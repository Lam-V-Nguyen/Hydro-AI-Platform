import { startLoading, stopLoading, jsonLoader, renderProjects, fillTable
    } from "./commonFunctions.js"; 
import { createLakeMap } from "./unstructuredGrid.js";
import { getState } from "./constant.js";

const selectContainer = () => document.getElementById('select-container'); 
const municipalityName = () => document.getElementById('municipality-name'); 
const municipalityList = () => document.getElementById("municipality-list"); 
const lakeSearcher = () => document.getElementById('lake-search'); 
const sugesstionLake = () => document.getElementById('lake-suggestions'); 
const lakeLabel = () => document.getElementById('lake-name-label'); 
const lakeSelector = () => document.getElementById('lake-name'); 
const lakeTable = () => document.getElementById('lake-table'); 
const tableContent = () => document.getElementById('table-of-contents'); 
const menuContent = () => document.getElementById('menu-container'); 

let lakesData = {}, lakeMap = null, lakeLayer = null, dataLake = null, 
    dataDepth = null, drawChecked = false, entireNorway = false, 
    timeOut = null; 

    
    
const currentProject = 'demo';
await loadLakes(); updateManager(); 


async function loadLakes(){ 
    startLoading("Initializing Database for entire Norway's Lakes. Please wait...");
    // await new Promise(requestAnimationFrame);
    const response = await jsonLoader('init_lakes', {projectName: currentProject});
    if (response.status === "error") { alert(response.message); return; } stopLoading();
    lakesData = response.content; dataLake = lakesData.lake; dataDepth = lakesData.depth; 
} 

async function addItems(value) { 
    startLoading('Loading all Lakes. Please wait...');
    timeOut = setTimeout( async() => { 
        const response = await jsonLoader('search_lake', { 
            projectName: currentProject, name: value 
        });
        if (response.status === "error") { alert(response.message); return; }
        if (response.content.length === 0) { sugesstionLake().style.display = 'none'; return; } 
        sugesstionLake().innerHTML = ''; 
        response.content.forEach(lake => { 
            var div = document.createElement('div'); 
            div.textContent = lake; 
            div.addEventListener('click', () => { 
                lakeSearcher().value = lake; 
                municipalityList().value = ''; 
                lakeSelector().innerHTML = `<option value="${lake}">${lake}</option>`; 
                sugesstionLake().style.display = 'none'; 
                lakeSelector().dispatchEvent(new Event('change')); 
            }); 
            sugesstionLake().appendChild(div); 
        }); 
        sugesstionLake().style.display = 'block'; 
    }, 200); 
    stopLoading();
} 

function updateManager() { 
    // Change data source 
    document.querySelectorAll('input[type="radio"]').forEach(obj => { 
        obj.addEventListener('change', () => { 
            if (obj.id === 'new-database') { 
                selectContainer().style.display = 'flex'; drawChecked = false; 
                municipalityName().value = ''; lakeSearcher().value = ''; 
                lakeSelector().style.display = 'flex'; 
                lakeSelector().value = ''; lakeLabel().style.display = 'flex'; 
            } else if (obj.id === 'new-map') { 
                selectContainer().style.display = 'none'; drawChecked = true; 
                const contents = [['', '', '', '', '', '', '']]; 
                fillTable(contents, lakeTable(), true); 
            } 
            tableContent().style.display = "block"; menuContent().style.display = "none"; 
            const tbody = lakeTable().querySelector("tbody"); tbody.innerHTML = '';
            fillTable([['', '', '', '', '', '', '']], lakeTable(), true); 

            console.log('Goi loadLakes', getState().temp); 
             
        });
    }); 
    // Update municipality name 
    municipalityName().addEventListener('change', async (e) => { 
        const selectedLake = e.target.value.trim(); entireNorway = false; 
        if (!selectedLake || selectedLake === "") { 
            e.target.dispatchEvent(new Event('click')); return; 
        } 
        if (selectedLake === "All Municipalities" ) { 
            startLoading('Loading Lakes for entire Norway. Please wait...');
            // await new Promise(requestAnimationFrame);
            entireNorway = true; tableContent().style.display = "none"; 
            menuContent().style.display = "none"; lakeSelector().style.display = "none"; 
            // colorbar_container_grid().style.display = 'none'; 
            const response = await jsonLoader('load_lakes', { 
                projectName: currentProject, lakeName: 'all' 
            }); stopLoading(); 
            if (response.status === "error") { alert(response.message); return; } 
            dataLake = response.content.lake; dataDepth = response.content.depth; 
            // lakeLayer = clearMap(lakeLayer, lakeMap); 
            // lakeLayer = polygonPlotter(dataLake, true);
            // orthoLayer = clearMap(orthoLayer, lakeMap); 
            return; 
        } 
        lakeSelector().innerHTML = lakesData[selectedLake].map(name => `<option value="${name}">${name}</option>`).join(''); 
        lakeSelector().value = lakesData[selectedLake][0]; 
        lakeSelector().dispatchEvent(new Event('change')); 
    }); 
    municipalityName().addEventListener('click', async (e) => { 
        sugesstionLake().style.display = "none"; lakeSearcher().value = ""; 
        if (e.target.value.trim() === "") { 
            lakeLabel().style.display = "none"; lakeSelector().style.display = "none"; 
            menuContent().style.display = "none"; 
            const tbody = lakeTable().querySelector("tbody"); tbody.innerHTML = '';
            fillTable([['', '', '', '', '', '', '']], lakeTable(), true); 
        } 
        if (Object.keys(lakesData).length === 0) { await loadLakes(); } 
        municipalityList().innerHTML = ''; 
        // Add "All Municipalities" option 
        const allLi = document.createElement("li"); 
        allLi.textContent = "All Municipalities"; allLi.style.fontWeight = "bold"; 
        allLi.dataset.value = "All Municipalities"; allLi.style.fontSize = "14px"; 
        allLi.addEventListener('mousedown', () => { 
            municipalityName().value = allLi.dataset.value; 
            municipalityList().style.display = "none"; 
            lakeLabel().style.display = "none"; 
            lakeSelector().style.display = "none"; 
            municipalityName().dispatchEvent(new Event('change')); 
        }); 
        municipalityList().appendChild(allLi); 
        const allHr = document.createElement("hr"); 
        allHr.style.margin = "5px 10px 5px 10px"; 
        allHr.style.borderTop = "1px solid #0414f5"; 
        municipalityList().appendChild(allHr); 
        Object.keys(lakesData).forEach(p => { 
            const li = document.createElement("li"); 
            li.textContent = p; 
            li.addEventListener('mousedown', () => { 
                municipalityName().value = p; 
                municipalityList().style.display = "none"; 
                lakeLabel().style.display = "block"; 
                lakeSelector().style.display = "block"; 
                municipalityName().dispatchEvent(new Event('change')); 
            }); 
            municipalityList().appendChild(li); 
        });
        municipalityList().style.display = "block"; 
    }); 
    municipalityName().addEventListener('input', (e) => { 
        const value = e.target.value.trim(); 
        if (value !== "") { 
            renderProjects(municipalityList(), e.target, Object.keys(lakesData), value); 
        } else { 
            // lakeLayer = clearMap(lakeLayer, lakeMap); 
            lakeSelector().value = ""; e.target.value = ""; 
            lakeLabel().style.display = "none"; 
            lakeSelector().style.display = "none"; 
            e.target.dispatchEvent(new Event('click')); 
        } 
    }); 
    municipalityName().addEventListener('blur', (e) => { 
        setTimeout(() => { municipalityList().style.display = "none"; }, 0); 
        if (e.target.value === "") { 
            lakeLabel().style.display = "none"; lakeSelector().style.display = "none"; 
        } 
    }); 
    // Search lake 
    const handleLakeSearchEvent = async (e) => { 
        const value = e.target.value.trim(); 
        if (e.type === 'input') clearTimeout(timeOut); 
        if (e.type === 'click') { 
            lakeSelector().style.display = 'none'; 
            lakeLabel().style.display = 'none'; 
        } 
        if (value === "") { 
            fillTable([['', '', '', '', '', '', '']], lakeTable(), true); 
            menuContent().style.display = "none"; 
        } 
        await addItems(value); municipalityName().value = ''; 
        municipalityList().style.display = "none"; 
    }; 
    ['click', 'input'].forEach(evt => { 
        lakeSearcher().addEventListener(evt, handleLakeSearchEvent); 
    }); 
    lakeSelector().addEventListener('change', async (e) => { 
        const lakeName = e.target.value.trim(); if (!lakeName) return; 
        if (lakeName === '') { menuContent().style.display = "none"; 
        } else { menuContent().style.display = "grid"; } 
        // gridLayer = clearMap(gridLayer, lakeMap); 
        // lakeLayer = clearMap(lakeLayer, lakeMap); 
        // pointLayer = clearMap(pointLayer, lakeMap); 
        // orthoLayer = clearMap(orthoLayer, lakeMap); 
        startLoading(`Loading data for lake: ${lakeName}`);
        // await new Promise(requestAnimationFrame); 
        const response = await jsonLoader('load_lakes', { 
            projectName: currentProject, lakeName: lakeName 
        }); stopLoading(); 
        if (response.status === "error") { alert(response.message); return; } 
        dataLake = response.content.lake; dataDepth = response.content.depth;

        
        // lakeMap = await createLakeMap(); 
        const data = dataLake.features[0].properties;
        const contents = [[data.name, data.region, data.area, data.perimeter, data.min, data.max, data.avg]]; 
        tableContent().style.display = "block"; 
        fillTable(contents, lakeTable(), true);
        // depthCheckbox().checked = true; 
        // polygonCheckbox().checked = true; 
        // orthoCheckbox().checked = false; 
        // // Plot lake and depth on map
        // window.depthGridLayer = clearMap(window.depthGridLayer, lakeMap); 
        // window.depthGridLayer = gridPlotter(dataLake, dataDepth); 
        // lakeLayer = clearMap(lakeLayer, lakeMap); 
        // lakeLayer = polygonPlotter(dataLake, true);
    }); 
    document.addEventListener('click', (e) => { 
        const input = lakeSearcher(), suggestion = sugesstionLake(); 
        if (!input.contains(e.target) && !suggestion.contains(e.target)) { 
            suggestion.style.display = "none"; 
        } 
    }); 
    // // Check whether map widget exists 
    // const layout = localStorage.getItem('grid-layout'); 
    // const hasMap = layout ? JSON.parse(layout).some(item => item.id === 'map'):false; 
    // if (!hasMap) window.parent.postMessage({ type: 'addMapWidget' }, '*'); 
}