import { gridId } from "./constant.js";
import { getUser, fillTable, jsonLoader, deleteTable, addRowToTable,
    signalSender, sendRequest, initRequestListener
} from "./commonFunctions.js";
import { projectRender } from "./projectManager.js";
import { plotUnstructuredGrid } from "./unstructuredGrid.js";

// import { startLoading, stopLoading, jsonLoader, renderProjects, fillTable
//     } from "./commonFunctions.js"; 
// import { createLakeMap } from "./unstructuredGrid.js";
// import { getState } from "./constant.js";

initRequestListener();

const row = ['Name', 'Municipality', 'Area', 'Perimeter', 
    'Max Depth', 'Min Depth', 'Average Depth'];
let currentProject = null, lakesData = {}, dataLake = null, dataDepth = null,
    drawChecked = false, entireNorway = false, timeOut = null, drawSelection = false,
    activeProject = null, isRunning = false, logInterval = null, refineChecked = false,
    isPointLayer = false;
// let lakesData = {}, lakeMap = null, pointLayer = null, entireNorway = false, 
//     deleteChecked = false, dataLake = null, dataDepth = null,
//     timeOut = null, levelValue = null, pointContainer = [], html = '', drawChecked = false, moveChecked = false,
//     baseMap = null, currentTileLayer = null, gridLayer = null, orthoLayer = null,
//     tempLine = null, mapContainer = null, ;
    
    
const $ = (id) => document.getElementById(id);
const obj = {
    selectContainer: $("select-container"), municipalityName: $("municipality-name"), 
    municipalityList: $("municipality-list"), lakeSearcher: $("lake-search"), 
    sugesstionLake: $("lake-suggestions"), lakeLabel: $("lake-name-label"), 
    lakeSelector: $("lake-name"), lakeTable: $("lake-table"), 
    tableContent: $("table-of-contents"), menuContent: $("menu-container"),
    polygonCheckbox: $("polygon-checkbox"), depthCheckbox: $("depth-checkbox"),
    vertexesBtn: $("vertexes-btn"), refinementCheckbox: $("refinement-checkbox"),
    refinementContainer: $("refinement-container"), refinementValue: $("refinement-value"),
    moveCheckbox: $("move-checkbox"), deleteCheckbox: $("delete-checkbox"),
    scaleSelector: $("scale-factor"), scaleFactor: $("custom-scale-factor"),
    orthoCheckbox: $("orthogonality-checkbox"), createGrid: $("generate-grid"),
    gridOptimizationCheckbox: $("optimization-checkbox"), chartDiv: $("myChart-grid"),
    gridOptimizationContainer: $("grid-optimization-container"), saveGrid: $("save-grid"),
    iterationValue: $("iterations"), valueFrom: $("detail-level-from"),
    valueTo: $("detail-level-to"), optimizeBtn: $("optimize-grid"),
    
    plotContainer: $("plot-container"), gridName: $("grid-name"),
    // progressbarGrid: $("progressbar-grid"), progressTextGrid: $("progress-text-grid"),
    // leafletContainer: $("map-container"), optimizeCloseBtn: $("optimization-close"),
};

async function addItems(currentProject, value) { 
    signalSender('showOverlay', 'Loading all Lakes for entire Norway. Please wait...');
    timeOut = setTimeout( async() => { 
        const response = await jsonLoader('search_lake', { 
            projectName: currentProject, name: value 
        });
        if (response.status === "error") { alert(response.message); return; }
        if (response.content.length === 0) { obj.sugesstionLake.style.display = 'none'; return; } 
        obj.sugesstionLake.innerHTML = ''; 
        response.content.forEach(lake => { 
            var div = document.createElement('div'); 
            div.textContent = lake; 
            div.addEventListener('click', () => { 
                obj.lakeSearcher.value = lake; 
                obj.municipalityList.value = ''; 
                obj.lakeSelector.innerHTML = `<option value="${lake}">${lake}</option>`; 
                obj.sugesstionLake.style.display = 'none'; 
                obj.lakeSelector.dispatchEvent(new Event('change')); 
            }); 
            obj.sugesstionLake.appendChild(div); 
        }); 
        obj.sugesstionLake.style.display = 'block'; 
    }, 200); 
    signalSender('hideOverlay');
} 

await getProject(); lakeOptions(); dataBaseOptions(); unGridManager();

async function getProject() { 
    const user = await getUser();
    currentProject = user.split('/').pop();
}

function unGridManager() {
    // Check whether map widget exists
    const layout = localStorage.getItem('grid-layout');
    const hasMap = layout ? JSON.parse(layout).some(item => item.id === gridId):false;
    const content = { id: gridId, title: 'Unstructured Grid Map' };
    if (!hasMap) signalSender('addMapWidget', content);
    // Change data source 
    document.querySelectorAll('input[type="radio"]').forEach(opt => { 
        opt.addEventListener('change', () => { 
            if (opt.id === 'new-database') { 
                obj.selectContainer.style.display = 'flex'; 
                obj.municipalityName.value = ''; obj.lakeSearcher.value = ''; 
                obj.lakeSelector.style.display = 'none'; 
                obj.lakeSelector.value = ''; obj.lakeLabel.style.display = 'none';
                obj.menuContent.style.display = 'none'; 
                drawSelection = false; drawChecked = false; 
            } else if (opt.id === 'new-map') { 
                obj.selectContainer.style.display = 'none'; 
                drawSelection = true; drawChecked = true;
                obj.menuContent.style.display = 'grid';
                signalSender('colorbarOption', { display: 'none', id: gridId });
            }
            deleteTable(obj.lakeTable); addRowToTable(obj.lakeTable, row); resetMap();
        });
    });
    // Hide suggestions
    document.addEventListener('click', (e) => { 
        const input = obj.lakeSearcher, suggestion = obj.sugesstionLake; 
        if (!input.contains(e.target) && !suggestion.contains(e.target)) { 
            suggestion.style.display = "none"; 
        }
    });
    // Show/Hide objects
    obj.polygonCheckbox.addEventListener('change', (e) => {
        const content = { 
            layer: 'polygonGrid', polygon: dataLake,
            checked: e.target.checked
        };
        signalSender('gridPlot', content);
    });
    obj.depthCheckbox.addEventListener('change', async (e) => {
        if (e.target.checked && drawSelection) { e.target.checked = false; return; } 
        const content = { 
            layer: 'depthGrid', checked: e.target.checked, 
            polygon: dataLake, id: gridId, legend: 'Depth (m)', 
            dataLake: dataLake, dataDepth: dataDepth
        };
        signalSender('gridPlot', content);
    });
    obj.refinementCheckbox.addEventListener('change', async (e) => {
//         if (e.target.checked) { 
//             const content = { 
//                 layer: 'vertexGrid', checked: true, 
//                 // polygon: dataLake, id: gridId, legend: 'Depth (m)', 
//                 // dataLake: dataLake, dataDepth: dataDepth
//             };
//             await signalSender('gridOptions', content);
//             if (isPointLayer) { 
//                 alert("Select the button 'Get/Reset Vertexes' to create vertexes first.");
//                 e.target.checked = false; return;
//             }
//             refineChecked = true; obj.depthCheckbox.checked = false;
//             obj.moveCheckbox.checked = false; moveChecked = false;
//             obj.depthCheckbox.dispatchEvent(new Event('change'));
//             obj.orthoCheckbox.checked = false; 
//             //obj.orthoCheckbox.dispatchEvent(new Event('change'));
//             // orthoLayer = clearMap(orthoLayer, lakeMap); 
//             pointContainer = []; //gridLayer = clearMap(gridLayer, lakeMap);
//             obj.refinementContainer.style.display = 'flex';
//             deleteChecked = false; obj.deleteCheckbox.checked = false;
//             deleteChecked = false; ///obj.deleteCheckbox.dispatchEvent(new Event('change'));

//         } 
//         else { obj.refinementContainer.style.display = 'none'; refineChecked = false; }
    });
//     obj.orthoCheckbox.addEventListener('change', async (e) => {
//         const content = { 
//             layer: 'orthoGrid', checked: e.target.checked,
//             id: gridId, currentProject: currentProject
//         };
//         signalSender('gridOptions', content);
//     });
//     obj.gridOptimizationCheckbox.addEventListener('change', async (e) => {
//         if (e.target.checked) {
// //             if (gridLayer === null) { 
// //                 alert("Please generate grid first."); e.target.checked = false; return; 
// //             }
//             obj.gridOptimizationContainer.style.display = 'flex';
//         } else { obj.gridOptimizationContainer.style.display = 'none'; }
//     });
//     obj.moveCheckbox.addEventListener('change', async (e) => { 
//         const content = { 
//             layer: 'moveGrid', checked: e.target.checked, 
//             currentProject: currentProject
//             // polygon: dataLake, 
//             // id: gridId, legend: 'Depth (m)', 
//             // dataLake: dataLake, dataDepth: dataDepth
//         };
//         signalSender('gridOptions', content);
//     });
//     obj.deleteCheckbox.addEventListener('change', async (e) => {
//         if (!e.target.checked) { deleteChecked = false; return; }
//         // if (pointLayer === null) { 
//         //     alert("Select the button 'Get/Reset Vertexes' to create vertexes first.");
//         //     e.target.checked = false; return;
//         // }
//         obj.moveCheckbox.checked = false; moveChecked = false;
//         pointContainer = []; deleteChecked = true;
//         //gridLayer = clearMap(gridLayer, lakeMap);
//         obj.orthoCheckbox.checked = false; 
//         // orthoCheckbox().dispatchEvent(new Event('change'));
//         refineChecked = false; obj.refinementCheckbox.checked = false;
//         obj.refinementCheckbox.dispatchEvent(new Event('change'));
//     });
//     obj.scaleSelector.addEventListener('change', (e) => {
//         const value = e.target.value;
//         if (value === "auto") { obj.scaleFactor.style.display = "none"; }
//         else { obj.scaleFactor.style.display = "flex"; }
//     });
//     obj.scaleFactor.addEventListener('input', (e) => { 
//         const value = e.target.value;
//         if (value === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) { 
//             e.target.value = '1.0'; return; 
//         }
//     });
    obj.vertexesBtn.addEventListener('click', async () => {
        signalSender('clearGridMap');
        signalSender('colorbarOption', { display: 'none', id: gridId });
        signalSender('showOverlay', 'Generating Vertexes. Please wait...');
        const response = await jsonLoader('vertex_generator', { projectName: currentProject }); 
        signalSender('hideOverlay');
        if (response.status === "error") { alert(response.message); return; }
        const content = {
            layer: 'vertexGrid', key: 'moveChecked',
            currentProject: currentProject,
            points: response.content, move: true,
        }
        const result = await sendRequest('gridOptions', content);
        if (!obj.polygonCheckbox.checked) { obj.polygonCheckbox.checked = true; }
        obj.polygonCheckbox.dispatchEvent(new Event('change'));
        obj.orthoCheckbox.checked = false; obj.orthoCheckbox.dispatchEvent(new Event('change'));
        refineChecked = false; obj.refinementCheckbox.checked = false;
        obj.refinementCheckbox.dispatchEvent(new Event('change'));
        obj.depthCheckbox.checked = false; obj.depthCheckbox.dispatchEvent(new Event('change'));
    });


    obj.createGrid.addEventListener('click', async () => {
//         if (pointLayer === null) { alert("Please generate vertexes first."); return; }
        const levelSelector = obj.scaleSelector.value, pointCollection = [];
        if (levelSelector === "auto") { levelValue = ''; 
        } else { levelValue = Number(obj.scaleFactor.value); }
//         pointLayer.eachLayer(layer => {
//             const latlng = layer.getLatLng();
//             pointCollection.push([latlng.lat, latlng.lng]);
//         });
        if (pointCollection.length === 0) { alert("No vertexes found."); return; }
        pointCollection.push(pointCollection[0]);
        signalSender('showOverlay', 'Generating an unstructured Grid. Please wait...');
        const contents = { 
            projectName: currentProject, levelValue: levelValue, 
            pointCollection: pointCollection 
        }
        const response = await jsonLoader('grid_creator', contents); 
        signalSender('hideOverlay');
        if (response.status === "error") { alert(response.message); return; }
//         gridLayer = clearMap(gridLayer, lakeMap); orthoLayer = clearMap(orthoLayer, lakeMap);
//         gridLayer = await plotUnstructuredGrid(response.content, lakeMap);
        moveChecked = false; obj.moveCheckbox.checked = false;
        refineChecked = false; obj.refinementCheckbox.checked = false;
        obj.refinementCheckbox.dispatchEvent(new Event('change'));
        obj.gridOptimizationCheckbox.checked = false;
        obj.gridOptimizationCheckbox.dispatchEvent(new Event('change'));
        obj.depthCheckbox.checked = false; obj.depthCheckbox.dispatchEvent(new Event('change'));
        obj.orthoCheckbox.checked = false; obj.orthoCheckbox.dispatchEvent(new Event('change'));
    });

    obj.optimizeBtn.addEventListener('click', async () => {
        // obj.progressbarGrid.value = 0; obj.progressTextGrid.innerText = ''; 
        // gridLayer = clearMap(gridLayer, lakeMap);
        if (isRunning) { alert("Grid optimization is already running."); return; }
//         if (pointLayer === null) { alert("Please generate grid first."); return; }
        const iterations = Number(obj.iterationValue.value);
        if (isNaN(iterations)) { alert("Please enter a valid number of iterations."); return; }
        const levelFrom = Number(obj.valueFrom.value), levelTo = Number(obj.valueTo.value);
        if (isNaN(levelFrom) || isNaN(levelTo) || levelFrom < 0 || levelTo < 0 || levelFrom >= levelTo) {
            alert("Please enter a valid value range."); return; 
        }
        // leafletContainer().style.display = 'none'; compass().style.display = 'none'; 
        obj.plotContainer.style.display = 'flex';
        obj.tableContent.style.display = 'none'; obj.menuContent.style.display = 'none'; 
        obj.optimizeCloseBtn.innerText = 'Stop'; isRunning = true;
        const statusRes = await jsonLoader('check_grid_optimization', {projectName: currentProject});
        // if (statusRes.status === "running") {
        //     updateLog(currentProject, obj.progressbarGrid, obj.progressTextGrid, 1);
        // }
        const pointCollection = [];
//         pointLayer.eachLayer(layer => {
//             const latlng = layer.getLatLng();
//             pointCollection.push([latlng.lat, latlng.lng]);
//         });
        if (pointCollection.length === 0) { alert("No vertexes found."); return; }
        pointCollection.push(pointCollection[0]);
        const contents = { projectName: currentProject, pointCollection: pointCollection,
            iterations: iterations, levelFrom: levelFrom, levelTo: levelTo
        };
        const start = await jsonLoader('start_grid_optimization', contents);
        if (start.status === "error") { isRunning = false; alert(start.message); return; }
        // updateLog(currentProject, obj.progressbarGrid, obj.progressTextGrid, 1);
    });
    // obj.optimizeCloseBtn.addEventListener('click', async (e) => {
    // //     const value = e.target.innerText;
    // //     if (value === 'Stop') {
    // //         const response = await jsonLoader('grid_stop', {projectName: currentProject});
    // //         if (response.status === "error") { alert(response.message); }
    // //         isRunning = false; e.target.innerText = 'Close and Plot Grid';
    // //     } else if (value === 'Close and Plot Grid') {
    // //         // leafletContainer().style.display = 'flex';  compass().style.display = 'flex';
    // //         obj.plotContainer.style.display = 'none';
    // //         obj.tableContent.style.display = 'flex'; obj.menuContent.style.display = 'flex';
    // //     }
    // });
    obj.saveGrid.addEventListener('click', async() => {
//         if (gridLayer === null) { alert("Please generate unstructured grid first."); return; }
        let name = obj.gridName.value.trim();
        if (name === "") { alert("Please enter a name."); return; }
        if (nameChecker(name)) { alert('Grid name contains invalid characters.'); return; }
        if (!name.toLowerCase().endsWith('.nc')) { name = name + '.nc'; }
        signalSender('showOverlay', 'Checking grid existence. Please wait...');
        const contents = { projectName: currentProject, gridName: name };
        const check = await jsonLoader('grid_checker', contents); 
        signalSender('hideOverlay');
        if (check.status === "error") { 
            if (!confirm(`File "${name}" already exists. Do you want to overwrite it?`)) return;
        }
        signalSender('showOverlay', 'Saving grid. Please wait...');
        const response = await jsonLoader('grid_saver', contents);
        signalSender('hideOverlay'); alert(response.message);
    });
    
}


async function lakeOptions() {
    // Search lake
    const handleLakeSearchEvent = async (e) => { 
        const value = e.target.value.trim(); 
        if (e.type === 'input') clearTimeout(timeOut); 
        if (e.type === 'click') { 
            obj.lakeSelector.style.display = 'none'; 
            obj.lakeLabel.style.display = 'none'; 
        } 
        if (value === "") {
            obj.menuContent.style.display = "none"; 
            resetMap();
        }
        await addItems(currentProject, value); 
        obj.municipalityName.value = ''; 
        obj.municipalityList.style.display = "none"; 
    }; 
    ['click', 'input'].forEach(evt => { 
        obj.lakeSearcher.addEventListener(evt, handleLakeSearchEvent); 
    }); 
    obj.lakeSelector.addEventListener('change', async (e) => { 
        const lakeName = e.target.value.trim(); if (!lakeName) return; 
        if (lakeName === '') { 
            obj.menuContent.style.display = "none";
        } else { obj.menuContent.style.display = "grid"; }
        resetMap(); signalSender('showOverlay', `Loading data for lake: ${lakeName}`);
        const response = await jsonLoader('load_lakes', { 
            projectName: currentProject, lakeName: lakeName 
        });
        signalSender('hideOverlay');
        if (response.status === "error") { alert(response.message); return; } 
        dataLake = response.content.lake; dataDepth = response.content.depth;
        const data = dataLake.features[0].properties;
        const contents = [[
            data.name, data.region, data.area, 
            data.perimeter, data.min, data.max, data.avg
        ]]; 
        obj.tableContent.style.display = "block"; 
        fillTable(contents, obj.lakeTable, true);
        obj.polygonCheckbox.checked = true;
        obj.depthCheckbox.checked = true;
        obj.orthoCheckbox.checked = false; 
        // Plot depth grid on map
        const dataGrid = { 
            layer: 'depthGrid', legend: 'Depth (m)', 
            dataLake: dataLake, dataDepth: dataDepth, id: gridId
        };
        signalSender('gridPlot', dataGrid);
        // Plot polygon on map
        const dataPolygon = { 
            layer: 'polygonGrid', polygon: dataLake, checked: true,
            id: gridId, entireNorway: entireNorway, zoom: true 
        };
        signalSender('gridPlot', dataPolygon);
    }); 
}

async function loadLakes(currentProject){
    signalSender('showOverlay', "Initializing Database for entire Norway's Lakes. Please wait...");
    const response = await jsonLoader('init_lakes', {projectName: currentProject});
    if (response.status === "error") { alert(response.message); return; }
    signalSender('hideOverlay');
    lakesData = response.content;
    dataLake = lakesData.lake; dataDepth = lakesData.depth;
}

async function dataBaseOptions() {
    // Update municipality name 
    obj.municipalityName.addEventListener('change', async (e) => { 
        const selectedLake = e.target.value.trim(); entireNorway = false; 
        if (!selectedLake || selectedLake === "") { 
            e.target.dispatchEvent(new Event('click')); return; 
        }
        if (selectedLake === "All Municipalities" ) { 
            signalSender('showOverlay', 'Loading Lakes for entire Norway. Please wait...');
            entireNorway = true; obj.tableContent.style.display = "none"; 
            obj.menuContent.style.display = "none"; 
            obj.lakeSelector.style.display = "none"; 
            signalSender('colorbarOption', { display: 'none', id: gridId });
            const response = await jsonLoader('load_lakes', { 
                projectName: currentProject, lakeName: 'all'
            });
            signalSender('hideOverlay');
            if (response.status === "error") { alert(response.message); return; } 
            dataLake = response.content.lake; dataDepth = response.content.depth;
            signalSender('clearGridMap');
            const dataPolygon = { 
                layer: 'polygonGrid', polygon: dataLake, id: gridId, 
                entireNorway: entireNorway, zoom: true 
            };
            signalSender('gridPlot', dataPolygon); return;
        }
        obj.lakeSelector.innerHTML = lakesData[selectedLake]
            .map(name => `<option value="${name}">${name}</option>`).join(''); 
        obj.lakeSelector.value = lakesData[selectedLake][0]; 
        obj.lakeSelector.dispatchEvent(new Event('change')); 
    });
    obj.municipalityName.addEventListener('click', async (e) => { 
        obj.sugesstionLake.style.display = "none"; obj.lakeSearcher.value = "";
        if (e.target.value.trim() === "") { 
            obj.lakeLabel.style.display = "none"; 
            obj.lakeSelector.style.display = "none"; 
            obj.menuContent.style.display = "none"; 
            const tbody = obj.lakeTable.querySelector("tbody"); tbody.innerHTML = '';
            deleteTable(obj.lakeTable); addRowToTable(obj.lakeTable, row);
        } 
        if (Object.keys(lakesData).length === 0) { await loadLakes(currentProject); } 
        obj.municipalityList.innerHTML = ''; 
        // Add "All Municipalities" option 
        const allLi = document.createElement("li"); 
        allLi.textContent = "All Municipalities"; allLi.style.fontWeight = "bold"; 
        allLi.dataset.value = "All Municipalities"; allLi.style.fontSize = "18px"; 
        allLi.addEventListener('mousedown', () => { 
            obj.municipalityName.value = allLi.dataset.value; 
            obj.municipalityList.style.display = "none"; 
            obj.lakeLabel.style.display = "none"; 
            obj.lakeSelector.style.display = "none"; 
            obj.municipalityName.dispatchEvent(new Event('change')); 
        }); 
        obj.municipalityList.appendChild(allLi); 
        const allHr = document.createElement("hr"); 
        allHr.style.margin = "5px 10px 5px 10px"; 
        allHr.style.borderTop = "1px solid #0414f5"; 
        obj.municipalityList.appendChild(allHr); 
        Object.keys(lakesData).forEach(p => { 
            const li = document.createElement("li"); 
            li.textContent = p; 
            li.addEventListener('mousedown', () => { 
                obj.municipalityName.value = p; 
                obj.municipalityList.style.display = "none"; 
                obj.lakeLabel.style.display = "block"; 
                obj.lakeSelector.style.display = "block"; 
                obj.municipalityName.dispatchEvent(new Event('change')); 
            }); 
            obj.municipalityList.appendChild(li); 
        });
        obj.municipalityList.style.display = "block"; 
    });
    obj.municipalityName.addEventListener('input', (e) => { 
        const value = e.target.value.trim(); 
        if (value !== "") { 
            projectRender(e.target, obj.municipalityList, Object.keys(lakesData));
        } else { 
            obj.lakeSelector.value = ""; e.target.value = ""; 
            obj.lakeLabel.style.display = "none"; 
            obj.lakeSelector.style.display = "none"; 
            e.target.dispatchEvent(new Event('click')); 
        } 
    });
    obj.municipalityName.addEventListener('blur', (e) => { 
        setTimeout(() => { obj.municipalityList.style.display = "none"; }, 0); 
        if (e.target.value === "") { 
            obj.lakeLabel.style.display = "none"; obj.lakeSelector.style.display = "none"; 
        } 
    });
}

function updateLog(project, progress_bar, progress_text, seconds){
    activeProject = project; isRunning = true;
    logInterval = setInterval(async () => {
        if (activeProject !== project) { clearInterval(logInterval); logInterval = null; }
        try {
            const statusRes = await jsonLoader('check_grid_optimization', {projectName: project});
            progress_text.innerText = statusRes.message; progress_bar.value = statusRes.progress;
            if (statusRes.status === "finished" || statusRes.status === "stopped") {
                clearInterval(logInterval); logInterval = null; isRunning = false;
                if (statusRes.grid) { 
                    // gridLayer = clearMap(gridLayer, lakeMap);
                    // gridLayer = await plotUnstructuredGrid(statusRes.grid, lakeMap);
                    orthoCheckbox().checked = true; orthoCheckbox().dispatchEvent(new Event('change'));
                } else { alert('No grid has been found. Consider running the optimization again.'); }
                optimizeCloseBtn().innerText = "Close and Plot Grid"; return;
            }
            if (statusRes.status === "failed") {
                clearInterval(logInterval); logInterval = null; isRunning = false;
                alert(statusRes.message); return;
            }
            // Plotting Orthogonality
            await orthoPlotter(statusRes.his, chartDiv(), 'Step', 'Orthogonality', 'Orthogonality History');
        } catch (error) { 
            alert("Polling error:", error); clearInterval(logInterval); logInterval = null; 
        }
    }, seconds * 1000);
}

function resetMap(){
    signalSender('clearGridMap'); signalSender('colorbarOption', { display: 'none', id: gridId });
    // obj.polygonCheckbox.checked = false; obj.depthCheckbox.checked = false;
    // obj.refinementCheckbox.checked = false; obj.orthoCheckbox.checked = false; 
    // obj.deleteCheckbox.checked = false; refineChecked = false; deleteChecked = false;
}
