import os, json, traceback, mercantile, rasterio, shutil, io, sknw, copy, shapely, rioxarray
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

@router.post("/flow_project")
async def flow_project(request: Request, user=Depends(functions.basic_auth)):
    body = await request.json()
    try:
        file_name = body.get('filename')
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        os.makedirs(flow_dir, exist_ok=True)
        dir = os.path.normpath(os.path.join(flow_dir, file_name))
        os.makedirs(dir, exist_ok=True)
        return JSONResponse({'status': 'ok', 'message': f"Project '{file_name}' created successfully."})
    except Exception as e:
        print('/data_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.get("/{name:path}/terrain/{key}/{folder}/{filename}/{z}/{x}/{y}.png")
def terrain_tiles(name: str, key: str, folder: str, filename: str, z: int, x: int, y: int):
    try:
        project = name
        tif_folder = os.path.normpath(os.path.join(PROJECT_ROOT, project, 'flows', folder))
        tif_path = os.path.normpath(os.path.join(tif_folder, filename))
        if not os.path.exists(tif_path):
            return JSONResponse({"status": 'error', "message": f"File not found: {tif_path}"})
        # Get min and max
        meta_path = tif_path.replace("_cog.tif", ".json").replace("_streams.tif", ".json")
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
async def terrain_upload(file: UploadFile = File(...), flowName: str = Form(...),
    projectName: str = Form(...), user=Depends(functions.basic_auth)):
    try:
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        if not os.path.exists(flow_dir): os.makedirs(flow_dir, exist_ok=True)
        terrain_dir = os.path.normpath(os.path.join(flow_dir, flowName))
        if not os.path.exists(terrain_dir): os.makedirs(terrain_dir, exist_ok=True)
        terrain_path = os.path.normpath(os.path.join(terrain_dir, file.filename))
        with open(terrain_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        file.file.close()
        # Convert to COG
        dst_crs, cog_path = "EPSG:3857", os.path.splitext(terrain_path)[0] + "_cog.tif"
        with rasterio.open(terrain_path) as src:
            if src.crs is None:
                return JSONResponse({'status': 'error', 'message': "TIF file has no CRS"})
            transform, width, height = calculate_default_transform(
                src.crs, dst_crs, src.width, src.height, *src.bounds
            )
            profile = src.profile.copy()
            profile.update({"crs": dst_crs, "transform": transform, "width": width,
                "height": height, "driver": "COG", "compress": "LZW", "tiled": True,
                "blockxsize": 256, "blockysize": 256
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
        tile_url = f"/{project_name}/terrain/raw/{flowName}/{os.path.basename(cog_path)}/{{z}}/{{x}}/{{y}}.png"
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
    dir = os.path.normpath(os.path.join(flow_dir, folder))
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
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        folder, key, flow_name = file_name.rstrip(".tif"), "streams", body.get('flowName')
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flow_name))
        dtm_path = os.path.normpath(os.path.join(flow_dir, file_name))
        fill_name, stream_name = folder + "_filled.tif", folder + "_streams.tif"
        flwdir_name, flwacc_name = folder + "_flowdir.tif", folder + "_flowacc.tif"
        fill_path = os.path.normpath(os.path.join(flow_dir, fill_name))
        if os.path.exists(fill_path): functions.safe_remove(fill_path)
        wtb.fill_depressions(dem=dtm_path, output=fill_path)
        flw_path = os.path.normpath(os.path.join(flow_dir, flwdir_name))
        if os.path.exists(flw_path): functions.safe_remove(flw_path)
        wtb.d8_pointer(dem=fill_path, output=flw_path)
        flwacc_path = os.path.normpath(os.path.join(flow_dir, flwacc_name))
        if os.path.exists(flwacc_path): functions.safe_remove(flwacc_path)
        wtb.d8_flow_accumulation(i=fill_path, output=flwacc_path, out_type="cells")
        stream_path = os.path.normpath(os.path.join(flow_dir, stream_name))
        if os.path.exists(stream_path): functions.safe_remove(stream_path)
        wtb.extract_streams(flow_accum=flwacc_path, output=stream_path, threshold=threshold)
        meta_path, meta = dtm_path.replace(".tif", ".json"), {}
        if os.path.exists(meta_path):
            with open(meta_path, "r") as f: meta = json.load(f)
        meta[key] = {"min": 0, "max": 1}
        with open(meta_path, "w") as f: json.dump(meta, f)
        tile_url = f"/{project_name}/terrain/{key}/{flow_name}/{stream_name}/{{z}}/{{x}}/{{y}}.png"
        contents = {"tile_url": tile_url, "min": 0, "max": 1}
        return JSONResponse({'status': 'ok', 'content': contents})
    except Exception as e:
        print('/detect_streams:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/catchment")
async def catchment(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        file_name, lat, lon = body.get('filename'), body.get('lat'), body.get('lon')
        snap_distance, folder = float(body.get('snapDistance')), file_name.rstrip(".tif")
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows"))
        os.makedirs(flow_dir, exist_ok=True)
        dir = os.path.normpath(os.path.join(flow_dir, folder))
        flwdir_name, catchment_name = f"{folder}_flowdir.tif", f"{folder}_catchment.tif"
        flw_path = os.path.normpath(os.path.join(dir, flwdir_name))
        snap_dir = os.path.normpath(os.path.join(dir, "snapped"))
        os.makedirs(snap_dir, exist_ok=True)
        outlet_dir = os.path.normpath(os.path.join(dir, "outlet"))
        os.makedirs(outlet_dir, exist_ok=True)
        stream_name, snapp_name = folder + "_streams.tif", "snapped.shp"
        outlet_name = "outlet.shp"
        stream_path = os.path.normpath(os.path.join(dir, stream_name))
        snap_path = os.path.normpath(os.path.join(snap_dir, snapp_name))
        if os.path.exists(snap_path): functions.safe_remove(snap_path)
        outlet_path = os.path.normpath(os.path.join(outlet_dir, outlet_name))
        if os.path.exists(outlet_path): functions.safe_remove(outlet_path)
        # Create outlet point
        with rasterio.open(stream_path) as src:
            crs = src.crs
        outlet = gpd.GeoDataFrame(geometry=[shapely.geometry.Point(lon, lat)], crs="EPSG:4326")
        outlet = outlet.to_crs(crs)
        outlet.to_file(outlet_path)
        catchment_path = os.path.normpath(os.path.join(dir, catchment_name))
        if os.path.exists(catchment_path): functions.safe_remove(catchment_path)
        wtb.jenson_snap_pour_points(pour_pts=outlet_path, streams=stream_path, output=snap_path, snap_dist=snap_distance)
        wtb.watershed(d8_pntr=flw_path, pour_pts=snap_path, output=catchment_path)
        with rasterio.open(catchment_path) as src:
            data = src.read(1).astype("uint8")
            transform = src.transform
        results = [shape(geom) for geom, val in shapes(data, transform=transform) if val == 1]
        geom = flow_functions.remove_holes(unary_union(results))
        catchment = gpd.GeoDataFrame(geometry=[geom], crs=crs)
        # Delete temporary files
        shutil.rmtree(snap_dir, onerror=functions.remove_readonly)
        shutil.rmtree(outlet_dir, onerror=functions.remove_readonly)
        functions.safe_remove(catchment_path)
        if catchment.empty: return JSONResponse({'status': 'error', 'message': 'No catchment found.'})
        if catchment.crs != "EPSG:4326": catchment = catchment.to_crs("EPSG:4326")
        return JSONResponse({'status': 'ok', 'content': json.loads(catchment.to_json())})
    except Exception as e:
        print('/catchment:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/data_upload")
async def data_upload(request: Request):
    try:
        body = await request.json()
        content, key = [], body.get('key')
        if key == "soil": 
            soil_type, soil_depth = flow_functions.soils[0], flow_functions.soils[1]
            for soil in soil_type:
                for depth in soil_depth:
                    content.append([soil, depth, 'cm'])
        elif key == "land":
            code = body.get('code')
            if code == "corine": land_code = flow_functions.corine_codes
            else: land_code = flow_functions.esa_codes
        
        
        
        

        if len(content) == 0: return JSONResponse({'status': 'error', 'message': 'No data found.'})
        return JSONResponse({'status': 'ok', 'content': content})
    except Exception as e:
        print('/data_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})


@router.post("/data_download")
async def data_download(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        projectName, key, flow_name = body.get('projectName'), body.get('key'), body.get('flowName')
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flow_name))
        if not os.path.exists(flow_dir): os.makedirs(flow_dir)
        terrain_dir = os.path.normpath(os.path.join(flow_dir, 'raw'))
        os.makedirs(terrain_dir, exist_ok=True)
        # Create a raw terrain that is clipped to catchment
        catchment = gpd.GeoDataFrame.from_features(body.get('area')['features'], crs="EPSG:4326")
        min_lon, min_lat, max_lon, max_lat = catchment.total_bounds
        bbox = (float(min_lon), float(min_lat), float(max_lon), float(max_lat))
        file = [f for f in os.listdir(flow_dir) if f.endswith('_filled.tif')][0]
        temp_path = os.path.normpath(os.path.join(flow_dir, file))
        terrain_path = os.path.normpath(os.path.join(terrain_dir, 'dtm_raw.tif'))
        if not os.path.exists(terrain_path):
            terrain = rioxarray.open_rasterio(temp_path).squeeze()
            catchment_UTM = catchment.to_crs(terrain.rio.crs)
            buffer = 10 if not terrain.rio.crs.is_geographic else 0.0001
            catchment_UTM['geometry'] = catchment_UTM['geometry'].buffer(buffer)
            terrain_clipped = flow_functions.clip_catchment(catchment_UTM, terrain)
            terrain_clipped.rio.to_raster(terrain_path)
        if key == "soil":
            soil_dir = os.path.normpath(os.path.join(flow_dir, "soil"))
            os.makedirs(soil_dir, exist_ok=True)
            # Create soil thickness
            with rasterio.open(terrain_path) as src:
                meta = src.meta.copy()
            meta.update({"dtype": "float32", "nodata": -9999.0})
            data = np.ones((meta["height"], meta["width"]), dtype="float32") * 100
            data[data == meta["nodata"]] = 100
            with rasterio.open(os.path.join(soil_dir, 'soilthickness.tif'), "w", **meta) as dst:
                dst.write(data, 1)


            
        




        
        return JSONResponse({'status': 'ok', 'content': ''})
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
        new_cols = ['width', 'depth']
        for col in new_cols:
            if col not in gdf.columns: gdf[col] = 'None'
            else: gdf[col] = pd.to_numeric(gdf[col], errors='coerce')
        gdf = gdf[['_id', 'width', 'depth', 'geometry']]
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
