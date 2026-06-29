import { setupTabs } from "./tabManager.js";
import { getUser, getProjectList, jsonLoader, updateLog } from "./commonFunctions.js";
import { projectRender } from "./projectManager.js";




const $ = (id) => document.getElementById(id);
const obj = {
    projectList: $('project-list'), projectName: $('project-name'),
    modelSteps: $('model-step'), modelStart: $('model-start'), modelEnd: $('model-end'),
    modelBuildBtn: $('model-build-btn'), modelRunBtn: $('model-run-btn'), modelLog: $('model-text')
}


let currentProject, lastOffset = 0;


setupTabs(document); await getProject(); modelManager();

async function getProject() { 
    const userName = await getUser(); currentProject = userName.split('/').pop();
    const respond = await getProjectList(`${currentProject}/flows`, '');
    await projectRender(obj.projectName, obj.projectList, respond);
}


function modelManager() {
    obj.modelBuildBtn.addEventListener('click', async () => {
        const name = obj.projectName.value;
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        const startTime = obj.modelStart.value, endTime = obj.modelEnd.value;
        if (startTime === '') { alert('Please select a start date first.'); return; }
        if (endTime === '') { alert('Please select an end date first.'); return; }
        const statusRes = await jsonLoader('check_weather_status', {projectName: currentProject});
        if (statusRes.status === "running") { alert("Build model is running."); return; }
        obj.modelLog.value = ''; lastOffset = 0;
        const params = Object.fromEntries(
            [...document.querySelectorAll(".initial-conditions-tile input")]
                .map(input => [input.id, Number(input.value)])
        );
        // const content = { 
        //     projectName: currentProject, flowName: name, step: Number(obj.modelStep.value),
        //     params: params, start: startTime, end: endTime, key: 'build'
        // };
        // const request = await jsonLoader('wflow_model', content);
        // if (request.status === 'error') { alert(request.message); return; }
        // updateLog(currentProject, name, obj.modelLog, 2);
    });
    obj.modelRunBtn.addEventListener('click', async () => {
        



    });
}


