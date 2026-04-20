import { getProjectList, jsonLoader } from "./commonFunctions.js";

// const $ = (id) => document.getElementById(id);
// const obj = { 
//     scenarioSelector: $("options-scenario"), showCheckbox: $("show-checkbox"),
//     labelWAQ: $("label-waq"), waqSelector: $("options-waq"), progressbar: $("progressbar"),
//     progressText: $("progress-text"), infoArea: $("textarea"), runBtn: $("run-button"),
//     textareaWrapper: $("form-row-textarea"), checkboxContainer: $("checkbox-container")
// };

// let currentProject = null, logIntervalHYD = null, logIntervalWAQ = null, 
//     lastOffsetHYD = 0, lastOffsetWAQ = 0, HYDRunning = false, WAQRunning = false,
//     activeHYDProject = null, activeWAQProject = null;

// async function checkboxUpdate(mode){
//     if (mode === 'waq' && obj.scenarioSelector.value !== '') { 
//         obj.labelWAQ.style.display = 'flex'; obj.waqSelector.style.display = 'flex'; 
//     } else if (mode === 'hyd') {
//         obj.labelWAQ.style.display = 'none'; obj.waqSelector.style.display = 'none'; 
//     }
//     const show = obj.showCheckbox.checked;
//     if (show && (obj.progressText.innerText === 'No simulation running' 
//         || obj.progressText.innerText === 'Simulation completed successfully')) { obj.infoArea.value = ''; }
//     obj.textareaWrapper.style.display = show ? 'flex' : 'none';
// }

// function updateLogHYD(hydProject, progress_bar, progress_text, info, seconds){
//     activeHYDProject = hydProject;
//     logIntervalHYD = setInterval(async () => {
//         if (activeHYDProject !== hydProject) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
//         try {
//             const statusRes = await jsonLoader('check_sim_status_hyd', {projectName: hydProject});
//             progress_text.innerText = statusRes.message; progress_bar.value = statusRes.progress;
//             if (statusRes.status !== "running" && statusRes.status !== "reorganizing") {
//                 info.value += statusRes.message;
//                 if (logIntervalHYD) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
//             }
//             const res = await fetch(`/sim_log_tail_hyd/${hydProject}?offset=${lastOffsetHYD}&log_file=log_hyd.txt`);
//             if (!res.ok) return;
//             const data = await res.json();
//             for (const line of data.lines) { info.value += line + "\n"; }
//             lastOffsetHYD = data.offset;
//         } catch (error) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
//     }, seconds * 1000);
// }

// function updateLogWAQ(hydProject, waqProject, progress_bar, progress_text, info, seconds) {
//     activeWAQProject = `${hydProject}_${waqProject}`;
//     logIntervalWAQ = setInterval(async () => {
//         if (activeWAQProject !== `${hydProject}_${waqProject}`) { clearInterval(logIntervalWAQ); logIntervalWAQ = null; }
//         try {
//             const statusRes = await jsonLoader('check_sim_status_waq', {projectName: hydProject});
//             progress_text.innerText = statusRes.message; progress_bar.value = statusRes.progress;
//             if (statusRes.status !== "running" && statusRes.status !== "reorganizing") {
//                 info.value += statusRes.message;
//                 if (logIntervalWAQ) { clearInterval(logIntervalWAQ); logIntervalWAQ = null; }
//             }
//             const res = await fetch(`/sim_log_tail_waq/${hydProject}?offset=${lastOffsetWAQ}&log_file=log_waq.txt`);
//             if (!res.ok) return;
//             const data = await res.json(); if (info.value !== '') { info.value = ''; }
//             for (const line of data.lines) { info.value += line + "\n"; }
//             lastOffsetWAQ = data.offset;
//         } catch (error) { clearInterval(logIntervalWAQ); logIntervalWAQ = null; }
//     }, seconds * 1000);
// }

// updateComponents();

// async function updateComponents() {
//     const respond = await getProjectList('input');
//     if (!respond) { obj.scenarioSelector.innerHTML = `<option value="">--- No projects found ---</option>`; return; }
//     const options = respond.map(name => `<option value="${name}">${name}</option>`).join('');
//     const defaultOption = `<option value="" selected>--- No selected ---</option>`;
//     obj.scenarioSelector.innerHTML = defaultOption + options;
//     obj.showCheckbox.checked = false; checkboxUpdate(mode);
//     obj.showCheckbox.addEventListener('change', checkboxUpdate(mode));
//     obj.scenarioSelector.addEventListener('change', async() => {
//         const projectName = obj.scenarioSelector.value;
//         if (!projectName) {
//             obj.checkboxContainer.style.display = 'none'; obj.progressText.innerText = ""; 
//             obj.progressbar.value = 0; obj.labelWAQ.style.display = 'none'; 
//             obj.waqSelector.style.display = 'none'; obj.textareaWrapper.style.display = 'none'; return;
//         }
//         if (mode === 'hyd') { // Work with HYD simulation
//             if (logIntervalHYD) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
//             lastOffsetHYD = 0; activeHYDProject = projectName;
//             const statusRes = await jsonLoader('check_sim_status_hyd', {projectName: projectName});
//             if (statusRes.status === "running" || statusRes.status === "reorganizing") {
//                 const res = await fetch(`/sim_log_full/${projectName}?log_file=log_hyd.txt`);
//                 if (res.ok) {
//                     const data = await res.json();
//                     obj.infoArea.value = data.content || ''; lastOffsetHYD = data.offset;
//                 }
//                 obj.showCheckbox.checked = true; HYDRunning = true;
//                 // Run hydrodynamics simulation and Update logs every 10 seconds
//                 updateLogHYD(projectName, obj.progressbar, obj.progressText, obj.infoArea, 10);
//             } else { obj.showCheckbox.checked = false; HYDRunning = false; }
//             obj.progressText.innerText = statusRes.message; obj.progressbar.value = statusRes.progress;
//         } else if (mode === 'waq'){ // Work with WAQ simulation
//             if (logIntervalWAQ) { clearInterval(logIntervalWAQ); logIntervalWAQ = null; }
//             lastOffsetWAQ = 0; activeWAQProject = `${projectName}_${obj.waqSelector.value}`;
//             const data = await jsonLoader('select_project', {filename: projectName, key: 'getWAQs', folder_check: 'input'});
//             if (data.status === "error") {
//                 alert(data.message); obj.labelWAQ.style.display = 'none'; 
//                 obj.waqSelector.style.display = 'none'; return;
//             }
//             obj.labelWAQ.style.display = 'flex'; obj.waqSelector.style.display = 'flex'; obj.showCheckbox.checked = false;
//             obj.waqSelector.innerHTML = data.content.map(name => `<option value="${name}">${name}</option>`).join('');
//             const statusRes = await jsonLoader('check_sim_status_waq', {projectName: projectName});
//             if (statusRes.status === "running" || statusRes.status === "reorganizing") {
//                 const res = await fetch(`/sim_log_full/${projectName}?log_file=log_waq.txt`);
//                 if (res.ok) {
//                     const data = await res.json();
//                     obj.infoArea.value = data.content || ''; lastOffsetWAQ = data.offset;
//                 }
//                 obj.showCheckbox.checked = true; WAQRunning = true;
//                 // Run water quality simulation and Update logs every 1 second
//                 updateLogWAQ(projectName, obj.waqSelector.value, obj.progressbar, obj.progressText, obj.infoArea, 1);
//             } else { obj.showCheckbox.checked = false; WAQRunning = false; }
//             obj.progressText.innerText = statusRes.message; obj.progressbar.value = statusRes.progress;
//         }
//         obj.checkboxContainer.style.display = 'block'; 
//         obj.textareaWrapper.style.display = 'flex'; checkboxUpdate(mode); 
//     });
//     // Run new simulation
//     obj.runBtn.addEventListener('click', async () => {
//         currentProject = obj.scenarioSelector.value;
//         if (!currentProject || currentProject === '') { alert('Please select a scenario.'); return; }
//         if (mode === 'hyd') { // Check if HYD simulation is running
//             if (HYDRunning) { alert("Detected an HYD simulation is running. Please wait until it finishes."); return; }
//             const statusRes = await jsonLoader('check_sim_status_hyd', {projectName: currentProject});
//             if (statusRes.status === "running") { alert("HYD simulation is already running."); return; }
//             const res = await jsonLoader('check_folder', {projectName: currentProject, folder: 'output', key: 'hyd'});
//             if (res.status === "ok") { if (!confirm("Output exists. Re-run will overwrite it. Continue?")) return; }
//             const start = await jsonLoader('start_sim_hyd', {projectName: currentProject});
//             if (start.status === "error") { alert(start.message); return; }
//             obj.infoArea.value = ''; obj.progressbar.value = 0;
//             obj.progressText.innerText = 'Preparing data for the HYD simulation...';
//             updateLogHYD(currentProject, obj.progressbar, obj.progressText, obj.infoArea, 10);
//         } else if (mode === 'waq'){ // Check if WAQ simulation is running
//             if (WAQRunning) { alert("Detected a WAQ simulation is running. Please wait until it finishes."); return; }
//             const statusRes = await jsonLoader('check_sim_status_waq', {projectName: currentProject});
//             if (statusRes.status === "running") { alert("WAQ simulation is already running."); return; }
//             const res = await jsonLoader('check_folder', {projectName: currentProject, folder: obj.waqSelector.value, key: 'waq'});
//             if (res.status === "ok") { if (!confirm("Output exists. Re-run will overwrite it. Continue?")) return; }
//             obj.progressText.innerText = 'Preparing data for the WAQ simulation...';
//             obj.infoArea.value = ''; obj.progressbar.value = 0;
//             const start = await jsonLoader('start_sim_waq', {projectName: currentProject, waqName: obj.waqSelector.value});
//             if (start.status === "error") {alert(start.message); return;}
//             updateLogWAQ(currentProject, obj.waqSelector.value, obj.progressbar, obj.progressText, obj.infoArea, 1);
//         }
//     });
// }