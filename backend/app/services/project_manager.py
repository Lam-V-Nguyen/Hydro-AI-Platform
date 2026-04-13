import traceback, asyncio

from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse

from services import functions


router = APIRouter()

@router.post("/auth_check")
async def auth_check(user=Depends(functions.basic_auth)):
    output = 'ok' if user == 'admin' else 'error'
    return {"user": user, "output": output}

# Set up the database depending on the project
@router.post("/setup_database")
async def setup_database(request: Request, user=Depends(functions.basic_auth)):
    try:
        body = await request.json()
        project_name, _ = functions.project_definer(body.get('projectName'), user)
        redis, params = request.app.state.redis, body.get('params')
        extend_task, lock = None, redis.lock(f"{project_name}:setup_database", timeout=600)
        print(project_name)





    except Exception as e:
        print('/setup_database:\n==============')
        traceback.print_exc()
        return JSONResponse({"status": 'error', "message": f"Error: {str(e)}"})
    finally:
        if extend_task:
            extend_task.cancel()
            try: await extend_task
            except asyncio.CancelledError: pass





