import traceback
from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse
from services import functions


router, processes = APIRouter(), {}

@router.post("/init_lakes")
async def init_lakes(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        print(body)
        # project_name, _ = functions.project_definer(body.get('projectName'), user)
        # project_cache = request.app.state.project_cache.setdefault(project_name, None)
        # if not project_cache:
        #     print("Project is not available in memory. Creating a new one...")
        #     request.app.state.project_cache = {}
        #     project_cache_dict = request.app.state.project_cache
        #     project_cache = project_cache_dict.setdefault(project_name, {})



        return JSONResponse({'content': result, 'status': 'ok'})
    except Exception as e:
        print('/init_lakes:\n==============')
        traceback.print_exc()
        return JSONResponse({'status': 'error', 'message': f"Error: {e}"})