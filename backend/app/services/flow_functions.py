import os, tempfile, dotenv
from pysheds.grid import Grid
from rasterio.shutil import copy as rio_copy
from services import functions




dotenv.load_dotenv()
MET_url = os.getenv('MET_ProstAPI_URL')
MET_client_id = os.getenv('MET_ProstAPI_CLIENT_ID')
NVE_url = os.getenv('NVE_URL')
NVE_client_id = os.getenv('NVE_API_KEY')



def fill_sink(dtm_path:str, fill_path:str) -> None:
    # Load DTM
    grid = Grid.from_raster(data=dtm_path, nodata=-9999)
    dtm = grid.read_raster(data=dtm_path)
    # Fill depressions
    filled = grid.fill_depressions(dem=dtm).astype('float32')
    # Resolve flats
    inflated = grid.resolve_flats(dem=filled).astype('float32')
    file_writer(grid, inflated, fill_path)

def flow_direction(fill_path:str, flow_path:str) -> None:
    grid = Grid.from_raster(data=fill_path, nodata=-9999)
    fill = grid.read_raster(data=fill_path)
    flow = grid.flowdir(dem=fill, routing='d8').astype('int16')
    file_writer(grid, flow, flow_path)

def flow_accumulation(flow_path:str, acc_path:str) -> None:
    grid = Grid.from_raster(data=flow_path, nodata=-9999)
    flow_dir = grid.read_raster(data=flow_path)
    acc = grid.accumulation(fdir=flow_dir, routing='d8').astype('float32')
    file_writer(grid, acc, acc_path)
















def file_writer(grid:Grid, data, out_path:str) -> None:
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp_file:
        temp_file = tmp_file.name
    grid.to_raster(data, temp_file)
    copy_options = dict(
        driver="COG", compress="LZW", tiled=True,
        blocksize=256, overview_resampling="average"
    )
    rio_copy(temp_file, out_path, **copy_options)
    functions.safe_remove(temp_file)