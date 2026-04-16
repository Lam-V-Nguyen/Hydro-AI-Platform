import { jsonLoader } from "./commonFunctions.js";

export function projectMaker() {
    const overlay = document.createElement("div");
    overlay.className = "pm-overlay";
    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.innerHTML = `
        <h3 style="margin-top:0;">Create New Project</h3>
        <input id="projectNameInput" 
               type="text" placeholder="New project name" />
        <div style="text-align:right; gap: 10px;">
            <button class="button-grid" id="okBtn">OK</button>
            <button class="button-grid" id="cancelBtn">Cancel</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    const input = modal.querySelector("#projectNameInput");
    input.focus();
    modal.querySelector("#okBtn").onclick = async () => {
        const projectName = input.value.trim();
        if (!projectName) { alert("Please enter a project name."); return; }
        const data = await jsonLoader('setup_new_project', { projectName: projectName });
        alert(data.message); overlay.remove();
        if (data.status !== "error") { 
            const project = document.querySelector(".project-note");
            if (project) project.textContent = `Project: ${data.status}`;
        }
    };
    modal.querySelector("#cancelBtn").onclick = () => { overlay.remove(); };
    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") modal.querySelector("#okBtn").click();
    });
}

export async function projectModifier(userName=null, key='open') {
    if (!userName) return;
    let title = key === 'open' ? 'Open Project' :'Delete Project';
    let btn = key === 'open' ? 'Open' : 'Delete';
    const overlay = document.createElement("div");
    overlay.className = "pm-overlay";
    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.innerHTML = `
        <h3 style="margin-top:0;">${title}</h3>
        <div class="pm-row">
            <label>Select Project</label>
            <select id="projectList">
                <option value="">-- No selected --</option>
            </select>
        </div>
        <div style="text-align:right; gap: 10px;">
            <button class="button-grid" id="okBtn">${btn}</button>
            <button class="button-grid" id="closeBtn">Cancel</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    // Get the list of projects
    const projectList = modal.querySelector("#projectList");
    if (!projectList) return;
    const user = userName.split('/').shift();
    const contents = { 
        filename: user, key: 'getProjects', folder_check: '' 
    };
    const data = await jsonLoader('select_project', contents);
    if (data.status === "error") { alert(data.message); return; }
    data.content.forEach(project => {
        const option = document.createElement("option");
        option.value = project;
        option.textContent = project;
        projectList.appendChild(option);
    });
    projectList.selectedIndex = 1;
    modal.querySelector("#okBtn").onclick = async () => {
        let value = projectList.value.trim();
        if (value === "") { alert("Please select a project from the list."); return; }
        const project = document.querySelector(".project-note");
        if (project) {
            if (key === 'delete') {
                const isDel = confirm(`Do you want to delete project '${value}'?`); if (!isDel) return;
                const data = await jsonLoader('delete_project', { projectName: value });
                alert(data.message); if (data.status !== "error") value = 'demo';
            }
        }
        project.textContent = `Project: ${user}/${value}`; overlay.remove();
    };
    modal.querySelector("#closeBtn").onclick = () => { overlay.remove(); };
}

export function pdfOpener(pdfName=null) {
    if (!pdfName) return;
    const win = window.open(`src_frontend/pdfs/${pdfName}`, '_blank');
    if (!win) alert('Please allow popups for this document');
}

export async function projectRender(objectInput, objectList, fullList) {
    // Update project list
    objectInput.addEventListener('input', (e) => { 
        if (fullList.length === 0) return;
        const value = e.target.value.trim();
        objectList.innerHTML = "";
        const filtered = fullList.filter(p => p.toLowerCase().includes(value.toLowerCase()));
        if (filtered.length === 0) {
            objectList.style.display = "none"; return;
        }
        filtered.forEach(p => {
            const li = document.createElement("li");
            li.textContent = p;
            li.addEventListener('mousedown', () => { 
                objectInput.value = p; objectList.style.display = "none";
            });
            objectList.appendChild(li);
        });
        objectList.style.display = filtered.length > 0 ? "block": "none";
    });
    objectInput.addEventListener('click', async () => {
        objectInput.dispatchEvent(new Event('input'));
    });
    objectInput.addEventListener('blur', () => { 
        setTimeout(() => { objectList.style.display = "none"; }, 100);
    });
}

