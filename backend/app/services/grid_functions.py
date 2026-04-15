import os, pickle
from config import SOURCE_BACKEND
import geopandas as gpd
from shapely.geometry import Polygon, MultiPolygon




def initLakes(lake_path=None, depth_path=None):
    # Load lake database
    lake_dir = os.path.join(SOURCE_BACKEND, 'lakes_database')
    if lake_path is not None:
        lake_db_path = os.path.normpath(os.path.join(lake_dir, 'lakes.shp'))
        if os.path.exists(lake_db_path):
            lake_db = gpd.read_file(lake_db_path)
            if lake_db.crs != 'EPSG:4326': lake_db = lake_db.to_crs(crs='EPSG:4326')
            lake_db = lake_db.dropna(subset=['name', 'region', 'geometry'])
            lake_db['name'] = lake_db['name'].fillna('Unnamed Lake')
            lake_db['region'] = lake_db['region'].where(lake_db['region'].notna(), 
                'Unknown Municipality' + lake_db["id"].fillna(-1).astype(str))
            lake_db['id'] = lake_db['id'].astype('int64')
        with open(lake_path, 'wb') as f: pickle.dump(lake_db, f)
    if depth_path is not None:
        depth_db_path = os.path.normpath(os.path.join(lake_dir, 'depth.shp'))
        depth_db = gpd.read_file(depth_db_path)
        depth_db['id'] = depth_db['id'].astype('int64')
        depth_db.set_index('id', inplace=True)
        if depth_db.crs != 'EPSG:4326': depth_db = depth_db.to_crs(crs='EPSG:4326')
        depth_db['depth'] = depth_db['depth'].astype(float)
        with open(depth_path, 'wb') as f: pickle.dump(depth_db, f)

def remove_holes(geom, cell_size=0):
    geom = geom.buffer(0)
    if (cell_size == None): cell_size = geom.area
    if geom.geom_type == "Polygon":
        kept_interiors = [ring for ring in geom.interiors if Polygon(ring).area >= cell_size]
        return Polygon(geom.exterior, kept_interiors)
    elif geom.geom_type == "MultiPolygon":
        polygons = []
        for poly in geom.geoms:
            kept_interiors = [ring for ring in poly.interiors if Polygon(ring).area >= cell_size]
            polygons.append(Polygon(poly.exterior, kept_interiors))
        return MultiPolygon(polygons)
    else: return geom







