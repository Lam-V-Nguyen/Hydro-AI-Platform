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
        const data = await jsonLoader('setup_new_project', { projectName });
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

export async function projectLoader(userName=null) {
    if (!userName) return;
    const overlay = document.createElement("div");
    overlay.className = "pm-overlay";
    const modal = document.createElement("div");
    modal.className = "pm-modal";
    modal.innerHTML = `
        <h3 style="margin-top:0;">Open Project</h3>
        <div class="pm-row">
            <label>Select Project</label>
            <select id="projectList">
                <option value="">-- No selected --</option>
            </select>
        </div>
        <div style="text-align:right; gap: 10px;">
            <button class="button-grid" id="openBtn">OK</button>
            <button class="button-grid" id="closeBtn">Cancel</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector("#openBtn").onclick = async () => {
        const project = userName.split('/').shift();
        // if (!projectName) { alert("Please enter a project name."); return; }
        // const data = await jsonLoader('open_project', { project });
        // alert(data.message); overlay.remove();
        // if (data.status !== "error") { 
        //     const project = document.querySelector(".project-note");
        //     if (project) project.textContent = `Project: ${data.status}`;
        // }
    };
    modal.querySelector("#closeBtn").onclick = () => { overlay.remove(); };
}



