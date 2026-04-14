export function renderProjects(objectList, objectInput, fullList, filter) {
    objectList.innerHTML = "";
    const filtered = fullList.filter(p => p.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach(p => {
        const li = document.createElement("li");
        li.textContent = p;
        li.addEventListener('mousedown', () => { 
            objectInput.value = p; objectList.style.display = "none";
        });
        objectList.appendChild(li);
    });
    objectList.style.display = filter ? "block" : "none";
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

