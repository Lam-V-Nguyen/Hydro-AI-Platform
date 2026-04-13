from fastapi import APIRouter, Request, Depends
from uuid import uuid4
from services import functions


router = APIRouter()

@router.post("/auth_check")
async def auth_check(user=Depends(functions.basic_auth)):
    output = 'ok' if user == 'admin' else 'error'
    return {"user": user, "output": output}

# def project_definer(old_name, username='admin'):
#     new_name = f'{username}/{old_name}' if username!='admin' else 'demo'
#     name_id = f'{new_name}/{uuid4()}'
#     if old_name == '': new_name = new_name.rstrip('/')
#     return new_name, name_id