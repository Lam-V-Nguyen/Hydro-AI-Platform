import { setupTabs } from "./tabManager.js";
import { getUser, signalSender, getProjectList, jsonLoader, updateLog } from "./commonFunctions.js";
import { projectRender } from "./projectManager.js";




const $ = (id) => document.getElementById(id);
const obj = {
    projectList: $('project-list'), projectName: $('project-name'), projectCreator: $('create-btn'),
    modelSteps: $('model-step'), modelStart: $('model-start'), modelEnd: $('model-end'),
    modelPourpointBtn: $('model-pourpoint-btn'), modelLat: $('model-lat'), modelLon: $('model-lon'),
    pourpointFile: $('model-pourpoint-file'),
    modelCheckBtn: $('model-check-btn'), modelRunBtn: $('model-run-btn'), modelLog: $('model-text')
}


let currentProject, lastOffset = 0;


setupTabs(document); await getProject(); modelManager();

async function getProject() { 
    const userName = await getUser(); currentProject = userName.split('/').pop();
    const respond = await getProjectList(`${currentProject}/flows`, '');
    await projectRender(obj.projectName, obj.projectList, respond);
}

function modelManager() {
    obj.projectCreator.addEventListener('click', async () => {
        const name = obj.projectName.value.trim();
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        const content = { projectName: currentProject, flowName: name, key: 'open' };
        signalSender('Reading forcing data to get start and end dates.\nPlease wait...');
        const data = await jsonLoader('flow_project', content); signalSender('hideOverlay');
        if (data.status === 'error') { alert(data.message); return; }
        obj.modelStart.value = data.content['start']; obj.modelEnd.value = data.content['end'];
    });
    obj.modelCheckBtn.addEventListener('click', async () => {
        const name = obj.projectName.value;
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        const statusRes = await jsonLoader('check_download_status', {projectName: currentProject});
        if (statusRes.status === "running") { alert("Check model is running."); return; }
        obj.modelLog.value = ''; lastOffset = 0;
        const content = { projectName: currentProject, flowName: name, key: 'check' };
        const request = await jsonLoader('wflow_model', content);
        if (request.status === 'error') { alert(request.message); return; }
        updateLog(currentProject, name, obj.modelLog, 2, 'wflow_check');
        obj.modelLat.value = request.content[0];
        obj.modelLon.value = request.content[1];
    });
    obj.modelPourpointBtn.addEventListener('click', () => obj.pourpointFile.click());
    obj.pourpointFile.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return; 
        const formData = new FormData(); formData.append('file', file);
        try {
            signalSender('showOverlay', 'Uploading pourpoint data. Please wait...');
            const response = await fetch('/geojson_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            const coords = data.content["features"][0]["geometry"]["coordinates"]
            obj.modelLat.value = coords[1]; obj.modelLon.value = coords[0];
        } catch (error) { alert(`Uploading pourpoint failed: ${error.message}`); }
        finally { e.target.value = ''; }
    });
    obj.modelRunBtn.addEventListener('click', async () => {
        const startTime = obj.modelStart.value, endTime = obj.modelEnd.value;
        if (startTime === '') { alert('Please select a start date first.'); return; }
        if (endTime === '') { alert('Please select an end date first.'); return; }


        
        const params = Object.fromEntries(
            [...document.querySelectorAll(".initial-conditions-tile input")]
                .map(input => [input.id, Number(input.value)])
        );



    });
}


