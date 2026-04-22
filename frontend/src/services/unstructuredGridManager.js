import { gridId } from "./constant.js";
import { getUser, fillTable, jsonLoader, deleteTable, addRowToTable,
    signalSender
} from "./commonFunctions.js";
import { projectRender } from "./projectManager.js";
import { gridPlotter } from "./unstructuredGrid.js";

// import { startLoading, stopLoading, jsonLoader, renderProjects, fillTable
//     } from "./commonFunctions.js"; 
// import { createLakeMap } from "./unstructuredGrid.js";
// import { getState } from "./constant.js";

const row = ['Name', 'Municipality', 'Area', 'Perimeter', 
    'Max Depth', 'Min Depth', 'Average Depth'];
let currentProject = null, lakesData = {}, dataLake = null, dataDepth = null,
    drawChecked = false, entireNorway = false, timeOut = null, drawSelection = false;
// let lakesData = {}, lakeMap = null, pointLayer = null, entireNorway = false, 
//     refineChecked = false, deleteChecked = false, dataLake = null, dataDepth = null,
//     timeOut = null, levelValue = null, pointContainer = [], html = '', drawChecked = false, moveChecked = false,
//     baseMap = null, currentTileLayer = null, gridLayer = null, orthoLayer = null, isRunning = false,
//     tempLine = null, mapContainer = null, activeProject = null, logInterval = null;
    
    
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
    leafletContainer: $("map-container"), plotContainer: $("plot-container"),
    progressbarGrid: $("progressbar-grid"), progressTextGrid: $("progress-text-grid"),
    optimizeCloseBtn: $("optimization-close"), gridName: $("grid-name"),
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
    signalSender('addMapWidget', content);
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
            legend: 'Depth (m)', dataLake: dataLake, 
            dataDepth: dataDepth, id: gridId
        };
        signalSender('gridPlotter', dataGrid);
        // Plot polygon on map
        const dataPolygon = { 
            polygon: dataLake, id: gridId, 
            entireNorway: entireNorway, zoom: true 
        };
        signalSender('polygonPlotter', dataPolygon);
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
                polygon: dataLake, id: gridId, entireNorway: entireNorway, zoom: true 
            };
            signalSender('polygonPlotter', dataPolygon); return;
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

function resetMap(){
    signalSender('clearGridMap'); signalSender('colorbarOption', { display: 'none', id: gridId });
    // obj.polygonCheckbox.checked = false; obj.depthCheckbox.checked = false;
    // obj.refinementCheckbox.checked = false; obj.orthoCheckbox.checked = false; 
    // obj.deleteCheckbox.checked = false; refineChecked = false; deleteChecked = false;
}


// function updateManager() { 

// function toggleMoveMode(targetLayer, enable) {
//     targetLayer.eachLayer(layer => {
//         if (layer.dragging) {
//             enable ? layer.dragging.enable() : layer.dragging.disable();
//         }
//     });
// }

// async function plotUnstructuredGrid(obj) {
//     const tempLayer = L.geoJSON(obj, {
//         style: feature => {
//             switch (feature.geometry.type) {
//                 case 'LineString': 
//                 case 'MultiLineString': return { color: 'black', weight: 0.5 };
//                 case 'Polygon':
//                 case 'MultiPolygon':
//                     return { color: 'black', fillColor: 'darkcyan', fillOpacity: 0.5, weight: 0.5 };
//                 default: return {};
//             }
//         }
//     }).addTo(lakeMap);
//     return tempLayer;
// }



async function createLakeMap() {
//     lakeMap.on('mousemove', function (e) { 
//         mapContainer.style.cursor = "grab";
//         if (refineChecked) {
//             if (pointContainer.length === 0) { html = "Select start point to refine."; }
//             hoverTooltip.setLatLng(e.latlng).setContent(html);
//             lakeMap.openTooltip(hoverTooltip);
//         }
//         if (deleteChecked) {
//             if (pointContainer.length === 0) { html = "Select start point to delete."; }
//             hoverTooltip.setLatLng(e.latlng).setContent(html);
//             lakeMap.openTooltip(hoverTooltip);
//         }

//         if (moveChecked) { 
//             mapContainer.style.cursor = "move";
//             html = `Move a vertex using the left mouse button.`;
//             hoverTooltip.setLatLng(e.latlng).setContent(html);
//             lakeMap.openTooltip(hoverTooltip);
//         }
//     });

}


// async function polygonRefinement(pointIds) {
//     const refineValue = Number(refinementValue().value); gridLayer = clearMap(gridLayer, lakeMap);
//     if (!Number.isFinite(refineValue) || refineValue <= 0) { alert("Please enter a valid non-negative value."); return; }
//     if (pointLayer === null) { alert("No polygon has been found. Select the button 'Get/Reset Vertexes' to draw the original polygon first."); return; }
//     const pointCollection = [];
//     pointLayer.eachLayer(layer => {
//         const latlng = layer.getLatLng();
//         pointCollection.push([latlng.lat, latlng.lng]);
//     });
//     if (pointCollection.length < 2) { alert("No point has been found. Select the button 'Get/Reset Vertexes' to create vertexes first."); return; }
//     startLoading('Refining Vertexes. Please wait...');
//     const contents = {
//         projectName: getState().currentProject, distance: refineValue, polygon: pointCollection,
//         startPoint: pointIds[0], endPoint: pointIds[pointIds.length - 1]
//     }
//     const response = await sendQuery('vertex_refiner', contents); stopLoading();
//     if (response.status === "error") { alert(response.message);  return; }
//     const polygon = response.content.polygon, point = response.content.point; dataLake = polygon;
//     if (!polygonCheckbox().checked) { polygonCheckbox().checked = true; }
//     lakeMap.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) lakeMap.removeLayer(layer); });
//     polygonLayer = polygonPlotter(polygon); pointLayer = addPointLayer(point, false);
//     orthoCheckbox().checked = false; orthoCheckbox().dispatchEvent(new Event('change'));
// }

// async function pointRemoval(pointIds) {
//     if (pointLayer === null) { alert("No polygon has been found. Select the button 'Get/Reset Vertexes' to draw the original polygon first."); return; }
//     const pointCollection = []; deleteChecked = true;
//     pointLayer.eachLayer(layer => {
//         const latlng = layer.getLatLng();
//         pointCollection.push([latlng.lat, latlng.lng]);
//     });
//     if (pointCollection.length < 2) { alert("No point has been found. Select the button 'Get/Reset Vertexes' to draw the original polygon first."); return; }
//     startLoading('Deleting Vertexes. Please wait...');
//     const contents = {
//         projectName: getState().currentProject, polygon: pointCollection,
//         startPoint: pointIds[0], endPoint: pointIds[pointIds.length - 1]
//     }
//     await new Promise(resolve => setTimeout(resolve, 0));
//     const response = await sendQuery('vertex_remover', contents); stopLoading();
//     if (response.status === "error") { alert(response.message); return; }
//     const polygon = response.content.polygon, point = response.content.point;
//     lakeMap.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) lakeMap.removeLayer(layer); });
//     polygonLayer = polygonPlotter(polygon, false); pointLayer = addPointLayer(point, false);
//     orthoCheckbox().checked = false; orthoCheckbox().dispatchEvent(new Event('change'));
// }



// async function orthoPlotter(data, plotDiv, titleX, titleY, chartTitle) {
//     if (!plotDiv) { alert("plotDiv is null"); return; }
//     if (!data || data.length === 0) return;
//     // Delete existing plot
//     Plotly.purge(plotDiv); plotDiv.innerHTML = "";
//     const x = data.map(d => d.iteration), minVals = data.map(d => d.min);
//     const meanVals = data.map(d => d.mean), maxVals = data.map(d => d.max);
//     const traces = [{x: x, y: minVals, mode: 'lines', type: 'scatter', name: 'Min', line: { width: 2 }},
//         { x: x, y: meanVals, mode: 'lines', type: 'scatter', name: 'Mean', line: { width: 2 } },
//         { x: x, y: maxVals, mode: 'lines', type: 'scatter', name: 'Max', line: { width: 2 } }
//     ];
//     const layout = {
//         title: { text: chartTitle, font: { size: 20, color: 'black', weight: 'bold' } },
//         paper_bgcolor: 'rgb(245, 240, 240)', plot_bgcolor: 'rgb(247, 243, 243)', showlegend: true,
//         xaxis: {  title: titleX, type: 'linear', showline: true, mirror: true, ticks: 'outside', font: { color: 'black', size: 18 } },
//         yaxis: { title: titleY, showline: true, mirror: true, ticks: 'outside', font: { color: 'black', size: 18 } },
//         margin: { l: 70, r: 30, t: 50, b: 50 }, 
//     };
//     Plotly.react(plotDiv, traces, layout, { responsive: true });
// }

// function updateLog(project, progress_bar, progress_text, seconds){
//     activeProject = project; isRunning = true;
//     logInterval = setInterval(async () => {
//         if (activeProject !== project) { clearInterval(logInterval); logInterval = null; }
//         try {
//             const statusRes = await sendQuery('check_grid_optimization', {projectName: project});
//             progress_text.innerText = statusRes.message; progress_bar.value = statusRes.progress;
//             if (statusRes.status === "finished" || statusRes.status === "stopped") {
//                 clearInterval(logInterval); logInterval = null; isRunning = false;
//                 if (statusRes.grid) { 
//                     gridLayer = clearMap(gridLayer, lakeMap);
//                     gridLayer = await plotUnstructuredGrid(statusRes.grid);
//                     orthoCheckbox().checked = true; orthoCheckbox().dispatchEvent(new Event('change'));
//                 } else { alert('No grid has been found. Consider running the optimization again.'); }
//                 optimizeCloseBtn().innerText = "Close and Plot Grid"; return;
//             }
//             if (statusRes.status === "failed") {
//                 clearInterval(logInterval); logInterval = null; isRunning = false;
//                 alert(statusRes.message); return;
//             }
//             // Plotting Orthogonality
//             await orthoPlotter(statusRes.his, chartDiv(), 'Step', 'Orthogonality', 'Orthogonality History');
//         } catch (error) { 
//             alert("Polling error:", error); clearInterval(logInterval); logInterval = null; 
//         }
//     }, seconds * 1000);
// }

// async function dataPreparationManager(){
//     baseMap = document.getElementById("base-map-select");
//     if (!lakeMap) { createLakeMap(); }; polygonLayer = clearMap(polygonLayer, lakeMap);
//     regionName().addEventListener('change', async () => {
//         const selectedLake = regionName().value.trim(); entireNorway = false;
//         if (!selectedLake || selectedLake === "") { return; }
//         if (selectedLake === "All Municipalities" ) {
//             startLoading('Loading Lakes for entire Norway. Please wait...'); entireNorway = true;
//             const response = await sendQuery('load_lakes', { projectName: getState().currentProject, lakeName: 'all' }); stopLoading();
//             if (response.status === "error") { alert(response.message);  return; }
//             tableContent().style.display = "none"; menuContent().style.display = "none";
//             colorbar_container_grid().style.display = 'none'; lakeSelector().style.display = "none";
//             dataLake = response.content.lake; dataDepth = response.content.depth;
//             polygonLayer = clearMap(polygonLayer, lakeMap); polygonLayer = polygonPlotter(dataLake, true); 
//             orthoLayer = clearMap(orthoLayer, lakeMap); return;
//         }
//         lakeSelector().innerHTML = lakesData[selectedLake].map(name => `<option value="${name}">${name}</option>`).join('');
//         lakeSelector().value = lakesData[selectedLake][0]; lakeSelector().dispatchEvent(new Event('change'));
//     });
//     lakeSelector().addEventListener('change', async () => {
//         const lakeName = lakeSelector().value; if (!lakeName) return;
//         gridLayer = clearMap(gridLayer, lakeMap); polygonLayer = clearMap(polygonLayer, lakeMap);
//         pointLayer = clearMap(pointLayer, lakeMap); orthoLayer = clearMap(orthoLayer, lakeMap);
//         startLoading(`Loading data for lake: ${lakeName}`);
//         const response = await sendQuery('load_lakes', { projectName: getState().currentProject, lakeName: lakeName }); stopLoading();
//         if (response.status === "error") { alert(response.message); return; }
//         dataLake = response.content.lake; dataDepth = response.content.depth;
//         createLakeMap(); const data = dataLake.features[0].properties;
//         const contents = [[data.name, data.region, data.area, data.perimeter, data.min, data.max, data.avg]];
//         tableContent().style.display = "block"; menuContent().style.display = "flex";
//         fillTable(contents, lakeTable(), true); lakeSelector().style.display = 'flex';
//         depthCheckbox().checked = true; polygonCheckbox().checked = true; orthoCheckbox().checked = false;
//         // Plot lake and depth on map
//         window.depthGridLayer = clearMap(window.depthGridLayer, lakeMap);
//         window.depthGridLayer = gridPlotter(dataLake, dataDepth);
//         polygonLayer = clearMap(polygonLayer, lakeMap); polygonLayer = polygonPlotter(dataLake, true);
//     });
//     // Search lake
//     lakeSearcher().addEventListener('click', (e) => { 
//         addItems(e.target.value.trim()); regionList().style.display = "none";
//         lakeSelector().style.display = 'none'; regionName().value = '';
//     });
//     lakeSearcher().addEventListener('input', (e) => {
//         clearTimeout(timeOut); addItems(e.target.value.trim()); regionName().value = '';
//         regionList().style.display = "none"; lakeSelector().style.display = 'none'; resetMap();
//     });
//     document.addEventListener('click', (e) => { 
//         const input = lakeSearcher(), suggestion = sugesstionLake();
//         if (!input.contains(e.target) && !suggestion.contains(e.target)) {
//             suggestion.style.display = "none";
//         }
//     });
//     polygonCheckbox().addEventListener('change', (e) => {
//         if (e.target.checked) { 
//             if (polygonLayer === null) { polygonLayer = polygonPlotter(dataLake, true); }
//         } else { polygonLayer = clearMap(polygonLayer, lakeMap); }
//     });
//     depthCheckbox().addEventListener('change', async (e) => {
//         if (e.target.checked) {
//             if (drawSelection) { e.target.checked = false; return; } 
//             if (window.depthGridLayer === null) {
//                 startLoading('Plotting depth grid. Please wait...');
//                 await new Promise(resolve => setTimeout(resolve, 0));
//                 window.depthGridLayer = gridPlotter(dataLake, dataDepth);
//                 stopLoading();
//             }
//         } else {
//             window.depthGridLayer = clearMap(window.depthGridLayer, lakeMap);
//             colorbar_container_grid().style.display = 'none';
//         }
//     });
//     baseMap.addEventListener('change', () => {
//         const url = baseMap.value.trim(); currentTileLayer = clearMap(currentTileLayer, lakeMap);
//         currentTileLayer = L.tileLayer(url, {zIndex: 0});
//         currentTileLayer.addTo(lakeMap);
//         setTimeout(() => { lakeMap.invalidateSize(); }, 0);
//     });
//     vertexesBtn().addEventListener('click', async () => {
//         gridLayer = clearMap(gridLayer, lakeMap); polygonLayer = clearMap(polygonLayer, lakeMap);
//         colorbar_container_grid().style.display = 'none';
//         startLoading('Generating Vertexes. Please wait...');
//         await new Promise(resolve => setTimeout(resolve, 0));
//         const response = await sendQuery('vertex_generator', { projectName: getState().currentProject }); stopLoading();
//         if (response.status === "error") { alert(response.message); return; }
//         pointLayer = clearMap(pointLayer, lakeMap); pointLayer = addPointLayer(response.content, false);
//         if (!polygonCheckbox().checked) { polygonCheckbox().checked = true; }
//         polygonCheckbox().dispatchEvent(new Event('change'));
//         orthoCheckbox().checked = false; orthoCheckbox().dispatchEvent(new Event('change'));
//         refineChecked = false; refinementCheckbox().checked = false;
//         refinementCheckbox().dispatchEvent(new Event('change'));
//         depthCheckbox().checked = false; depthCheckbox().dispatchEvent(new Event('change'));
//     });
//     refinementCheckbox().addEventListener('change', (e) => {
//         if (e.target.checked) { 
//             if (pointLayer === null) { 
//                 alert("Select the button 'Get/Reset Vertexes' to create vertexes first.");
//                 e.target.checked = false; return;
//             }
//             refineChecked = true; depthCheckbox().checked = false;
//             moveCheckbox().checked = false; moveChecked = false;
//             depthCheckbox().dispatchEvent(new Event('change'));
//             orthoLayer = clearMap(orthoLayer, lakeMap); deleteChecked = false;
//             orthoCheckbox().checked = false; orthoCheckbox().dispatchEvent(new Event('change'));
//             pointContainer = []; gridLayer = clearMap(gridLayer, lakeMap);
//             refinementContainer().style.display = 'flex';
//             deleteChecked = false; deleteCheckbox().checked = false;
//             deleteCheckbox().dispatchEvent(new Event('change'));
//         } else { refinementContainer().style.display = 'none'; refineChecked = false; }
//     });
//     moveCheckbox().addEventListener('change', async (e) => { 
//         const value = e.target.checked, pointCollection = [];
//         if (value) {
//             if (pointLayer === null) {
//                 alert("Select the button 'Get/Reset Vertexes' to create vertexes first.");
//                 e.target.checked = false; return;
//             }
//             toggleMoveMode(pointLayer, true);
//             pointLayer.eachLayer(layer => {
//                 const latlng = layer.getLatLng();
//                 pointCollection.push([latlng.lat, latlng.lng]);
//             });
//             if (pointCollection.length === 0) { alert("No vertexes found."); return; }
//             pointCollection.push(pointCollection[0]); 
//             moveChecked = true; refineChecked = false; deleteChecked = false;
//             deleteCheckbox().checked = false; refinementCheckbox().checked = false;
//             startLoading('Regenerating vertexes. Please wait...');
//             await new Promise(resolve => setTimeout(resolve, 0));
//             const contents = { projectName: getState().currentProject, pointCollection: pointCollection };
//             const response = await sendQuery('vertex_mover', contents); stopLoading();
//             if (response.status === "error") { alert(response.message); return; }
//             if (!polygonCheckbox().checked) { polygonCheckbox().checked = true; }
//             polygonLayer = clearMap(polygonLayer, lakeMap); polygonLayer = polygonPlotter(response.content.polygon);
//             pointLayer = clearMap(pointLayer, lakeMap); pointLayer = addPointLayer(response.content.point, true);
//         } else { moveChecked = false; toggleMoveMode(pointLayer, false); }
//     });
//     deleteCheckbox().addEventListener('change', async (e) => {
//         if (!e.target.checked) { deleteChecked = false; return; }
//         if (pointLayer === null) { 
//             alert("Select the button 'Get/Reset Vertexes' to create vertexes first.");
//             e.target.checked = false; return;
//         }
//         moveCheckbox().checked = false; moveChecked = false;
//         pointContainer = []; gridLayer = clearMap(gridLayer, lakeMap); deleteChecked = true; 
//         orthoCheckbox().checked = false; orthoCheckbox().dispatchEvent(new Event('change'));
//         refineChecked = false; refinementCheckbox().checked = false;
//         refinementCheckbox().dispatchEvent(new Event('change'));
//     });
//     scaleSelector().addEventListener('change', (e) => {
//         const value = e.target.value;
//         if (value === "auto") { scaleFactor().style.display = "none"; }
//         else { scaleFactor().style.display = "flex"; }
//     });
//     scaleFactor().addEventListener('input', (e) => { 
//         const value = e.target.value;
//         if (value === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) { e.target.value = '1.0'; return; }
//     });
//     createGrid().addEventListener('click', async () => {
//         if (pointLayer === null) { alert("Please generate vertexes first."); return; }
//         const levelSelector = scaleSelector().value, pointCollection = [];
//         if (levelSelector === "auto") { levelValue = ''; } else { levelValue = Number(scaleFactor().value); }
//         pointLayer.eachLayer(layer => {
//             const latlng = layer.getLatLng();
//             pointCollection.push([latlng.lat, latlng.lng]);
//         });
//         if (pointCollection.length === 0) { alert("No vertexes found."); return; }
//         pointCollection.push(pointCollection[0]);
//         startLoading('Generating an Unstructured Grid. Please wait...');
//         await new Promise(resolve => setTimeout(resolve, 0));
//         const contents = { projectName: getState().currentProject, pointCollection: pointCollection, levelValue: levelValue }
//         const response = await sendQuery('grid_creator', contents); stopLoading();
//         if (response.status === "error") { alert(response.message); return; }
//         gridLayer = clearMap(gridLayer, lakeMap); orthoLayer = clearMap(orthoLayer, lakeMap);
//         gridLayer = await plotUnstructuredGrid(response.content);
//         moveChecked = false; moveCheckbox().checked = false;
//         refineChecked = false; refinementCheckbox().checked = false;
//         refinementCheckbox().dispatchEvent(new Event('change'));
//         gridOptimizationCheckbox().checked = false;
//         gridOptimizationCheckbox().dispatchEvent(new Event('change'));
//         depthCheckbox().checked = false; depthCheckbox().dispatchEvent(new Event('change'));
//         orthoCheckbox().checked = false; orthoCheckbox().dispatchEvent(new Event('change'));
//     });
//     orthoCheckbox().addEventListener('change', async (e) => {
//         if (e.target.checked) { 
//             if (gridLayer === null) { 
//                 alert("Please generate grid first."); 
//                 orthoCheckbox().checked = false; return; 
//             }
//             startLoading('Generating Orthogonality Grid. Please wait...');
//             await new Promise(resolve => setTimeout(resolve, 0));
//             const contents = { projectName: getState().currentProject };
//             const response = await sendQuery('grid_ortho', contents); stopLoading();
//             if (response.status === "error") { alert(response.message); return; }
//             window.depthGridLayer = clearMap(window.depthGridLayer, lakeMap);
//             orthoLayer = clearMap(orthoLayer, lakeMap); depthCheckbox().checked = false;
//             const vmin = response.content.min, vmax = response.content.max, colorKey = 'ortho';
//             orthoLayer = L.geoJSON(response.content.data, {
//                 pointToLayer: (feature, latlng) => {
//                     const value = Number(feature.properties.orth);
//                     const { r, g, b, a } = getColorFromValue(value, vmin, vmax, colorKey);
//                     const col = `rgb(${r},${g},${b})`;
//                     return L.circleMarker(latlng, {
//                         color: col, fillColor: col, radius: 2, fillOpacity: a
//                     });
//                 },
//                 onEachFeature: (feature, layer) => {
//                     layer.bindTooltip(`Orthogonality: ${feature.properties.orth}`, {
//                         sticky: true, permanent: false, direction: 'center', opacity: 1
//                     });
//                 }
//             }).addTo(lakeMap);
//             updateColorbar(vmin, vmax, 'Orthogonality', colorKey, colorbar_color_grid(), 
//                 colorbar_title_grid(), colorbar_label_grid());
//             colorbar_container_grid().style.display = 'block';
//         } else { 
//             orthoLayer = clearMap(orthoLayer, lakeMap);
//             if (!depthCheckbox().checked) { colorbar_container_grid().style.display = 'none'; } 
//         }
//     });
//     gridOptimizationCheckbox().addEventListener('change', async (e) => {
//         if (e.target.checked) {
//             if (gridLayer === null) { 
//                 alert("Please generate grid first."); e.target.checked = false; return; 
//             }
//             gridOptimizationContainer().style.display = 'flex';
//         } else { gridOptimizationContainer().style.display = 'none'; }
//     });
//     optimizeBtn().addEventListener('click', async () => {
//         progressbarGrid().value = 0; progressTextGrid().innerText = ''; gridLayer = clearMap(gridLayer, lakeMap);
//         if (isRunning) { alert("Grid optimization is already running."); return; }
//         if (pointLayer === null) { alert("Please generate grid first."); return; }
//         const iterations = Number(iterationValue().value);
//         if (isNaN(iterations)) { alert("Please enter a valid number of iterations."); return; }
//         const levelFrom = Number(valueFrom().value), levelTo = Number(valueTo().value);
//         if (isNaN(levelFrom) || isNaN(levelTo) || levelFrom < 0 || levelTo < 0 || levelFrom >= levelTo) {
//             alert("Please enter a valid value range."); return; 
//         }
//         leafletContainer().style.display = 'none'; plotContainer().style.display = 'flex'; compass().style.display = 'none';
//         tableContent().style.display = 'none'; menuContent().style.display = 'none'; 
//         optimizeCloseBtn().innerText = 'Stop'; isRunning = true;
//         const statusRes = await sendQuery('check_grid_optimization', {projectName: getState().currentProject});
//         if (statusRes.status === "running") {
//             updateLog(getState().currentProject, progressbarGrid(), progressTextGrid(), 1);
//         }
//         const pointCollection = [];
//         pointLayer.eachLayer(layer => {
//             const latlng = layer.getLatLng();
//             pointCollection.push([latlng.lat, latlng.lng]);
//         });
//         if (pointCollection.length === 0) { alert("No vertexes found."); return; }
//         pointCollection.push(pointCollection[0]);
//         const contents = { projectName: getState().currentProject, pointCollection: pointCollection,
//             iterations: iterations, levelFrom: levelFrom, levelTo: levelTo
//         };
//         const start = await sendQuery('start_grid_optimization', contents);
//         if (start.status === "error") { isRunning = false; alert(start.message); return; }
//         updateLog(getState().currentProject, progressbarGrid(), progressTextGrid(), 1);
//     });
//     optimizeCloseBtn().addEventListener('click', async (e) => {
//         const value = e.target.innerText;
//         if (value === 'Stop') {
//             const response = await sendQuery('grid_stop', {projectName: getState().currentProject});
//             if (response.status === "error") { alert(response.message); }
//             isRunning = false; e.target.innerText = 'Close and Plot Grid';
//         } else if (value === 'Close and Plot Grid') {
//             leafletContainer().style.display = 'flex'; plotContainer().style.display = 'none'; compass().style.display = 'flex';
//             tableContent().style.display = 'flex'; menuContent().style.display = 'flex';
//         }
//     });
//     saveGrid().addEventListener('click', async() => {
//         if (gridLayer === null) { alert("Please generate unstructured grid first."); return; }
//         let name = gridName().value.trim();
//         if (name === "") { alert("Please enter a name."); return; }
//         if (nameChecker(name)) { alert('Grid name contains invalid characters.'); return; }
//         if (!name.toLowerCase().endsWith('.nc')) { name = name + '.nc'; }
//         startLoading('Checking grid existence. Please wait...');
//         await new Promise(resolve => setTimeout(resolve, 0));
//         const contents = { projectName: getState().currentProject, gridName: name };
//         const check = await sendQuery('grid_checker', contents); stopLoading();
//         if (check.status === "error") { 
//             if (!confirm(`File "${name}" already exists. Do you want to overwrite it?`)) { return; }
//         }
//         startLoading('Saving grid. Please wait...');
//         const response = await sendQuery('grid_saver', contents);
//         stopLoading(); alert(response.message);
//     });
//     baseMap.dispatchEvent(new Event('change'));
// }


