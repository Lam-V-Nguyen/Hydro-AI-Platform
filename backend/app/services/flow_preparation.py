import os, json, traceback, mercantile, rasterio, shutil, io, sknw, copy
from fastapi import APIRouter, Request, Depends, UploadFile, File, Form, Response
from fastapi.responses import JSONResponse
import geopandas as gpd, numpy as np, matplotlib.cm as cm, pandas as pd
from config import PROJECT_ROOT, WHITEBOX_DIR
from dotenv import load_dotenv
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject
from rasterio.features import shapes
from shapely.geometry import shape, LineString
from shapely.ops import unary_union, linemerge
from PIL import Image
from skimage.morphology import skeletonize
from services import functions, flow_functions
from whitebox.whitebox_tools import WhiteboxTools
load_dotenv()
wtb = WhiteboxTools()
wtb.set_verbose_mode(False)
wtb.set_whitebox_dir(WHITEBOX_DIR)

router = APIRouter()

@router.get("/{name:path}/terrain/{key}/{folder}/{filename}/{z}/{x}/{y}.png")
def terrain_tiles(name: str, key: str, folder: str, filename: str, z: int, x: int, y: int):
    try:
        project = name
        tif_folder = os.path.normpath(os.path.join(PROJECT_ROOT, project, 'flows', "terrains", folder))
        tif_path = os.path.normpath(os.path.join(tif_folder, filename))
        if not os.path.exists(tif_path):
            return JSONResponse({"status": 'error', "message": f"File not found: {tif_path}"})
        # Get min and max
        meta_path = os.path.normpath(os.path.join(tif_folder, f"{folder}.json"))
        with open(meta_path) as f:
            meta = json.load(f)
        global_min, global_max = float(meta[key].get("min", 0)), float(meta[key].get("max", 0))
        bounds = mercantile.xy_bounds(x, y, z)
        dst_transform = rasterio.transform.from_bounds(
            bounds.left, bounds.bottom, bounds.right, bounds.top, 256, 256
        )
        dst = np.full((256, 256), np.nan, dtype=np.float32)
        with rasterio.open(tif_path) as src:
            reproject( source=rasterio.band(src, 1), destination=dst,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=dst_transform, dst_crs="EPSG:3857",
                resampling=Resampling.bilinear, dst_nodata=np.nan
            )
        if np.all(np.isnan(dst)): return Response(status_code=204)
        valid_mask = ~np.isnan(dst)
        norm = np.zeros_like(dst)
        if global_max > global_min:
            norm[valid_mask] = (dst[valid_mask] - global_min) / (global_max - global_min)
        else: norm[:] = 0
        norm = np.clip(norm, 0, 1)
        rgba_map = cm.get_cmap("terrain")(norm)
        rgb = (rgba_map[:, :, :3] * 255).astype(np.uint8)
        alpha = (valid_mask * 255).astype(np.uint8)
        rgba = np.dstack([rgb, alpha])
        img, buf = Image.fromarray(rgba, mode="RGBA"), io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/terrain_upload")
async def terrain_upload(file: UploadFile = File(...),
    projectName: str = Form(...), user=Depends(functions.basic_auth)):
    try:
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        os.makedirs(flow_dir, exist_ok=True)
        dir = os.path.normpath(os.path.join(flow_dir, "terrains"))
        os.makedirs(dir, exist_ok=True)
        name, dst_crs = file.filename.rstrip(".tif"), "EPSG:3857"
        save_dir = os.path.normpath(os.path.join(dir, name))
        if os.path.exists(save_dir): shutil.rmtree(save_dir)
        os.makedirs(save_dir, exist_ok=True)
        terrain_path = os.path.normpath(os.path.join(save_dir, file.filename))
        with open(terrain_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        # Convert to COG
        cog_path = os.path.splitext(terrain_path)[0] + "_cog.tif"
        with rasterio.open(terrain_path) as src:
            if src.crs is None:
                return JSONResponse({'status': 'error', 'message': "TIF file has no CRS"})
            transform, width, height = calculate_default_transform(
                src.crs, dst_crs, src.width, src.height, *src.bounds
            )
            profile = src.profile.copy()
            profile.update({"crs": dst_crs, "transform": transform, "width": width,
                "height": height, "driver": "COG", "compress": "LZW", "tiled": True
            })
            with rasterio.open(cog_path, "w", **profile) as dst:
                reproject(
                    source=rasterio.band(src, 1), destination=rasterio.band(dst, 1),
                    src_transform=src.transform, src_crs=src.crs,
                    dst_transform=transform, dst_crs=dst_crs,
                    resampling=Resampling.bilinear
                )
        # Get min and max
        with rasterio.open(cog_path) as src:
            data = src.read(1, masked=True)
            global_min, global_max = float(data.min()), float(data.max())
        del data
        meta_path, meta = os.path.splitext(terrain_path)[0] + ".json", {}
        if os.path.exists(meta_path):
            with open(meta_path, "r") as f: meta = json.load(f)
        meta['raw'] = {"min": global_min, "max": global_max}
        with open(meta_path, "w") as f: json.dump(meta, f)
        tile_url = f"/{project_name}/terrain/raw/{name}/{os.path.basename(cog_path)}/{{z}}/{{x}}/{{y}}.png"
        contents = {"tile_url": tile_url, "min": global_min, "max": global_max}
        return JSONResponse({'status': 'ok', 'content': contents})
    except Exception as e:
        print('/terrain_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})
    
@router.post("/geojson_upload")
async def geojson_upload(file: UploadFile = File(...)):
    try:
        gdf = gpd.read_file(file.file)
        if gdf.empty: return JSONResponse({'status': 'error', 'message': 'No data found.'})
        if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
        return JSONResponse({'status': 'ok', 'content': json.loads(gdf.to_json())})
    except Exception as e:
        print('/geojson_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/raster_check")
async def raster_check(request: Request, user=Depends(functions.basic_auth)):
    body = await request.json()
    file_name, key = body.get('filename'), body.get('key')
    folder = file_name.rstrip(".tif")
    project_name, _ = functions.project_definer(body.get('projectName'), user)
    flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
    os.makedirs(flow_dir, exist_ok=True)
    dir = os.path.normpath(os.path.join(flow_dir, "terrains", folder))
    if key == "fill":
        status, message = "error", 'No fill terrain found. Please upload terrain data and run "Fill sinks/depressions".'
        path = os.path.normpath(os.path.join(dir, folder + "_filled.tif"))
    elif key == "flow_direction":
        status, message = "error", 'No flow direction found. Work on "Terrain Processing" and run "Flow direction".'
        path = os.path.normpath(os.path.join(dir, folder + "_flowdir.tif"))
    elif key == "flow_accumulation":
        status, message = "error", 'No flow accumulation found. Work on "Terrain Processing" and run "Flow accumulation".'
        path = os.path.normpath(os.path.join(dir, folder + "_flowacc.tif"))
    if os.path.exists(path): status, message = "ok", ''
    return JSONResponse({'status': status, 'message': message})

@router.post("/detect_streams")
async def detect_streams(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        file_name, threshold = body.get('filename'), body.get('threshold')
        folder, key = file_name.rstrip(".tif"), "streams"
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        os.makedirs(flow_dir, exist_ok=True)
        dir = os.path.normpath(os.path.join(flow_dir, "terrains", folder))
        dtm_path = os.path.normpath(os.path.join(dir, file_name))
        fill_name, stream_name = folder + "_filled.tif", folder + "_streams.tif"
        flwdir_name, flwacc_name = folder + "_flowdir.tif", folder + "_flowacc.tif"
        fill_path = os.path.normpath(os.path.join(dir, fill_name))
        if os.path.exists(fill_path): functions.safe_remove(fill_path)
        wtb.fill_depressions(dem=dtm_path, output=fill_path)
        flw_path = os.path.normpath(os.path.join(dir, flwdir_name))
        if os.path.exists(flw_path): functions.safe_remove(flw_path)
        wtb.d8_pointer(dem=fill_path, output=flw_path)
        flwacc_path = os.path.normpath(os.path.join(dir, flwacc_name))
        if os.path.exists(flwacc_path): functions.safe_remove(flwacc_path)
        wtb.d8_flow_accumulation(i=fill_path, output=flwacc_path, out_type="cells")
        stream_path = os.path.normpath(os.path.join(dir, stream_name))
        if os.path.exists(stream_path): functions.safe_remove(stream_path)
        print(flwacc_path, stream_path, threshold)
        wtb.extract_streams(flow_accum=flwacc_path, output=stream_path, threshold=threshold)
        meta_path, meta = os.path.normpath(os.path.join(dir, f"{folder}.json")), {}
        if os.path.exists(meta_path):
            with open(meta_path, "r") as f: meta = json.load(f)
        meta[key] = {"min": 0, "max": 1}
        with open(meta_path, "w") as f: json.dump(meta, f)
        tile_url = f"/{project_name}/terrain/{key}/{folder}/{stream_name}/{{z}}/{{x}}/{{y}}.png"
        contents = {"tile_url": tile_url, "min": 0, "max": 1}
        return JSONResponse({'status': 'ok', 'content': contents})
    except Exception as e:
        print('/detect_streams:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})


# @router.post("/fill_terrain")
# async def fill_terrain(request: Request, user=Depends(functions.basic_auth)):
#     try:
#         body = await request.json()
#         file_name = body.get('filename')
#         folder = file_name.rstrip(".tif")
#         fill_name, json_file = folder + "_filled.tif", f"{folder}.json"
#         project_name, _ = functions.project_definer(body.get('projectName'), user)
#         flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
#         os.makedirs(flow_dir, exist_ok=True)
#         dir = os.path.normpath(os.path.join(flow_dir, "terrains", folder))
#         os.makedirs(dir, exist_ok=True)
#         dtm_path = os.path.normpath(os.path.join(dir, file_name))
#         fill_path = os.path.normpath(os.path.join(dir, fill_name))
#         if os.path.exists(fill_path): functions.safe_remove(fill_path)
#         wtb.fill_depressions(dem=dtm_path, output=fill_path)
#         with rasterio.open(fill_path) as src:
#             data = src.read(1, masked=True)
#             global_min, global_max = float(data.min()), float(data.max())
#         del data
#         meta_path, meta = os.path.normpath(os.path.join(dir, json_file)), {}
#         if os.path.exists(meta_path):
#             with open(meta_path, "r") as f: meta = json.load(f)
#         meta['filled'] = {"min": global_min, "max": global_max}
#         with open(meta_path, "w") as f: json.dump(meta, f)
#         tile_url = f"/{project_name}/terrain/filled/{folder}/{fill_name}/{{z}}/{{x}}/{{y}}.png"
#         contents = {"tile_url": tile_url, "min": global_min, "max": global_max}
#         return JSONResponse({'status': 'ok', 'content': contents})
#     except Exception as e:
#         print('/fill_terrain:\n==============')
#         traceback.print_exc()
#         return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

# @router.post("/flow_direction")
# async def flow_direction(request: Request, user=Depends(functions.basic_auth)):
#     try:
#         body = await request.json()
#         file_name = body.get('filename')
#         folder = file_name.rstrip(".tif")
#         flowdir_name, json_file = folder + "_flowdir.tif", f"{folder}.json"
#         project_name, _ = functions.project_definer(body.get('projectName'), user)
#         flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
#         os.makedirs(flow_dir, exist_ok=True)
#         dir = os.path.normpath(os.path.join(flow_dir, "terrains", folder))
#         fill_path = os.path.normpath(os.path.join(dir, folder + "_filled.tif"))
#         flow_path = os.path.normpath(os.path.join(dir, flowdir_name))
#         if os.path.exists(flow_path): functions.safe_remove(flow_path)
#         wtb.d8_pointer(dem=fill_path, output=flow_path)
#         with rasterio.open(flow_path) as src:
#             data = src.read(1, masked=True)
#             global_min, global_max = float(data.min()), float(data.max())
#         del data
#         meta_path, meta = os.path.normpath(os.path.join(dir, json_file)), {}
#         if os.path.exists(meta_path):
#             with open(meta_path, "r") as f: meta = json.load(f)
#         meta['flowdir'] = {"min": global_min, "max": global_max}
#         with open(meta_path, "w") as f: json.dump(meta, f)
#         tile_url = f"/{project_name}/terrain/flowdir/{folder}/{flowdir_name}/{{z}}/{{x}}/{{y}}.png"
#         contents = {"tile_url": tile_url, "min": global_min, "max": global_max}
#         return JSONResponse({'status': 'ok', 'content': contents})
#     except Exception as e:
#         print('/flow_direction:\n==============')
#         traceback.print_exc()
#         return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

# @router.post("/flow_accumulation")
# async def flow_accumulation(request: Request, user=Depends(functions.basic_auth)):
#     try:
#         body = await request.json()
#         file_name = body.get('filename')
#         folder = file_name.rstrip(".tif")
#         fill_name, flowacc_name = f"{folder}_filled.tif", f"{folder}_flowacc.tif"
#         project_name, _ = functions.project_definer(body.get('projectName'), user)
#         flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
#         os.makedirs(flow_dir, exist_ok=True)
#         dir = os.path.normpath(os.path.join(flow_dir, "terrains", folder))
#         fill_path = os.path.normpath(os.path.join(dir, fill_name))
#         flowacc_path = os.path.normpath(os.path.join(dir, flowacc_name))
#         if os.path.exists(flowacc_path): functions.safe_remove(flowacc_path)
#         wtb.d8_flow_accumulation(i=fill_path, output=flowacc_path)
#         with rasterio.open(flowacc_path) as src:
#             data = src.read(1, masked=True)
#             global_min, global_max = float(data.min()), float(data.max())
#         del data
#         meta_path, meta = os.path.normpath(os.path.join(dir, f"{folder}.json")), {}
#         if os.path.exists(meta_path):
#             with open(meta_path, "r") as f: meta = json.load(f)
#         meta['flowacc'] = {"min": global_min, "max": global_max}
#         with open(meta_path, "w") as f: json.dump(meta, f)
#         tile_url = f"/{project_name}/terrain/flowacc/{folder}/{flowacc_name}/{{z}}/{{x}}/{{y}}.png"
#         contents = {"tile_url": tile_url, "min": global_min, "max": global_max}
#         return JSONResponse({'status': 'ok', 'content': contents})
#     except Exception as e:
#         print('/flow_accumulation:\n==============')
#         traceback.print_exc()
#         return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

# @router.post("/catchment")
# async def catchment(request: Request, user=Depends(functions.basic_auth)):
#     try:
#         body = await request.json()
#         file_name, lat, lon = body.get('filename'), body.get('lat'), body.get('lon')
#         threshold, snap_distance = float(body.get('threshold')), float(body.get('snapDistance'))
#         folder = file_name.rstrip(".tif")
#         fill_name, catchment_name = f"{folder}_filled.tif", f"{folder}_catchment.tif"
#         project_name, _ = functions.project_definer(body.get('projectName'), user)
#         flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
#         os.makedirs(flow_dir, exist_ok=True)
#         dir = os.path.normpath(os.path.join(flow_dir, "terrains", folder))
#         fill_path = os.path.normpath(os.path.join(dir, fill_name))
#         catchment_path = os.path.normpath(os.path.join(dir, catchment_name))
#         if os.path.exists(catchment_path): functions.safe_remove(catchment_path)
#         # catchment = flow_functions.watershed(fill_path, lat, lon, threshold, snap_distance)
#         if catchment.empty: return JSONResponse({'status': 'error', 'message': 'No catchment found.'})
#         return JSONResponse({'status': 'ok', 'content': json.loads(catchment.to_json())})
#     except Exception as e:
#         print('/catchment:\n==============')
#         traceback.print_exc()
#         return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/data_upload")
async def data_upload(file: UploadFile = File(...), projectName: str = Form(...),
    key: str = Form(...), user=Depends(functions.basic_auth)):
    try:
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        os.makedirs(flow_dir, exist_ok=True)
        if key == "soil": 
            folder, func_codes = "soils", flow_functions.soil_codes
            func_types = copy.deepcopy(flow_functions.soil_types)
            new_cols = ["theta_s", "theta_r", "k_sat_ver", "soil_depth", "conductivity_decay", "brooks_corey"]
        elif key == "land": 
            folder, func_codes = "lands", flow_functions.land_codes
            func_types = copy.deepcopy(flow_functions.land_types)
            new_cols = ["LAI", "root_depth", "interception", "manning_n", "albedo", "kc"]
        save_dir = os.path.normpath(os.path.join(flow_dir, folder))
        os.makedirs(save_dir, exist_ok=True)
        file_ext = file.filename.split(".")
        soil_path = os.path.normpath(os.path.join(save_dir, file.filename))
        with open(soil_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        if file_ext[-1].lower() in ["tif"]:
            with rasterio.open(soil_path) as src:
                data = src.read(1)
                mask = data != src.nodata
                data = data.astype(np.int32)
                results = ({ "geometry": shape(geom), key: func_codes.get(value, "")
                } for geom, value in shapes(data, mask=mask, transform=src.transform))
                geoms = list(results)
            del data
            gdf = gpd.GeoDataFrame(geoms, crs=src.crs)
        elif file_ext[-1].lower() in ["geojson"]: 
            gdf = gpd.read_file(soil_path)
        if gdf.empty: return JSONResponse({'status': 'error', 'message': 'No data found.'})
        if key not in gdf.columns: gdf.insert(1, key, 'None')
        mapped = gdf[key].map(lambda x: func_types.get(x, ["None"] * len(new_cols)))
        gdf[new_cols] = pd.DataFrame(mapped.tolist(), columns=new_cols)
        gdf[key] = np.where(gdf[key]=='', 'None', gdf[key])
        gdf[key] = gdf[key].astype(str)
        if '_id' not in gdf.columns: gdf.insert(0, '_id', range(1, len(gdf) + 1))
        gdf = gdf[['_id', key, 'geometry'] + new_cols]
        for col in new_cols:
            gdf[col] = pd.to_numeric(gdf[col], errors='coerce')
        if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
        return JSONResponse({'status': 'ok', 'content': json.loads(gdf.to_json())})
    except Exception as e:
        print('/data_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/polygon_clip")
async def polygon_clip(request: Request):
    try:
        body = await request.json()
        base_layer, clip_layer = body.get('baseLayer'), body.get('clipLayer')
        base_layer = gpd.GeoDataFrame.from_features(base_layer, crs="EPSG:4326")
        clip_layer = gpd.GeoDataFrame.from_features(clip_layer, crs="EPSG:4326")
        get_area = body.get('getArea')
        # Clip the base layer to the clip layer
        if get_area == 'inside': clipped_layer = gpd.clip(base_layer, clip_layer)
        elif get_area == 'outside': clipped_layer = base_layer.overlay(clip_layer, how='difference')
        if clipped_layer.empty: return JSONResponse({'status': 'error', 'message': 'No data found.'})
        clipped_layer = clipped_layer.reset_index(drop=True)
        clipped_layer['_id'] = clipped_layer.index + 1
        return JSONResponse({'status': 'ok', 'content': json.loads(clipped_layer.to_json())})
    except Exception as e:
        print('/polygon_clip:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/assign_type")
async def assign_type(request: Request):
    try:
        body = await request.json()
        key, data = body.get('key'), body.get('data')
        if key == "soil": content = copy.deepcopy(flow_functions.soil_types[data])
        elif key == "land": content = copy.deepcopy(flow_functions.land_types[data])
        content.insert(0, data)
        return JSONResponse({'status': 'ok', 'content': content})
    except Exception as e:
        print('/assign_type:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/river_upload")
async def river_upload(file: UploadFile = File(...), projectName: str = Form(...),
    key: str = Form(...), threshold: float = Form(...), user=Depends(functions.basic_auth)):
    try:
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        os.makedirs(flow_dir, exist_ok=True)
        save_dir = os.path.normpath(os.path.join(flow_dir, 'rivers'))
        os.makedirs(save_dir, exist_ok=True)
        file_ext = file.filename.split(".")
        ext = file_ext[-1].lower()
        if key == "river-raster" and not ext in ["tif"]:
            return JSONResponse({'status': 'error', 'message': 'Flow accumulation data must be in *.tif format.'})
        if key == "river-vector" and not ext in ["geojson"]:
            return JSONResponse({'status': 'error', 'message': 'Vector data must be in *.geojson format.'})
        river_path = os.path.normpath(os.path.join(save_dir, file.filename))
        with open(river_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        if file_ext[-1].lower() in ["tif"]:
            with rasterio.open(river_path) as src:
                data = src.read(1, masked=True)
                transform = src.transform
            mask = (data >= float(threshold)).astype(np.uint8)
            skeleton = skeletonize(mask).astype(np.uint8)
            graph = sknw.build_sknw(skeleton, multi=False) 
            del skeleton, mask, data
            lines = []
            for s, e in graph.edges():
                pts = graph[s][e]['pts']  # Nx2 array: row, col
                # Convert row, col to x, y CRS
                xy_pts = [transform * (c, r) for r, c in pts]
                lines.append(LineString(xy_pts))
            merged = linemerge(unary_union(lines))
            if merged.geom_type == "LineString": lines = [merged]
            else: lines = list(merged.geoms)
            gdf = gpd.GeoDataFrame(geometry=lines, crs=src.crs)
        elif file_ext[-1].lower() in ["geojson"]: gdf = gpd.read_file(river_path)
        if gdf.empty: return JSONResponse({'status': 'error', 'message': 'No data found.'})
        if '_id' not in gdf.columns: gdf.insert(0, '_id', range(1, len(gdf) + 1))
        new_cols = ['width', 'depth', 'manning_n']
        for col in new_cols:
            if col not in gdf.columns: gdf[col] = 'None'
            else: gdf[col] = pd.to_numeric(gdf[col], errors='coerce')
        gdf = gdf[['_id', 'width', 'depth', 'manning_n', 'geometry']]
        if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
        return JSONResponse({'status': 'ok', 'content': json.loads(gdf.to_json())})
    except Exception as e:
        print('/river_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})


# @router.post("/weather_location")
# async def weather_location(request: Request):
#     try:
#         body = await request.json()
#         content = flowFunctions.weather_init(body.get('key'))
#         if len(content) == 0: return JSONResponse({'status': 'error', 'message': 'No data found.'})
#         return JSONResponse({'status': 'ok', 'content': json.loads(content.to_json())})
#     except Exception as e:
#         print('/weather_location:\n==============')
#         traceback.print_exc()
#         return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

# @router.post("/weather_provider")
# async def weather_provider(request: Request):
#     try:
#         body = await request.json()
#         source, station = body.get('source'), body.get('station')
#         start, end = body.get('start'), body.get('end')
#         start_time = datetime.strptime(start, '%Y-%m-%d %H:%M:%S')
#         end_time = datetime.strptime(end, '%Y-%m-%d %H:%M:%S')
#         if start_time >= end_time: 
#             return JSONResponse({'status': 'error', 'message': "Error: Start time is later than end time."})
#         content, missing = flowFunctions.weather_downloader(source, station, start_time, end_time)
#         if len(content) == 0: return JSONResponse({'status': 'error', 'message': 'No data found.'})
#         return JSONResponse({'status': 'ok', 'content': content, 'missing': missing})
#     except Exception as e:
#         print('/weather_provider:\n==============')
#         traceback.print_exc()
#         return JSONResponse({'status': 'error', 'message': f"Error: {e}"})
