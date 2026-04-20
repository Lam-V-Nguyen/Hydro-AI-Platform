import { jsonLoader } from "./commonFunctions.js";

let activeHYDProject = null, logIntervalHYD = null;

// export async function checkboxUpdate(mode) {
//     if (mode === 'hyd') {
//         obj.labelWAQ.style.display = 'none'; obj.waqSelector.style.display = 'none'; 
//     } else if (mode === 'waq' && obj.scenarioSelector.value !== '') { 
//         obj.labelWAQ.style.display = 'flex'; obj.waqSelector.style.display = 'flex'; 
//     }
//     const show = obj.showCheckbox.checked;
//     if (show && (obj.progressText.innerText === 'No simulation running' 
//         || obj.progressText.innerText === 'Simulation completed successfully')) { obj.infoArea.value = ''; }
//     obj.textareaWrapper.style.display = show ? 'flex' : 'none';
// }


export function updateLogHYD(activeHYDProject, logIntervalHYD, hydProject, progress_bar, progress_text, info, seconds){
    activeHYDProject = hydProject;
    logIntervalHYD = setInterval(async () => {
        if (activeHYDProject !== hydProject) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
        try {
            const statusRes = await jsonLoader('check_sim_status_hyd', {projectName: hydProject});
            progress_text.innerText = statusRes.message; progress_bar.value = statusRes.progress;
            if (statusRes.status !== "running" && statusRes.status !== "reorganizing") {
                info.value += statusRes.message;
                if (logIntervalHYD) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
            }
            const res = await fetch(`/sim_log_tail_hyd/${hydProject}?offset=${lastOffsetHYD}&log_file=log_hyd.txt`);
            if (!res.ok) return;
            const data = await res.json();
            for (const line of data.lines) { info.value += line + "\n"; }
            lastOffsetHYD = data.offset;
        } catch (error) { clearInterval(logIntervalHYD); logIntervalHYD = null; }
    }, seconds * 1000);
}

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