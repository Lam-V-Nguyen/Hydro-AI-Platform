import traceback, os, pickle, json
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from services import functions, grid_functions
from config import PROJECT_ROOT


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
                grid_functions.loadLakes(lake_path=lake_path)
            with open(lake_path, 'rb') as f: lake_db = pickle.load(f)
            project_cache['lake_db'] = lake_db
        else: lake_db = project_cache['lake_db']
        if 'depth_db' not in project_cache:
            depth_path = os.path.normpath(os.path.join(lakes_dir, 'depth.pkl'))
            if not os.path.exists(depth_path):
                print("Depth data is not available. Creating a new one...")
                grid_functions.loadLakes(depth_path=depth_path)
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
    









