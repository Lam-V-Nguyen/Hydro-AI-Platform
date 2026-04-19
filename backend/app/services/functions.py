import os, json, chardet, asyncio, stat, time, re
from config import ALLOWED_USERS
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi import Depends, HTTPException, status
from redis.asyncio.lock import Lock
from config import PROJECT_ROOT
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

def safe_remove(path, retries=10, delay=1):
    for _ in range(retries):
        try:
            os.remove(path)
            return
        except PermissionError:
            time.sleep(delay)
    raise Exception(f"Cannot delete file: {path}")

def seconds_datetime(seconds: int) -> tuple:
    days = seconds // 86400
    seconds %= 86400
    hours = seconds // 3600
    seconds %= 3600
    minutes = seconds // 60
    seconds = seconds % 60
    return days, f"{hours:02d}:{minutes:02d}:{seconds:02d}"




def fileWriter(template_path: str, params: dict) -> str:
    """
    Write to file with predefined parameters

    Parameters
    ----------
    template_path: str
        The path of template file
    params: dict
        The dictionary of parameters

    Returns
    -------
    str
        The content of saved file
    """
    # Open the file and read its contents
    with open(template_path, 'r', encoding=encoding_detect(template_path)) as file:
        file_content = file.read()
    # Replace placeholders with actual values
    for key, value in params.items():
        file_content = file_content.replace(f'{{{key}}}', str(value))
    # Adjust the structure
    lines, result = [], []
    for line in file_content.split('\n'):
        if '#' in line and not line.strip().startswith('#'):
            left, right = line.split('#', 1)
            left, middle = left.split("=", 1)
            lines.append((left + " = ", middle.strip(), '#' + right.strip()))
        else: lines.append((line.strip(), "", ""))
    max_len = max(len(middle) for _, middle, _ in lines) + 1
    for left, middle, right in lines:
        result.append(left + middle.ljust(max_len) + right)
    result = "\n".join(result)
    return result

def contentWriter(project_name: str, filename: str, data: list, content: str, unit: str='sec') -> tuple:
    """
    Write to file with predefined parameters

    Parameters
    ----------
    project_name: str
        The name of the project
    filename: str
        The name of the file
    data: list
        The list of data
    content: str
        The content of the file
    ref_utc: datetime
        The reference time
    unit: str
        The unit of time

    Returns
    -------
    tuple
        The status and message
    """
    try:
        path = os.path.normpath(os.path.join(PROJECT_ROOT, project_name, "input"))
        # Write weather.tim file
        tim_path = os.path.normpath(os.path.join(path, filename))
        with open(tim_path, 'w', encoding=encoding_detect(tim_path)) as f:
            for row in data:
                if unit == 'sec': row[0] = int(row[0]/1000)
                elif unit == 'min': row[0] = int(row[0]/(1000*60))
                temp = '  '.join([str(r) for r in row])
                f.write(f"{temp}\n")
        # Add weather data to FlowFM.ext file
        ext_path = os.path.normpath(os.path.join(path, "FlowFM.ext"))
        if os.path.exists(ext_path):
            with open(ext_path, 'r', encoding=encoding_detect(ext_path)) as f:
                update_content = f.read()
            parts = re.split(r'\n\s*\n', update_content)
            parts = [p.strip() for p in parts if p.strip()]
            if (any(filename in part for part in parts)): 
                index = parts.index([part for part in parts if filename in part][0])
                parts[index] = content
            else: parts.append(content)
            with open(ext_path, 'w', encoding=encoding_detect(ext_path)) as file:
                joined_parts = '\n\n'.join(parts)
                file.write(f"\n{joined_parts}\n")
        else:
            with open(ext_path, 'w', encoding=encoding_detect(ext_path)) as f:
                f.write(f"\n{content}\n")
        status, message = 'ok', "Data is saved successfully."
    except Exception as e:
        status, message = 'error', f"Error: {str(e)}"
    return status, message