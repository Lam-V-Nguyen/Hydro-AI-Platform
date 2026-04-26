import os, shutil, zipfile, traceback, json, msgpack
from fastapi import APIRouter, UploadFile, File, Form, Depends, Request
from fastapi.responses import JSONResponse
from config import PROJECT_ROOT
from services import functions
import geopandas as gpd, numpy as np
from shapely.geometry import mapping


router = APIRouter()


# Upload file from local computer to server
@router.post("/upload_data")
async def upload_data(file: UploadFile = File(...), projectName: str = Form(...),
    fileName: str = Form(...), type: str = Form(...), user=Depends(functions.basic_auth)):
    project_name, _ = functions.project_definer(projectName, user)
    if (type == 'grid'): save_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "input"))
    elif (type == 'gis'): save_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "GIS"))
    if not os.path.exists(save_dir): os.makedirs(save_dir)
    file_path = os.path.normpath(os.path.join(save_dir, fileName))
    try:
        zip_files = [f for f in os.listdir(save_dir) if f.endswith('.zip')]
        if len(zip_files) > 0:
            for f in zip_files: functions.safe_remove(os.path.normpath(os.path.join(save_dir, f)))
        temp_dir = os.path.normpath(os.path.join(save_dir, 'temp'))
        if os.path.exists(temp_dir): shutil.rmtree(temp_dir)
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk: break
                f.write(chunk)
        if (file_path.endswith('.zip')):
            if not os.path.exists(temp_dir): os.makedirs(temp_dir)
            else: shutil.rmtree(temp_dir)
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            files = os.listdir(temp_dir)
            if (len(files) == 1 and os.path.isdir(os.path.normpath(os.path.join(temp_dir, files[0])))):
                temp_dir = os.path.normpath(os.path.join(temp_dir, files[0]))
                files = os.listdir(temp_dir)
            else: return JSONResponse({"status": 'error', "message": "Invalid zip file. File must contain one subfolder."})
            shp_files = [f for f in files if f.endswith('.shp')]
            if len(shp_files) > 0:
                for f in shp_files:
                    file_name = os.path.normpath(os.path.join(temp_dir, f))
                    gdf = gpd.read_file(file_name)
                    if gdf.empty: return JSONResponse({"status": 'error', "message": f"File '{f}' is empty."})
                    # Convert to WGS84 if not already
                    if gdf.crs is None: gdf.set_crs(epsg=4326, inplace=True)
                    if gdf.crs != '4326': gdf = gdf.to_crs(epsg=4326)
                    gdf["geometry"] = gdf.geometry.simplify(tolerance=0.0001, preserve_topology=True)
                    file_out = os.path.normpath(os.path.join(save_dir, f'{f.replace(".shp", "")}.geojson'))
                    gdf.to_file(file_out, driver='GeoJSON')
            functions.safe_remove(file_path); shutil.rmtree(temp_dir)
            temp_dir = os.path.normpath(os.path.join(save_dir, 'temp'))
            if os.path.exists(temp_dir): shutil.rmtree(temp_dir)
        return JSONResponse({"status": "ok", "message": f"File {file.filename} uploaded successfully."})
    except Exception as e:
        print('/upload_data:\n==============')
        traceback.print_exc()
        return JSONResponse({"status": "error", "message": str(e)})
    finally: 
        if file_path.endswith('.zip') and os.path.exists(file_path): functions.safe_remove(file_path)
        temp_dir = os.path.normpath(os.path.join(save_dir, 'temp'))
        if os.path.exists(temp_dir): shutil.rmtree(temp_dir)
        await file.close()

# Process data
async def process_internal(query: str, key: str, redis, project_cache, project_name: str):
    # Internal function to process data
    message = ''
    if key == 'summary':
        dia_path = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "output", "HYD", "FlowFM.dia"))
        hyd_his, waq_his = project_cache.get("hyd_his"), project_cache.get("waq_his")
        data = functions.getSummary(dia_path, [hyd_his, waq_his])
    elif key == 'hyd_station':
        temp, message = functions.hydCreator(project_cache.get("hyd_his"))
        data = json.loads(temp.to_json())
    elif key in ['wq_obs', 'wq_loads']:
        waq_obs_raw = await redis.hget(project_name, "waq_obs")
        waq_obs = msgpack.unpackb(waq_obs_raw, raw=False)
        data = json.loads(functions.obsCreator(waq_obs[key]).to_json())
    elif key == 'sources':
        data = json.loads(functions.sourceCreator(project_cache.get("hyd_his")).to_json())
    elif key == 'crosssections':
        temp, message = functions.crosssectionCreator(project_cache.get("hyd_his"))
        data = json.loads(temp.to_json())
    elif key == '_in-situ':
        name, station_id, typ = query.split('*')
        temp = functions.selectInsitu(project_cache.get("hyd_his"), project_cache.get("hyd_map"), name, station_id, typ)
        data = { 'columns': temp.columns.tolist(), 'rows': temp.values.tolist() }
    elif key == 'substance_check':
        substance_raw = await redis.hget(project_name, 'config')
        substance = msgpack.unpackb(substance_raw, raw=False)[query]
        if len(substance) > 0: 
            data = sorted(substance)
            message = functions.valueToKeyConverter(data)
        else: data, message = None, f"No substance defined."
    elif key == 'substance':
        temp = functions.timeseriesCreator(project_cache.get("waq_his"), query, timeColumn='nTimesDlwq')
        data = { 'columns': temp.columns.tolist(), 'rows': temp.values.tolist() }
    elif key == 'static':
        # Create static data for map
        grid, hyd_map = project_cache.get("grid"), project_cache.get("hyd_map")
        x = hyd_map['mesh2d_node_x'].data.compute()
        y = hyd_map['mesh2d_node_y'].data.compute()
        z = hyd_map['mesh2d_node_z'].data.compute()
        if 'depth' in query: values = functions.interpolation_Z(grid, x, y, z)
        # Convert GeoDataFrame to expected format
        fnm = functions.numberFormatter
        features = [{ "type": "Feature", "properties": {"index": idx}, "geometry": mapping(row['geometry'])} 
                    for idx, row in grid.iterrows()]
        data = { 'meshes': { 'type': 'FeatureCollection', 'features': features },
            'values': values.tolist(), 'min_max': [fnm(np.nanmin(values)).tolist(), fnm(np.nanmax(values)).tolist()]
        }
    else:
        # Create time series data
        temp = functions.timeseriesCreator(project_cache.get("hyd_his"), key)
        data = { 'columns': temp.columns.tolist(), 'rows': temp.values.tolist() }
    return message, data

@router.post("/process_data")
async def process_data(request: Request, user=Depends(functions.basic_auth)):
    try:
        # Get body data
        body = await request.json()
        query, key, redis = body.get('query'), body.get('key'), request.app.state.redis
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        project_cache = request.app.state.project_cache.setdefault(project_name)
        lock = redis.lock(f"{project_name}:{key}", timeout=10)
        async with lock:
            message, data = await process_internal(query, key, redis, project_cache, project_name)
            if data is None: return JSONResponse({'status': 'error', 'message': message})
            return JSONResponse({'content': data, 'status': 'ok', 'message': message})
    except Exception as e:
        print('/process_data:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/initiate_options")
async def initiate_options(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        key, data, redis = body.get('key'), [], request.app.state.redis
        lock = redis.lock(f"{project_name}:initiate_options", timeout=10)
        async with lock:
            if key == 'vector': data = functions.getVectorNames()
            elif key == 'layer_hyd':
                layer_reverse_raw = await redis.hget(project_name, "layer_reverse_hyd")
                layer_reverse = msgpack.unpackb(layer_reverse_raw, raw=False)
                if layer_reverse: data = [(idx, value) for idx, value in layer_reverse.items()]
            elif key == 'sigma_waq':
                layer_reverse_raw = await redis.hget(project_name, "layer_reverse_waq")
                layer_reverse = msgpack.unpackb(layer_reverse_raw, raw=False)
                if layer_reverse: data = [(idx, value) for idx, value in layer_reverse.items()]
            elif key == 'thermocline_waq':
                config_raw = await redis.hget(project_name, "config")
                config = msgpack.unpackb(config_raw, raw=False)
                item = [x for x in config.keys() if x.startswith('waq_map_') and x.endswith('_selector')]
                if len(item) > 0: 
                    temp, temp_data = config[item[0]], []
                    for i in temp:
                        temp_data.append((i, i))
                    data = temp_data
            return JSONResponse({"status": 'ok', "content": data})
    except Exception as e:
        print('/initiate_options:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})





