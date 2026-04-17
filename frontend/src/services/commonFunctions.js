export function getUser(){
    return new Promise((resolve) => {
        function handler(event) {
            if (event.data.type === 'USER') {
                window.removeEventListener('message', handler);
                resolve(event.data.content);
            }
        }
        window.addEventListener('message', handler);
        window.parent.postMessage({type: "GET_USER"}, "*");
    });
}

export function iframeConnector(objBtn, objtarget, type, content = null, lineType='crossSection') {
    if (objBtn.__handler) objBtn.removeEventListener('click', objBtn.__handler);
    objBtn.__handler = async () => {
        const freshData = typeof content === 'function' ? content() : content;
        const result = await new Promise((resolve) => {
            function listener(event) {
                if (event.data?.requestId === type) {
                    window.removeEventListener('message', listener);
                    resolve(event.data.result);
                }
            }
            window.addEventListener('message', listener);
            const contents = {
                id: 'hyd', requestId: type, 
                content: freshData.rows, lineType: lineType
            }
            window.parent.postMessage( contents, '*');
        });
        if (type === 'pickLocation') { objtarget.value = result; 
        } else if (type === 'pickPoint') {
            const lat = Number(result.lat).toFixed(12);
            const lon = Number(result.lng).toFixed(12);
            objtarget[1].value = lat; objtarget[2].value = lon;
            if (objtarget[0].value.trim() === '') {
                const name = `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
                objtarget[0].value = `Point_${name}`;
            }
        } else if (type === 'pickPath') {
            const name = objtarget[0].value.trim();
            const lineName = lineType==='crossSection' ? lineType : 'boundary';
            if (name === '') {
                const crossName = lineName==='crossSection' ? lineName : 'Boundary';
            }
            const table = objtarget[1], arr = []; deleteTable(table);
            for (let i = 0; i < result.length; i++) {
                const lat = Number(result[i].lat).toFixed(12);
                const lon = Number(result[i].lng).toFixed(12);
                arr.push([crossName, lat, lon]);
            }
            fillTable(arr, table, true);
        }   
        
        
        return result;
    };
    objBtn.addEventListener('click', objBtn.__handler);
}

export function nameChecker(name) {
    return !/^[A-Za-z0-9_-]+$/.test(name);
}

export function fillTable(data2D, table, clear=true){
    let tbody = table.querySelector("tbody");
    if (!data2D || data2D.length === 0) {
        if (clear) { tbody.innerHTML = ''; }
        return;
    }
    // Remove entire table if clear is true
    if (!clear) {
        // Remove empty rows
        const existingRows = Array.from(tbody.querySelectorAll("tr"));
        existingRows.forEach(row => {
            const inputs = Array.from(row.querySelectorAll("input"));
            const isEmptyRow = inputs.length > 0 && inputs.every(inp => inp.value.trim() === "");
            if (isEmptyRow) row.remove();
        });
    } else { tbody.innerHTML = ''; }
    // Add new rows to table
    const numRows = data2D.length;
    const numCols = data2D[0].length;
    for (let i = 0; i < numRows; i++) {
        const row = document.createElement("tr");
        for (let j = 0; j < numCols; j++) {
            const td = document.createElement("td");
            const input = document.createElement("input");
            input.type = "text";
            input.value = data2D[i][j];
            td.appendChild(input);
            row.appendChild(td);
        }
        tbody.appendChild(row);
    }
}

export function getDataFromTable(table, isZeroIndexString=false){
    const columns = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => {
        return Array.from(tr.querySelectorAll("td input")).map((input, idx) => {
            const val = input.value.trim();
            if (isZeroIndexString) return val; // Keep as string
            // Convert to number if possible
            if (idx === 0 && val) {
                const isoString = val.replace(/\//g, "-").replace("T", " ");
                return toUTC(isoString);
            }
            if (!isNaN(val) && val !== "") return parseFloat(val);
            return val;
        });
    })
    // Remove empty rows
    .filter(row => row.some(cell => cell !== "" && cell !== null && cell !== undefined));
    return {columns, rows};
}

export async function updateTable(table, comboBox, projectName, key='') {
    const data = await jsonLoader('init_source', {projectName: projectName, key: key});
    if (data.status === "ok") {
        comboBox.innerHTML = '';
        // Add hint to the velocity object
        const hint = document.createElement('option');
        hint.value = ''; hint.selected = true;
        hint.text = '- No Selection -'; 
        comboBox.add(hint);
        // Add options
        const data_arr = [];
        data.content.forEach((item, idx) => {
            const option = document.createElement('option');
            option.value = item; option.text = item;
            comboBox.add(option);
            data_arr.push([item, data.type[idx]]);
        });
        if (data_arr.length > 0) fillTable(data_arr, table);
    }
}
export function deleteTable(table, name=null, type=''){
    const tbody = table.querySelector("tbody");
    tbody.innerHTML = ""; 
    if (name != null) name.value = '';
}

export async function htmlLoader(functionName){
    const response = await fetch(`/${functionName}`);
    if (!response.ok) { return null; }
    const data = await response.text();
    return data;
}

export async function jsonLoader(functionName, content){
    const response = await fetch(`/${functionName}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(content)});
    const data = await response.json();
    return data;
}

export function startLoading(str = '') {
    const loadingContainer = document.querySelector('.loading-container');
    if (!loadingContainer) return;
    loadingContainer.querySelector('.loading-text').textContent = str;
    loadingContainer.style.display = 'flex'; 
}

export function stopLoading() { 
    const loadingContainer = document.querySelector('.loading-container');
    if (!loadingContainer) return;
    loadingContainer.style.display = "none";
}

