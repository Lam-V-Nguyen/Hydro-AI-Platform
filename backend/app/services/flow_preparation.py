import os, json, traceback, mercantile, rasterio, shutil
import io, sknw, copy, shapely, rioxarray, zipfile, gc, glob, pyflwdir
from fastapi import APIRouter, Request, Depends, UploadFile, File, Form, Response
from fastapi.responses import JSONResponse
import geopandas as gpd, numpy as np, matplotlib.cm as cm, pandas as pd, xarray as xr
from config import PROJECT_ROOT, WHITEBOX_DIR, SOURCE_BACKEND
from dotenv import load_dotenv
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject
from rasterio.features import shapes, rasterize
from rasterio.merge import merge
from shapely.geometry import shape, LineString, Polygon
from shapely.ops import unary_union, linemerge
from PIL import Image
from pyflwdir import dem
from skimage.morphology import skeletonize
from services import functions, flow_functions
from whitebox.whitebox_tools import WhiteboxTools
from rasterio.io import MemoryFile
from owslib.wcs import WebCoverageService
from terracatalogueclient import Catalogue
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
        # Get min and max
        meta_path = tif_path.replace("_cog.tif", ".json").replace("_streams.tif", ".json")
        if key == "soil":
            tif_path = os.path.normpath(os.path.join(tif_folder, key, filename))            
            meta_path = os.path.normpath(os.path.join(tif_folder, key, 'soil.json'))
        if not os.path.exists(tif_path):
            return JSONResponse({"status": 'error', "message": f"File not found: {tif_path}"})
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

@router.post("/stream_upload")
async def stream_upload(request: Request, user=Depends(functions.basic_auth)):
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
        print('/stream_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/soil_upload")
async def soil_upload(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        key, flow_name, layer = "soil", body.get('flowName'), body.get('layerName')
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flow_name, key))
        file_name, json_name = layer + ".tif", 'soil.json'
        soil_path = os.path.normpath(os.path.join(flow_dir, file_name))
        soil = rioxarray.open_rasterio(soil_path).squeeze()
        min = int(soil.where(soil != soil.rio.nodata).min().item())
        max = int(soil.max().values)
        meta_path, meta = os.path.normpath(os.path.join(flow_dir, json_name)), {}
        meta[key] = {"min": min, "max": max}
        with open(meta_path, "w") as f: json.dump(meta, f)
        tile_url = f"/{project_name}/terrain/{key}/{flow_name}/{file_name}/{{z}}/{{x}}/{{y}}.png"
        contents = {"tile_url": tile_url, "min": min, "max": max}
        return JSONResponse({'status': 'ok', 'content': contents})
    except Exception as e:
        print('/soil_upload:\n==============')
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
async def data_upload(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        key = body.get('key')
        if key == "soil":
            content, soil_type, soil_depth = [], flow_functions.soils[0], flow_functions.soils[1]
            for soil in soil_type:
                for depth in soil_depth:
                    content.append([soil, depth, 'cm'])
            if len(content) == 0: return JSONResponse({'status': 'error', 'message': 'No data found.'})
            return JSONResponse({'status': 'ok', 'content': content})
        elif key == "land":
            projectName, flow_name = body.get('projectName'), body.get('flowName')
            project_name, _ = functions.project_definer(projectName, user)
            flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flow_name))
            land_dir = os.path.normpath(os.path.join(flow_dir, 'landcover'))
            if os.path.exists(land_dir): shutil.rmtree(land_dir)
            os.makedirs(land_dir)
            sample_dir = os.path.normpath(os.path.join(SOURCE_BACKEND, 'flow_samples', 'landcover'))
            catchment = gpd.GeoDataFrame.from_features(body.get('area')['features'], crs="EPSG:4326")
            terrain_dir = os.path.normpath(os.path.join(flow_dir, 'raw'))
            terrain_path = os.path.normpath(os.path.join(terrain_dir, 'dtm_raw.tif'))
            terrain = rioxarray.open_rasterio(terrain_path).squeeze()
            area, code = catchment.copy(), body.get('code')
            if code == "corine":
                land_code = flow_functions.corine_codes
                land_path_csv = os.path.normpath(os.path.join(sample_dir, "corine_mapping.csv"))
                corine_path = os.path.normpath(os.path.join(sample_dir, "U2018_CLC2018_V2020_20u1.zip"))
                with zipfile.ZipFile(corine_path, "r") as zip_ref:
                    name = os.path.basename(corine_path).replace(".zip", ".tif")
                    with zip_ref.open(name) as f:
                        data = f.read()
                        with MemoryFile(data) as memfile:
                            with rioxarray.open_rasterio(memfile) as src:
                                corine_land = src.squeeze().load()
                area = area.to_crs(corine_land.rio.crs)
                buffer = 0.001 if area.crs == "EPSG:4326" else 10
                area['geometry'] = area['geometry'].buffer(buffer)
                land_clip = flow_functions.clip_catchment(area, corine_land, corine_land.rio.nodata)
                raster_path = os.path.normpath(os.path.join(land_dir, 'corine.tif'))
                csv_path = os.path.normpath(os.path.join(land_dir, 'corine.csv'))
            elif code == "esa":
                land_code = flow_functions.esa_codes
                land_path_csv = os.path.normpath(os.path.join(sample_dir, "esa_worldcover_mapping.csv"))
                raster_path = os.path.normpath(os.path.join(land_dir, 'esa_worldcover.tif'))
                csv_path = os.path.normpath(os.path.join(land_dir, 'esa_worldcover.csv'))
                # Get landcover data from ESA worldcover
                user_name, password = os.getenv('ESA_USERNAME'), os.getenv('ESA_PASSWORD')
                catalogue = Catalogue().authenticate_non_interactive(user_name, password)
                if area.crs != 'EPSG:4326': area = area.to_crs('EPSG:4326')
                minx, miny, maxx, maxy = area.total_bounds
                bbox = Polygon.from_bounds(minx, miny, maxx, maxy)
                download_dir = os.path.join(land_dir, 'downloads')
                if os.path.exists(download_dir): shutil.rmtree(download_dir)
                # # Get name of landcover layer
                # collections = catalogue.get_collections()
                layers = [
                    # 'urn:eop:VITO:ESA_WorldCover_10m_2020_V1', 
                    'urn:eop:VITO:ESA_WorldCover_10m_2021_V2'
                ]
                # Search for products in the WorldCover collection
                product = catalogue.get_products(layers, geometry=bbox)
                catalogue.download_products(product, download_dir, force=True)
                pattern = os.path.join(download_dir, "**", "*_Map.tif")
                files = glob.glob(pattern, recursive=True)
                if len(files) == 0: 
                    return JSONResponse({'status': 'error', 'message': "No *_Map.tif files found in directory"})
                if len(files) == 1:
                    src_files = [rasterio.open(files[0])]
                    mosaic, transform = src_files[0].read(), src_files[0].transform
                elif len(files) > 1:
                    src_files = [rasterio.open(f) for f in files]
                    # Merge (mosaic)
                    mosaic, transform = merge(src_files)
                # Copy metadata
                out_meta = src_files[0].meta.copy()
                out_meta.update({
                    "height": mosaic.shape[1], "width": mosaic.shape[2],
                    "transform": transform, "compress": "lzw"
                })
                merge_path = os.path.join(land_dir, 'merged.tif')
                with rasterio.open(merge_path, "w", **out_meta) as dest:
                    dest.write(mosaic)
                # Close files
                for src in src_files: src.close()
                shutil.rmtree(download_dir)
                # Clip raster to catchment
                ds = rioxarray.open_rasterio(merge_path).squeeze()
                land_temp = ds.squeeze()
                buffer = 0.001 if area.crs == "EPSG:4326" else 10
                area['geometry'] = area['geometry'].buffer(buffer)
                land_clip = flow_functions.clip_catchment(area, land_temp, land_temp.rio.nodata)
                del land_temp, ds
                gc.collect()
                functions.safe_remove(merge_path)
            # Prepare landcover data
            land_csv = pd.read_csv(land_path_csv)
            land_clip = land_clip.rio.reproject(terrain.rio.crs)
            data = land_clip.values
            transform = land_clip.rio.transform()
            results = (
                {'geometry': geom, 'properties': {'value': value}}
                for geom, value in shapes(data, transform=transform)
            )
            gdf = gpd.GeoDataFrame.from_features(list(results))
            gdf.set_crs(terrain.rio.crs, inplace=True)
            gdf['value'] = gdf['value'].astype(int)
            gdf['value'] = gdf['value'].apply(lambda x: land_code[x][0])
            # Convert to raster
            with rasterio.open(terrain_path) as src:
                profile, transform, nodata = src.profile, src.transform, src.nodata
            shape = ((geom, value) for geom, value in zip(gdf.geometry, gdf["value"]))
            array = rasterize(
                shapes=shape, transform=transform, fill=nodata, 
                out_shape=(terrain.rio.height, terrain.rio.width)
            )
            mask = (array == nodata)
            array = np.where(mask, nodata, array)
            profile = {**profile, 'dtype': np.uint16, 'nodata': nodata}
            flow_functions.write_geotiff(array, profile, raster_path)
            if len(gdf) == 0: return JSONResponse({'status': 'error', 'message': 'No data found.'})
            # Remove nodata
            gdf = gdf[~gdf.value.isin([0, 999])].reset_index(drop=True)
            # Assign values to landcover
            gdf = gdf.merge(land_csv, left_on='value', right_on=code, how='left')
            gdf = gdf.rename(columns={'value': 'id'})
            if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
            # Save data
            land_csv.to_csv(csv_path, index=False)
            return JSONResponse({'status': 'ok', 'content': json.loads(gdf.to_json())})
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
        terrain = rioxarray.open_rasterio(temp_path).squeeze()
        terrain_path = os.path.normpath(os.path.join(terrain_dir, 'dtm_raw.tif'))
        if not os.path.exists(terrain_path):
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
            # Download soil data from ISRIC: https://files.isric.org/soilgrids/latest/data/
            soil_types, soil_depths = flow_functions.soil_types, flow_functions.soil_depths
            for item, name in soil_types.items():
                wcs = WebCoverageService(f'https://maps.isric.org/mapserv?map=/map/{item}.map', version='1.0.0')
                for type, value in soil_depths.items():
                    idx, soil_name = f'{item}_{type}', f'{name}_{value}'
                    response = wcs.getCoverage(
                        identifier=idx, crs='EPSG:4326', bbox=bbox,
                        format='image/tiff', resx=0.0025, resy=0.0025
                    )
                    with MemoryFile(response.read()) as memfile:
                        with memfile.open() as src:
                            data = rioxarray.open_rasterio(src, masked=True)
                            data_reprojected = data.rio.reproject_match(terrain)
                        data_reprojected.rio.to_raster(os.path.join(soil_dir, f'{soil_name}.tif'))
        return JSONResponse({'status': 'ok', 'message': f"Soil data downloaded successfully."})
    except Exception as e:
        print('/data_download:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/check_soil")
async def check_soil(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        projectName, flow_name = body.get('projectName'), body.get('flowName')
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir, content = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flow_name)), []
        dir = os.path.normpath(os.path.join(flow_dir, "soil"))
        files = [f for f in os.listdir(dir) if f.endswith('.tif') and f != 'soilthickness.tif']
        for file in files:
            soil_type, soil_depth = file.split('.')[0].split('_')
            temp = [
                flow_functions.soil_type_reverse[soil_type],
                flow_functions.soil_depth_reverse[soil_depth]
            ]
            content.append({
                'value': file.removesuffix('.tif'), 'label': (' - ').join(temp)
            })
        return JSONResponse({'status': 'ok', 'content': content})
    except Exception as e:
        print('/check_soil:\n==============')
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
        clipped_layer['description'] = clipped_layer.index + 1
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
    key: str = Form(...), threshold: float = Form(...), 
    flowName: str = Form(...), user=Depends(functions.basic_auth)):
    try:
        project_name, _ = functions.project_definer(projectName, user)
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flowName))
        os.makedirs(flow_dir, exist_ok=True)
        save_dir = os.path.normpath(os.path.join(flow_dir, 'river'))
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
                dem_array = src.read(1).astype(np.float32)
                crs, nodata, transform = src.crs, src.nodata, src.transform
            mask = np.isnan(dem_array) | (dem_array == nodata)
            filled_array, flwdir_array = dem.fill_depressions(elevtn=dem_array, max_depth=-1)
            flwdir_array = np.where(mask, nodata, flwdir_array)
            flw = pyflwdir.from_dem(filled_array, transform=transform, latlon=crs.is_geographic)
            flwacc = flw.accuflux(filled_array)
            mask = (flwacc >= float(threshold)).astype(np.uint8)
            skeleton = skeletonize(mask).astype(np.uint8)
            graph = sknw.build_sknw(skeleton, multi=False) 
            del skeleton, mask, flwacc
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
        if gdf.empty: 
            message = "No river is detected.\nPlease check the input raster."
            return JSONResponse({'status': 'error', 'message': message})
        if 'description' not in gdf.columns: gdf.insert(0, 'description', range(1, len(gdf) + 1))
        new_cols = ['width', 'depth']
        for col in new_cols:
            if col not in gdf.columns: gdf[col] = 'None'
            else: gdf[col] = pd.to_numeric(gdf[col], errors='coerce')
        gdf = gdf[['description', 'width', 'depth', 'geometry']]
        if gdf.crs != "EPSG:4326": gdf = gdf.to_crs("EPSG:4326")
        return JSONResponse({'status': 'ok', 'content': json.loads(gdf.to_json())})
    except Exception as e:
        print('/river_upload:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/delete_river")
async def delete_river(request: Request):
    try:
        body = await request.json()
        length = float(body.get('length'))
        data = gpd.GeoDataFrame.from_features(body.get('river')['features'], crs="EPSG:4326")
        data_UTM = data.copy().to_crs(data.estimate_utm_crs())
        data_UTM['length'] = data_UTM['geometry'].length
        data_UTM = data_UTM[data_UTM['length'] >= length]
        data_UTM = data_UTM.drop(columns=['length'])
        data_UTM = data_UTM.to_crs("EPSG:4326")
        n = len(data) - len(data_UTM)
        content = json.loads(data_UTM.to_json())
        return JSONResponse({'status': 'ok', 'content': content, 'numDeleted': n})
    except Exception as e:
        print('/delete_river:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})

@router.post("/save_flow_weather")
async def save_flow_weather(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        flow_name, data = body.get('flowName'), body.get('data')
        flow_dir = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "flows", flow_name))
        terrain_path = os.path.normpath(os.path.join(flow_dir, "raw/dtm_raw.tif"))
        if not os.path.exists(terrain_path):
            return JSONResponse({'status': 'error', 'message': "Terrain is not found.\nPlease prepare 'Topography' first."})
        terrain = rioxarray.open_rasterio(terrain_path).squeeze()
        # Create forcing nc file
        columns = [
            'time', 'precip_mm', 'temp_C', 'shortwave_Wm2', 
            'longwave_Wm2', 'wind_mps', 'pressure'
        ]
        weather = pd.DataFrame.from_records(data, columns=columns)
        weather['time'] = pd.to_datetime(weather['time'])
        weather = weather.set_index('time')
        time, crs = weather.index.to_numpy(), terrain.rio.crs
        if crs is None:
            return JSONResponse({'status': 'error', 'message': "Terrain has no crs"})
        ny, nx = terrain.rio.height, terrain.rio.width
        forcing = {
            'precip': ['precip_mm', '(mm/h)'], 'temp': ['temp_C', '(degC)'],
            'kin': ['shortwave_Wm2', '(W/m^2)'], 'kout': ['longwave_Wm2', '(W/m^2)'],
            'wind': ['wind_mps', '(m/s)'], 'press_msl': ['pressure', '(Pa)']
        }
        forcing_dir = os.path.join(flow_dir, 'forcing')
        if not os.path.exists(forcing_dir): os.makedirs(forcing_dir)
        out_path, datasets = os.path.join(forcing_dir, "my_forcing.nc"), {}
        for item, values in forcing.items():
            data = weather[values[0]].values
            data_3d = flow_functions.create_forcing(time, ny, nx, data)
            datasets[item] = (('time', 'y', 'x'), data_3d, {'units': values[1]})
        ds_final = xr.Dataset(
            data_vars=datasets, coords={"time": time, "y": terrain.y, "x": terrain.x}
        )
        ds_final.rio.set_spatial_dims(x_dim="x", y_dim="y", inplace=True)
        ds_final.rio.write_crs(crs, inplace=True)
        encoding = {
            var: {"zlib": True, "complevel": 4, "shuffle": True, "chunksizes": (1, 256, 256)}
            for var in ds_final.data_vars
        }
        ds_final.to_netcdf(out_path, engine='netcdf4', encoding=encoding)
        return JSONResponse({'status': 'ok', 'message': 'Weather data saved successfully.'})
    except Exception as e:
        print('/save_flow_weather:\n==============')
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
