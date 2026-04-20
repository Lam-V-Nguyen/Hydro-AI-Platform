import { getProjectList, jsonLoader } from "./commonFunctions.js";
import { updateLogHYD } from "./simManager.js";

const $ = (id) => document.getElementById(id);
const obj = { 
    scenarioSelector: $("options-scenario"), showCheckbox: $("show-checkbox"),
    progressbar: $("progressbar"), progressText: $("progress-text"), 
    runBtn: $("run-button"), textareaWrapper: $("form-row-textarea"), 
    infoArea: $("textarea"), checkboxContainer: $("checkbox-container")
};

let currentProject = null, logIntervalHYD = null,
    lastOffsetHYD = 0, HYDRunning = false, activeHYDProject = null;

hydComponents();

async function hydComponents() {
    const respond = await getProjectList('input');
    if (!respond) { obj.scenarioSelector.innerHTML = `<option value="">--- No projects found ---</option>`; return; }
    const options = respond.map(name => `<option value="${name}">${name}</option>`).join('');
    const defaultOption = `<option value="" selected>--- No selected ---</option>`;
    obj.scenarioSelector.innerHTML = defaultOption + options;
    obj.showCheckbox.checked = false;
    obj.showCheckbox.addEventListener('change', (e) => { 
        if (e.target.checked && (obj.progressText.innerText === 'No simulation running' 
            || obj.progressText.innerText === 'Simulation completed successfully')) { obj.infoArea.value = ''; }
        obj.textareaWrapper.style.display = e.target.checked ? 'flex' : 'none';
    });
    obj.scenarioSelector.addEventListener('change', async() => {
        const projectName = obj.scenarioSelector.value;
        if (!projectName) {
            obj.checkboxContainer.style.display = 'none'; obj.progressText.innerText = ""; 
            obj.progressbar.value = 0; obj.textareaWrapper.style.display = 'none'; return;
        }
        // Work with HYD simulation
        if (logIntervalHYD) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
        lastOffsetHYD = 0; activeHYDProject = projectName;
        const statusRes = await jsonLoader('check_sim_status_hyd', {projectName: projectName});
        if (statusRes.status === "running" || statusRes.status === "reorganizing") {
            const res = await fetch(`/sim_log_full/${projectName}?log_file=log_hyd.txt`);
            if (res.ok) {
                const data = await res.json();
                obj.infoArea.value = data.content || ''; lastOffsetHYD = data.offset;
            }
            obj.showCheckbox.checked = true; HYDRunning = true;
            // Run hydrodynamics simulation and Update logs every 10 seconds
            updateLogHYD(
                activeHYDProject, logIntervalHYD, projectName, 
                obj.progressbar, obj.progressText, obj.infoArea, 10
            );
        } else { obj.showCheckbox.checked = false; HYDRunning = false; }
        obj.progressText.innerText = statusRes.message;
        obj.progressbar.value = statusRes.progress;
        obj.checkboxContainer.style.display = 'block'; 
        // checkboxUpdate(mode);
    });
    // Run new simulation
    obj.runBtn.addEventListener('click', async () => {
        currentProject = obj.scenarioSelector.value;
        if (!currentProject || currentProject === '') { alert('Please select a scenario.'); return; }
        // Check if HYD simulation is running
        if (HYDRunning) { alert("Detected an HYD simulation is running. Please wait until it finishes."); return; }
        const statusRes = await jsonLoader('check_sim_status_hyd', {projectName: currentProject});
        if (statusRes.status === "running") { alert("HYD simulation is already running."); return; }
        const res = await jsonLoader('check_folder', {projectName: currentProject, folder: 'output', key: 'hyd'});
        if (res.status === "ok") { if (!confirm("Output exists. Re-run will overwrite it. Continue?")) return; }
        const start = await jsonLoader('start_sim_hyd', {projectName: currentProject});
        if (start.status === "error") { alert(start.message); return; }
        obj.infoArea.value = ''; obj.progressbar.value = 0;
        obj.progressText.innerText = 'Preparing data for the HYD simulation...';
        updateLogHYD(currentProject, obj.progressbar, obj.progressText, obj.infoArea, 10);
    });
}