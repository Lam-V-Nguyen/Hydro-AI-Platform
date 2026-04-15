import traceback, os, pickle, json
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from services import functions, grid_functions
from config import PROJECT_ROOT
from shapely.geometry import Polygon
import numpy as np


router, processes = APIRouter(), {}

@router.post("/init_lakes")
async def init_lakes(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        lakes_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "lakes"))
        if not os.path.exists(lakes_dir): os.makedirs(lakes_dir, exist_ok=True)      
        project_cache = request.app.state.project_cache.setdefault(project_name, None)
        if not project_cache:
            print("Project is not available in memory. Creating a new one...")
            request.app.state.project_cache = {}
            project_cache_dict = request.app.state.project_cache
            project_cache = project_cache_dict.setdefault(project_name, {})
        if 'lake_db' not in project_cache:
            lake_path = os.path.normpath(os.path.join(lakes_dir, 'lakes.pkl'))
            if not os.path.exists(lake_path): 
                print("Lake data is not available. Creating a new one...")
                grid_functions.initLakes(lake_path=lake_path)
            with open(lake_path, 'rb') as f: lake_db = pickle.load(f)
            project_cache['lake_db'] = lake_db
        else: lake_db = project_cache['lake_db']
        if 'depth_db' not in project_cache:
            depth_path = os.path.normpath(os.path.join(lakes_dir, 'depth.pkl'))
            if not os.path.exists(depth_path):
                print("Depth data is not available. Creating a new one...")
                grid_functions.initLakes(depth_path=depth_path)
            with open(depth_path, 'rb') as f: depth_db = pickle.load(f)
            project_cache['depth_db'] = depth_db
        else: depth_db = project_cache['depth_db']
        lake_path = os.path.normpath(os.path.join(lakes_dir, 'lakes.json'))
        if not os.path.exists(lake_path):
            result = lake_db.groupby("region")["name"].apply(list).to_dict()
            # Save the processed lake data
            json.dump(result, open(lake_path, "w", encoding=functions.encoding_detect(lake_path)))
        else: result = json.loads(open(lake_path, "r", encoding=functions.encoding_detect(lake_path)).read())
        return JSONResponse({'content': result, 'status': 'ok'})
    except Exception as e:
        print('/init_lakes:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})
    
@router.post("/load_lakes")
async def load_lakes(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        lake = body.get('lakeName')
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        project_cache = request.app.state.project_cache.setdefault(project_name, None)
        if project_cache is None:
            print("Project is not available in memory. Creating a new one...")
            request.app.state.project_cache = {}
            project_cache = request.app.state.project_cache.setdefault(project_name, {})
        lake_db, depth_db = project_cache.get('lake_db', None), project_cache.get('depth_db', None)        
        lake_dir = os.path.join(PROJECT_ROOT, project_name, "lakes")
        if lake_db is None:
            print("Lake data is not available in memory. Creating a new one...")
            lake_path = os.path.normpath(os.path.join(lake_dir, 'lakes.pkl'))
            if not os.path.exists(lake_path): grid_functions.initLakes(lake_path=lake_path)
            with open(lake_path, 'rb') as f: lake_db = pickle.load(f)
            project_cache['lake_db'] = lake_db
        if depth_db is None:
            print("Depth data is not available in memory. Creating a new one...")
            depth_path = os.path.normpath(os.path.join(lake_dir, 'depth.pkl'))
            if not os.path.exists(depth_path): grid_functions.initLakes(depth_path=depth_path)
            with open(depth_path, 'rb') as f: depth_db = pickle.load(f)
            project_cache['depth_db'] = depth_db
        if lake != 'all':
            lake_data = lake_db[lake_db['name'] == lake].copy()
            if lake_data.empty: return JSONResponse({'status': 'error', 'message': 'Lake not found.'})
            lake_id = lake_data['id'].iloc[0]
            depth_data = depth_db.loc[lake_id].copy()
            lake_data['min'] = round(depth_data['depth'].min(), 2)
            lake_data['max'] = round(depth_data['depth'].max(), 2)
            lake_data['avg'] = round(depth_data['depth'].mean(), 2)
        else: lake_data, depth_data = lake_db.copy(), None
        lake_data["geometry"] = lake_data.geometry.apply(lambda geo: grid_functions.remove_holes(geo, None))
        temp = lake_data.copy().to_crs(lake_data.estimate_utm_crs())
        lake_data['perimeter'] = temp.geometry.apply(
            lambda g: round(g.exterior.length if isinstance(g, Polygon)
                            else sum(p.exterior.length for p in g.geoms), 2))
        project_cache['lake'], project_cache['depth'] = lake_data, depth_data
        contents = {'lake': json.loads(lake_data.to_json()), 
            'depth': json.loads(depth_data.to_json()) if depth_data is not None else None}
        return JSONResponse({'content': contents})
    except Exception as e:
        print('/load_lakes:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/search_lake")
async def search_lake(request: Request, user=Depends(functions.basic_auth)):
    body = await request.json()
    project_name, _ = functions.project_definer(body.get('projectName'), user)
    lake_dir = os.path.join(PROJECT_ROOT, project_name, "lakes")
    lake_path = os.path.normpath(os.path.join(lake_dir, 'lakes_name.json'))   
    if not os.path.exists(lake_path):
        project_cache = request.app.state.project_cache.setdefault(project_name, None)
        if project_cache is None:
            print("Project is not available in memory. Creating a new one...")
            request.app.state.project_cache = {}
            project_cache = request.app.state.project_cache.setdefault(project_name, {})
            path = os.path.normpath(os.path.join(lake_dir, 'lakes.pkl'))
            if not os.path.exists(lake_path): grid_functions.initLakes(lake_path=path)
            with open(lake_path, 'rb') as f: lake_db = pickle.load(f)
            project_cache['lake_db'] = lake_db
        else: lake_db = project_cache.get('lake_db')
        data = np.unique(lake_db['name'].values).tolist()
        # Save the processed lake data
        json.dump(data, open(lake_path, "w", encoding=functions.encoding_detect(lake_path)))
    else: data = json.loads(open(lake_path, "r", encoding=functions.encoding_detect(lake_path)).read())    
    name = body.get('name')
    result = data if name == '' else [x for x in data if name.lower() in x.lower()]
    return JSONResponse({'content': result})









