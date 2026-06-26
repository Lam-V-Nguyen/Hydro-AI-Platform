import os, dotenv, rasterio, zipfile, rioxarray, sys
import logging, cdsapi, calendar, glob, gc, shutil, traceback
import geopandas as gpd, numpy as np, pandas as pd, xarray as xr
from shapely.geometry import Polygon, MultiPolygon
from scipy.spatial import cKDTree
from netCDF4 import Dataset
from rasterio.io import MemoryFile
from rasterio.enums import Resampling
import dask.array as da
from dask import delayed
from services import functions
from pathlib import Path
from datetime import datetime
from dateutil.relativedelta import relativedelta

if "bool" not in np.__dict__: np.bool = np.bool_




dotenv.load_dotenv()
MET_url = os.getenv('MET_ProstAPI_URL')
MET_client_id = os.getenv('MET_ProstAPI_CLIENT_ID')
NVE_url = os.getenv('NVE_URL')
NVE_client_id = os.getenv('NVE_API_KEY')
NODATA_DEM, NODATA_INT = -9999.0, 0

soils = [
    ['Clay', 'Sand', 'Silt', 'Bulk density', 'Soil organic carbon', 'Soil pH'],
    ['0', '5', '15', '30', '60', '100', '200']
]
soil_types = {
    'bulk density': ['BLDFIE_M', 'bd', 1000, np.int16, -32768],
    'clay': ['CLYPPT_M', 'clyppt', 1, np.uint8, 255], 
    'sand': ['SNDPPT_M', 'sndppt', 1, np.uint8, 255],
    'silt': ['SLTPPT_M', 'sltppt', 1, np.uint8, 255],  
    'organic carbon': ['OCDENS_M', 'oc', 1, np.int16, -32768], 
    'pH': ['PHIHOX_M', 'ph', 10, np.uint8, 255]
}
soil_depths = {
    '0cm': 'sl1', '5cm': 'sl2', '15cm': 'sl3', '30cm': 'sl4', 
    '60cm': 'sl5', '100cm': 'sl6', '200cm': 'sl7'
}
soil_type_reverse = {
    'clyppt': 'Clay', 'sndppt': 'Sand', 'sltppt': 'Silt', 
    'bd': 'Bulk density', 'oc': 'Soil organic carbon', 'ph': 'Soil pH'
}
soil_depth_reverse = {v: k for k, v in soil_depths.items()}

def interpolate_extrapolate(data, mask_nan, get_nearest=False, power=2, max_neighbors=8):
    h, w = data.shape
    mask_valid = ~mask_nan
    y_valid, x_valid = np.where(mask_valid)
    valid_values = data[mask_valid]
    y_fill, x_fill = np.where(mask_nan)
    n_points, n_fill = len(valid_values), len(y_fill)
    result = data.copy()
    if n_points == 0: return np.full((h, w), np.nan)
    if n_fill == 0: return result
    points_valid = np.column_stack((x_valid, y_valid))
    points_fill = np.column_stack((x_fill, y_fill))
    tree = cKDTree(points_valid)
    if not get_nearest: # interpolate using IDW
        k = min(max_neighbors, n_points)
        distances, indices = tree.query(points_fill, k=k)
        if k == 1: filled_values = valid_values[indices]
        else:
            # IDW
            distances = np.maximum(distances, 1e-8)
            weights = 1.0 / (distances ** power)
            weights = weights / weights.sum(axis=1, keepdims=True)
            neighbor_values = valid_values[indices]
            filled_values = np.sum(weights * neighbor_values, axis=1)
        result[y_fill, x_fill] = filled_values
    else: # get nearest neighbor
        distances, indices = tree.query(points_fill, k=1)
        nearest_values = valid_values[indices]
        result[y_fill, x_fill] = nearest_values
    return result

def remove_holes(geom):
    if isinstance(geom, Polygon): return Polygon(geom.exterior)
    elif isinstance(geom, MultiPolygon):
        return MultiPolygon([Polygon(p.exterior) for p in geom.geoms])
    else: return geom

def write_geotif(array, profile, output_path, nodata=-9999.0):
    array[np.isnan(array)] = nodata
    array = array.astype(profile["dtype"])
    profile.update(nodata=nodata)
    with rasterio.open(output_path, 'w', **profile) as dst:
        dst.write(array, 1)

def create_LAI(arr_2D, terrain, out_path, nodata=255):
    # Compute LAI
    lai_path = r"backend\src\flow_samples\landcover\LAI_Norway.zip"
    if os.path.exists(out_path): os.remove(out_path)
    land_flat, water_classes = arr_2D.ravel(), [40, 41, 44]
    valid_mask = (land_flat != nodata)
    land_valid = land_flat[valid_mask]
    unique_classes = np.unique(land_valid)
    df = pd.DataFrame(index=unique_classes.astype(int))
    with zipfile.ZipFile(lai_path, "r") as zip_ref:
        tif_names = [n for n in zip_ref.namelist() if n.endswith(".tif")]
        for name in tif_names:
            with zip_ref.open(name) as f:
                with MemoryFile(f.read()) as memfile:
                    month = name.split("_")[2].replace(".tif", "")
                    lai = rioxarray.open_rasterio(memfile).squeeze()
                    lai_match = lai.rio.reproject_match(terrain, resampling=Resampling.nearest)
                    lai_arr = lai_match.values.astype(np.float32)
                    lai_arr[lai_arr < -1000] = np.nan
                    lai_flat = lai_arr.ravel()
                    lai_valid = lai_flat[valid_mask]
                    lai_valid[np.isin(land_valid, water_classes)] = 0
                    tmp = pd.DataFrame({"type": land_valid, "lai": lai_valid})
                    df[int(month)] = np.round(tmp.groupby("type")["lai"].mean(), 3)
    df = df.reindex(sorted(df.columns), axis=1)
    df.index.name = os.path.basename(out_path).replace("_lai.csv", "")
    df.to_csv(out_path, index=True)

def is_valid_netcdf(path):
    try:
        with Dataset(path, "r") as ds:
           if len(ds.variables) == 0: return False
        return True
    except Exception:
        return False

def create_forcing(time, ny, nx, values, mask_nan, single_value, gdf=None, x_coords=None, y_coords=None):
    nt = len(time)
    if single_value:
        values = values.reshape(nt)
        values = da.from_array(values, chunks=(24))
        data = da.broadcast_to(values[:, None, None], (nt, ny, nx))
    else:
        lazy_arrays = []
        def interp_one_timestep(z):
            arr = functions.interpolation_Z(gdf, x_coords, y_coords, z, geo_type='point')
            return arr.reshape(ny, nx).astype(np.float32)
        for it in range(nt):
            delayed_arr = delayed(interp_one_timestep)(values[it].ravel())
            darr = da.from_delayed(
                delayed_arr, shape=(ny, nx), dtype=np.float32
            )
            lazy_arrays.append(darr)
        data = da.stack(lazy_arrays, axis=0)
    data = da.where(mask_nan[None, :, :], 0, data)
    return data

def setup_logger(log_path: str):
    logger = logging.getLogger("cdsapi")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    logger.propagate = False
    file_handler = logging.FileHandler(log_path, mode="a", encoding="utf-8")
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger

def weather_downloader(flow_dir, start, end, catchment, buffer=0.1):
    # Prepare forcing data from the global model ARE5
    # Source: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=download
    forcing_dir = os.path.join(flow_dir, 'forcing')
    os.makedirs(forcing_dir, exist_ok=True)
    forcing_path = os.path.join(forcing_dir, "weather_forcing.nc")
    # Remove old log
    log_path = os.path.join(forcing_dir, "log.txt")        
    if os.path.exists(log_path): os.remove(log_path)
    class StreamToLogger:
        def __init__(self, logger, level=logging.INFO):
            self.logger = logger
            self.level = level
            self.linebuf = ""
        def write(self, buf):
            for line in buf.rstrip().splitlines():
                self.logger.log(self.level, line.rstrip())
        def flush(self):
            pass
    # reset log file
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("")
    logger = setup_logger(log_path)
    old_stdout, old_stderr = sys.stdout, sys.stderr
    sys.stdout = StreamToLogger(logger)
    sys.stderr = StreamToLogger(logger)
    try:
        logger.info("Weather downloader started")
        CDS_url, CDS_key = os.getenv('CDS_URL'), os.getenv('CDS_API_KEY')
        config_path = Path.home() / '.cdsapirc'
        if not config_path.exists():
            logger.info("Creating .cdsapirc ...")
            config_path.write_text(f"url: {CDS_url}\nkey: {CDS_key}\n", encoding='utf-8')
            logger.info(f"Created at: {config_path}")
        start, end = '2025-01-01 00:00:00', '2025-01-10 00:00:00'
        logger.info(f"Starting time: {start}   --   Ending time: {end}")
        start_time = datetime.strptime(start, '%Y-%m-%d %H:%M:%S')
        end_time = datetime.strptime(end, '%Y-%m-%d %H:%M:%S')
        lon_min, lat_min, lon_max, lat_max = catchment.total_bounds
        north, east = max(lat_min, lat_max), max(lon_min, lon_max)
        south, west = min(lat_min, lat_max), min(lon_min, lon_max)
        area = [north + buffer, west - buffer, south - buffer, east + buffer]
        logger.info(f"Bounding box: {area}")
        # Setup variables
        variables = [
            'total_precipitation', # Precipitation
            '2m_temperature', # Temperature
            '10m_u_component_of_wind', '10m_v_component_of_wind', # Wind
            'surface_pressure',  # Pressure
            'surface_solar_radiation_downwards', # Shortwave radiation
            'surface_thermal_radiation_downwards', # Longwave radiation
        ]
        dataset = 'reanalysis-era5-single-levels'
        if os.path.exists(forcing_path): 
            logger.info("Removing old forcing data...")
        # Download ERA5 data monthly
        download_dir = os.path.join(forcing_dir, 'download')
        if not os.path.exists(download_dir): os.makedirs(download_dir)
        client = cdsapi.Client(quiet=False, debug=True)
        for var in variables:
            current = start_time.replace(day=1)
            while current <= end_time:
                year, month = current.year, current.month
                last_day = calendar.monthrange(year, month)[1]
                month_start = datetime(year, month, 1)
                month_end = datetime(year, month, last_day, 23)
                # Clip by requested range
                actual_start = max(start_time, month_start)
                actual_end = min(end_time, month_end)
                # Days to download
                days = [f"{d:02d}" for d in range(actual_start.day, actual_end.day + 1)]
                # Output file
                out_file = f"{var}_ERA5_{year}_{month:02d}.nc"
                output = os.path.join(download_dir, out_file)
                # Skip existing file
                if os.path.exists(output): os.remove(output)
                logger.info(f"Downloading: {out_file}")
                request = {
                    'product_type': 'reanalysis', 'variable': [var],
                    'year': [str(year)], 'month': [f"{month:02d}"], 'day': days,
                    'time': [f"{h:02d}:00" for h in range(24)], 'area': area,
                    'data_format': 'netcdf', 'download_format': 'unarchived'
                }
                client.retrieve(dataset, request, output)
                # Next month
                current += relativedelta(months=1)
        logger.info("ERA5 download completed successfully")
        # Check valid files
        logger.info("Checking valid files...")
        for var in variables:
            pattern = os.path.join(download_dir, f"{var}_ERA5_*.nc")
            raw_files = sorted(glob.glob(pattern))
            # Filter valid files
            files, bad_files = [], []
            for f in raw_files:
                if is_valid_netcdf(f): files.append(f)
                else: bad_files.append(f)
            logger.info(f"Valid files '{var}': {len(files)}/{len(raw_files)}")
            if bad_files:
                logger.info("Bad files:")
                for f in bad_files: logger.info(f" - {os.path.basename(f)}")
        # Concatenate sub-files
        logger.info("Concatenating files...")
        for var in variables:
            pattern = os.path.join(download_dir, f"{var}_ERA5_*.nc")
            raw_files = sorted(glob.glob(pattern))
            if len(raw_files) == 1:
                # Rename single file
                old_file, new_file = raw_files[0], pattern.replace('_*', "")
                os.rename(old_file, new_file)
                logger.info(f"Renamed: {os.path.basename(new_file)}")
            elif len(raw_files) > 1:
                files = [f for f in raw_files if is_valid_netcdf(f)]
                if len(files) == 0: continue
                datasets = []
                try:
                    logger.info(f"Merging {var} ...")
                    datasets = [xr.open_dataset(f) for f in files]
                    ds = xr.merge(
                        datasets, compat="override", join="outer"
                    )
                    # Remove ERA5 artifact dimension
                    if 'expver' in ds.variables: ds = ds.drop_vars('expver')
                    encoding = {
                        var: {"zlib": True, "complevel": 4, "dtype": "float32"}
                        for var in ds.data_vars
                    }
                    output = pattern.replace('_*', "")
                    logger.info(f"Writing forcing file: {output}")
                    ds.to_netcdf(output, format="NETCDF4", encoding=encoding)
                finally:
                    for ds in datasets: ds.close()
                    if 'ds' in locals(): ds.close()
                    del datasets
                    gc.collect()
        # Merge files
        logger.info("Merging files...")
        final_output = os.path.join(forcing_dir, "ear5.nc")
        datasets = [
            os.path.join(download_dir, f"{var}_ERA5.nc")
            for var in variables if os.path.exists(os.path.join(download_dir, f"{var}_ERA5.nc"))
        ]
        if datasets:
            datasets_ds = []
            try:
                datasets_ds = [xr.open_dataset(f) for f in datasets]
                ds_final = xr.merge(datasets_ds, compat="override", join="outer")
                encoding = {
                    var: {"zlib": True, "complevel": 4, "dtype": "float32"}
                    for var in ds_final.data_vars
                }
                logger.info(f"Writing ERA5 file: {final_output}")
                ds_final.to_netcdf(final_output, format="NETCDF4", encoding=encoding)
            finally:
                for ds in datasets_ds: ds.close()
                if 'ds_final' in locals(): ds_final.close()
                gc.collect()
            # Remove sub-files
            shutil.rmtree(download_dir)
            logger.info("Temporary files removed.")
            logger.info("Merging files completed successfully")
        else: logger.info("No multiple files to merge")
        raw_path, datasets = os.path.join(flow_dir, "raw", "dtm_raw.tif"), {}
        with rasterio.open(raw_path) as src:
            dem_array, crs = src.read(1), src.crs
            transform, nodata = src.transform, src.nodata
        mask_nan = np.isnan(dem_array) | (dem_array == nodata)
        ny, nx, time_step = dem_array.shape[0], dem_array.shape[1], 'hours'
        x_coords = transform.c + (np.arange(nx) + 0.5) * transform.a
        y_coords = transform.f + (np.arange(ny) + 0.5) * transform.e
        forcing = {
            'precip': ['tp', 'mm'], 'temp': ['t2m', 'degC'],
            'kin': ['ssrd', 'W/m^2'], 'kout': ['strd', 'W/m^2'],
            'wind': ['', 'm/s'], 'press_msl': ['sp', 'Pa']
        }
        with xr.open_dataset(final_output) as ds:
            # vars = list(ds.data_vars.keys())
            x_known, y_known, gdf = None, None, None
            timestamps = pd.to_datetime(ds['valid_time'].values).to_numpy()
            lat, lon = ds['latitude'].values, ds['longitude'].values
            single_value=True if min(lat.shape[0], lon.shape[0]) == 1 else False
            if not single_value:
                lon2d, lat2d = np.meshgrid(lon, lat)
                gdf_known = gpd.GeoDataFrame(geometry=gpd.points_from_xy(lon2d.ravel(), lat2d.ravel()), crs='EPSG:4326')
                gdf_known = gdf_known.to_crs(crs)
                x_known, y_known = gdf_known.geometry.x, gdf_known.geometry.y
                x, y = np.meshgrid(x_coords, y_coords)
                gdf = gpd.GeoDataFrame(geometry=gpd.points_from_xy(x.ravel(), y.ravel()), crs=crs)
            for var, (col, unit) in forcing.items():
                if col != '': data = ds[col].values.astype(np.float32)
                if var == 'precip': data *= 1000
                elif var == 'temp': data -= 273.15
                elif var == 'kin' or var == 'kout': data /= 3600
                elif var == 'wind':
                    u = ds['u10'].values.astype(np.float32)
                    v = ds['v10'].values.astype(np.float32)
                    data = np.sqrt(u**2 + v**2)
                    # wind_direction = (np.degrees(np.arctan2(-u, -v)) + 360) % 360
                if np.isnan(data).any():
                    nan_mask = np.isnan(data)
                    if nan_mask.all(): raise ValueError(f"{var} contains only NaN")
                    da_arr = xr.DataArray(data, dims=("valid_time", "latitude", "longitude"))
                    da_arr = (
                        da_arr.interpolate_na(dim="valid_time", method="linear")
                        .ffill("valid_time").bfill("valid_time")
                    )
                    data = da_arr.values.astype(np.float32)
                logger.info(f"Interpolating {var}...")
                data_3d = create_forcing(timestamps, ny, nx, data, mask_nan, single_value, gdf, x_known, y_known)
                datasets[var] = (('time', 'y', 'x'), data_3d, {'units': unit})
        ds_final = xr.Dataset(
            data_vars=datasets, coords={"time": timestamps, "y": y_coords, "x": x_coords}
        )
        ds_final = ds_final.rio.set_spatial_dims(x_dim="x", y_dim="y")
        ds_final = ds_final.rio.write_crs(crs)
        ds_final["time"].encoding = {
            "units": f"{time_step} since 1900-01-01 00:00:00",
            "calendar": "proleptic_gregorian", "dtype": "float64"
        }
        encoding = {
            var: {
                "zlib": True, "complevel": 5, "shuffle": True, 
                "dtype": "float32", "chunksizes": (24, 128, 128)
            }
            for var in ds_final.data_vars
        }
        ds_final.to_netcdf(forcing_path, format="NETCDF4", engine='netcdf4', encoding=encoding)
        ds_final.close()
        logger.info(f"Saved forcing file successfully: {forcing_path}")
    except Exception:
        print('/weather_downloader:\n==============')
        traceback.print_exc()
    finally:
        sys.stdout, sys.stderr = old_stdout, old_stderr

# def keep_polygon(geom):
#     if geom.geom_type == 'GeometryCollection':
#         polys = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon))]
#         if len(polys) == 0: return None
#         return polys[0]
#     return geom

# def fix_invalid_polygon(gdf, cols):
#     gdf_new, name = gdf.copy(), cols[0]
#     gdf_valid, gdf_nan = gdf_new[gdf_new[name] != ''], gdf_new[gdf_new[name] == '']
#     if gdf_nan.shape[0] > 0:
#         gdf_valid['geometry'] = gdf_valid['geometry'].apply(keep_polygon)
#         gdf_nan['geometry'] = gdf_nan['geometry'].apply(keep_polygon)
#         # Spatial join nearest
#         gdf_filled = gpd.sjoin_nearest(
#             gdf_nan, gdf_valid[['geometry', name]], how='left', distance_col='dist'
#         )
#         gdf_filled = gdf_filled.drop_duplicates(subset='_id')
#         gdf_new.loc[gdf_filled.index, cols] = gdf_valid.loc[gdf_filled['index_right'], cols].values
#     gdf_new['geometry'] = gdf_new['geometry'].apply(keep_polygon)
#     return gdf_new


# def weather_init(id:str) -> gpd.GeoDataFrame:
#     if id == 'ntnu':
#         data = {
#             'name': 'Norwegian University of Science and Technology',
#             'county': 'MØRE OG ROMSDAL', 'municipality': 'ÅLESUND', 
#             'stationHolders': 'NTNU I ÅLESUND',
#             'geometry': Point((6.4797, 62.4848))
#         }
#         gdf = gpd.GeoDataFrame(data=[data], geometry='geometry', crs="EPSG:4326")
#     elif id == 'eklima':
#         url = f'{MET_url}/sources/v0.jsonld'
#         headers = {'Accept': 'application/json'}
#         response = requests.request("GET", url, 
#             headers=headers, auth=HTTPBasicAuth(MET_client_id, ''))
#         columns = ['id', 'name', 'county', 'municipality', 'stationHolders', 'geometry']
#         if response.status_code != 200 or 'data' not in response.json():
#             return gpd.GeoDataFrame()
#         df = pd.DataFrame(response.json()['data'])[columns]
#         df['geometry'] = df['geometry'].apply(lambda x: Point(*x['coordinates']) if isinstance(x, dict) else None)
#         df.dropna(subset=['geometry'], inplace=True)
#         gdf = gpd.GeoDataFrame(df, crs="EPSG:4326")
#     elif id == 'nve':
#         url = f'{NVE_url}/Stations'
#         headers = {'Accept': 'application/json', "X-API-Key": NVE_client_id}
#         response = requests.request("GET", url, headers=headers, params={"Active": 1})
#         if response.status_code != 200 or 'data' not in response.json():
#             return gpd.GeoDataFrame()
#         columns = [
#             'stationId', 'stationName', 'latitude', 
#             'longitude', 'councilName', 'countyName', 'owner'
#             ]
#         allowed_params, filtered_data = {0, 2, 4, 8, 9, 11}, []
#         for station in response.json()['data']:
#             filtered_series = [
#                 s for s in station.get("seriesList", [])
#                 if s.get("parameter") in allowed_params
#             ]
#             if filtered_series:
#                 new_station = station.copy()
#                 new_station["seriesList"] = filtered_series
#                 filtered_data.append(new_station)
#         df = pd.DataFrame(filtered_data)[columns]
#         if df.empty: return gpd.GeoDataFrame()
#         columns_renamed = {
#             'stationId': 'id', 'stationName': 'name', 'councilName': 'municipality', 
#             'countyName': 'county', 'owner': 'stationHolders'
#         }
#         df.rename(columns=columns_renamed, inplace=True)
#         gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.longitude, df.latitude), crs='EPSG:4326')
#         gdf.drop(columns=['latitude', 'longitude'], inplace=True)
#     return gdf

# def weather_downloader(source:str, stationId:str, start:datetime, end:datetime) -> tuple:
#     start_time = start.strftime('%Y-%m-%dT%H:%M:%SZ')
#     end_time = end.strftime('%Y-%m-%dT%H:%M:%SZ')
#     if source == 'ntnu':
#         content = []




#     elif source == 'eklima':
#         # Reference: https://frost.met.no/elementtable
#         url = f'{MET_url}/observations/v0.jsonld'
#         headers = {'Accept': 'application/json'}
#         columns = [
#             "mean(air_temperature PT1H)", "mean(wind_speed PT1H)", 
#             "mean(surface_air_pressure PT1H)", "mean(relative_humidity PT1H)",
#             "sum(precipitation_amount PT1H)", 
#             "mean(surface_downwelling_shortwave_flux_in_air PT1H)",
#             'mean(surface_downwelling_longwave_flux_in_air PT1H)'
#         ]
#         params = {
#             "sources": stationId, "elements": ",".join(columns),
#             "referencetime": f"{start_time}/{end_time}"
#         }
#         response = requests.request("GET", url, params=params,
#             headers=headers, auth=HTTPBasicAuth(MET_client_id, ''))
#         data, rows = response.json()["data"], []
#         for item in data:
#             time = item['referenceTime']
#             for obs in item['observations']:
#                 rows.append({
#                     "timestamp": time, 'element': obs['elementId'],
#                     "value": obs['value'], 'timeResolution': obs['timeResolution'],
#                     "height": obs.get('level', {}).get('value'), "qualityCode": obs.get('qualityCode')
#                 })
#         df = pd.DataFrame(rows)
#         df['timestamp'] = pd.to_datetime(df['timestamp']).dt.strftime('%Y-%m-%d %H:%M:%S')
#         df = df[df['timeResolution'] == 'PT1H'].reset_index(drop=True)
#         weather_df = pd.DataFrame(data={'timestamp': df['timestamp'].unique()})
#         pre_mask = (df['element'] == 'sum(precipitation_amount PT1H)')
#         df.loc[pre_mask, 'precipitation'] = df.loc[pre_mask, 'value']
#         pre_df = df[~df['precipitation'].isna()]
#         weather_df = weather_df.merge(pre_df[['timestamp', 'precipitation']], how='left', on='timestamp')
#         temp_mask = (df['element'] == 'mean(air_temperature PT1H)') & (df['height'] == 2)
#         df.loc[temp_mask, 'temperature'] = df.loc[temp_mask, 'value']
#         temp_df = df[~df['temperature'].isna()]
#         weather_df = weather_df.merge(temp_df[['timestamp', 'temperature']], how='left', on='timestamp')
#         short_mask = (df['element'] == 'mean(surface_downwelling_shortwave_flux_in_air PT1H)')
#         df.loc[short_mask, 'short_wave_radiation'] = df.loc[short_mask, 'value']
#         short_df = df[~df['short_wave_radiation'].isna()]
#         weather_df = weather_df.merge(short_df[['timestamp', 'short_wave_radiation']], how='left', on='timestamp')
#         long_mask = (df['element'] == 'mean(surface_downwelling_longwave_flux_in_air PT1H)')
#         df.loc[long_mask, 'long_wave_radiation'] = df.loc[long_mask, 'value']
#         long_df = df[~df['long_wave_radiation'].isna()]
#         weather_df = weather_df.merge(long_df[['timestamp', 'long_wave_radiation']], how='left', on='timestamp')
#         wind_mask = (df['element'] == 'mean(wind_speed PT1H)') & (df['height'] == 10)
#         df.loc[wind_mask, 'wind_speed'] = df.loc[wind_mask, 'value']
#         wind_df = df[~df['wind_speed'].isna()]
#         weather_df = weather_df.merge(wind_df[['timestamp', 'wind_speed']], how='left', on='timestamp')
#         humidity_mask = (df['element'] == 'mean(relative_humidity PT1H)')
#         df.loc[humidity_mask, 'humidity'] = df.loc[humidity_mask, 'value']
#         humidity_df = df[~df['humidity'].isna()]
#         weather_df = weather_df.merge(humidity_df[['timestamp', 'humidity']], how='left', on='timestamp')
#         pressure_mask = (df['element'] == 'mean(surface_air_pressure PT1H)')
#         df.loc[pressure_mask, 'pressure'] = df.loc[pressure_mask, 'value']
#         pressure_df = df[~df['pressure'].isna()]
#         weather_df = weather_df.merge(pressure_df[['timestamp', 'pressure']], how='left', on='timestamp')
#     elif source == 'nve':
#         # Reference: https://hydapi.nve.no/swagger/index.html?urls.primaryName=V1
#         url, weather_df = f'{NVE_url}/Observations', pd.DataFrame()
#         weather_df['time'] = pd.date_range(start=start_time, end=end_time, freq='H').strftime('%Y-%m-%d %H:%M:%S')
#         headers = {'Accept': 'application/json', "X-API-Key": NVE_client_id}
#         # Get observations
#         observations = ['precipitation', 'temperature', 'short_wave_radiation',
#             'long_wave_radiation', 'wind_speed', 'humidity', 'pressure']
#         for obs in observations:
#             params = {
#                 "StationId": str(stationId), "Parameter": NVE_codes[obs], 
#                 "ResolutionTime": 60, "ReferenceTime": f"{start_time}/{end_time}"
#             }
#             response = requests.request("GET", url, params=params, headers=headers)
#             obs_data = response.json().get('data', [])
#             if response.status_code == 200 and obs_data:
#                 observations = obs_data[0].get('observations', [])
#                 if observations:
#                     temp_df = pd.DataFrame(observations)[['time', 'value']]
#                     temp_df.rename(columns={'value': obs}, inplace=True)
#                     weather_df = weather_df.merge(temp_df, how='left', on='time')
#                     continue
#             weather_df[obs] = None
#     # Check for missing values
#     missing = 1 if weather_df.isna().sum().sum() > 0 else 0
#     # Fill missing values with None
#     weather_df = weather_df.replace([np.inf, -np.inf], None)
#     weather_df = weather_df.astype(object)
#     weather_df = weather_df.where(weather_df.notna(), None)
#     content = weather_df.values.tolist()
#     return content, missing



# # Fix invalid soil polygon
# soil_UTM = soil.to_crs(terrain.rio.crs)
# soil_cols = ['soil', 'theta_s', 'theta_r', 'k_sat_ver', 'soil_depth', 'conductivity_decay', 'brooks_corey']
# soil_UTM = fix_invalid_polygon(soil_UTM, soil_cols)
# soil_layers = ['theta_s', 'theta_r', 'k_sat_ver', 'soil_depth', 'conductivity_decay', 'brooks_corey']
# soil_UTM = soil_UTM[soil_layers + ['geometry']]
# soil_UTM = soil_UTM.rename(columns={
#     'theta_s': 'thetaS', 'theta_r': 'thetaR', 'k_sat_ver': 'KsatVer', 'soil_depth': 'SoilThickness', 
#     'conductivity_decay': 'f', 'brooks_corey': 'brooks_corey'
# })
# # for value in soil_layers:
# #     soil_path = os.path.normpath(os.path.join('test/data/soil', f'{value}.tif'))
# #     write_tif(soil_path, terrain, soil_UTM, value)


        # save_dir = os.path.normpath(os.path.join(flow_dir, folder))
        # os.makedirs(save_dir, exist_ok=True)
        # file_ext = file.filename.split(".")
        # soil_path = os.path.normpath(os.path.join(save_dir, file.filename))
        # with open(soil_path, "wb") as buffer:
        #     shutil.copyfileobj(file.file, buffer)
        # if file_ext[-1].lower() in ["tif"]:
        #     with rasterio.open(soil_path) as src:
        #         data = src.read(1)
        #         mask = data != src.nodata
        #         data = data.astype(np.int32)
        #         results = ({ "geometry": shape(geom), key: func_codes.get(value, "")
        #         } for geom, value in shapes(data, mask=mask, transform=src.transform))
        #         geoms = list(results)
        #     del data
        #     gdf = gpd.GeoDataFrame(geoms, crs=src.crs)
        # elif file_ext[-1].lower() in ["geojson"]: 
        #     gdf = gpd.read_file(soil_path)
        # if gdf.empty: return JSONResponse({'status': 'error', 'message': 'No data found.'})
        # if key not in gdf.columns: gdf.insert(1, key, 'None')
        # mapped = gdf[key].map(lambda x: func_types.get(x, ["None"] * len(new_cols)))
        # gdf[new_cols] = pd.DataFrame(mapped.tolist(), columns=new_cols)
        # gdf[key] = np.where(gdf[key]=='', 'None', gdf[key])
        # gdf[key] = gdf[key].astype(str)
        # if '_id' not in gdf.columns: gdf.insert(0, '_id', range(1, len(gdf) + 1))
        # gdf = gdf[['_id', key, 'geometry'] + new_cols]
        # for col in new_cols:
        #     gdf[col] = pd.to_numeric(gdf[col], errors='coerce')
        # if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")

# # Download soil data 2020 from ISRIC: https://files.isric.org/soilgrids/latest/data/
# soil_types = {
#     'clay': 'clyppt', 'sand': 'sndppt', 'silt': 'sltppt', 
#     'bdod': 'bd', 'soc': 'oc', 'phh2o': 'ph'
# }
# depths = {
#     '0-5cm_mean': 'sl1', '5-15cm_mean': 'sl2', '15-30cm_mean': 'sl3',
#     '30-60cm_mean': 'sl4', '60-100cm_mean': 'sl5', '100-200cm_mean': 'sl6'
# }
# soils = {
#     'clay': 1, 'sand': 1, 'silt': 1, 'bdod': 100, 'soc': 10, 'phh2o': 10
# }
# bbox = (float(min_lon), float(min_lat), float(max_lon), float(max_lat))
# for item, name in tqdm(soil_types.items(), total=len(soil_types), desc='Downloading soil data'):
#     wcs = WebCoverageService(f'https://maps.isric.org/mapserv?map=/map/{item}.map', version='1.0.0')
#     scale = soils[item]
#     for type, value in depths.items():
#         idx = f'{item}_{type}'
#         response = wcs.getCoverage(
#             identifier=idx, crs='EPSG:4326', bbox=bbox, format='image/tiff',
#             resx=0.0025, resy=0.0025, timeout=120
#         )
#         with MemoryFile(response.read()) as memfile:
#             with rioxarray.open_rasterio(memfile) as src_xr:
#                 data_xr = src_xr.squeeze()
#                 data_xr = data_xr.rio.reproject_match(ref, resampling=Resampling.bilinear)
#                 data_xr = np.where(data_xr == data_xr.rio.nodata, nodata, data_xr)
#         soil_array = data_xr
#         # Interpolate data
#         mask_valid = soil_array != nodata
#         soil_values = flow_functions.interpolate_extrapolate(soil_array, ~mask_valid, True)
#         soil_values[mask_nan] = nodata
#         mask_land = (soil_values != nodata) & (~np.isnan(soil_values)) & (~mask_lake)
#         soil_values[mask_land] = soil_values[mask_land] / scale
#         soil_values[~mask_land] = nodata
#         soil_values = np.round(soil_values, 2).astype(np.float32)
#         path = os.path.join(soil_dir, f'{name}_{value}.tif')
#         flow_functions.write_geotiff(soil_values, profile, path)
# ref.close()
# # # Create soil thickness
# # soil_thickness_path = os.path.normpath(os.path.join(soil_dir, 'soilthickness.tif'))
# # soil_thickness = rasterize(
# #     shapes=[(geom, 200) for geom in area_clip], dtype=np.float32,
# #     out_shape=(height, width), transform=transform, fill=255
# # )
# # profile_thickness = profile.copy()
# # profile_thickness.update({'dtype': np.uint8, 'nodata': 255, 'count': 1, 'compress': 'lzw'})
# # flow_functions.write_geotiff(soil_thinkness, profile_thickness, soil_thinkness_path)



# # ============= QGIS python plugin: Process LAI downloaded from EarthData Search =============
# from pathlib import Path
# from datetime import datetime, timedelta
# from collections import defaultdict
# import numpy as np
# from osgeo import gdal

# input_dir = r"C:\Users\vanln\Downloads\MCD15A3H_061-20260618_172802"
# output_dir = r"C:\Users\vanln\Downloads\MCD15A3H_061-20260618_172802\monthly_lai"
# Path(output_dir).mkdir(exist_ok=True)

# def get_lai_subdataset(hdf_file):
#     ds = gdal.Open(hdf_file)
#     for sds_name, sds_desc in ds.GetSubDatasets():
#         if "Lai_500m" in sds_name:
#             return sds_name
#     raise Exception(f"Cannot find Lai_500m in {hdf_file}")

# monthly_files = defaultdict(list)
# for file in Path(input_dir).glob("*.hdf"):
#     parts = file.name.split(".")
#     julian = parts[1]  # A2018001
#     year = int(julian[1:5])
#     doy = int(julian[5:])
#     date = datetime(year, 1, 1) + timedelta(days=doy - 1)
#     monthly_files[(date.year, date.month)].append(str(file))

# for (year, month), files in sorted(monthly_files.items()):
#     print(f"Processing {year}-{month:02d}")
#     arrays = []
#     template_ds = None
#     for hdf_file in files:
#         lai_sds = get_lai_subdataset(hdf_file)
#         ds = gdal.Open(lai_sds)
#         arr = ds.ReadAsArray().astype(np.float32)
#         # MODIS fill value
#         arr[arr >= 249] = np.nan
#         arrays.append(arr)
#         if template_ds is None:
#             template_ds = ds
#     monthly_mean = np.nanmean(arrays, axis=0)
#     # scale factor LAI = 0.1
#     monthly_mean = monthly_mean * 0.1
#     outfile = (
#         Path(output_dir)
#         / f"LAI_{year}_{month:02d}.tif"
#     )
#     driver = gdal.GetDriverByName("GTiff")
#     out_ds = driver.Create(
#         str(outfile),
#         template_ds.RasterXSize,
#         template_ds.RasterYSize,
#         1,
#         gdal.GDT_Float32,
#         options=["COMPRESS=LZW"]
#     )
#     out_ds.SetGeoTransform(
#         template_ds.GetGeoTransform()
#     )
#     out_ds.SetProjection(
#         template_ds.GetProjection()
#     )
#     band = out_ds.GetRasterBand(1)
#     band.WriteArray(monthly_mean)
#     band.SetNoDataValue(-9999)
#     out_ds.FlushCache()
#     out_ds = None
#     print(f"Saved: {outfile}")
# print("DONE")


# # ============= Create weather file =============
# # Read weather data
# weather_path = os.path.join(sample_folder, 'weather_2025.csv')
# weather = pd.read_csv(weather_path, parse_dates=['datetime'], index_col='datetime')
# weather_new = weather.loc['2025-01-01 00:00:00':'2025-01-10 00:00:00']
# # Create forcing nc file
# time, time_step = weather_new.index.to_numpy(), 'hours'
# forcing_dir = os.path.join(test_folder, 'data/forcing')
# os.makedirs(forcing_dir, exist_ok=True)
# out_path, datasets = os.path.join(forcing_dir, "weather_forcing.nc"), {}
# with rasterio.open(raw_path) as src:
#     dem_array, crs = src.read(1), src.crs
#     transform, nodata = src.transform, src.nodata
# mask_nan = np.isnan(dem_array) | (dem_array == nodata)
# ny, nx = dem_array.shape[0], dem_array.shape[1]
# forcing = {
#     'precip': ['precip_mm', 'mm'], 'temp': ['temp_C', 'degC'],
#     'kin': ['shortwave_Wm2', 'W/m^2'], 'kout': ['longwave_Wm2', 'W/m^2'],
#     'wind': ['wind_mps', 'm/s'], 'press_msl': ['pressure', 'Pa']
# }
# for var, (col, unit) in forcing.items():
#     data = weather_new[col].values.astype(np.float32)
#     data_3d = create_forcing(time, ny, nx, data, mask_nan, single_value=True)
#     datasets[var] = (('time', 'y', 'x'), data_3d, {'units': unit})
# x_coords = transform.c + (np.arange(nx) + 0.5) * transform.a
# y_coords = transform.f + (np.arange(ny) + 0.5) * transform.e
# ds_final = xr.Dataset(
#     data_vars=datasets, coords={"time": time, "y": y_coords, "x": x_coords}
# )
# ds_final = ds_final.rio.set_spatial_dims(x_dim="x", y_dim="y")
# ds_final = ds_final.rio.write_crs(crs)
# ds_final["time"].encoding = {
#     "units": f"{time_step} since 1900-01-01 00:00:00",
#     "calendar": "proleptic_gregorian", "dtype": "float64"
# }
# encoding = {
#     var: {"zlib": True, "complevel": 4, "shuffle": True, "chunksizes": (1, 256, 256)}
#     for var in ds_final.data_vars
# }
# ds_final.to_netcdf(out_path, engine='netcdf4', encoding=encoding)





# ########################### Get landcover data from ESA worldcover
# user_name, password = os.getenv('ESA_USERNAME'), os.getenv('ESA_PASSWORD')
# catalogue = Catalogue().authenticate_non_interactive(user_name, password)
# area = catchment.copy()
# if area.crs != 'EPSG:4326': area = area.to_crs('EPSG:4326')
# minx, miny, maxx, maxy = area.total_bounds
# bbox = Polygon.from_bounds(minx, miny, maxx, maxy)
# download_dir = os.path.join(land_dir, 'downloads')
# if os.path.exists(download_dir): shutil.rmtree(download_dir)
# # Get name of landcover layer
# collections = catalogue.get_collections()
# layers = [
#     # 'urn:eop:VITO:ESA_WorldCover_10m_2020_V1', 
#     'urn:eop:VITO:ESA_WorldCover_10m_2021_V2'
# ]
# # Search for products in the WorldCover collection
# product = catalogue.get_products(layers, geometry=bbox)
# catalogue.download_products(product, download_dir, force=True)
# pattern = os.path.join(download_dir, "**", "*_Map.tif")
# files = glob.glob(pattern, recursive=True)
# if len(files) == 0: raise ValueError("No *_Map.tif files found in directory")
# if len(files) == 1:
#     src_files = [rasterio.open(files[0])]
#     mosaic, transform = src_files[0].read(), src_files[0].transform
# elif len(files) > 1:
#     src_files = [rasterio.open(f) for f in files]
#     # Merge (mosaic)
#     mosaic, transform = merge(src_files)
# # Copy metadata
# out_meta = src_files[0].meta.copy()
# out_meta.update({
#     "height": mosaic.shape[1], "width": mosaic.shape[2],
#     "transform": transform, "compress": "lzw"
# })
# merge_path = os.path.join(land_dir, 'merged.tif')
# with rasterio.open(merge_path, "w", **out_meta) as dest:
#     dest.write(mosaic)
# # Close files
# for src in src_files: src.close()
# shutil.rmtree(download_dir)
# # Clip raster to catchment
# land_path = os.path.join(land_dir, 'esa_worldcover.tif')
# land_temp = rioxarray.open_rasterio(merge_path).squeeze()
# land_match = land_temp.rio.reproject_match(terrain_da, resampling=Resampling.nearest)
# land_esa = land_match.values.astype(np.uint8)
# esa_nodata = land_match.rio.nodata
# if esa_nodata is not None:
#     land_esa[land_esa == esa_nodata] = NODATA_FLWDR
# land_esa[mask_nan] = NODATA_FLWDR
# flow_functions.write_geotif(land_esa, profile_writer, land_path, NODATA_FLWDR)
# del land_temp
# gc.collect()
# functions.safe_remove(merge_path)
# # Save look up table
# csv_path = r"backend\src\flow_samples\landcover\esa_worldcover_mapping.csv"
# df, lai_name, land_arr = pd.read_csv(csv_path), "esa", land_esa
# df.to_csv(os.path.join(land_dir, 'esa_worldcover.csv'), index=False)


# # Create soil thickness
# with rasterio.open(terrain_path) as src:
#     meta = src.meta.copy()
# meta.update({"dtype": "float32", "nodata": -9999.0})
# data = np.ones((meta["height"], meta["width"]), dtype="float32") * 100
# data[data == meta["nodata"]] = 100
# with rasterio.open(os.path.join(soil_dir, 'soilthickness.tif'), "w", **meta) as dst:
#     dst.write(data, 1)
# # Download soil data from ISRIC: https://files.isric.org/soilgrids/latest/data/
# soil_types, soil_depths = flow_functions.soil_types, flow_functions.soil_depths
# for item, name in soil_types.items():
#     wcs = WebCoverageService(f'https://maps.isric.org/mapserv?map=/map/{item}.map', version='1.0.0')
#     for type, value in soil_depths.items():
#         idx, soil_name = f'{item}_{type}', f'{name}_{value}'
#         response = wcs.getCoverage(
#             identifier=idx, crs='EPSG:4326', bbox=bbox,
#             format='image/tiff', resx=0.0025, resy=0.0025
#         )
#         with MemoryFile(response.read()) as memfile:
#             with memfile.open() as src:
#                 data = rioxarray.open_rasterio(src, masked=True)
#                 data_reprojected = data.rio.reproject_match(terrain)
#             data_reprojected.rio.to_raster(os.path.join(soil_dir, f'{soil_name}.tif'))