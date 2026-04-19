import os, shutil, zipfile, traceback
from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import JSONResponse
from config import PROJECT_ROOT
from services import functions
import geopandas as gpd


router = APIRouter()


# Upload file from local computer to server
@router.post("/upload_data")
async def upload_data(file: UploadFile = File(...), projectName: str = Form(...),
    fileName: str = Form(...), type: str = Form(...), user=Depends(functions.basic_auth)):
    project_name, _ = functions.project_definer(projectName, user)
    if (type == 'grid'): save_dir = os.path.join(PROJECT_ROOT, project_name, "input")
    elif (type == 'gis'): save_dir = os.path.join(PROJECT_ROOT, project_name, "GIS")
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
        if os.path.exists(file_path): functions.safe_remove(file_path)
        temp_dir = os.path.normpath(os.path.join(save_dir, 'temp'))
        if os.path.exists(temp_dir): shutil.rmtree(temp_dir)
        await file.close()











