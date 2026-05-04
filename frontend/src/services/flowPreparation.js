import { setupTabs } from "./tabManager.js";
import { flowId } from "./constant.js";
import { getUser, signalSender, sendRequest, initRequestListener, 
    jsonLoader, fillTable, deleteTable, addRowToTable, getDataFromTable
} from "./commonFunctions.js";
import { catchmentDelineation, geoJSONExporter } from "./flowManager.js";



const $ = (id) => document.getElementById(id);
const obj = {
    catchmentUpload: $('catchment-upload'), catchmentDTM: $('catchment-dtm'),
    catchmentUploadContainer: $('catchment-upload-container'),
    catchmentUploadBtn: $('catchment-upload-btn'), catchmentInputFile: $('catchment-input-file'),
    terrainBtn: $('terrain-btn'), terrainInputFile: $('terrain-input-file'), 
    terrainInputText: $('terrain-input-text'), fillBtn: $('terrain-fill-btn'),
    flowDirectionBtn: $('terrain-direction-btn'), flowAccumulationBtn: $('terrain-accumulation-btn'),
    pourpointContainer: $('pourpoint-container'), pourpointCheckbox: $('pourpoint-checkbox'),
    exportContainer: $('export-container'), exportBtn: $('export-catchment-btn'),
    pourpointLat: $('pourpoint-lat'), pourpointLon: $('pourpoint-lon'),
    threshold: $('pourpoint-threshold'), dist: $('pourpoint-dist'), catchmentRadio: $('catchment-layer'),
    soilInputText: $('soil-input-text'), soilBtn: $('soil-btn'), soilInputFile: $('soil-input-file'),
    soilCheckbox: $('soil-checker-checkbox'), soilInvalidCheckerBtn: $('soil-invalid-checker-btn'),
    soilTable: $('soil-attributes-table'), soilIds: $('soil-id'), soilClipBtn: $('soil-clip-btn'),
    assignSoilBtn: $('assign-soil-btn'), soilTypes: $('soil-type'), saveSoilBtn: $('save-soil-btn'),
    landBtn: $('land-btn'), landInputFile: $('land-input-file'), landInputText: $('land-input-text'),
    landInvalidCheckerBtn: $('land-invalid-checker-btn'), landCheckbox: $('land-checker-checkbox'),
    landIds: $('land-id'), landTable: $('land-attributes-table'), landTypes: $('land-type'),
    landClipBtn: $('land-clip-btn'), saveLandBtn: $('save-land-btn'), assignLandBtn: $('assign-land-btn'),
    riverContainer: $('river-container'), riverUploadBtn: $('river-upload-btn'), 
    riverInputFile: $('river-input-file'), riverInputText: $('river-input-text'), 
    riverThreshold: $('river-threshold'), riverCheckbox: $('river-checker-checkbox'),
    lakeUploadBtn: $('lake-upload-btn'), lakeInputFile: $('lake-input-file'),
    riverLakeClipBtn: $('river-clip-lake-btn'), riverCatchmentClipBtn: $('river-clip-catchment-btn'),
    riverTable: $('river-table'), riverDeleteBtn: $('river-delete-btn'), 
    assignRiverBtn: $('river-assign-btn'), saveRiverBtn: $('river-save-btn'),

}




let currentProject, minTerrain = null, maxTerrain = null, minFill = null, maxFill = null, lastRadio = null,
    minFlowDirection = null, maxFlowDirection = null, minFlowAccumulation = null, isFlowAccumulation = false,
    maxFlowAccumulation = null, isTerrain = false, isFill = false, isFlowDirection = false;

initRequestListener(); setupTabs(document); await getProject(); windowListener();
topographyManager(); soilManager(); landManager(); riverManager();

async function getProject() { 
    const userName = await getUser();
    currentProject = userName.split('/').pop();
}

function topographyManager() {
    const startOfDay = new Date(), now = new Date(); startOfDay.setHours(0, 0, 0, 0);
    // Work on catchment upload
    document.querySelectorAll('input[name="catchment"]').forEach(radio => {
        radio.addEventListener('change', async (e) => { 
            const tiles = document.querySelectorAll('.main-panel[data-panel="terrain-tab"] .tile');
            if (e.target.id === 'catchment-upload') { 
                obj.catchmentUploadContainer.style.display = 'flex';
                tiles.forEach(tile => {
                    const title = tile.querySelector('h3')?.textContent.trim();
                    if (title !== "Catchment Import") { tile.style.display = 'none';}
                });
            } else if (e.target.id === 'catchment-dtm') {
                obj.catchmentUploadContainer.style.display = 'none';
                tiles.forEach(tile => {
                    const title = tile.querySelector('h3')?.textContent.trim();
                    if (title !== "Catchment Import") { tile.style.display = 'block';}
                });
            }
        });
    });
    // Upload catchment
    obj.catchmentUploadBtn.addEventListener('click', () => obj.catchmentInputFile.click());
    obj.catchmentInputFile.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return; 
        const formData = new FormData(); formData.append('file', file);
        try {
            signalSender('showOverlay', 'Uploading catchment data. Please wait...');
            const response = await fetch('/geojson_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            const content = { 
                key: 'drawLayer', layerKey: 'catchmentLayer_Vector', 
                data: data.content, reset: false
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
        const formData = new FormData();
        formData.append('file', file); formData.append('projectName', currentProject);
        try {
            signalSender('Uploading and processing terrain data.\nPlease wait...');
            const response = await fetch('/terrain_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            minTerrain = data.content.min, maxTerrain = data.content.max;
            const content = { 
                key: 'drawLayer', data: data.content.tile_url, layerKey: 'terrainLayer', reset: true,
                min: data.content.min, max: data.content.max
            };
            await sendRequest('flowOptions', content);
            obj.terrainInputText.value = file.name; e.target.value = ''; isTerrain = true;
        } catch (error) { alert(`Uploading terrain failed: ${error.message}`); }
        lastRadio = document.querySelector('input[name="terrain"][value="terrain-raw"]');
        if (lastRadio) lastRadio.checked = true;
    });
    // Work on fill
    obj.fillBtn.addEventListener('click', async () => {
        const layerCheck = obj.terrainInputText.value;
        if (layerCheck === '') { alert('Please upload terrain data first.'); return; } 
        try {
            signalSender('showOverlay', 'Running fill algorithm. Please wait ...');
            const contents = { projectName: currentProject, filename: layerCheck };
            const data = await jsonLoader('fill_terrain', contents);
            signalSender('hideOverlay');
            if (data.status === "error") { alert(data.message); return; }
            minFill = data.content.min, maxFill = data.content.max;
            const content = { 
                key: 'drawLayer', data: data.content.tile_url, layerKey: 'fillLayer',
                min: data.content.min, max: data.content.max, reset: true
            };
            await sendRequest('flowOptions', content);
        } catch (error) { alert(`Running fill algorithm failed: ${error.message}`); }
        lastRadio = document.querySelector('input[name="terrain"][value="terrain-fill"]');
        if (lastRadio) lastRadio.checked = true;
    });
    obj.flowDirectionBtn.addEventListener('click', async () => {
        const layerCheck = obj.terrainInputText.value;
        if (layerCheck === '') { alert('Please upload terrain data first.'); return; }
        // Check if fill terrain has been run
        const content = { projectName: currentProject, filename: layerCheck, key: 'fill' };
        signalSender('showOverlay', 'Checking fill layer data. Please wait ...');
        const fillCheck = await jsonLoader('raster_check', content); signalSender('hideOverlay');
        if (fillCheck.status === 'error') { alert(fillCheck.message); return; }
        try {
            signalSender('showOverlay', 'Running flow direction algorithm. Please wait ...');
            const contents = { projectName: currentProject, filename: layerCheck };
            const data = await jsonLoader('flow_direction', contents);
            signalSender('hideOverlay');
            if (data.status === "error") { alert(data.message); return; }
            minFlowDirection = data.content.min, maxFlowDirection = data.content.max;
            const content = { 
                key: 'drawLayer', data: data.content.tile_url, layerKey: 'flowDirectionLayer',
                min: data.content.min, max: data.content.max, reset: true
            };
            await sendRequest('flowOptions', content);
        } catch (error) { alert(`Running flow direction algorithm failed: ${error.message}`); }
        lastRadio = document.querySelector('input[name="terrain"][value="terrain-direction"]');
        if (lastRadio) lastRadio.checked = true;
    });
    obj.flowAccumulationBtn.addEventListener('click', async () => {
        const layerCheck = obj.terrainInputText.value;
        if (layerCheck === '') { alert('Please upload terrain data first.'); return; }
        // Check if flow direction has been run
        const content = { projectName: currentProject, filename: layerCheck, key: 'flow_direction' };
        signalSender('showOverlay', 'Checking flow direction layer data. Please wait ...');
        const flowDirectionCheck = await jsonLoader('raster_check', content); signalSender('hideOverlay');
        if (flowDirectionCheck.status === 'error') { alert(flowDirectionCheck.message); return; }
        try {
            signalSender('showOverlay', 'Running flow accumulation algorithm. Please wait ...');
            const contents = { projectName: currentProject, filename: layerCheck };
            const data = await jsonLoader('flow_accumulation', contents);
            signalSender('hideOverlay');
            if (data.status === "error") { alert(data.message); return; }
            minFlowAccumulation = data.content.min, maxFlowAccumulation = data.content.max;
            const content = { 
                key: 'drawLayer', data: data.content.tile_url, layerKey: 'flowAccumulationLayer',
                min: data.content.min, max: data.content.max, reset: true
            };
            await sendRequest('flowOptions', content);
            obj.pourpointContainer.style.display = 'flex'; obj.exportContainer.style.display = 'flex';
        } catch (error) { alert(`Running flow accumulation algorithm failed: ${error.message}`); }
        lastRadio = document.querySelector('input[name="terrain"][value="terrain-accumulation"]');
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
                    key: 'drawLayer', layerKey: 'terrainLayer', in: minTerrain, max: maxTerrain, reset: true
                };
            } else if (value === 'terrain-fill') {
                if (!isTerrain) {
                    alert('Please upload terrain data first.'); 
                    lastRadio.checked = true; e.target.checked = false; return; 
                }
                const fillCheck = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'fillLayer' });
                isFill = fillCheck.exist;
                if (!isFill) { alert('Please run "Fill sinks/depressions" first.'); 
                    lastRadio.checked = true; e.target.checked = false; return; 
                }
                content = { 
                    key: 'drawLayer', layerKey: 'fillLayer', min: minFill, max: maxFill, reset: true
                };
            } else if (value === 'terrain-direction') {
                if (!isFill) {
                    alert('Please run "Fill sinks/depressions" first.'); 
                    lastRadio.checked = true; e.target.checked = false; return;
                }
                const flowDirectionCheck = await sendRequest('flowOptions', { 
                    key: 'layerChecker', layerKey: 'flowDirectionLayer' 
                });
                isFlowDirection = flowDirectionCheck.exist;
                if (!isFlowDirection) { alert('Please run "Fill sinks/depressions" first.'); 
                    lastRadio.checked = true; e.target.checked = false; return; 
                }
                content = { 
                    key: 'drawLayer', layerKey: 'flowDirectionLayer', 
                    min: minFlowDirection, max: maxFlowDirection, reset: true
                };
            } else if (value === 'terrain-accumulation') {
                if (!isFlowDirection) {
                    alert('Please run "Flow direction" first.'); 
                    lastRadio.checked = true; e.target.checked = false; return;
                }
                await sendRequest('flowOptions', { 
                    key: 'layerChecker', layerKey: 'flowAccumulationLayer' 
                });
                content = { 
                    key: 'drawLayer', layerKey: 'flowAccumulationLayer',
                    min: minFlowAccumulation, max: maxFlowAccumulation, reset: true
                };
            } else if (value === 'terrain-catchment') {
                if (!isFlowAccumulation) {
                    alert('Please run "Flow accumulation" and select a pourpoint first.'); 
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
            obj.exportContainer.style.display = 'flex';
            try { 
                const content = { key: 'pourpoint', checked: e.target.checked };
                const response = await sendRequest('flowOptions', content);
                const lat = Number(response.result.lat).toFixed(12);
                const lon = Number(response.result.lng).toFixed(12);
                obj.pourpointLat.value = lat; obj.pourpointLon.value = lon;
                const data =  await catchmentDelineation(
                    currentProject, obj.terrainInputText, obj.pourpointLat.value,
                    obj.pourpointLon.value, obj.threshold.value, obj.dist.value
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
    obj.soilBtn.addEventListener('click', () => obj.soilInputFile.click());
    obj.soilInputFile.addEventListener('change', async (event) => { 
        const file = event.target.files[0]; if (!file) return;
        const formData = new FormData(); formData.append('file', file); 
        formData.append('projectName', currentProject); formData.append('key', 'soil');
        try {
            signalSender('showOverlay', 'Uploading and processing soil data.\nPlease wait...');
            const response = await fetch('/data_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { e.target.value = ''; alert(data.message); return; }
            const content = { 
                key: 'mapPlotter', layerKey: 'soilLayer_Vector', 
                data: data.content, type: 'soil', reset: true
            };
            await sendRequest('flowOptions', content);
            obj.soilInputText.value = file.name; 
            obj.soilCheckbox.checked = true;
            obj.soilInvalidCheckerBtn.style.display = 'block'; 
        } catch (error) { 
            alert(`Uploading soil data failed: ${error.message}`); 
            obj.soilInvalidCheckerBtn.style.display = 'none';
            obj.soilCheckbox.checked = false; obj.soilInputText.value = '';
        } finally {
            event.target.value = '';
            await sendRequest('flowOptions', { key: 'hideColorbar' });
        }
    });
    obj.soilCheckbox.addEventListener('change', async (e) => {
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'soilLayer_Vector' });
        if (e.target.checked) { 
            if (!layerChecker.exist) { 
                alert('Please upload/create a soil layer first.');
                e.target.checked = false; obj.soilInvalidCheckerBtn.style.display = 'none'; return; 
            } else { 
                await sendRequest('flowOptions', { key: 'drawLayer', layerKey: 'soilLayer_Vector' });
                obj.soilInvalidCheckerBtn.style.display = 'block';
            }
        } else { 
            await sendRequest('flowOptions', { key: 'hideLayer', layerKey: 'soilLayer_Vector' });
            obj.soilIds.textContent = ''; deleteTable(obj.soilTable);
            const content = [
                'ID','Soil type','Saturated water','Residual water','Ver. conductivity',
                'Soil depth','Infiltration decay','Brooks–Corey parameter'
            ];
            addRowToTable(obj.soilTable, content); obj.soilInvalidCheckerBtn.style.display = 'none';
        }
    });
    obj.soilInvalidCheckerBtn.addEventListener('click', async () => { 
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'soilLayer_Vector' });
        if (!layerChecker.exist) { alert('Please upload/create a soil layer first.'); return; }
        deleteTable(obj.soilTable);
        await sendRequest('flowOptions', { key: 'invalidCheck', layerKey: 'soilLayer_Vector', type: 'soil' });
    });
    obj.soilClipBtn.addEventListener('click', async () => { 
        const soilChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'soilLayer_Vector' });
        if (!soilChecker.exist) { alert('Please upload/create a soil layer first.'); return; }
        const catchmentChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'catchmentLayer_Vector' });
        if (!catchmentChecker.exist) { alert('Please upload a catchment layer to clip.'); return; }
        const soilLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'soilLayer_Vector' });
        const catchmentLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
        const content = { 
            baseLayer: soilLayer.data, clipLayer: catchmentLayer.data, getArea: 'inside' 
        };
        signalSender('showOverlay', 'Clipping soil layer with catchment layer.\nPlease wait...');
        const request = await jsonLoader('polygon_clip', content);
        signalSender('hideOverlay');
        if (request.status === 'error') { alert(request.message); return; }
        const contents = { 
            key: 'mapPlotter', layerKey: 'soilLayer_Vector', 
            data: request.content, type: 'soil', reset: true
        };
        await sendRequest('flowOptions', contents);
    });
    obj.assignSoilBtn.addEventListener('click', async () => { 
        const soilChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'soilLayer_Vector' });
        if (!soilChecker.exist) { alert('Please upload/create a soil layer first.'); return; }
        const soilID = obj.soilIds.value;
        if (soilID === '') { alert('Please select a soil polygon first.'); return; }
        const soilType = obj.soilTypes.options[obj.soilTypes.selectedIndex].textContent;
        await sendRequest('flowOptions', { 
            key: 'assignType', layerKey: 'soilLayer_Vector', id: soilID, data: soilType, type: 'soil' 
        });
    });
    obj.saveSoilBtn.addEventListener('click', async () => { 
        const soilChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'soilLayer_Vector' });
        if (!soilChecker.exist) { alert('Please upload/create a soil layer first.'); return; }
        const layer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'soilLayer_Vector' });
        if (layer.data === null) { alert('Layer is empty. Please upload/create a soil layer first.'); return; }
        await geoJSONExporter(layer.data, 'soil.geojson');
    });
}

function landManager() {
    obj.landBtn.addEventListener('click',  () => { obj.landInputFile.click(); });
    obj.landInputFile.addEventListener('change', async (event) => {
        const file = event.target.files[0]; if (!file) return;
        const formData = new FormData(); formData.append('file', file); 
        formData.append('projectName', currentProject); formData.append('key', 'land');
        try { 
            signalSender('showOverlay', 'Uploading and processing Land Cover data.\nPlease wait...');
            const response = await fetch('/data_upload', { method: 'POST', body: formData });
            const data = await response.json(); signalSender('hideOverlay');
            if (data.status === 'error') { alert(data.message); return; }
            const content = { 
                key: 'mapPlotter', layerKey: 'landLayer_Vector', 
                data: data.content, type: 'land', reset: true
            };
            await sendRequest('flowOptions', content);
            obj.landInputText.value = file.name; 
            obj.landCheckbox.checked = true;
            obj.landInvalidCheckerBtn.style.display = 'block';
        } catch (err) {
            alert(`Uploading Land Use/Land Cover data failed. Error: ${err}`);
            obj.landInvalidCheckerBtn.style.display = 'none';
            obj.landCheckbox.checked = false; obj.landInputText.value = '';
        } finally { 
            event.target.value = '';
            await sendRequest('flowOptions', { key: 'hideColorbar' });
        }
    });
    obj.landCheckbox.addEventListener('change', async (e) => {
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
        if (e.target.checked) { 
            if (!layerChecker.exist) { 
                alert('Please upload/create a land layer first.');
                e.target.checked = false; obj.landInvalidCheckerBtn.style.display = 'none'; return; 
            } else { 
                await sendRequest('flowOptions', { key: 'drawLayer', layerKey: 'landLayer_Vector' });
                obj.landInvalidCheckerBtn.style.display = 'block';
            }
        } else { 
            await sendRequest('flowOptions', { key: 'hideLayer', layerKey: 'landLayer_Vector' });
            obj.landIds.textContent = ''; deleteTable(obj.landTable);
            const content = [
                'ID','Land type','Leaf Area Index','Root Depth','Canopy Interception',
                'Manning Roughness','Albedo','Crop Coefficient'
            ];
            addRowToTable(obj.landTable, content); obj.landInvalidCheckerBtn.style.display = 'none';
        }
    });
    obj.landInvalidCheckerBtn.addEventListener('click', async () => { 
        const layerChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
        if (!layerChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
        deleteTable(obj.landTable);
        await sendRequest('flowOptions', { key: 'invalidCheck', layerKey: 'landLayer_Vector', type: 'land' });
    });
    obj.landClipBtn.addEventListener('click', async () => { 
        const landChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
        if (!landChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
        const catchmentChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'catchmentLayer_Vector' });
        if (!catchmentChecker.exist) { alert('Please upload a catchment layer to clip.'); return; }
        const landLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'landLayer_Vector' });
        const catchmentLayer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'catchmentLayer_Vector' });
        const content = { 
            baseLayer: landLayer.data, clipLayer: catchmentLayer.data, getArea: 'inside' 
        };
        signalSender('showOverlay', 'Clipping land cover layer with catchment layer.\nPlease wait...');
        const request = await jsonLoader('polygon_clip', content); signalSender('hideOverlay');
        if (request.status === 'error') { alert(request.message); return; }
        const contents = { 
            key: 'mapPlotter', layerKey: 'landLayer_Vector', 
            data: request.content, type: 'land', reset: true
        };
        await sendRequest('flowOptions', contents);
    });
    obj.assignLandBtn.addEventListener('click', async () => { 
        const landChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
        if (!landChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
        const landID = obj.landIds.value;
        if (landID === '') { alert('Please select a land polygon first.'); return; }
        const landType = obj.landTypes.options[obj.landTypes.selectedIndex].textContent;
        await sendRequest('flowOptions', { 
            key: 'assignType', layerKey: 'landLayer_Vector', id: landID, data: landType, type: 'land' 
        });
    });
    obj.saveLandBtn.addEventListener('click', async () => { 
        const landChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'landLayer_Vector' });
        if (!landChecker.exist) { alert('Please upload/create a land cover layer first.'); return; }
        const layer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'landLayer_Vector' });
        if (layer.data === null) { alert('Layer is empty. Please upload/create a land cover layer first.'); return; }
        await geoJSONExporter(layer.data, 'landcover.geojson');
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
        const riverOption = document.querySelector('input[name="river"]:checked').value;
        const threshold = Number(obj.riverThreshold.value);
        if (riverOption === 'river-raster' && threshold <= 0) {
            alert('Please select a threshold value greater than 0.'); return;
        }
        const file = e.target.files[0]; if (!file) return;
        const formData = new FormData(); formData.append('threshold', threshold);
        formData.append('file', file); formData.append('key', riverOption);
        formData.append('projectName', currentProject);
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
            const content = ['Segment ID','Width','Depth','Manning Roughness'];
            deleteTable(obj.riverTable); addRowToTable(obj.riverTable, content);
        }
    });
    obj.lakeUploadBtn.addEventListener('click', () => { obj.lakeInputFile.click(); });
    obj.lakeInputFile.addEventListener('change', async (event) => {
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
            const res = await sendRequest('flowOptions', content);
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
    obj.riverDeleteBtn.addEventListener('click', async () => {
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const data = getDataFromTable(obj.riverTable, true).rows;
        if (data.length === 0) { alert('Please select a segment of the river on map to delete.'); return; }
        await sendRequest('flowOptions', { 
            key: 'deleteItem', layerKey: 'riverLayer_Vector', id: data[0][0], type: 'river' 
        });
        const content = ['Segment ID','Width','Depth','Manning Roughness'];
        deleteTable(obj.riverTable); addRowToTable(obj.riverTable, content);
    });
    obj.assignRiverBtn.addEventListener('click', async () => { 
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const data = getDataFromTable(obj.riverTable, true).rows;
        if (data.length === 0) { alert('Please select a segment of the river on map to edit.'); return; }
        if (data[0].some(v => !v.trim() || Number.isNaN(Number(v)))) {
            alert('Values in the table must be numeric.'); return;
        }
        await sendRequest('flowOptions', { 
            key: 'assignType', layerKey: 'riverLayer_Vector', 
            id: data[0][0], data: data[0].slice(1), type: 'river' 
        });
    });
    obj.saveRiverBtn.addEventListener('click', async () => { 
        const riverChecker = await sendRequest('flowOptions', { key: 'layerChecker', layerKey: 'riverLayer_Vector' });
        if (!riverChecker.exist) { alert('Please upload/create a river layer first.'); return; }
        const layer = await sendRequest('flowOptions', { key: 'getLayer', layerKey: 'riverLayer_Vector' });
        if (layer.data === null) { alert('Layer is empty. Please upload/create a river layer first.'); return; }
        await geoJSONExporter(layer.data, 'river.geojson');
    });



//     document.querySelectorAll('input[name="weather"]').forEach(item => {
//         item.addEventListener('change', (e) => {            
//             if (e.target.value === 'weather-csv') { 
//                 weatherCSVContainer().style.display = 'flex';
//                 weatherStationContainer().style.display = 'none';
//             } else {
//                 weatherCSVContainer().style.display = 'none';
//                 weatherStationContainer().style.display = 'flex';
//             }
//         });
//     });
//     weatherBtn().addEventListener('click', () => { weatherInputFile().click(); });
//     weatherInputFile().addEventListener('change', async (e) => {
//         startLoading('Uploading weather data from CSV file. Please wait...');
//         try { await csvUploader(e, weatherInputText(), weatherAttributesTable(), 8);
//         } finally { stopLoading(); }
//     });
//     weatherStationSelector().addEventListener('change', async(e) => {
//         const value = e.target.value; let response = null, iCon = null;
//         deleteTable(weatherAttributesTable());
//         if (!value || value === '') {
//             weatherStationStartContainer().style.display = 'none';
//             weatherStationEndContainer().style.display = 'none'; return;
//         }
//         weatherStationStartContainer().style.display = 'flex';
//         weatherStationEndContainer().style.display = 'flex';
//         weatherStart().value = formatDate(startOfDay); weatherEnd().value = formatDate(now);
//         if (value == 'ntnu') {
//             startLoading('Getting location of the NTNU weather station. Please wait...');
//             response = await sendQuery('weather_location', { key: 'ntnu' }); stopLoading();
//             if (response.status === 'error') { alert(response.message); e.target.value = ''; return; }
//             iCon = `/static_backend/images/ntnu.png?v=${Date.now()}`;
//         } else if (value == 'eklima') {
//             startLoading('Getting location of weather stations from Norwegian Meteorological Institute. Please wait...');
//             response = await sendQuery('weather_location', { key: 'eklima' }); stopLoading();
//             if (response.status === 'error') { alert(response.message); e.target.value = ''; return; }
//             iCon = `/static_backend/images/met.png?v=${Date.now()}`;
//         } else if (value == 'nve') {
//             startLoading('Getting location of weather stations from Norwegian Water Resources and Energy Directorate. Please wait...');
//             response = await sendQuery('weather_location', { key: 'nve' }); stopLoading();
//             if (response.status === 'error') { alert(response.message); e.target.value = ''; return; }
//             iCon = `/static_backend/images/nve.png?v=${Date.now()}`;
//         }
//         weatherLayer = clearMap(weatherLayer, map);
//         weatherLayer = L.geoJSON(response.content, { 
//             pointToLayer: (_, latlng) => {
//                 const marker = L.marker(latlng, {
//                     icon: L.icon({
//                         iconUrl: iCon, iconSize: [30, 30], iconAnchor: [10, 10]
//                     }),
//                 });
//                 return marker;
//             },
//             onEachFeature: (feature, featureLayer) => {
//                 featureLayer.on('click', async (e) => { 
//                     L.DomEvent.stopPropagation(e);
//                     await getWeatherData(value, feature.properties.id, weatherStart().value, weatherEnd().value);
//                 });
//                 featureLayer.bindTooltip(`${buildTooltip(feature.properties, value)}`, {sticky: true});
//             }
//         }).addTo(map);
//     });





}


function windowListener() {
    // Check whether map widget exists
    const layout = localStorage.getItem('grid-layout');
    const hasMap = layout ? JSON.parse(layout).some(item => item.id === flowId):false;
    const content = { id: flowId, title: 'Flow Estimation Map' };
    if (!hasMap) signalSender('addMapWidget', content);
    window.addEventListener('message', (e) => {
        if (e.data?.type === 'updateUIDelay') {
            const content = e.data.content; let table = null, ids = null, objType = null;
            // console.log('message', content);
            if (content.key === 'soil') {
                ids = obj.soilIds; table = obj.soilTable; objType = obj.soilTypes;
            } else if (content.key === 'land') {
                ids = obj.landIds; table = obj.landTable; objType = obj.landTypes;
            } else if (content.key === 'river') { table = obj.riverTable;

            }
            if (content.key === 'soil' || content.key === 'land') {
                const option = [...objType.options].find(o => o.text === content.objType);
                if (option) objType.value = option.value;
                ids.textContent = '';
                content.ids.forEach(id => {
                    const option = document.createElement('option');
                    option.value = id; option.textContent = id;
                    ids.appendChild(option);
                });
            }
            deleteTable(table);
            content.data.forEach(row => {
                fillTable([row], table, false);
            });
            signalSender('hideOverlay');
        }
    });
}





// const terrainInputText = () => document.getElementById('terrain-input-text');
// const terrainInputFile = () => document.getElementById('terrain-input-file');
// const terrainBtn = () => document.getElementById('terrain-btn');
// const fillBtn = () => document.getElementById('terrain-fill-btn');
// const flowDirectionBtn = () => document.getElementById('terrain-direction-btn');
// const flowAccumulationBtn = () => document.getElementById('terrain-accumulation-btn');
// const catchmentExportBtn = () => document.getElementById('export-catchment-btn');
// const pourpointContainer = () => document.getElementById('pourpoint-container');
// const pourpointCheckbox = () => document.getElementById('pourpoint-checkbox');
// const pourpointLat = () => document.getElementById('pourpoint-lat');
// const pourpointLon = () => document.getElementById('pourpoint-lon');
// const pourpointThreshold = () => document.getElementById('pourpoint-threshold');
// const pourpointDist = () => document.getElementById('pourpoint-dist');
// const exportContainer = () => document.getElementById('export-container');
// const colorbar_container = () => document.getElementById('colorbar-container');
// const colorbar_color = () => document.getElementById('colorbar-color');
// const colorbar_title = () => document.getElementById('colorbar-title');
// const colorbar_label = () => document.getElementById('colorbar-labels');
// const catchmentUploadContainer = () => document.getElementById('catchment-upload-container');
// const catchmentInputFile = () => document.getElementById('catchment-input-file');
// const catchmentUploadBtn = () => document.getElementById('catchment-upload-btn');
// const soilInputText = () => document.getElementById('soil-input-text');
// const soilInputFile = () => document.getElementById('soil-input-file');
// const soilBtn = () => document.getElementById('soil-btn');
// const soilCheckbox = () => document.getElementById('soil-checker-checkbox');
// const soilInvalidCheckerBtn = () => document.getElementById('soil-invalid-checker-btn');
// const soilClipBtn = () => document.getElementById('soil-clip-btn');
// const soilIds = () => document.getElementById('soil-id');
// const soilTypes = () => document.getElementById('soil-type');
// const assignSoilBtn = () => document.getElementById('assign-soil-btn');
// const saveSoilBtn = () => document.getElementById('save-soil-btn');
// const soilAttributesTable = () => document.getElementById('soil-attributes-table');
// const landInputFile = () => document.getElementById('land-input-file');
// const landInputText = () => document.getElementById('land-input-text');
// const landBtn = () => document.getElementById('land-btn');
// const landCheckbox = () => document.getElementById('land-checker-checkbox');
// const landInvalidCheckerBtn = () => document.getElementById('land-invalid-checker-btn');
// const landClipBtn = () => document.getElementById('land-clip-btn');
// const landIds = () => document.getElementById('land-id');
// const landTypes = () => document.getElementById('land-type');
// const assignLandBtn = () => document.getElementById('assign-land-btn');
// const saveLandBtn = () => document.getElementById('save-land-btn');
// const landAttributesTable = () => document.getElementById('land-attributes-table');
// const riverInputFile = () => document.getElementById('river-input-file');
// const riverUploadBtn = () => document.getElementById('river-upload-btn');
// const riverInputText = () => document.getElementById('river-input-text');
// const thresholdLabel = () => document.getElementById('river-threshold-label');
// const riverThreshold = () => document.getElementById('river-network-threshold');
// const riverAttributesTable = () => document.getElementById('river-attributes-table');
// const assignRiverBtn = () => document.getElementById('river-assign-btn');
// const saveRiverBtn = () => document.getElementById('river-save-btn');
// const lakeInputFile = () => document.getElementById('lake-input-file');
// const lakeUploadBtn = () => document.getElementById('lake-upload-btn');
// const riverLakeClipBtn = () => document.getElementById('river-clip-lake-btn');
// const riverCatchmentClipBtn = () => document.getElementById('river-clip-catchment-btn');
// const riverDeleteBtn = () => document.getElementById('river-delete-btn');
// const riverCheckbox = () => document.getElementById('river-checker-checkbox');
// const initialTopMoisture = () => document.getElementById('initial-top-moisture');
// const initialSubMoisture = () => document.getElementById('initial-sub-moisture');
// const initialGroundwater = () => document.getElementById('initial-groundwater');
// const initialOverlandFlow = () => document.getElementById('initial-overland-flow');
// const initialRiverStorage = () => document.getElementById('initial-river-storage');
// const initialLakeStorage = () => document.getElementById('initial-lake-storage');
// const initialSnowDepth = () => document.getElementById('initial-snow-depth');
// const initialWaterDepth = () => document.getElementById('initial-water-depth');
// const initialSaturationDeficit = () => document.getElementById('initial-saturation-deficit');
// const weatherCSVContainer = () => document.getElementById('weather-csv-container');
// const weatherInputFile = () => document.getElementById('weather-input-file');
// const weatherInputText = () => document.getElementById('weather-input-text');
// const weatherBtn = () => document.getElementById('weather-btn');
// const weatherStationSelector = () => document.getElementById('weather-station');
// const weatherStationContainer = () => document.getElementById('weather-station-container');
// const weatherStationStartContainer = () => document.getElementById('weather-station-start');
// const weatherStationEndContainer = () => document.getElementById('weather-station-end');
// const weatherStart = () => document.getElementById('weather-start-date');
// const weatherEnd = () => document.getElementById('weather-end-date');
// const weatherAttributesTable = () => document.getElementById('weather-attributes-table');






// let map = null,
//     
//     
//     
//      , 
//     isPourpointActive = false, landLayer = null, riverLayer = null, lakeLayer = null,
//     weatherLayer = null;










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
