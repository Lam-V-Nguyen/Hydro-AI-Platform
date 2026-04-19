import { toUTC } from "./projectSaver.js";
import { createCheckboxList, viewDatafromPlot, saveToExcelFromPlot } from "./chartManager.js";



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

function waitForWidget(id, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
            const iframe = document.querySelector(`#iframe-${id}`);
            if (iframe) {
                clearInterval(timer); resolve(iframe);
            }
            if (Date.now() - start > timeout) {
                clearInterval(timer); reject("Widget not found");
            }
        }, 50);
    });
}
function waitForIframeLoad(iframe) {
    return new Promise(resolve => {
        if (iframe.contentDocument?.readyState === 'complete') {
            resolve();
        } else { iframe.onload = () => resolve(); }
    });
}
export async function waitForWidgetReady(id) {
    const iframe = await waitForWidget(id);
    await waitForIframeLoad(iframe);
    return iframe;
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
                id: 'hyd', requestId: type, content: freshData, lineType
            }
            window.parent.postMessage( contents, '*');
        });
        if (type === 'pickLocation') { objtarget.value = result; 
        } else if (type === 'pickPoint' || type === 'pickSource') {
            const lat = Number(result.lat).toFixed(12);
            const lon = Number(result.lng).toFixed(12);
            objtarget[1].value = lat; objtarget[2].value = lon;
            if (objtarget[0].value.trim() === '') {
                let name = '';
                if (type === 'pickPoint') {
                    name = `Point_${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
                } else if (type === 'pickSource') { name = 'Source_Sink'; }
                objtarget[0].value = name;
            }
        } else if (type === 'pickPath') {
            let name = objtarget[0].value.trim();
            if (name === '') {
                if (lineType === 'crossSection') { name = 'Cross-Section'; } else { name = 'Boundary'; }
                objtarget[0].value = name;
            }
            const table = objtarget[1], arr = []; deleteTable(table);
            for (let i = 0; i < result.length; i++) {
                const lat = Number(result[i].lat).toFixed(12);
                const lon = Number(result[i].lng).toFixed(12);
                const newName = `${name}_${i + 1}`;
                arr.push([newName, lat, lon]);
            }
            fillTable(arr, table, true);
            if (lineType === 'boundary') { // Update boundary option
                const options = arr.map(row => `<option value="${row[0]}">${row[0]}</option>`).join(' ');
                const defaultOption = `<option value="" selected>--- No selected ---</option>`;
                objtarget[2].innerHTML = defaultOption + options;
            }



        }
        return result;
    };
    objBtn.addEventListener('click', objBtn.__handler);
}

export function nameChecker(name) {
    return !/^[A-Za-z0-9_-]+$/.test(name);
}

export function fillTable(data2D, table, clear=true){
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    if (!data2D || data2D.length === 0) {
        if (clear) { tbody.innerHTML = ''; }
        return;
    }
    // Remove entire table if clear is true
    if (clear) { tbody.innerHTML = '';
    } else { 
        // Remove empty rows
        const existingRows = Array.from(tbody.querySelectorAll("tr"));
        existingRows.forEach(row => {
            const inputs = Array.from(row.querySelectorAll("input"));
            const isEmptyRow = inputs.length > 0 && inputs.every(inp => inp.value.trim() === "");
            if (isEmptyRow) row.remove();
        });
    }
    const fragment = document.createDocumentFragment();
    const numCols = data2D[0].length;
    for (const rowData of data2D) {
        const tr = document.createElement("tr");
        for (let j = 0; j < numCols; j++) {
            const td = document.createElement("td");
            const input = document.createElement("input");
            input.type = "text";
            input.value = rowData[j] ?? '';
            td.appendChild(input);
            tr.appendChild(td);
        }
        fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);

    // // Add new rows to table
    // const numRows = data2D.length;
    // const numCols = data2D[0].length;
    // for (let i = 0; i < numRows; i++) {
    //     const row = document.createElement("tr");
    //     for (let j = 0; j < numCols; j++) {
    //         const td = document.createElement("td");
    //         const input = document.createElement("input");
    //         input.type = "text";
    //         input.value = data2D[i][j];
    //         td.appendChild(input);
    //         row.appendChild(td);
    //     }
    //     tbody.appendChild(row);
    // }
}

export function getDataFromTable(table, isZeroIndexString=false){
    const columns = Array.from(
        table.querySelectorAll("thead th")).map(th => th.textContent.trim()
    );
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
    const tbody = table.querySelector("tbody"); tbody.innerHTML = ""; 
    if (name != null) name.value = '';
    if (type != '') window.parent.postMessage({type: type}, '*');
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

export async function csvUploader(event, targetText, table,
    nCols, isIgnoreHeader=true, objName=null, latitude=null, longitude=null){
    return new Promise((resolve, reject) => {
        const file = event.target.files[0];
        if (!file) { resolve(); return; }
        targetText.value = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');
                const parts = lines[0].split(',').map(item => item.trim());
                if (parts.length !== nCols) { 
                    alert('Number of columns should be ' + nCols + '.'); 
                    target.value = ''; resolve(); return; 
                }
                let dataLines = lines;
                if (isIgnoreHeader) dataLines = dataLines.slice(1); // Skip header
                dataLines.forEach((line, idx) => {
                    const parts = line.split(',').map(item => item.trim());
                    let data_arr = [];
                    if (parts.length === 2) {
                        data_arr = [[parts[0], parseFloat(parts[1])]];
                    } else if (parts.length === 3) {
                        data_arr = [[parts[0], parseFloat(parts[1]), parseFloat(parts[2])]];
                    } else if (parts.length === 5) {
                        if (objName && latitude && longitude) {
                            objName.value = file.name.replace('.csv', ''); 
                            if (idx === 0) {
                                latitude.value = parts[0]; longitude.value = parts[1];
                            } else if (idx === 1) { return;
                            } else {
                                data_arr = [[parts[0], parseFloat(parts[1]), parseFloat(parts[2]), 
                                    parseFloat(parts[3]), parseFloat(parts[4])]];
                            }
                        } else {
                            data_arr = [[parts[0], parseFloat(parts[1]), parseFloat(parts[2]), 
                                parseFloat(parts[3]), parseFloat(parts[4])]];
                        }
                    } else {
                        data_arr = [[parts[0], ...parts.slice(1).map(item => parseFloat(item))]];
                    }
                    if (data_arr.length === 0) return;
                    fillTable(data_arr, table, false);
                });
                resolve();
            } catch (err) { reject(err); }
        };
        reader.onerror = reject; reader.readAsText(file);
    });
}

export async function fileUploader(targetFile, targetText, projectName, gridName, message, type){
    if (projectName === '') return;
    window.parent.postMessage({type: 'showOverlay', message: message}, '*');
    const file = targetFile.files[0], formData = new FormData();
    formData.append('file', file); formData.append('projectName', projectName);
    formData.append('fileName', gridName); formData.append('type', type);
    if (targetText !== null) {targetText.value = file?.name || "";}
    const response = await fetch('/upload_data', { method: 'POST', body: formData });
    const data = await response.json();
    window.parent.postMessage({type: 'hideOverlay'}, '*');
    if (data.status === "error") {
        if (targetText !== null) {targetText.value = '';}
        alert(data.message); targetFile.value = ''; return;
    }
    alert(data.message);
}

export function copyPaste(table, nCols){
    const tbody = table.querySelector('tbody');
    table.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.Clipboard).getData('text'); // Get clipboard data
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== ''); // Split into rows 
        if (!rows.length) return;
        // Get the first row
        const firstLine = rows[0];
        const columns = firstLine.split(/\t|,/);
        if (columns.length !== nCols) { 
            alert(`The current table has ${columns.length} columns.\nNumber of columns must be ${nCols}.`); 
            return; }
        tbody.innerHTML = '';
        const data_arr = rows.map(row => row.split(/\t|,/).slice(0, nCols)); // Split into columns
        fillTable(data_arr, table);
    });
}

export function addRowToTable(table, list){
    const tbody = table.querySelector("tbody");
    const tr = document.createElement('tr');
    list.forEach(text => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = text;
        td.appendChild(input);
        tr.appendChild(td);
    });
    tbody.appendChild(tr);
}

export function removeRowFromTable(table, name){
    if (name.trim() === '') { alert('Please select observation point to remove.'); return; }
    // Remove row with matching name
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const rowToRemove = rows.find(row => {{
        const firstCell = row.querySelector("td");
        if (!firstCell) return false;
        const input = firstCell.querySelector("input");
        if (!input) return false;
        const cellText = input ? input.value.trim() : firstCell.textContent.trim();
        return cellText === name;
    }});
    if (rowToRemove) { rowToRemove.remove(); alert(`Observation point "${name}" removed.`);
    } else { alert(`Observation point "${name}" not found.`); }
}

export function pointUpdate(target, table, isExist=true, objList=[]){
    target.addEventListener('change', () => { 
        const objUpdate = document.getElementById('obs-update');
        objUpdate.style.display = 'none';
        if (isExist) {
            objList.forEach(obj => obj.value = ''); 
            objUpdate.style.display = 'block';
        } else {
            const tbody = table.querySelector("tbody");
            const newTbody = document.createElement('tbody');
            const tr = document.createElement('tr');
            objList.forEach(text => {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = text;
                td.appendChild(input);
                tr.appendChild(td);
            });
            newTbody.appendChild(tr); tbody.replaceWith(newTbody);
        }
    });
}

export function plotTable(table, sourceName, id){
    // Get data from table
    const {columns, rows} = getDataFromTable(table, true);
    let title = sourceName.value.slice(0, -4), titleWindow = '';
    if (rows.length === 0) { alert('No data to plot. Please check the table.'); return; }
    if (id === 'hyd-plot-source') { titleWindow = 'Hydrological Time-Series Graph';
    } else { titleWindow = 'Meteorological Time-Series Graph'; }
    // Plot: Send message to parent
    window.parent.postMessage({
        type: 'plotSource', columns: columns, rows: rows,
        id: id, title: title, titleWindow: titleWindow
    }, '*');
}

export function interpolateJet(t) {
    const jetColors = [
        [0.0, [0, 0, 128]], [0.35, [0, 255, 255]],
        [0.5, [0, 255, 0]], [0.75, [255, 255, 0]], [1.0, [255, 0, 0]]
    ];
    for (let i = 0; i < jetColors.length - 1; i++) {
        const [t1, c1] = jetColors[i];
        const [t2, c2] = jetColors[i + 1];
        if (t >= t1 && t <= t2) {
            const f = (t - t1) / (t2 - t1);
            const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
            const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
            const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
            return `rgb(${r},${g},${b})`;
        }
    }
    return `rgb(255,0,0)`;
}

export function numberFormatter(num, decimals) {
    if (num === null || num === undefined || isNaN(num)) return '';
    if (num === 0) return '0';
    const n = Number(num);
    if (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e6) { return n.toExponential(decimals); }
    return n.toFixed(decimals);
}

export function formatDateTime(value) {
    const d = new Date(value);
    if (isNaN(d)) return value;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}










