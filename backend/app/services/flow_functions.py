import os, dotenv, rasterio
import geopandas as gpd
from shapely.ops import unary_union
from shapely.geometry import Polygon, MultiPolygon
from netCDF4 import Dataset



dotenv.load_dotenv()
MET_url = os.getenv('MET_ProstAPI_URL')
MET_client_id = os.getenv('MET_ProstAPI_CLIENT_ID')
NVE_url = os.getenv('NVE_URL')
NVE_client_id = os.getenv('NVE_API_KEY')
NODATA_DEM, NODATA_INT = -9999.0, 0

# soil_codes = {
#     1: "Rocks and boulders", 2: "Gravel", 3: "Coarse sand",
#     4: "Fine sand", 5: "Coarse sand with clay",
#     6: "Fine sand with clay", 7: "Coarse clay with sand",
#     8: "Fine clay with sand", 9: "Clay", 10: "Fine clay",
#     11: "Very fine clay", 12: "Silt", 13: "Gyttja/peat",
#     14: "Bedrock", 15: "Glacier", 16: "Water"
# }
# soil_types = {
#     "Rocks and boulders": [0.10, 0.01, 5000, 200, 0.03, 2],
#     "Gravel": [0.25, 0.02, 3000, 500, 0.03, 3],
#     "Coarse sand": [0.38, 0.03, 2000, 1000, 0.025, 3],
#     "Fine sand": [0.41, 0.04, 1200, 1200, 0.020, 3],
#     "Coarse sand with clay": [0.42, 0.05, 600, 1500, 0.018, 4],
#     "Fine sand with clay": [0.43, 0.05, 400, 1500, 0.017, 4],
#     "Coarse clay with sand": [0.45, 0.06, 200, 1800, 0.015, 5],
#     "Fine clay with sand": [0.46, 0.07, 120, 1800, 0.014, 6],
#     "Clay": [0.48, 0.08, 60, 2000, 0.012, 7],
#     "Fine clay": [0.50, 0.09, 40, 2000, 0.011, 8],
#     "Very fine clay": [0.52, 0.10, 20, 2000, 0.010, 9],
#     "Silt": [0.46, 0.07, 150, 1800, 0.014, 6],
#     "Gyttja/peat": [0.80, 0.20, 50, 2500, 0.008, 4],
#     "Bedrock": [0.05, 0.01, 100, 100, 0.040, 1],
#     "Glacier": [0.30, 0.02, 500, 500, 0.020, 2],
#     "Water": [1.00, 1.00, 10000, 0, 0, 0]
# }
# land_codes = {
#     1: "Bare soil", # 1-Bare land, 15-Bare rock, 17-Unclassified
#     3: "Impervious/Urban", # 3-Other paved, 9-Paved road, 10-Unpaved road, 12-Railroad, 16-Building
#     2: "Water", 4: "Snow/Ice", 5: "Field", 6: "Shallow vegetation", 7: "Dense vegetation",
# }
# land_types = {
#     "Bare soil": [0.1, 0.1, 0.2, 0.02, 0.25, 0.2],
#     "Water": [0, 0, 0, 0.03, 0.07, 1.05],
#     "Field": [3.0, 0.8, 1.5, 0.20, 0.20, 1.0],
#     "Shallow vegetation": [2.0, 0.5, 1.0, 0.15, 0.23, 0.9],
#     "Dense vegetation": [5.0, 1.5, 3.0, 0.40, 0.13, 1.1],
#     "Impervious/Urban": [0.5, 0.1, 0.5, 0.05, 0.15, 0.3],
#     "Snow/Ice": [0, 0, 0, 0.03, 0.80, 0.1]
# }

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
    clipped = clipped.fillna(nodata)
    clipped.rio.write_nodata(nodata, inplace=True)
    return clipped




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


