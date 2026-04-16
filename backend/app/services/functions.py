import os, json, chardet, asyncio, stat
from config import PROJECT_ROOT, ALLOWED_USERS
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi import Depends, HTTPException, status
from redis.asyncio.lock import Lock
from uuid import uuid4



def encoding_detect(file_path: str) -> str:
    """Detect the encoding of a file."""
    encoding = 'utf-8'
    if not os.path.exists(file_path) or not os.path.isfile(file_path): return encoding
    with open(file_path, 'rb') as f:
        raw_data = f.read()
        result = chardet.detect(raw_data)
        encoding = result['encoding']
    return encoding

USERS = json.load(open(ALLOWED_USERS, "r", encoding=encoding_detect(ALLOWED_USERS)))

def basic_auth(credentials: HTTPBasicCredentials=Depends(HTTPBasic())):
    username, password = credentials.username, credentials.password
    if username not in USERS or USERS[username] != password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorized", headers={"WWW-Authenticate": "Basic"}
        )
    return username

def project_definer(old_name, username='admin'):
    new_name = f'{username}/{old_name}' if username!='admin' else 'demo'
    name_id = f'{new_name}/{uuid4()}'
    if old_name == '': new_name = new_name.rstrip('/')
    return new_name, name_id

async def auto_extend(lock: Lock, interval: int = 10):
    """
    Auto-extend Redis lock every `interval` seconds, only if still owned.
    """
    try:
        while True:
            await asyncio.sleep(interval)
            try:
                if not await lock.locked(): break
            except Exception: break
            try: await lock.extend()
            except Exception: break
    except asyncio.CancelledError: pass

def remove_readonly(func, path, excinfo):
    # Change the readonly bit, but not the file contents
    os.chmod(path, stat.S_IWRITE)
    func(path)




