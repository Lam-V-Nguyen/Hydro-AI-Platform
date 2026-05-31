import os, dotenv, rasterio
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from netCDF4 import Dataset

dotenv.load_dotenv()
MET_url = os.getenv('MET_ProstAPI_URL')
MET_client_id = os.getenv('MET_ProstAPI_CLIENT_ID')
NVE_url = os.getenv('NVE_URL')
NVE_client_id = os.getenv('NVE_API_KEY')
NODATA_DEM, NODATA_INT = -9999.0, 0

soils = [
    ['Clay', 'Sand', 'Silt', 'Bulk density', 'Soil organic carbon', 'Soil pH'],
    ['0-5', '5-15', '15-30', '30-60', '60-100', '100-200']
]
soil_types = {
    'clay': 'clyppt', 'sand': 'sndppt', 'silt': 'sltppt', 
    'bdod': 'bd', 'soc': 'oc', 'phh2o': 'ph'
}
soil_depths = {
    '0-5cm_mean': 'sl1', '5-15cm_mean': 'sl2', '15-30cm_mean': 'sl3',
    '30-60cm_mean': 'sl4', '60-100cm_mean': 'sl5', '100-200cm_mean': 'sl6'
}
soil_type_reverse = {
    'clyppt': 'Clay', 'sndppt': 'Sand', 'sltppt': 'Silt', 
    'bd': 'Bulk density', 'oc': 'Soil organic carbon', 'ph': 'Soil pH'
}
soil_depth_reverse = {v: k for k, v in soil_depths.items()}


corine_codes = {
    1: [111, "Continuous urban fabric"], 2: [112, "Discontinuous urban fabric"],
    3: [121, "Industrial or commercial units and public facilities"],
    4: [122, "Road and rail networks and associated land"],
    5: [123, "Port areas"], 6: [124, "Airports"], 7: [131, "Mineral extraction sites"], 
    8: [132, "Dump sites"], 9: [133, "Construction sites"], 10: [141, "Green urban areas"],
    11: [142, "Sport and leisure facilities"], 12: [211, "Non-irrigated arable land"],
    13: [212, "Permanently irrigated arable land"], 14: [213, "Rice fields"],
    15: [221, "Vineyards"], 16: [222, "Fruit tree and berry plantations"],
    17: [223, "Olive groves"], 18: [231, "Pastures meadows and other permanent grasslands under agricultural use"],
    19: [241, "Annual crops associated with permanent crops"], 20: [242, "Complex cultivation patterns"],
    21: [243, "Land principally occupied by agriculture with significant areas of natural vegetation"],
    22: [244, "Agro-forestry areas"], 23: [311, "Broad-leaved forest"], 24: [312, "Coniferous forest"], 
    25: [313, "Mixed forest"], 26: [321, "Natural grassland"], 27: [322, "Moors and heathland"],
    28: [323, "Sclerophyllous vegetation"], 29: [324, "Transitional woodland/shrub"],
    30: [331, "Beaches dunes and sand plains"], 31: [332, "Bare rock"], 32: [333, "Sparsely vegetated areas"],
    33: [334, "Burnt areas"], 34: [335, "Glaciers and perpetual snow"], 35: [411, "Inland marshes"],
    36: [412, "Peatbogs"], 37: [421, "Coastal salt marshes"], 38: [422, "Salines"],
    39: [423, "Intertidal flats"], 40: [511, "Water courses"], 41: [512, "Water bodies"],
    42: [521, "Coastal lagoons"], 43: [522, "Estuaries"], 44: [532, "Sea and ocean"], 
    48: [999, "No data"], -128: [999, "No data"]
}
canopy_gap_fraction = {
    # Urban / artificial
    111: 0.9, 112: 0.9, 121: 0.95, 122: 0.95, 123: 0.95, 124: 0.95,
    131: 0.98, 132: 1.0, 133: 1.0, 141: 0.7, 142: 0.75,
    # Agriculture
    211: 0.6, 212: 0.6, 213: 0.55, 221: 0.5, 222: 0.5, 223: 0.5,
    231: 0.5, 241: 0.55, 242: 0.55, 243: 0.6, 244: 0.6,
    # Forest
    311: 0.2, 312: 0.15, 313: 0.18,
    # Natural vegetation
    321: 0.7, 322: 0.5, 323: 0.4, 324: 0.45,
    # Bare / sparse
    331: 0.98, 332: 0.98, 333: 1.0, 334: 1.0, 335: 1.0,
    # Wetlands
    411: 0.85, 412: 0.9, 421: 0.95, 422: 1.0, 423: 1.0,
    # Water
    511: 1.0, 512: 1.0, 521: 1.0, 522: 1.0, 523: 1.0,
    # No data
    999: -999.0
}
esa_codes = {
    0: [0, "No data"], 10: [10, "Tree cover"], 20: [20, "Shrubland"], 30: [30, "Grassland"], 
    40: [40, "Cropland"], 50: [50, "Built-up"], 60: [60, "Bare / sparse vegetation"], 
    70: [70, "Snow and Ice"], 80: [80, "Permanent water bodies"], 
    90: [90, "Herbaceous wetland"], 95: [95, "Mangroves"], 100: [100, "Moss and Lichen"],
}

def remove_holes(geom):
    if isinstance(geom, Polygon): return Polygon(geom.exterior)
    elif isinstance(geom, MultiPolygon):
        return MultiPolygon([Polygon(p.exterior) for p in geom.geoms])
    else: return geom

def write_geotiff(data, profile, output_path):
    profile.update(dtype=data.dtype, count=1, compress='lzw')
    with rasterio.open(output_path, 'w', **profile) as dst:
        dst.write(data, 1)

def is_valid_netcdf(path):
    try:
        with Dataset(path, "r") as ds:
           if len(ds.variables) == 0: return False
        return True
    except Exception:
        return False
    
def clip_catchment(catchment, terrain, nodata=-9999.0):
    clipped = terrain.rio.clip(catchment.geometry, terrain.rio.crs, drop=True)
    clipped = clipped.where(clipped.notnull(), nodata)
    return clipped

def create_forcing(time, ny, nx, values, single_value=True):
    if single_value:
        data = np.empty((len(time), ny, nx), dtype=np.float32)
        data[:] = values[:, None, None]
    

    return data


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

    


# ## Prepare forcing data from the global model ARE5

# dotenv.load_dotenv()
# CDS_url, CDS_key = os.getenv('CDS_URL'), os.getenv('CDS_API_KEY')
# config_path = Path.home() / '.cdsapirc'
# if not config_path.exists():
#     print("Creating .cdsapirc ...")
#     config_path.write_text(f"url: {CDS_url}\nkey: {CDS_key}\n", encoding='utf-8')
#     print("Created at:", config_path)

# # Setup variables
# variables = [
#     'total_precipitation', # Precipitation
#     '2m_temperature', # Temperature
#     '10m_u_component_of_wind', '10m_v_component_of_wind', # Wind
#     '2m_dewpoint_temperature',  
#     'surface_solar_radiation_downwards', # Radiation
# ]
# dataset = 'reanalysis-era5-single-levels'
# forcing_dir = os.path.join(test_folder, 'data/forcing')
# if not os.path.exists(forcing_dir): os.makedirs(forcing_dir)
# download_dir = os.path.join(test_folder, 'data/forcing/download')
# if not os.path.exists(download_dir): os.makedirs(download_dir)
# start, end = '2025-03-01 00:00:00', '2025-12-31 00:00:00'
# start_time = datetime.strptime(start, '%Y-%m-%d %H:%M:%S')
# end_time = datetime.strptime(end, '%Y-%m-%d %H:%M:%S')
# minx, miny, maxx, maxy = catchment.total_bounds
# area = [round(float(maxy), 2), round(float(minx), 2), round(float(miny), 2), round(float(maxx), 2)]

# # Download ERA5 data monthly
# client = cdsapi.Client()
# for var in variables:
#     current = start_time.replace(day=1)
#     while current <= end_time:
#         year, month = current.year, current.month
#         last_day = calendar.monthrange(year, month)[1]
#         month_start = datetime(year, month, 1)
#         month_end = datetime(year, month, last_day, 23)
#         # Clip by requested range
#         actual_start = max(start_time, month_start)
#         actual_end = min(end_time, month_end)
#         # Days to download
#         days = [f"{d:02d}" for d in range(actual_start.day, actual_end.day + 1)]
#         # Output file
#         out_file = f"{var}_ERA5_{year}_{month:02d}.nc"
#         output = os.path.join(download_dir, out_file)
#         # Skip existing file
#         if os.path.exists(output): os.remove(output)
#         print(f"Downloading: {out_file}")
#         request = {
#             'product_type': 'reanalysis', 'variable': [var],
#             'year': [str(year)], 'month': [f"{month:02d}"], 'day': days,
#             'time': [f"{h:02d}:00" for h in range(24)], 'area': area,
#             'data_format': 'netcdf', 'download_format': 'unarchived'
#         }
#         client.retrieve(dataset, request, output)
#         # Next month
#         current += relativedelta(months=1)

# # Check valid files
# for var in variables:
#     pattern = os.path.join(download_dir, f"{var}_ERA5_*.nc")
#     raw_files = sorted(glob.glob(pattern))
#     # Filter valid files
#     files, bad_files = [], []
#     for f in raw_files:
#         if is_valid_netcdf(f): files.append(f)
#         else: bad_files.append(f)
#     print(f"Valid files '{var}': {len(files)}/{len(raw_files)}")
#     if bad_files:
#         print("Bad files:")
#         for f in bad_files: print(" -", f)

# # Concatenate sub-files
# for var in variables:
#     pattern = os.path.join(download_dir, f"{var}_ERA5_*.nc")
#     raw_files, files = sorted(glob.glob(pattern)), []
#     files = [f for f in raw_files if is_valid_netcdf(f)]
#     if len(files) > 0:
#         ds = xr.open_mfdataset(
#             files, combine='by_coords', parallel=True, chunks={'valid_time':24}
#         )
#         # Remove ERA5 artifact dimension
#         if 'expver' in ds: ds = ds.drop_vars('expver')
#         encoding = {
#             var: {"zlib": True, "complevel": 4, "dtype": "float32"}
#             for var in ds.data_vars
#         }
#         output = pattern.replace('_*', "")
#         print(f"Writing forcing file: {output}")
#         ds.to_netcdf(output, format="NETCDF4", encoding=encoding)
#         ds.close()
#         del ds
#         gc.collect()
# print("DONE:")

# # Merge files
# final_output, datasets = os.path.join(forcing_dir, "my_ear5_forcing.nc"), []
# for var in variables:
#     pattern = os.path.join(download_dir, f"{var}_ERA5.nc")
#     datasets.append(pattern)
# if len(datasets) > 0:
#     datasets_ds = [xr.open_dataset(f) for f in datasets]
#     ds_final = xr.merge(datasets_ds, compat="override", join="outer")
#     encoding = {
#         var: {"zlib": True, "complevel": 4, "dtype": "float32"}
#         for var in ds_final.data_vars
#     }
#     ds_final.to_netcdf(final_output, format="NETCDF4", encoding=encoding)
#     ds_final.close()
#     del ds_final
#     gc.collect()
#     print("DONE:")
# else: print("No files to merge")

# # Change variable name
# rename_dict = {
#     "tp": "precip", "t2m": "temp",
#     "u10": "wind_u", "v10": "wind_v",
#     "ssrd": "radiation",
# }
# final_output = os.path.join(forcing_dir, "my_ear5_forcing.nc")
# final_output_rename = os.path.join(forcing_dir, "my_forcing.nc")
# ds_final = xr.open_dataset(final_output)
# ds_final = ds_final.rename({"longitude": "x", "latitude": "y"})
# ds_final = ds_final.rio.set_spatial_dims(x_dim="x", y_dim="y")
# ds_final = ds_final.rio.write_crs("EPSG:4326")
# ds_rename = ds_final.rename({
#     k: v for k, v in rename_dict.items() if k in ds_final.data_vars
# })
# # Unit conversion
# if "radiation" in ds_rename:
#     ds_rename["radiation"] = ds_rename["radiation"] / 3600.0
#     ds_rename["radiation"].attrs["units"] = "mm"
# if "precip" in ds_rename:
#     ds_rename["precip"] = ds_rename["precip"] * 1000.0
#     ds_rename["precip"].attrs["units"] = "mm"
# if "temp" in ds_rename:
#     ds_rename["temp"] = ds_rename["temp"] - 273.15
#     ds_rename["temp"].attrs["units"] = "degC"
# if "d2m" in ds_rename:
#     ds_rename["d2m"] = ds_rename["d2m"] - 273.15
#     ds_rename["d2m"].attrs["units"] = "degC"
# ds_rename = ds_rename.sortby("valid_time")
# encoding = {
#     var: {"zlib": True, "complevel": 4, "dtype": "float32"}
#     for var in ds_rename.data_vars
# }
# ds_rename.to_netcdf(final_output_rename, format="NETCDF4", encoding=encoding)


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