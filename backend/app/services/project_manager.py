import traceback, asyncio, os, shutil

from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from config import PROJECT_ROOT
from services import functions


router = APIRouter()

@router.post("/auth_check")
async def auth_check(user=Depends(functions.basic_auth)):
    output = 'ok' if user == 'admin' else 'error'
    return {"user": user, "output": output}

# Set up the database depending on the project
@router.post("/setup_database")
async def setup_database(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        redis, params = request.app.state.redis, body.get('params')
        extend_task, lock = None, redis.lock(f"{project_name}:setup_database", timeout=600)        
        async with lock:
            extend_task = asyncio.create_task(functions.auto_extend(lock, interval=10))
            project_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name))
            folders = ['input', 'GIS', 'output', 'output/config', 'output/HYD', 'output/WAQ']
            for folder in folders:
                folder_path = os.path.normpath(os.path.join(project_dir, folder))
                if not os.path.exists(folder_path): os.makedirs(folder_path, exist_ok=True)
            config_dir = os.path.normpath(os.path.join(project_dir, folder[3]))
            hyd_dir = os.path.normpath(os.path.join(project_dir, folder[4]))
            waq_dir = os.path.normpath(os.path.join(project_dir, folder[5]))
            # demo_dir = os.path.normpath(os.path.join(PROJECT_ROOT, 'demo'))
            # if user != 'admin':
            #     print(f"Copying project 'demo' folder to '{project_dir}'")
            #     os.makedirs(project_dir, exist_ok=True)
            #     shutil.copytree(demo_dir, project_dir, dirs_exist_ok=True)
            project_cache_dict = getattr(request.app.state, "project_cache", None)
            if project_cache_dict is None:
                request.app.state.project_cache = {}
                project_cache_dict = request.app.state.project_cache
            project_cache = project_cache_dict.setdefault(project_name, {})
            dm = request.app.state.dataset_manager
            # Assign datasets (only load if file path exists)
        #     hyd_his, hyd_map, waq_his, waq_map = await init_data(project_cache, dm, hyd_dir, waq_dir, params)
        #     if hyd_map is not None:
        #         print('Creating grid for hydrodynamic simulation...')
        #         project_cache['grid'] = functions.unstructuredGridCreator(hyd_map)
        #     else: return JSONResponse({"status": 'error', "message": "Cannot find hydrodynamic data (map file).\nConsider running the model again."})
        #     temp_name = params[2].replace('_his.zarr', '') if params[2] != '' else params[3].replace('_map.zarr', '')
        #     model_path = os.path.normpath(os.path.join(waq_dir, f'{temp_name}.json'))
        #     # Load or init config
        #     config_path, obs = os.path.normpath(os.path.join(config_dir, 'config.json')), {}
        #     if os.path.exists(config_path) and os.path.getsize(config_path) > 0:
        #         print('Config already exists. Loading...')
        #         config = json.loads(open(config_path, "r", encoding=functions.encoding_detect(config_path)).read())
        #         waq_model = config.get('model_type', '')
        #     else:
        #         print('Config doesn\'t exist. Creating...')
        #         config, waq_model = {"hyd": {}, "waq": {}, "meta": {"hyd_scanned": False, "waq_scanned": False}, "model_type": ''}, ''
        #         # Lazy scan HYD variables only once
        #         if (hyd_map or hyd_his) and not config['meta']['hyd_scanned']:
        #             print('Scanning HYD variables...')
        #             hyd_vars = functions.getVariablesNames([hyd_his, hyd_map])
        #             config["hyd"], config["meta"]["hyd_scanned"] = hyd_vars, True
        #         # Get WAQ model
        #         if os.path.exists(model_path):
        #             print('Loading WAQ model...')
        #             temp_data = json.load(open(model_path, "r", encoding=functions.encoding_detect(model_path)))
        #             waq_model = temp_data['model_type']
        #             config['wq_obs'] = True if 'wq_obs' in temp_data else False
        #             config['wq_loads'] = True if 'wq_loads' in temp_data else False
        #         if (waq_his or waq_map) and waq_model == '': return JSONResponse({"status": 'error', "message": "Some WAQ-related parameters are missing.\nConsider running the model again."})  
        #         # Lazy scan WAQ
        #         if (waq_map or waq_his) and config['model_type'] != waq_model:
        #             print('Scanning WAQ variables...')
        #             waq_vars = functions.getVariablesNames([waq_his, waq_map], waq_model, temp_name)
        #             config["waq"], config["meta"]["waq_scanned"], config['model_type'] = waq_vars, True, waq_model
        #         # Delete waq option if no waq files
        #         if waq_his is None and waq_map is None:
        #             print('No waq files. Deleting waq option...')
        #             config['waq'], config['meta']['waq_scanned'], config['model_type'] = {}, False, ''
        #             for k in ("wq_obs", "wq_loads"):
        #                 config.pop(k, None)
        #         # Load GIS layers
        #         config['gis_layers'] = [f.replace('.geojson', '') for f in os.listdir(gis_dir) if f.endswith(".geojson")]
        #         # Save config
        #         open(config_path, "w", encoding=functions.encoding_detect(config_path)).write(json.dumps(config))
        #     # Get number of HYD layers
        #     layer_path = os.path.normpath(os.path.join(config_dir, 'layers_hyd.json'))
        #     if not os.path.exists(layer_path):
        #         layer_reverse_hyd = functions.layerCounter(hyd_map, 'hyd')
        #         json.dump(layer_reverse_hyd, open(layer_path, "w", encoding=functions.encoding_detect(layer_path)))                    
        #     else: layer_reverse_hyd = json.load(open(layer_path, "r", encoding=functions.encoding_detect(layer_path)))
        #     # Get number of WAQ layers
        #     if waq_map is not None:
        #         print('Creating layers for water quality simulation...')
        #         layer_path = os.path.normpath(os.path.join(config_dir, 'layers_waq.json'))
        #         if not os.path.exists(layer_path):
        #             layer_reverse_waq = functions.layerCounter(waq_map, 'waq')
        #             json.dump(layer_reverse_waq, open(layer_path, "w", encoding=functions.encoding_detect(layer_path)))                    
        #         else: layer_reverse_waq = json.load(open(layer_path, "r", encoding=functions.encoding_detect(layer_path)))
        #     # Convert sigma layer to depth layer
        #     depth_values = [float(v.split(' ')[1]) for k, v in layer_reverse_hyd.items() if int(k) >= 0]
        #     max_depth, layer_reverse_waq_depth = max(np.array(depth_values, dtype=float), key=abs), {}
        #     for k, v in layer_reverse_waq.items():
        #         if int(k) >= 0: 
        #             note, val = '', round(max_depth*float(v.split(':')[1].strip().split(' ')[0].strip())/100, 2)
        #             if int(k) == 0: note = ' (surface)'
        #             elif int(k) == len(layer_reverse_hyd)-2: note = ' (bottom)'
        #             layer_reverse_waq_depth[k] = f'Depth: {val} m{note}'
        #         else: layer_reverse_waq_depth[k] = v
        #     # Get observations in WAQ
        #     if os.path.exists(model_path):
        #         temp_data = json.load(open(model_path, "r", encoding=functions.encoding_detect(model_path)))
        #         if 'wq_obs' in temp_data: obs['wq_obs'] = temp_data['wq_obs']
        #         if 'wq_loads' in temp_data: obs['wq_loads'] = temp_data['wq_loads']
        #     # Restructure configuration
        #     result = {**config.get("hyd", {}), **config.get("waq", {})}
        #     for k, v in config.items():
        #         if k not in ("hyd", "waq", "meta"):
        #             result[k] = v
        #     # Serialize grid & layer_reverse to JSON-safe formats
        #     redis_mapping = {
        #         "hyd_his_path": params[0], "hyd_map_path": params[1], "waq_his_path": params[2], "waq_map_path": params[3],
        #         "layer_reverse_hyd": msgpack.packb(layer_reverse_hyd, use_bin_type=True),
        #         "layer_reverse_waq": msgpack.packb(layer_reverse_waq_depth, use_bin_type=True),
        #         "config": msgpack.packb(result, use_bin_type=True), "waq_model": waq_model,
        #         "waq_obs": msgpack.packb(obs, use_bin_type=True)
        #     }
        #     # Save to Redis
        #     await redis.delete(project_name)
        #     await redis.hset(project_name, mapping=redis_mapping)
            print('Configuration loaded successfully.')
            return JSONResponse({"status": 'ok', "content": {}})
    except Exception as e:
        print('/setup_database:\n==============')
        traceback.print_exc()
        return JSONResponse({"status": 'error', "message": f"Error: {str(e)}"})
    finally:
        if extend_task:
            extend_task.cancel()
            try: await extend_task
            except asyncio.CancelledError: pass





