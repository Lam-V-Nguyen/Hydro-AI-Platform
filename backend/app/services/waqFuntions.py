import os, json, datetime, re, traceback, asyncio, shutil
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from services import functions, wq_functions
from config import PROJECT_ROOT, SOURCE_BACKEND
import numpy as np, pandas as pd

router = APIRouter()


@router.post("/select_hyd")
async def select_hyd(request: Request, user=Depends(functions.basic_auth)):
    body = await request.json()
    project_name, _ = functions.project_definer(body.get('projectName'), user)
    folder = [PROJECT_ROOT, project_name, "DFM_DELWAQ", 'FlowFM.hyd']
    path = os.path.normpath(os.path.join(*folder))
    if os.path.exists(path):
        return JSONResponse({"status": 'ok', "content": wq_functions.hydReader(path)})
    message = f"Error: Cannot find .hyd file in project '{project_name}'.\nPlease run a hydrodynamic simulation first."
    return JSONResponse({"status": 'error', "message": message})

@router.post("/load_waq")
async def load_waq(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        folder = [PROJECT_ROOT, project_name, "output", 'scenarios', f"{body.get('waqName')}.json"]
        path, data = os.path.normpath(os.path.join(*folder)), {}
        if not os.path.exists(path): return JSONResponse({"status": 'error', "message": 'Configuration file not found.'})
        with open(path, 'r', encoding=functions.encoding_detect(path)) as f:
            files = json.load(f)
        parts = re.split('DATA_ITEM', files['timeTable'])
        parts, time_data = [p.strip() for p in parts if p.strip()], []
        for part in parts:
            temp = part.split('\n')
            location, substances, times = temp[0].strip(), temp[4].strip().split(' '), temp[5:]
            if len(times) > 0:
                for idx, substance in enumerate(substances):
                    for item in times:
                        temp_item = item.strip().split(' ')
                        temp_time = pd.to_datetime(temp_item[0], format='%Y/%m/%d-%H:%M:%S').strftime('%Y-%m-%d %H:%M:%S')
                        time_data.append([temp_time, location, substance.replace("'", ""), temp_item[idx + 1]])
        result = [item for item in time_data if item[3] != '-999.0']
        data['key'], data['name'], data['mode'] = files['key'], files['folderName'], files['mode']
        data['obs'], data['loads'], data['time_data'] = files['obsPoints'], files['loadsData'], result
        data['times'], data['usefors'] = files['timeTable'], files['usefors']
        data['initial'], data['scheme'] = files['initial'], files['scheme']
        data['maxiter'], data['tolerance'] = files['maxiter'], files['tolerance']
        data['useforsFrom'], data['useforsTo'] = files['useforsFrom'], files['useforsTo']
        return JSONResponse({"status": 'ok', "content": data})
    except: return JSONResponse({"status": 'error'})

@router.post("/clone_waq")
async def clone_waq(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        old_name, new_name = body.get('oldName'), body.get('newName')
        project_folder = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, 'output', 'scenarios'))
        redis = request.app.state.redis
        extend_task, lock = None, redis.lock(f"{project_name}:clone_waq", timeout=100, blocking_timeout=10)
        async with lock:
            extend_task = asyncio.create_task(functions.auto_extend(lock))
            old_path = os.path.normpath(os.path.join(project_folder, f"{old_name}.json"))
            new_path = os.path.normpath(os.path.join(project_folder, f"{new_name}.json"))
            if not os.path.exists(old_path): 
                return JSONResponse({"status": 'error', "message": f"Path '{old_path}' does not exist."})
            data = json.load(open(old_path, 'r', encoding=functions.encoding_detect(old_path)))
            data['folderName'] = new_name.replace('.json', '')
            data['timeTable'] = data['timeTable'].replace(old_name, new_name)
            json.dump(data, open(new_path, 'w', encoding=functions.encoding_detect(new_path)))
            return JSONResponse({"message": f"Scenario '{new_name}' was cloned successfully!"})
    except Exception as e:
        print('/clone_waq:\n==============')
        traceback.print_exc()
        return JSONResponse({"message": f"Error: {str(e)}"})
    finally:
        if extend_task:
            extend_task.cancel()
            try: await extend_task
            except asyncio.CancelledError: pass

# Delete a file
@router.post("/delete_file")
async def delete_file(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        redis, file = request.app.state.redis, body.get('name')
        scenario_folder = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, 'output', 'scenarios'))
        waq_folder = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, 'output', 'WAQ'))
        extend_task, lock = None, redis.lock(f"{project_name}:delete_file", timeout=300)
        async with lock:
            extend_task = asyncio.create_task(functions.auto_extend(lock))
            file_name = os.path.normpath(os.path.join(scenario_folder, f"{file}.json"))
            if not os.path.exists(file_name): 
                return JSONResponse({"status": 'error', "message": f"Path '{file_name}' does not exist."})
            if os.path.exists(waq_folder):
                waq_files = [f for f in os.listdir(waq_folder) if file in f]
                if len(waq_files) > 0:
                    for f in waq_files:
                        temp_path = os.path.normpath(os.path.join(waq_folder, f))
                        functions.safe_remove(temp_path) if f.endswith('.json') else shutil.rmtree(temp_path)
            functions.safe_remove(file_name)
            return JSONResponse({"message": f"Scenario '{file}' was deleted successfully!"})
    except Exception as e:
        print('/delete_file:\n==============')
        traceback.print_exc()
        return JSONResponse({"message": f"Error: {str(e)}"})
    finally:
        if extend_task:
            extend_task.cancel()
            try: await extend_task
            except asyncio.CancelledError: pass

@router.post("/select_waq")
async def select_waq(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        folder = [PROJECT_ROOT, project_name, "output", 'scenarios']
        path = os.path.normpath(os.path.join(*folder))
        files = [f.replace('.json', '') for f in os.listdir(path) if f.endswith('.json')]
        if len(files) == 0: return JSONResponse({"status": 'error'})
        return JSONResponse({"status": 'ok', "content": files})
    except: return JSONResponse({"status": 'error'})

@router.post("/wq_time_from_waq")
async def wq_time_from_waq(request: Request):
    try:
        body = await request.json()
        key = body.get('key')
        if key == 'Simple_Oxygen': from_ = ['NH4', 'CBOD5', 'OXY', 'SOD']
        elif key == 'Oxygen_BOD': from_ = ['OXY', 'CBOD5']
        elif key == 'Cadmium': from_ = ['IM1', 'Cd', 'IM1S1', 'CdS1']
        elif key == 'Eutrophication': from_ = ['A', 'DP', 'NORG', 'NH4', 'NO3']
        elif key == 'Trace_Metals': from_ = ['ASWTOT', 'CUWTOT', 'NIWTOT', 
            'PBWTOT', 'POCW', 'AOCW', 'DOCW', 'SSW', 'ZNWTOT', 'ASREDT', 'ASSTOT', 
            'ASSUBT', 'CUREDT', 'CUSTOT', 'CUSUBT', 'NIREDT', 'NISTOT', 'NISUBT',
            'PBREDT', 'PBSTOT', 'PBSUBT', 'DOCB', 'DOCSUB', 'POCB', 'POCSUB', 
            'S', 'ZNREDT', 'ZNSTOT', 'ZNSUBT']
        elif key == 'Conservative_Tracers': from_ = ['cTR1', 'cTR2', 'cTR3', 'dTR1', 'dTR2', 'dTR3']
        elif key == 'Suspend_Sediment': from_ = ['IM1', 'IM2', 'IM3', 'IM1S1', 'IM2S1', 'IM3S1']
        elif key == 'Coliform': from_ = ['Salinity', 'EColi']
        return JSONResponse({"status": 'ok', "froms": from_})
    except Exception as e:
        return JSONResponse({"status": 'error', "message":  f"Error: {str(e)}"})







