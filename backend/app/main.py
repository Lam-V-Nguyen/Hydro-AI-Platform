import uvicorn, os, sys
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
    

# Import internally backend modules
from config import SOURCE_BACKEND, SOURCE_FRONTEND, lifespan
from services import route_page, project_manager, grid_preparation, \
    process_manager, sim_manager, data_preparation, hyd_functions, waq_funtions, \
    flow_preparation
# , wq_process, \
#     run_simulation, flow_preparation

app = FastAPI(lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Mount common static files for Mobirise (frontend)
# app.mount("/assets/images", StaticFiles(directory=os.path.join(STATIC_DIR_FRONTEND, "assets/images")), name="mobirise_images")
# app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR_FRONTEND, "assets")), name="assets")
app.mount("/src_frontend", StaticFiles(directory=SOURCE_FRONTEND), name="src_frontend")
app.mount("/src_backend", StaticFiles(directory=SOURCE_BACKEND), name="src_backend")
# # My images
# app.mount("/images", StaticFiles(directory=os.path.join(STATIC_DIR_BACKEND, "images")), name="my_images")

# app.mount("/projects_static", StaticFiles(directory=PROJECT_STATIC_ROOT), name="projects_static")

# Mount routes
app.include_router(route_page.router)
app.include_router(project_manager.router)
app.include_router(grid_preparation.router)
app.include_router(process_manager.router)
app.include_router(hyd_functions.router)
app.include_router(waq_funtions.router)
app.include_router(sim_manager.router)
app.include_router(data_preparation.router)
app.include_router(flow_preparation.router)
# app.include_router(wq_process.router)
# app.include_router(run_simulation.router)




if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload_dirs=['.'], reload=True) # Remove reload=True for production