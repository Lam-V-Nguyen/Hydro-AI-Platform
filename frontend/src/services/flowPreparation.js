import { setupTabs } from "./tabManager.js";
import { flowId } from "./constant.js";
import { getUser, signalSender, sendRequest, initRequestListener, 
    nameChecker, csvUploader, getProjectList, jsonLoader, fillTable, 
    deleteTable, addRowToTable, getDataFromTable, formatDate
} from "./commonFunctions.js";
import { catchmentDelineation, geoJSONExporter } from "./flowManager.js";
import { projectRender } from "./projectManager.js";


const $ = (id) => document.getElementById(id);
const obj = {
    projectList: $('project-list'), projectName: $('project-name'), projectCreator: $('create-btn'),
    catchmentInputFile: $('catchment-input-file'), terrainBtn: $('terrain-btn'), 
    terrainInputFile: $('terrain-input-file'), terrainInputText: $('terrain-input-text'), 
    streamBtn: $('stream-btn'), threshold: $('threshold'), pourpointContainer: $('pourpoint-container'), 
    pourpointCheckbox: $('pourpoint-checkbox'), exportContainer: $('export-container'), 
    exportBtn: $('export-catchment-btn'), pourpointLat: $('pourpoint-lat'), 
    pourpointLon: $('pourpoint-lon'), dist: $('pourpoint-dist'), catchmentRadio: $('catchment-layer'), 
    soilBtn: $('soil-btn'), soilSource: $('soil-source'), soilTable: $('soil-attributes-table'), 
    downloadSoilBtn: $('download-soil-btn'), soilCheckerBtn: $('check-soil-btn'), soilLayer: $('soil-layer'),
    landBtn: $('land-btn'), landSource: $('land-source'), landLoaderBtn: $('land-load-btn'),
    riverContainer: $('river-container'), riverUploadBtn: $('river-upload-btn'),    
    riverInputFile: $('river-input-file'), riverInputText: $('river-input-text'),     
    riverThreshold: $('river-threshold'), riverCheckbox: $('river-checker-checkbox'),    
    riverLakeUploadBtn: $('lake-upload-btn'), riverCatchmentUploadBtn: $('lake-catchment-upload-btn'),
    lakeInputFile: $('lake-input-file'), riverLakeClipBtn: $('river-clip-lake-btn'),  
    riverCatchmentClipBtn: $('river-clip-catchment-btn'), riverTable: $('river-table'), 
    riverLength: $('river-length'), riverLengthBtn: $('river-length-btn'),
    riverDeleteBtn: $('river-delete-btn'), invalidriverBtn: $('river-invalid-checker-btn'),
    riverIds: $('river-id'), assignRiverBtn: $('river-assign-btn'), saveRiverBtn: $('river-save-btn'),
    weatherCSVContainer: $('weather-csv-container'), weatherStationContainer: $('weather-station-container'),
    weatherBtn: $('weather-btn'), weatherInputFile: $('weather-input-file'), weatherInputText: $('weather-input-text'), 
    weatherTable: $('weather-table'), weatherStationSelector: $('weather-station'), 
    weatherSourceContainer: $('weather-source-container'), downloadWeatherBtn: $('weather-download-btn'),
    weatherStationStartContainer: $('weather-station-start'), weatherStationEndContainer: $('weather-station-end'), 
    weatherStart: $('weather-start-date'), weatherEnd: $('weather-end-date'), saveweatherBtn: $('weather-save-btn'),
}


let currentProject, minTerrain = null, maxTerrain = null, minFill = null, maxFill = null, lastRadio = null,
    isTerrain = false, isStream = false;
    
    
    // minFlowDirection = null, maxFlowDirection = null, minFlowAccumulation = null, isFlowAccumulation = false,
    // maxFlowAccumulation = null, isFill = false, isFlowDirection = false;

initRequestListener(); setupTabs(document); await getProject();
settingManager(); windowListener(); topographyManager(); 
soilManager(); landManager(); riverManager(); weatherManager();  

async function getProject() { 
    const userName = await getUser(); currentProject = userName.split('/').pop();
    const respond = await getProjectList(`${currentProject}/flows`, '');
    await projectRender(obj.projectName, obj.projectList, respond);
}

function settingManager() {
    // Create new flow project
    obj.projectCreator.addEventListener('click', async () => {
        const name = obj.projectName.value.trim();
        if (!name || name.trim() === '') { alert('Please define scenario name.'); return; }
        if (nameChecker(name)) { alert('Scenario name contains invalid characters.'); return; }
        signalSender('showOverlay', 'Creating a new flow project. Please wait...');
        const content = { projectName: currentProject, filename: name };
        const data = await jsonLoader('flow_project', content);
        signalSender('hideOverlay'); alert(data.message);
    });
}

function topographyManager() {
    // Upload catchment
    obj.catchmentInputFile.addEventListener('change', async (e) => {
        const name = obj.projectName.value.trim();
        if (name === '') { alert('Please define scenario name (in tab "Settings").'); return; }
        const file = e.target.files[0]; if (!file) return; 
        const formData = new FormData(); formData.append('file', file);
        try {
            signalSender('showOverlay', 'Uploading catchment data. Please wait...');
            const response = await fetch('/geojson_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            const content = { 
                key: 'drawLayer', layerKey: 'catchmentLayer_Vector', data: data.content, reset: false
            };
            await sendRequest('flowOptions', content );
        } catch (error) { alert(`Uploading catchment failed: ${error.message}`); }
        finally { e.target.value = ''; }
    });
    // Work on terrain
    obj.terrainBtn.addEventListener('click', async () => {
        obj.terrainInputText.value = ''; obj.terrainInputFile.value = '';
        await sendRequest('flowOptions', { key: 'clearAll' });
        obj.terrainInputFile.click();
    });
    obj.terrainInputFile.addEventListener('change', async (e) => { 
        const file = e.target.files[0]; if (!file) return;
        const value = obj.projectName.value.trim();
        if (!value || value.trim() === '') { alert('Please define scenario name.'); return; }
        const formData = new FormData();
        formData.append('file', file); formData.append('flowName', value); 
        formData.append('projectName', currentProject);
        try {
            signalSender('Uploading and processing terrain data.\nPlease wait...');
            const response = await fetch('/terrain_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            minTerrain = data.content.min, maxTerrain = data.content.max;
            const content = { 
                key: 'drawLayer', data: data.content.tile_url, layerKey: 'terrainLayer',
                reset: true, min: minTerrain, max: maxTerrain
            };
            await sendRequest('flowOptions', content);
            obj.terrainInputText.value = file.name; e.target.value = ''; isTerrain = true;
        } catch (error) { alert(`Uploading terrain failed: ${error.message}`); }
        lastRadio = document.querySelector('input[name="terrain"][value="terrain-raw"]');
        if (lastRadio) lastRadio.checked = true;
    });
    // Detect streams
    obj.streamBtn.addEventListener('click', async () => {
        const layerCheck = obj.terrainInputText.value, name = obj.projectName.value.trim();
        if (layerCheck === '') { alert('Please upload terrain data first.'); return; }
        if (name === '') { alert('Please define scenario name (in tab "Settings").'); return; }
        try {
            signalSender('showOverlay', 'Detecting streams. Please wait ...');
            const contents = { 
                projectName: currentProject, filename: layerCheck, 
                flowName: name, threshold: obj.threshold.value 
            };
            const data = await jsonLoader('stream_upload', contents);
            signalSender('hideOverlay');
            if (data.status === "error") { alert(data.message); return; }
            const content = { 
                key: 'drawLayer', data: data.content.tile_url, layerKey: 'streamLayer', 
                min: data.content.min, max: data.content.max, reset: true
            };
            await sendRequest('flowOptions', content);
            obj.pourpointContainer.style.display = 'flex';
        } catch (error) { alert(`Detecting streams failed: ${error.message}`); }
        lastRadio = document.querySelector('input[name="terrain"][value="terrain-stream"]');
        if (lastRadio) lastRadio.checked = true;
    });
    lastRadio = document.querySelector('input[name="terrain"]:checked'); 
    document.querySelectorAll('input[name="terrain"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            let content = {};
            const terrainValue = obj.terrainInputText.value;
            const value = e.target.value;            
            if (terrainValue === '' && value !== 'hide-all') { 
                alert('Please upload terrain data first.'); 
                e.target.checked = false; 
                lastSelectedRadio.checked = true; 
                await sendRequest('flowOptions', { key: 'clearAll' }); return; 
            }
            if (value === 'hide-all') { content = { key: 'clearAll' };
            } else if (value === 'terrain-raw') {
                const terrainCheck = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'terrainLayer' });
                isTerrain = terrainCheck.exist;
                content = { 
                    key: 'drawLayer', layerKey: 'terrainLayer', 
                    min: minTerrain, max: maxTerrain, reset: true
                };
            } else if (value === 'terrain-stream') {
                if (!isTerrain) {
                    alert('Please upload terrain data first.'); 
                    lastRadio.checked = true; e.target.checked = false; return; 
                }
                const streamCheck = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'streamLayer' });
                isStream = streamCheck.exist;
                if (!isStream) { alert('Please run "Extract streams" first.'); 
                    lastRadio.checked = true; e.target.checked = false; return; 
                }
                content = { key: 'drawLayer', layerKey: 'streamLayer', min: 0, max: 1, reset: true };
            } else if (value === 'terrain-catchment') {
                if (!isStream || obj.pourpointLat.value === '' || obj.pourpointLon.value === '') {
                    alert('Please run "Extract streams" and/or select a pourpoint first.'); 
                    lastRadio.checked = true; e.target.checked = false; return;
                }
                content = { key: 'drawLayer', layerKey: 'catchmentLayer_Vector', reset: true };
            }
            lastRadio = e.target; await sendRequest('flowOptions', content);
        });
    });
    obj.pourpointCheckbox.addEventListener('change', async (e) => {
        const radio = document.querySelector('input[name="terrain"][value="terrain-catchment"]');
        obj.pourpointLat.value = ''; obj.pourpointLon.value = '';
        if (e.target.checked) {
            const layerCheck = obj.terrainInputText.value;
            lastRadio.checked = true; if (radio) radio.checked = false;
            if (layerCheck === '') { 
                alert('No terrain data uploaded. Please:\n1. Upload terrain data.\n2. Run algorithms in the panel "Terrain Processing".');
                e.target.checked = false; return;
            }
            obj.pourpointContainer.style.display = 'flex';
            try { 
                const content = { key: 'pourpoint', checked: e.target.checked };
                const response = await sendRequest('flowOptions', content);
                const lat = Number(response.result.lat).toFixed(12);
                const lon = Number(response.result.lng).toFixed(12);
                obj.pourpointLat.value = lat; obj.pourpointLon.value = lon;
                const data =  await catchmentDelineation(
                    currentProject, obj.terrainInputText, obj.pourpointLat.value, obj.pourpointLon.value, obj.dist.value
                );
                if (data !== null) {
                    const content = { 
                        key: 'drawLayer', layerKey: 'catchmentLayer_Vector', data: data, reset: true
                    };
                    await sendRequest('flowOptions', content ); e.target.checked = false;
                    if (radio) { radio.checked = true; }
                } else {
                    obj.pourpointContainer.style.display = 'none'; 
                    obj.exportContainer.style.display = 'none';
                    e.target.checked = false;
                }
            } catch (error) { 
                e.target.checked = false; obj.pourpointLat.value = '';
                obj.pourpointLon.value = ''; 
                await sendRequest('flowOptions', { key: 'pourpointCancel' });
            }
        }
    });
    obj.exportBtn.addEventListener('click', async () => { 
        const layerCheck = obj.terrainInputText.value;
        if (layerCheck === '') { alert('Please upload terrain data first.'); return; }
        const layer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
        if (layer.data === null) { alert('Please select pourpoint and create a catchment first.'); return; }
        await geoJSONExporter(layer.data, 'catchment.geojson');
    });
}

function soilManager() {
    obj.soilBtn.addEventListener('click', () => obj.catchmentInputFile.click());
    obj.soilSource.addEventListener('change', async (e) => { 
        const value = e.target.value;
        if (value === '') { 
            deleteTable(obj.soilTable);
            const content = ["Soil type", "Soil depth", "Value"];
            addRowToTable(obj.soilTable, content); return;
        } 
        try { 
            signalSender('showOverlay', 'Getting soil data.\nPlease wait...');
            const request = await jsonLoader('data_upload', {key: 'soil' }); 
            signalSender('hideOverlay');
            if (request.status === 'error') { alert(request.message); return; }
            fillTable(request.content, obj.soilTable, true);
        } catch (error) { 
            alert(`Uploading soil data failed: ${error.message}`);
            obj.soilSource.value = '';
        }
    });
    obj.downloadSoilBtn.addEventListener('click', async () => {
        const name = obj.projectName.value;
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        const value = obj.soilSource.value;
        if (value === '') { alert('Please select a source first.'); return; }
        const data = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
        if (data.data === null) { alert('Please check/upload a catchment first.'); return; }
        signalSender('showOverlay', 'Downloading soil data.\nPlease wait...');
        const content = { 
            projectName: currentProject, key: 'soil', area: data.data, flowName: name, code: value 
        };
        const request = await jsonLoader('data_download', content); 
        signalSender('hideOverlay'); alert(request.message)
        obj.soilCheckerBtn.click();
    });
    obj.soilCheckerBtn.addEventListener('click', async () => {
        const name = obj.projectName.value;
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        signalSender('showOverlay', 'Getting soil layers.\nPlease wait...');
        const content = { 
            projectName: currentProject, flowName: name 
        };
        const request = await jsonLoader('check_soil', content);
        if (request.status === 'error') {
            signalSender('hideOverlay'); alert(request.message); return; 
        }
        let defaultOption = `<option value="" selected>--- Select a layer ---</option>`;
        if (request.content.length === 0) { 
            obj.soilLayer.innerHTML = defaultOption;
            alert('No soil layer detected.'); return;
        }
        const options = request.content.map(
            row => `<option value="${row.value}">${row.label}</option>`
        ).join('');
        obj.soilLayer.innerHTML = defaultOption + options;
        signalSender('hideOverlay');
    });
    obj.soilLayer.addEventListener('change', async (e) => { 
        const value = e.target.value; if (value === '') return;
        const name = obj.projectName.value; 
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        signalSender('showOverlay', 'Uploading and processing soil data. Please wait ...');
        const contents = { 
            projectName: currentProject, flowName: name, layerName: value
        };
        const data = await jsonLoader('soil_upload', contents);
        signalSender('hideOverlay');
        if (data.status === "error") { alert(data.message); return; }
        const content = { 
            key: 'drawLayer', layerKey: 'soilLayer', reset: true, 
            data: data.content.tile_url, min: data.content.min, max: data.content.max
        };
        await sendRequest('flowOptions', content );
    });
}

function landManager() {
    obj.landBtn.addEventListener('click',  () => { obj.catchmentInputFile.click(); });
    obj.landLoaderBtn.addEventListener('click', async () => { 
        const name = obj.projectName.value;
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        const value = obj.landSource.value;
        if (value === '') { alert('Please select a LC source first.'); return; }
        const data = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
        if (data.data === null) { alert('Please check/upload a catchment first.'); return; }
        signalSender('showOverlay', 'Getting and processing land cover layers.\nPlease wait...');
        const content = { 
            projectName: currentProject, key: 'land', flowName: name, code: value, area: data.data
        };
        const request = await jsonLoader('data_upload', content); signalSender('hideOverlay');
        if (request.status === 'error') { alert(request.message); return; }
        console.log(request.content);
        const contents = { 
            key: 'mapPlotter', layerKey: 'landLayer_Vector', 
            data: request.content, type: 'land', reset: true
        };
        await sendRequest('flowOptions', contents);
    });
}

function riverManager() {
    document.querySelectorAll('input[name="river"]').forEach(radio => { 
        radio.addEventListener('change', (e) => {
            const value = e.target.value;
            if (value === 'river-raster') { 
                obj.riverContainer.style.display = 'flex'; 
            } else if (value === 'river-vector') { 
                obj.riverContainer.style.display = 'none'; 
            }
        });
    });
    obj.riverUploadBtn.addEventListener('click', () => { obj.riverInputFile.click(); });
    obj.riverInputFile.addEventListener('change', async (e) => {
        const name = obj.projectName.value;
        if (name === '') { 
            alert('Please select a scenario from the tab "Settings" first.'); return; 
        }
        const riverOption = document.querySelector('input[name="river"]:checked').value;
        const threshold = Number(obj.riverThreshold.value);
        if (riverOption === 'river-raster' && threshold <= 0) {
            alert('Please select a threshold value greater than 0.'); return;
        }
        const file = e.target.files[0]; if (!file) return;
        const formData = new FormData(); formData.append('threshold', threshold);
        formData.append('file', file); formData.append('key', riverOption);
        formData.append('projectName', currentProject); formData.append('flowName', name);
        try {
            signalSender('showOverlay', 'Uploading and processing river data.\nPlease wait...');
            const response = await fetch('/river_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            const content = { 
                key: 'mapPlotter', layerKey: 'riverLayer_Vector', 
                data: data.content, type: 'river', reset: true
            };
            await sendRequest('flowOptions', content);
            obj.riverInputText.value = file.name; obj.riverCheckbox.checked = true;
        } catch (error) { 
            alert(`Uploading river data failed: ${error.message}`);
            obj.riverInputText.value = ''; obj.riverCheckbox.checked = false;
        } finally { e.target.value = ''; }
    });
    obj.riverCheckbox.addEventListener('change', async (e) => {
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (e.target.checked) { 
            if (!layerChecker.exist) { 
                alert('Please upload/create a river layer first.');
                e.target.checked = false; return; 
            } else { await sendRequest('flowOptions', { key: 'drawLayer', layerKey: 'riverLayer_Vector' }); }
        } else { 
            await sendRequest('flowOptions', { key: 'hideLayer', layerKey: 'riverLayer_Vector' });
            const content = ['Segment ID', 'Width', 'Depth'];
            deleteTable(obj.riverTable); addRowToTable(obj.riverTable, content);
        }
    });
    obj.riverCatchmentUploadBtn.addEventListener('click', () => { obj.catchmentInputFile.click(); });
    obj.riverLakeUploadBtn.addEventListener('click', () => { obj.lakeInputFile.click(); });
    obj.lakeInputFile.addEventListener('change', async (event) => {
        const name = obj.projectName.value.trim(); 
        if (name === '') { alert('Please select a scenario from the tab "Settings" first.'); return; }
        const file = event.target.files[0]; if (!file) return; 
        const formData = new FormData(); formData.append('file', file);
        try {
            signalSender('showOverlay', 'Uploading lake boundary. Please wait...');
            const response = await fetch('/geojson_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            const content = { 
                key: 'mapPlotter', layerKey: 'lakeLayer_Vector', 
                data: data.content, type: 'river', reset: false
            };
            await sendRequest('flowOptions', content);
        } catch (error) { alert(`Uploading lake boundary failed: ${error.message}`); }
        finally { event.target.value = ''; }
    });
    obj.riverLakeClipBtn.addEventListener('click', async () => {
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const lakeChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'lakeLayer_Vector' });
        if (!lakeChecker.exist) { alert('Please upload a lake boundary.'); return; }
        const riverLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'riverLayer_Vector' });
        const lakeLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'lakeLayer_Vector' });
        const content = { 
            baseLayer: riverLayer.data, clipLayer: lakeLayer.data, getArea: 'outside' 
        };
        signalSender('showOverlay', 'Clipping river layer to lake boundary.\nPlease wait...');
        const request = await jsonLoader('polygon_clip', content); signalSender('hideOverlay');
        if (request.status === 'error') { alert(request.message); return; }
        const contents = { 
            key: 'mapPlotter', layerKey: 'riverLayer_Vector', 
            data: request.content, type: 'river', reset: true
        };
        await sendRequest('flowOptions', contents);
        obj.riverCheckbox.checked = true;
    });
    obj.riverCatchmentClipBtn.addEventListener('click', async () => {
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const catchmentChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'catchmentLayer_Vector' });
        if (!catchmentChecker.exist) { alert('Please upload a catchment boundary.'); return; }
        const riverLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'riverLayer_Vector' });
        const catchmentLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
        const content = { 
            baseLayer: riverLayer.data, clipLayer: catchmentLayer.data, getArea: 'inside' 
        };
        signalSender('showOverlay', 'Clipping river layer to catchment boundary.\nPlease wait...');
        const request = await jsonLoader('polygon_clip', content); signalSender('hideOverlay');
        if (request.status === 'error') { alert(request.message); return; }
        const contents = { 
            key: 'mapPlotter', layerKey: 'riverLayer_Vector', 
            data: request.content, type: 'river', reset: true
        };
        await sendRequest('flowOptions', contents);
        obj.riverCheckbox.checked = true;
    });
    obj.invalidriverBtn.addEventListener('click', async () => { 
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!layerChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const content = ['Segment ID','Width','Depth'];
        deleteTable(obj.riverTable); addRowToTable(obj.riverTable, content);
        await sendRequest('flowOptions', { key: 'invalidCheck', layerKey: 'riverLayer_Vector', type: 'river' });
    });
    obj.riverLengthBtn.addEventListener('click', async () => { 
        const value = obj.riverLength.value;
        if (value === '' || isNaN(Number(value)) || Number(value) <= 0) {
            alert('Please recheck the min length.'); return; 
        }
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!layerChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const data = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'riverLayer_Vector' });
        signalSender('showOverlay', 'Deleting short river segments.\nPlease wait...');
        const request = await jsonLoader('delete_river', { length: value, river: data.data });
        signalSender('hideOverlay');
        if (request.status === 'error') { alert(request.message); return; }
        alert('Number of deleted segments: ' + request.numDeleted);
        const contents = { 
            key: 'mapPlotter', layerKey: 'riverLayer_Vector', 
            data: request.content, type: 'river', reset: true
        };
        await sendRequest('flowOptions', contents);
    });
    obj.riverDeleteBtn.addEventListener('click', async () => {
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const data = getDataFromTable(obj.riverTable, true).rows, id = obj.riverIds.value;
        if (data.length === 0) { alert('Please select a segment of the river on map to delete.'); return; }
        await sendRequest('flowOptions', { 
            key: 'deleteItem', layerKey: 'riverLayer_Vector', id: id, type: 'river' 
        });
        const selectData = data.filter(v => Number(v[0]) !== Number(id));
        const firstValues = selectData.map(arr => arr[0]);
        obj.riverIds.textContent = '';
        firstValues.forEach(id => {
            const option = document.createElement('option');
            option.value = id; option.textContent = id;
            obj.riverIds.appendChild(option);
        });
        deleteTable(obj.riverTable); fillTable(selectData, obj.riverTable, true);
    });
    obj.assignRiverBtn.addEventListener('click', async () => { 
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const data = getDataFromTable(obj.riverTable, true).rows;
        if (data.length === 0) { alert('Please select a segment of the river on map to edit.'); return; }
        const id = obj.riverIds.value;
        const selectData = data.filter(v => Number(v[0]) === Number(id));
        if (selectData.length === 0) { alert(`Cannot find the selected segment '${id}' in the table.`); return; }
        if (selectData[0].some(v => !v.trim() || Number.isNaN(Number(v)))) {
            alert('Values in the table must be numeric.'); return;
        }
        const response = await sendRequest('flowOptions', { 
            key: 'assignType', layerKey: 'riverLayer_Vector', id: id, data: selectData[0], type: 'river' 
        });
        obj.riverIds.textContent = '';
        response.ids.forEach(id => {
            const option = document.createElement('option');
            option.value = id; option.textContent = id;
            obj.riverIds.appendChild(option);
        });
        deleteTable(obj.riverTable); fillTable(response.data, obj.riverTable, true);
    });
    obj.saveRiverBtn.addEventListener('click', async () => { 
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const layer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'riverLayer_Vector' });
        if (layer.data === null) { alert('Layer is empty. Please upload/create a river layer first.'); return; }
        await geoJSONExporter(layer.data, 'river.geojson');
    });
}

function weatherManager() {
    const startOfDay = new Date(), now = new Date(); startOfDay.setHours(0, 0, 0, 0);
    document.querySelectorAll('input[name="weather"]').forEach(item => {
        item.addEventListener('change', (e) => {
            if (e.target.value === 'weather-csv') { 
                obj.weatherCSVContainer.style.display = 'flex';
                obj.weatherStationContainer.style.display = 'none';
                obj.downloadWeatherBtn.style.display = 'none';
                obj.weatherSourceContainer.style.display = 'none';
            } else {
                obj.weatherCSVContainer.style.display = 'none';
                obj.weatherStationContainer.style.display = 'flex';
                obj.downloadWeatherBtn.style.display = 'flex';
                obj.weatherSourceContainer.style.display = 'flex';
            }
        });
    });
    obj.weatherBtn.addEventListener('click', () => { obj.weatherInputFile.click(); });
    obj.weatherInputFile.addEventListener('change', async (e) => {
        const name = obj.projectName.value;
        if (name === '') { 
            alert('Please select a scenario from the tab "Settings" first.'); return; 
        }
        signalSender('showOverlay', 'Uploading weather data from CSV file.\nPlease wait...');
        try { await csvUploader(e, obj.weatherInputText, obj.weatherTable, 7);
        } finally { signalSender('hideOverlay'); }
    });
    obj.weatherStationSelector.addEventListener('change', async(e) => {
        const value = e.target.value;
        if (!value || value === '') {
            obj.weatherStationStartContainer.style.display = 'none';
            obj.weatherStationEndContainer.style.display = 'none';
            obj.downloadWeatherBtn.style.display = 'none'; return;
        }
        obj.weatherStationStartContainer.style.display = 'flex';
        obj.weatherStationEndContainer.style.display = 'flex';
        obj.downloadWeatherBtn.style.display = 'flex';
        obj.weatherStart.value = formatDate(startOfDay); 
        obj.weatherEnd.value = formatDate(now);
    });
    obj.downloadWeatherBtn.addEventListener('click', async () => {
        const value = obj.weatherStationSelector.value, name = obj.projectName.value;
        if (!value || value === '') { 
            alert('Please select a weather station first.'); return; 
        }
        if (name === '') { 
            alert('Please select a scenario from the tab "Settings" first.'); return; 
        }
        if (value == 'met') {


        }
        if (value == 'rosim') {
//             signalSender('showOverlay', `Getting weather locations from 'regnbyge.no'.\nPlease wait...`);
//             const response = await sendQuery('weather_location', { key: 'ntnu' }); signalSender('hideOverlay');
//             if (response.status === 'error') { alert(response.message); e.target.value = ''; return; }
//             await sendRequest('flowOptions', { key: 'weather', layerKey: 'weather_Vector', id: 'rosim' });
// //         } else if (value == 'eklima') {
// //             startLoading('Getting location of weather stations from Norwegian Meteorological Institute. Please wait...');
// //             response = await sendQuery('weather_location', { key: 'eklima' }); stopLoading();
// //             if (response.status === 'error') { alert(response.message); e.target.value = ''; return; }
// //             iCon = `/static_backend/images/met.png?v=${Date.now()}`;
// //         } else if (value == 'nve') {
// //             startLoading('Getting location of weather stations from Norwegian Water Resources and Energy Directorate. Please wait...');
// //             response = await sendQuery('weather_location', { key: 'nve' }); stopLoading();
// //             if (response.status === 'error') { alert(response.message); e.target.value = ''; return; }
// //             iCon = `/static_backend/images/nve.png?v=${Date.now()}`;
        }
// //         weatherLayer = clearMap(weatherLayer, map);
// //         weatherLayer = L.geoJSON(response.content, { 
// //             pointToLayer: (_, latlng) => {
// //                 const marker = L.marker(latlng, {
// //                     icon: L.icon({
// //                         iconUrl: iCon, iconSize: [30, 30], iconAnchor: [10, 10]
// //                     }),
// //                 });
// //                 return marker;
// //             },
// //             onEachFeature: (feature, featureLayer) => {
// //                 featureLayer.on('click', async (e) => { 
// //                     L.DomEvent.stopPropagation(e);
// //                     await getWeatherData(value, feature.properties.id, weatherStart().value, weatherEnd().value);
// //                 });
// //                 featureLayer.bindTooltip(`${buildTooltip(feature.properties, value)}`, {sticky: true});
// //             }
// //         }).addTo(map);
    });
    obj.saveweatherBtn.addEventListener('click', async () => {
        const name = obj.projectName.value;
        if (name === '') { 
            alert('Please select a scenario from the tab "Settings" first.'); return; 
        }
        const data = getDataFromTable(obj.weatherTable, true).rows;
        if (data.length === 0) { alert('Please upload weather data first.'); return; }
        signalSender('showOverlay', 'Generating weather data.\nPlease wait...');
        const content = { 
            projectName: currentProject, flowName: name, data: data 
        };
        const request = await jsonLoader('save_flow_weather', { data: data });
        signalSender('hideOverlay'); alert(request.message);
    });
}

function windowListener() {
    // Check whether map widget exists
    const layout = localStorage.getItem('grid-layout');
    const hasMap = layout ? JSON.parse(layout).some(item => item.id === flowId):false;
    const content = { id: flowId, title: 'Flow Estimation Map' };
    if (!hasMap) signalSender('addMapWidget', content);
    window.addEventListener('message', (e) => {
        if (e.data?.type === 'updateUIDelay') {
            const content = e.data.content;
            let table = null, ids = null;
            if (content.key === 'river') { 
                ids = obj.riverIds; table = obj.riverTable;
            }
            ids.textContent = '';
            content.ids.forEach(id => {
                const option = document.createElement('option');
                option.value = id; option.textContent = id;
                ids.appendChild(option);
            });
            deleteTable(table);
            content.data.forEach(row => {
                fillTable([row], table, false);
            });
            signalSender('hideOverlay');
        }
    });
}

// async function getWeatherData(source, station, start, end) {
//     if (start === '' || end === '') { 
//         alert('Please select start and end dates first.'); return; 
//     }
//     const content = { source : source, station: station, start: start, end: end };
//     startLoading('Downloading weather data for selected station. Please wait...');
//     const response = await sendQuery('weather_provider', content); stopLoading();
//     requestAnimationFrame(() => { 
//         if (response.status === 'error') { alert(response.message); return; }
//         fillTable(response.content, weatherAttributesTable());
//         if (response.missing === 1) { 
//             setTimeout(() => { 
//                 alert('There is missing data. Please fill in the missing data or select another data source.'); 
//             }, 100);
//         }
//     });
// }



//     obj.landClipBtn.addEventListener('click', async () => { 
//         const landChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
//         if (!landChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
//         const catchmentChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'catchmentLayer_Vector' });
//         if (!catchmentChecker.exist) { alert('Please upload a catchment layer to clip.'); return; }
//         const landLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'landLayer_Vector' });
//         const catchmentLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
//         const content = { 
//             baseLayer: landLayer.data, clipLayer: catchmentLayer.data, getArea: 'inside' 
//         };
//         signalSender('showOverlay', 'Clipping land cover layer with catchment layer.\nPlease wait...');
//         const request = await jsonLoader('polygon_clip', content); signalSender('hideOverlay');
//         if (request.status === 'error') { alert(request.message); return; }
//         const contents = { 
//             key: 'mapPlotter', layerKey: 'landLayer_Vector', 
//             data: request.content, type: 'land', reset: true
//         };
//         await sendRequest('flowOptions', contents);
//     });
//     obj.landTypes.addEventListener('change', async (e) => { 
//         const value = e.target.value.trim(), id = obj.landIds.value;
//         if (id === '') { alert('Please select a land polygon first.'); return; }
//         if (value === '') {
//             const content = [`${id}`,'','','','','','',''];
//             deleteTable(obj.landTable); fillTable([content], obj.landTable); return;
//         }
//         const landType = obj.landTypes.options[obj.landTypes.selectedIndex].textContent;
//         const data = await jsonLoader('assign_type', { key: 'land', data: landType });
//         if (data.status === "error") { alert(data.message); return; }
//         data.content.unshift(`${id}`);
//         fillTable([data.content], obj.landTable, true);
//     });
//     obj.assignLandBtn.addEventListener('click', async () => { 
//         const landChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
//         if (!landChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
//         const landID = obj.landIds.value;
//         if (landID === '') { alert('Please select a land polygon first.'); return; }
//         const data = getDataFromTable(obj.landTable, true).rows[0].slice(1);
//         await sendRequest('flowOptions', { 
//             key: 'assignType', layerKey: 'landLayer_Vector', id: landID, data: data, type: 'land' 
//         });
//     });
//     obj.saveLandBtn.addEventListener('click', async () => { 
//         const landChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
//         if (!landChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
//         const layer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'landLayer_Vector' });
//         if (layer.data === null) { alert('Layer is empty. Please upload/create a land cover layer first.'); return; }
//         await geoJSONExporter(layer.data, 'landcover.geojson');
//     });