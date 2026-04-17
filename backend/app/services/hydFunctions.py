import os, datetime, re, traceback
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from services import functions
from config import PROJECT_ROOT



router = APIRouter()

# Get parameters for an existing scenario
@router.post("/get_scenario")
async def get_scenario(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        project_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name))
        in_dir, data = os.path.normpath(os.path.join(project_dir, "input")), {}
        if os.path.exists(in_dir):
            mdu_path = os.path.normpath(os.path.join(in_dir, "FlowFM.mdu"))
            if not os.path.exists(mdu_path):
                return JSONResponse({"status": 'error', "message": f"Scenario '{body.get('projectName')}' doesn't have an *.mdu file."})
            with open(mdu_path, 'r', encoding=functions.encoding_detect(mdu_path)) as f:
                for raw_line in f:
                    line = raw_line.split("#")[0].strip()
                    if line.startswith('AngLat'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2: data["avgLat"] = parts[1].strip()
                    elif line.startswith('NetFile'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2: data["gridPath"] = parts[1].strip()
                    elif line.startswith('Kmx'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2: data["nLayers"] = parts[1].strip()
                    elif line.startswith('TStart'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            temp = datetime.datetime.fromtimestamp(int(parts[1].strip()))
                            data["startDate"] = temp.strftime("%Y-%m-%d %H:%M:%S")
                    elif line.startswith('TStop'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            temp = datetime.datetime.fromtimestamp(int(parts[1].strip()))
                            data["stopDate"] = temp.strftime("%Y-%m-%d %H:%M:%S")
                    elif line.startswith('ObsFile'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            obs_path = os.path.normpath(os.path.join(in_dir, parts[1].strip()))
                            with open(obs_path, 'r', encoding=functions.encoding_detect(obs_path)) as f:
                                lines = f.readlines()
                            data["obsPointTable"] = [[z.replace("'", ""), y, x] 
                                for x, y, z in [line.split() for line in lines if len(line.split()) == 3]]
                    elif line.startswith('CrsFile'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            crs_path = os.path.normpath(os.path.join(in_dir, parts[1].strip()))
                            with open(crs_path, 'r', encoding=functions.encoding_detect(crs_path)) as f:
                                lines = f.readlines()
                            data["crossSectionTable"] = [[z, y, x] 
                                for x, y, z in [line.split() for line in lines if len(line.split()) == 3]]
                    elif line.startswith('ExtForceFileNew'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            boundary_path = os.path.normpath(os.path.join(in_dir, parts[1].strip()))
                            boundary, boundary_names, forcing = [], [], []
                            with open(boundary_path, 'r', encoding=functions.encoding_detect(boundary_path)) as f:
                                for line1 in f:
                                    if line1.strip().startswith('locationFile'):
                                        parts = line1.split("=")
                                        if len(parts) >= 2 and parts[1] not in boundary_names:
                                            file_path = os.path.normpath(os.path.join(in_dir, parts[1].replace("\n", "")))
                                            with open(file_path, 'r', encoding=functions.encoding_detect(file_path)) as f:
                                                line_files = f.readlines()
                                            boundary.append([[z, y, x] for x, y, z in [line.split() for line in line_files if len(line.split()) == 3]])
                                            boundary_names.append(parts[1])
                                    elif line1.strip().startswith('forcingFile'):
                                        parts = line1.split("=")
                                        if len(parts) >= 2 and parts[1] not in forcing: forcing.append(parts[1])
                            data["boundaryTable"] = boundary[0]
                    elif line.startswith('DtUser'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            values = functions.seconds_datetime(int(parts[1].strip()))
                            data["userTimestepDate"], data["userTimestepTime"] = values[0], values[1]
                    elif line.startswith('DtNodal'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            values = functions.seconds_datetime(int(parts[1].strip()))
                            data["nodalTimestepDate"], data["nodalTimestepTime"] = values[0], values[1]
                    elif line.startswith('HisInterval'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            temp = parts[1].strip()
                            seconds = int(temp.split(" ")[0].strip())
                            values = functions.seconds_datetime(seconds)
                            data["hisIntervalDate"], data["hisIntervalTime"] = values[0], values[1]
                            temp_start = int(temp.split(" ")[1].strip())
                            temp_stop = int(temp.split(" ")[2].strip())
                            start = datetime.datetime.fromtimestamp(temp_start)
                            stop = datetime.datetime.fromtimestamp(temp_stop)
                            data["hisStart"] = start.strftime("%Y-%m-%d %H:%M:%S")
                            data["hisStop"] = stop.strftime("%Y-%m-%d %H:%M:%S")
                    elif line.startswith('MapInterval'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            temp = parts[1].strip()
                            seconds = int(temp.split(" ")[0].strip())
                            values = functions.seconds_datetime(seconds)
                            data["mapIntervalDate"], data["mapIntervalTime"] = values[0], values[1]
                            temp_start = int(temp.split(" ")[1].strip())
                            temp_stop = int(temp.split(" ")[2].strip())
                            start = datetime.datetime.fromtimestamp(temp_start)
                            stop = datetime.datetime.fromtimestamp(temp_stop)
                            data["mapStart"] = start.strftime("%Y-%m-%d %H:%M:%S")
                            data["mapStop"] = stop.strftime("%Y-%m-%d %H:%M:%S")
                    elif line.startswith('WaqInterval'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            temp = parts[1].strip()
                            seconds = int(temp.split(" ")[0].strip())
                            values = functions.seconds_datetime(seconds)
                            data["wqIntervalDate"], data["wqIntervalTime"] = values[0], values[1]
                            temp_start = int(temp.split(" ")[1].strip())
                            temp_stop = int(temp.split(" ")[2].strip())
                            start = datetime.datetime.fromtimestamp(temp_start)
                            stop = datetime.datetime.fromtimestamp(temp_stop)
                            data["wqStart"] = start.strftime("%Y-%m-%d %H:%M:%S")
                            data["wqStop"] = stop.strftime("%Y-%m-%d %H:%M:%S")
                    elif line.startswith('StatsInterval'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            values = functions.seconds_datetime(int(parts[1].strip()))
                            data["statisticDate"], data["statisticTime"] = values[0], values[1]
                    elif line.startswith('TimingsInterval'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2:
                            values = functions.seconds_datetime(int(parts[1].strip()))
                            data["timingDate"], data["timingTime"] = values[0], values[1]
                    elif line.startswith('WaterLevIni'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2: data["initWaterLevel"] = parts[1].strip()
                    elif line.startswith('InitialSalinity'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2: data["initSalinity"] = parts[1].strip()
                    elif line.startswith('Temperature'):
                        parts = [p.strip() for p in line.split("=") if p.strip()]
                        if len(parts) == 2: data["initTemperature"] = parts[1].strip()
            data["meteoPath"], meteos, data["meteoName"] = '', [], "FlowFM_meteo.tim"
            meteo_path = os.path.normpath(os.path.join(in_dir, data["meteoName"]))
            if os.path.exists(meteo_path):
                with open(meteo_path, 'r', encoding=functions.encoding_detect(meteo_path)) as f:
                    lines = f.readlines()
                for line in lines:
                    line = line.replace("\n", "")
                    if len(line.strip().split()) != 5: continue
                    temp = line.strip().split()
                    temp[0] = datetime.datetime.fromtimestamp(int(temp[0].strip())*60).strftime("%Y-%m-%d %H:%M:%S")
                    meteos.append(temp)
                data["meteoPath"] = meteos
            data["weatherPath"], weathers, data["weatherType"], data["weatherName"] = '', [], '', "windxy.tim"
            weather_path = os.path.normpath(os.path.join(in_dir, data["weatherName"]))
            if os.path.exists(weather_path):
                with open(weather_path, 'r', encoding=functions.encoding_detect(weather_path)) as f:
                    lines = f.readlines()
                for line in lines:
                    line = line.replace("\n", "")
                    if not line.strip(): continue
                    temp = line.strip().split()
                    temp[0] = datetime.datetime.fromtimestamp(int(temp[0].strip())*60).strftime("%Y-%m-%d %H:%M:%S")
                    weathers.append(temp)
                if len(temp) == 3: data["weatherType"] = "wind-magnitude-direction"
                data["weatherPath"] = weathers
            return JSONResponse({"status": 'ok', "content": data})
        else: return JSONResponse({"status": 'new'})
    except Exception as e:
        print('/get_scenario:\n==============')
        traceback.print_exc()
        return JSONResponse({"status": 'error', "message": f"Error: {str(e)}\nConsider running the scenario again."})

# Get list of source from .ext file
@router.post("/init_source")
async def init_source(request: Request, user=Depends(functions.basic_auth)):
    body = await request.json()
    project_name, _ = functions.project_definer(body.get('projectName'), user)
    path, key = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "input", "FlowFM.ext")), body.get('key')
    if os.path.exists(path):
        with open(path, 'r', encoding=functions.encoding_detect(path)) as f:
            content = f.read()
        parts = re.split(r'\n\s*\n', content)
        parts = [p.strip() for p in parts if p.strip()]
        if len(parts) == 0: 
            os.remove(path)
            return JSONResponse({"status": 'error', "content": [], "type": []})
        lts = [re.search(r'FILENAME=(.+?)\.pli', p).group(1) for p in parts if re.search(r'FILENAME=(.+?)\.pli', p)]
        if len(lts) == 0: return JSONResponse({"status": 'error', "content": [], "type": []})        
        if not key == '':
            check = [i[0] for i in key]
            item_remove = [p for p in lts if p not in check]
            if len(item_remove) > 0:
                item_remove = item_remove[0]
                temp_path = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "input"))
                for part in parts:
                    if item_remove in part:
                        parts.remove(part)
                        pli_path = os.path.normpath(os.path.join(temp_path, f"{item_remove}.pli"))
                        tim_path = os.path.normpath(os.path.join(temp_path, f"{item_remove}.tim"))
                        if os.path.exists(pli_path): os.remove(pli_path)
                        if os.path.exists(tim_path): os.remove(tim_path)
            with open(path, 'w', encoding=functions.encoding_detect(path)) as file:
                joined_parts = '\n\n'.join(parts)
                file.write(f"\n{joined_parts}\n")
        status, data, type = 'ok', [], []
        for part in parts:
            if 'QUANTITY=discharge_salinity_temperature_sorsin' in part:
                match = re.search(r'FILENAME=(.+?)\.pli', part)
                if match:
                    data.append(match.group(1))
                    type.append('discharge_salinity_temperature_sorsin')
    else: status, data, type = 'error', [], []
    return JSONResponse({"status": status, "content": data, "type": type})









