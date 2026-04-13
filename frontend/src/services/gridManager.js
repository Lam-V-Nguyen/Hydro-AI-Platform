import { getState } from "./constant.js";
import { startLoading, stopLoading, jsonLoader } from "./utils.js";

let lakesData = {};

await loadLakes(); updateManager();

async function loadLakes(){
    startLoading("Initializing Database for entire Norway's Lakes. Please wait...");
    const response = await jsonLoader('init_lakes', {projectName: getState().currentProject});
    // if (response.status === "error") { alert(response.message); return; }
    // stopLoading();
    // lakesData = response.content; 
    // dataLake = lakesData.lake; dataDepth = lakesData.depth;
}

function updateManager() { 
    
    // Change data source
    document.querySelectorAll('input[type="radio"]').forEach(obj => {
        obj.addEventListener('change', () => {
            if (obj.id === 'new-database') {
            

            } else if (obj.id === 'new-map') { 




            }
        });
    });
    // Check whether map widget exists
    const layout = localStorage.getItem('grid-layout');
    const hasMap = layout ? JSON.parse(layout).some(item => item.id === 'map'):false;
    if (!hasMap) window.parent.postMessage({ type: 'addMapWidget' }, '*');
}
