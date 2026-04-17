import { setupTabs } from "./tabManager.js";
import { jsonLoader, getUser, nameChecker, fillTable, updateTable, iframeConnector,
    getDataFromTable
} from "./commonFunctions.js";
import { projectRender } from "./projectManager.js";



const $ = (id) => document.getElementById(id);
const obj = {
    descriptionTab: $('desription-tab'), controlTab: $('control-tab'),
    projectList: $('project-list'), projectName: $('project-name'),
    projectCreator: $('create-btn'), projectCloner: $('duplicate-btn'),
    projectRemover: $('remove-btn'), projectSaver: $('save-btn'),
    latitude: $('latitude'), getLocation: $('location'),
    nLayers: $('n-layer'), gridPathText: $('grid-text'), 
    gridPathFile: $('grid-file'), startDate: $('start-date'), 
    stopDate: $('stop-date'),userTimestepDate: $('user-date'), 
    userTimestepTime: $('user-time'), nodalTimestepDate: $('nodal-date'), 
    nodalTimestepTime: $('nodal-time'), obsPointName: $('obs-point'),
    obsPointLatitude: $('obs-latitude'), obsPointLongitude: $('obs-longitude'),
    obsPointPicker: $('obs-picker'), obsPointAddList: $('obs-add-list'),
    obsPointAddRow: $('obs-add-row'), obsPointRemove: $('obs-remove'),
    obsPointTable: $('obs-table'), obsPointUploadFile: $('obs-file'),
    obsPointUploadText: $('obs-text'), obsPointUpdate: $('obs-update'), 
    crossSectionName: $('cross-section'), crossSectionPicker: $('cross-section-picker'), 
    crossSectionRemove: $('cross-section-remove'), crossSectionTable: $('cross-section-table'),    
    boundaryName: $('boundary-name'), boundaryPicker: $('boundary-picker'), 
    boundaryRemove: $('boundary-remove'), boundaryTable: $('boundary-table'),

   
    
    

    

   
boundarySelector: $('option-boundary-edit'),
    boundaryUploadFile: $('boundary-picker-file'), boundaryUploadText: $('boundary-picker-text'),
    boundaryCSV: $('boundary-upload-csv'), boundaryAddRow: $('boundary-add-row'),
    boundaryEditTable: $('boundary-edit-table'), boundaryEditUpdate: $('boundary-update'),
    boundaryEditRemove: $('boundary-edit-remove'), boundarySelectorView: $('option-boundary-type-view'),
    boundaryViewContainer: $('textarea-container'), boundaryText: $('data-view'),
    sourceName: $('source-name'), sourceOptionNew: $('source-sink-new'),
    sourceOptionExist: $('source-sink-exist'), sourceOptionPicker: $('source-picker'),
    sourceLatitude: $('source-latitude'), sourceLongitude: $('source-longitude'),
    sourceTable: $('source-table'), sourceUploadFile: $('source-upload-file'),
    sourceUploadText: $('source-csv-text'), sourceAddBtn: $('add-source-btn'),
    sourcePlotBtn: $('plot-source-btn'), sourceSaveBtn: $('save-source-btn'),
    sourceSelectorRemove: $('option-source-remove'), sourceRemoveBtn: $('source-remove'),
    sourceRemoveTable: $('source-remove-table'), sourceDeleteTableBtn: $('delete-source-btn'),
    meteoAddBtn: $('add-meteo-btn'), meteoPlotBtn: $('plot-meteo-btn'),
    meteoDeleteBtn: $('delete-meteo-btn'), meteoSaveBtn: $('save-meteo-btn'),
    meteoTable: $('edit-meteo-table'), meteoUploadFile: $('meteo-picker-file'),
    meteoUploadText: $('meteo-picker-text'), weatherPanel: $('weather-upload-panel'),
    weatherSelector: $('option-weather'), weatherUpload: $('weather-update'),
    weatherAddRow: $('weather-add-row'), weatherRemove: $('weather-remove'),
    weatherCSVUploadFile: $('weather-update-file'), weatherCSVUploadText: $('weather-update-text'),
    weatherTable: $('weather-edit-table'), hisIntervalDate: $('his-output-interval-date'),
    hisIntervalTime: $('his-output-interval-time'), mapIntervalDate: $('map-output-interval-date'),
    mapIntervalTime: $('map-output-interval-time'), wqIntervalDate: $('water-quality-output-interval-date'),
    wqIntervalTime: $('water-quality-output-interval-time'), rstIntervalDate: $('restart-interval-date'),
    rstIntervalTime: $('restart-interval-time'), statisticDate: $('statistic-output-interval-date'),
    statisticTime: $('statistic-output-interval-time'), timingDate: $('timing-statistic-output-interval-date'),
    timingTime: $('timing-statistic-output-interval-time'), salinity: $('use-salinity'),
    temperature: $('option-temperature'), initWaterLevel: $('initial-water-level'),
    initTemperature: $('initial-temperature'), initSalinity: $('initial-salinity'),
    outputHis: $('write-his-file'), hisStart: $('his-output-start'), hisStop: $('his-output-end'),
    outputMap: $('write-map-file'), mapStart: $('map-output-start'), mapStop: $('map-output-end'),
    outputWQ: $('write-water-quality-file'), wqStart: $('water-quality-output-start'), wqStop: $('water-quality-output-end'),
    outputRestart: $('write-restart-file'), rstStart: $('restart-start'), rstStop: $('restart-end'),
}

let userName = null, BCChecked = 0, listProjects = [];


setupTabs(document); projectOptions(); updateComponent();

async function getProjectList(){
    if (userName === null) return;
    const contents = { filename: userName, key: 'getHYDProjects', folder_check: 'input' };
    const data = await jsonLoader('select_project', contents);
    if (data.status === "error") { alert(data.message); return; }
    return data.content;
}

async function projectOptions(){
    // Create new project
    obj.projectCreator.addEventListener('click', async () => {
        const name = obj.projectName.value.trim(); let project = '';
        if (!name || name.trim() === '') { alert('Please define scenario name.'); return; }
        if (nameChecker(name)) { alert('Scenario name contains invalid characters.'); return; }
        if (name.includes('/')) { project = name.split('/').pop(); } else { project = name; }
        const data = await jsonLoader('setup_new_project', { projectName: project });
        obj.controlTab.style.display = "block"; obj.descriptionTab.style.display = "none"; // Show tabs
        // alert(data.message); 
        await loadScenario(name);
    });
    // Copy project
    obj.projectCloner.addEventListener('click', async () => {
        const name = obj.projectName.value.trim();
        if (!name || name === '') { alert('Please select scenario first.'); return; }
        // Ask for a new name
        const newName = prompt('Please enter a name for the new scenario.\nCloning a scenario will take some time. Please be patient.');
        if (!newName || newName === '') { alert('Please define clone scenario name.'); return; }
        if (nameChecker(newName)) { alert('Name of clone scenario is invalid.'); return;}
        obj.projectCloner.innerHTML = 'Cloning...';
        const data = await jsonLoader('copy_project', {oldName: name, newName: newName});
        alert(data.message); obj.projectName.value = '';
        obj.projectCloner.innerHTML = 'Clone Scenario';
    });
    // Delete project
    obj.projectRemover.addEventListener('click', async () => {
        const name = obj.projectName.value.trim();
        if (!name || name.trim() === '') { alert('Please define scenario.'); return; }
        // Ask for confirmation
        if (!confirm('Are you sure you want to delete this scenario?')) { return; }
        obj.projectRemover.innerHTML = 'Deleting...';
        const data = await jsonLoader('delete_project', {projectName: name});
        alert(data.message); obj.projectName.value = '';
        obj.projectRemover.innerHTML = 'Delete Scenario';
    });
}

function sourceChange(target, table, lat, lon, sourceName, sourceText){
    const check = target.checked;
    if (!check) return;
    lat.value = ''; lon.value = '';
    // Clear table and name
    const tbody = table.querySelector("tbody");
    tbody.innerHTML = ""; sourceName.value = ''; sourceText.value = '';
}

function assignOutput(target, start, end, startDate, stopDate){
    target.addEventListener('change', () => { 
        if (!target.checked) { start.value = ''; end.value = ''; return; }
        start.value = startDate.value !== '' ? startDate.value : '';
        end.value = stopDate.value !== '' ? stopDate.value : '';
    });
}

async function updateComponent(){
    const user = await getUser(); userName = user;
    obj.projectName.style.pointerEvents = "auto";
    listProjects = await getProjectList();
    await projectRender(obj.projectName, obj.projectList, listProjects);
    // Check whether map widget exists
    const layout = localStorage.getItem('grid-layout');
    const hasMap = layout ? JSON.parse(layout).some(item => item.id === 'map'):false;
    const content = { id: 'hyd-map', title: 'Hydrodynamic Scenario Map' };
    if (!hasMap) window.parent.postMessage({ type: 'addMapWidget', content: content }, '*');
    // Show/Hide tabs
    obj.projectName.addEventListener('input', (e) => { 
        const value = e.target.value.trim();
        if (value === '') { 
            obj.controlTab.style.display = "none"; 
            obj.descriptionTab.style.display = "block"; 
        }
    });
    // Update location
    iframeConnector(obj.getLocation, obj.latitude, 'pickLocation');
    iframeConnector(obj.obsPointPicker, 
        [obj.obsPointName, obj.obsPointLatitude, obj.obsPointLongitude], 'pickPoint', 
        () => getDataFromTable(obj.obsPointTable, true)
    );
    iframeConnector(obj.crossSectionPicker, 
        [obj.crossSectionName, obj.crossSectionTable], 'pickPath',
        () => getDataFromTable(obj.crossSectionTable, true), 'crossSection'
    );
    iframeConnector(obj.boundaryPicker,
        [obj.boundaryName, obj.boundaryTable], 'pickPath', 
        () => getDataFromTable(obj.boundaryTable, true), 'boundary'
    );
//     mapPicker(sourceOptionPicker(), 'pickSource');
//     // Event when user uploads CSV file
//     obsPointUploadText().addEventListener('click', () => { obsPointUploadFile().click(); });
//     obsPointUploadFile().addEventListener('change', async (event) => { 
//         await csvUploader(event, obsPointUploadText(), obsPointTable(), 3); event.target.value = '';
//     });
//     sourceUploadText().addEventListener('click', () => { sourceUploadFile().click(); });
//     sourceUploadFile().addEventListener('change', async (event) => { 
//         deleteTable(sourceTable());
//         await csvUploader(event, sourceUploadText(), sourceTable(), 5, false, sourceName(), sourceLatitude(), sourceLongitude()); 
//         event.target.value = ''; 
//     });
//     meteoUploadText().addEventListener('click', () => { meteoUploadFile().click(); });
//     meteoUploadFile().addEventListener('change', async (event) => {
//         await csvUploader(event, meteoUploadText(), meteoTable(), 5); event.target.value = '';
//     });
//     weatherCSVUploadText().addEventListener('click', () => { weatherCSVUploadFile().click(); });
//     weatherCSVUploadFile().addEventListener('change', async (event) => {
//         await csvUploader(event, weatherCSVUploadText(), weatherTable(), 3); event.target.value = '';
//     });
//     // Upload file to server
//     gridPathText().addEventListener('click', () => { gridPathFile().click(); });
//     gridPathFile().addEventListener('change', async (event) => {
//         await fileUploader(gridPathFile(), gridPathText(), projectName().value, 'FlowFM_net.nc', 'Uploading grid to project...', 'grid');
//         window.parent.postMessage({type: 'showGrid', projectName: projectName().value, 
//             gridName: 'FlowFM_net.nc', message: 'Uploading grid to project...'}, '*');
//         event.target.value = '';
//     });
//     // Copy and paste to tables
//     copyPaste(boundaryEditTable(), 2); copyPaste(sourceTable(), 5); 
//     copyPaste(meteoTable(), 5); copyPaste(weatherTable(), 3); copyPaste(obsPointTable(), 3);
//     // Get data from main page
//     window.addEventListener('message', (event) => {
//         if (event.data.type === 'locationPicked') {
//             const lat = Number(event.data.content.lat).toFixed(1);
//             latitude().value = lat;
//         }
//         if (event.data.type === 'pointPicked') {
//             const lat = Number(event.data.content.lat).toFixed(12);
//             const lon = Number(event.data.content.lng).toFixed(12);
//             obsPointLatitude().value = lat; obsPointLongitude().value = lon;
//             if (obsPointName().value.trim() === '') {
//                 obsPointName().value = `Point_${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
//             }
//         }
//         if (event.data.type === 'crossSectionPicked') {
//             const content = event.data.content;
//             let value = crossSectionName().value.trim();
//             if (value === '') { value = `Cross-Section`; crossSectionName().value = value; }
//             const data_arr = content.map((row, idx) => [`${value}_${idx + 1}`, Number(row.lat).toFixed(12), Number(row.lng).toFixed(12)]);
//             fillTable(data_arr, crossSectionTable(), true);
//         }
//         if (event.data.type === 'boundaryPicked') {
//             const content = event.data.content;
//             let value = boundaryName().value.trim();
//             if (value === '') { value = `Boundary`; boundaryName().value = value; }
//             const data_arr = content.map((row, idx) => [`${value}_${idx + 1}`, Number(row.lat).toFixed(12), Number(row.lng).toFixed(12)]);
//             fillTable(data_arr, boundaryTable(), true);
//             // Update boundary option
//             const options = data_arr.map(row => `<option value="${row[0]}">${row[0]}</option>`).join(' ');
//             const defaultOption = `<option value="" selected>--- No selected ---</option>`;
//             boundarySelector().innerHTML = defaultOption + options;
//         }
//         if (event.data.type === 'sourcePicked') {
//             const content = event.data.content;
//             let value = sourceName().value.trim();
//             if (value === '') { value = `Source_Sink`; sourceName().value = value; }
//             sourceLatitude().value = Number(content.lat).toFixed(16);
//             sourceLongitude().value = Number(content.lng).toFixed(16);
//         }
//     });
//     // Add point to table
//     obsPointAddList().addEventListener('click', () => {
//         const name = obsPointName().value.trim();
//         const lat = obsPointLatitude().value.trim();
//         const lon = obsPointLongitude().value.trim();
//         if (name === '' || lat === '' || lon === '' || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
//             alert('Please check name, latitude, and longitude of the observation point.'); return;}
//         // Add to table
//         fillTable([[name, lat, lon]], obsPointTable(), false);
//         // Clear input
//         obsPointName().value = ''; obsPointLatitude().value = ''; obsPointLongitude().value = '';
//     });
//     // Add a new row to the table
//     obsPointAddRow().addEventListener('click', () => addRowToTable(obsPointTable(), ['Name', 'Latitude', 'Longitude']));
//     boundaryAddRow().addEventListener('click', () => addRowToTable(boundaryEditTable(), ['YYYY-MM-DD HH:MM:SS', 'Value']));
//     sourceAddBtn().addEventListener('click', () => addRowToTable(sourceTable(), ['YYYY-MM-DD HH:MM:SS', 'Discharge', 'Salinity', 'Temperature', 'Contaminant']));
//     meteoAddBtn().addEventListener('click', () => addRowToTable(meteoTable(), ['YYYY-MM-DD HH:MM:SS', 'Humidity', 'Air temperature', 'Cloud coverage', 'Solar radiation']));
//     weatherAddRow().addEventListener('click', () => addRowToTable(weatherTable(), ['YYYY-MM-DD HH:MM:SS', 'Magnitude', 'Direction']));
//     // Remove point from table
//     obsPointRemove().addEventListener('click', () => {
//         const name = obsPointName().value.trim();
//         removeRowFromTable(obsPointTable(), name); obsPointName().value = '';
//     });
//     // Event when user change radio button for observation points
//     pointUpdate(document.getElementById('observation-point-new'), obsPointTable(),
//         false, ["Name", "Latitude", "Longitude"]);
//     pointUpdate(document.getElementById('observation-point-exist'), 
//         obsPointTable(), true, [obsPointName(), obsPointLatitude(), obsPointLongitude()]);
//     // Update observation point on map
//     obsPointUpdate().addEventListener('click', () => {
//         const content = getDataFromTable(obsPointTable(), true);
//         if (content.rows.length === 0) {alert('No observation points found.'); return;}
//         window.parent.postMessage({type: 'updateObsPoint', data: content}, '*');
//     });
//     // Event when user delete
//     crossSectionRemove().addEventListener('click', () => deleteTable(crossSectionTable(), crossSectionName(), 'clearCrossSection'));
//     boundaryEditRemove().addEventListener('click', () => { deleteTable(boundaryEditTable()); boundaryAddRow().click(); });
//     sourceDeleteTableBtn().addEventListener('click', () => { deleteTable(sourceTable()); sourceAddBtn().click(); });
//     meteoDeleteBtn().addEventListener('click', () => { deleteTable(meteoTable()); meteoAddBtn().click(); });
//     weatherRemove().addEventListener('click', () => { deleteTable(weatherTable()); weatherAddRow().click(); });
//     // Event when user plot table
//     plotTable(sourcePlotBtn(), sourceTable()); plotTable(meteoPlotBtn(), meteoTable());
//     // Update boundary option
//     boundaryEditUpdate().addEventListener('click', async () => {
//         const nameProject = projectName().value.trim(), nameBoundary = boundaryName().value.trim();
//         const subBoundary = boundarySelector().value, boundaryType = boundaryTypeSelector().value;
//         if (nameProject === '' || nameBoundary === '' || subBoundary === '' || boundaryType === '') {
//             alert('Please check: \n     1. Name of project/boundary/sub-boundary option is required.' + 
//                 '\n     2. Boundary type is required.' + '\n     3. Reference date is required.'); return;
//         }
//         const boundaryData = getDataFromTable(boundaryTable(), true);
//         if (boundaryData.rows.length === 0) { alert('No data in the table. Please check boundary condition.'); return; }
//         const subBoundaryData = getDataFromTable(boundaryEditTable());
//         if (subBoundaryData.rows.length === 0) { alert('No data in the table. Please check sub-boundary condition.'); return; }
//         // Create boundary
//         const content = {projectName: nameProject, boundaryName: nameBoundary, boundaryData: boundaryData.rows,
//             subBoundaryName: subBoundary, boundaryType: boundaryType, subBoundaryData: subBoundaryData.rows}
//         const data = await sendQuery('update_boundary', content);
//         alert(data.message); boundarySelectorView().value = '';
//         boundaryViewContainer().style.display = 'none'; boundaryText().value = '';
//     });
//     // Update parameters of boundary from file
//     boundarySelector().addEventListener('change', async () => {
//         const boundaryName = boundarySelector().value, boundaryType = boundaryTypeSelector().value;
//         const content = {projectName: projectName().value.trim(), boundaryName: boundaryName, boundaryType: boundaryType};
//         const data = await sendQuery('get_boundary_params', content);
//         if (data.status === 'new') { boundaryEditRemove().click(); return; }
//         if (data.status === 'error') { alert(data.message); return; }
//         boundaryEditRemove().click(); fillTable(data.content, boundaryEditTable());
//     });
//     boundaryTypeSelector().addEventListener('change', async () => {
//         const boundaryName = boundarySelector().value, boundaryType = boundaryTypeSelector().value;
//         const content = {projectName: projectName().value.trim(), boundaryName: boundaryName, boundaryType: boundaryType};
//         const data = await sendQuery('get_boundary_params', content);
//         if (data.status === 'new') { boundaryEditRemove().click(); return; }
//         if (data.status === 'error') { alert(data.message); return; }
//         boundaryEditRemove().click(); fillTable(data.content, boundaryEditTable());
//     });
//     // Upload boundary condition from CSV
//     boundaryCSV().addEventListener('click', () => { boundaryUploadFile().click(); });
//     boundaryUploadFile().addEventListener('change', async (event) => { 
//         deleteTable(boundaryEditTable());
//         await csvUploader(event, boundaryUploadText(), boundaryEditTable(), 2);
//         boundaryUploadFile().value = '';
//     });
//     // View boundary condition
//     boundarySelectorView().addEventListener('change', async () => {
//         if (boundarySelectorView().value === '') { boundaryViewContainer().style.display = 'none'; return; }
//         if (projectName().value === '') {
//             alert('Name of project is required.'); 
//             boundaryViewContainer().style.display = 'none'; return;
//         }
//         const value = boundarySelectorView().value;
//         boundaryText().value = '';
//         // Create boundary
//         const data = await sendQuery('view_boundary', {projectName: projectName().value, boundaryType: value});
//         if (data.status === "error") {
//             boundarySelectorView().value = ''; alert(data.message);
//             boundaryViewContainer().style.display = 'none'; return;
//         };
//         boundaryText().value = data.content; boundaryViewContainer().style.display = 'flex';
//     });
//     // Delete boundary
//     boundaryRemove().addEventListener('click', async () => {
//         const content = getDataFromTable(boundaryTable(), true).rows;
//         // Delete the last part and get unique name
//         const nameBoundary = [...new Set(content.map(p => p[0].replace(/_\d+$/, '')))];
//         const data = await sendQuery('delete_boundary', {projectName: projectName().value, boundaryName: nameBoundary});
//         alert(data.message); deleteTable(boundaryTable(), undefined, 'clearBoundary'); BCChecked = 0;
//         const tbody = boundaryEditTable().querySelector("tbody"); tbody.innerHTML = "";
//         boundarySelectorView().value = ''; boundarySelector().value = ''; boundarySelector().innerHTML = '';
//         boundaryViewContainer().style.display = 'none'; boundaryText().value = ''; boundaryName().value = '';
//     });
//     // Working on source/sink option
//     sourceOptionNew().addEventListener('change', () => {
//         sourceChange(sourceOptionNew(), sourceTable(), sourceLat(), sourceLon(), sourceName(), sourceUploadText()); 
// deleteTable(sourceTable()); sourceAddBtn().click();
//         sourceOptionPicker().style.display = 'block';
//     });
//     sourceOptionExist().addEventListener('change', () => {
//         sourceChange(sourceOptionExist(), sourceTable(), sourceLat(), sourceLon(), sourceName(), sourceUploadText()); 
// deleteTable(sourceTable()); sourceAddBtn().click();
//         sourceOptionPicker().style.display = 'none';
//     });
//     // Remove source from project
//     sourceRemoveBtn().addEventListener('click', async () => {
//         const nameProject = projectName().value.trim();
//         if (nameProject === ''){ alert('Please check project name.'); return; }
//         const name = sourceSelectorRemove().value;
//         removeRowFromTable(sourceRemoveTable(), name); deleteTable(sourceTable());
//         const content = getDataFromTable(sourceRemoveTable(), true).rows;
//         updateTable(sourceRemoveTable(), sourceSelectorRemove(), nameProject, content);
//     });
//     // Change output options
//     assignOutput(outputHis(), hisStart(), hisStop(), startDate(), stopDate());
//     assignOutput(outputMap(), mapStart(), mapStop(), startDate(), stopDate());
//     assignOutput(outputWQ(), wqStart(), wqStop(), startDate(), stopDate());
//     assignOutput(outputRestart(), rtsStart(), rtsStop(), startDate(), stopDate());
//     // Save source to project
//     sourceSaveBtn().addEventListener('click', async () => {
//         const nameProject = projectName().value.trim();
//         if (nameProject === ''){ alert('Please check project name.'); return; }
//         const table = getDataFromTable(sourceTable());
//         const name = sourceName().value;
//         const lat = sourceLatitude().value;
//         const lon = sourceLongitude().value;
//         if (table.rows.length === 0) { alert('No data to save. Please check the table.'); return; }
//         if (lat === '' || lon === '' || name === ''){ alert('Please check Name/Latitude/Longitude.'); return; }
//         const content = {projectName: nameProject, nameSource: name, lat: lat, lon: lon, data: table.rows, BC: BCChecked};
//         const data = await sendQuery('save_source', content);
//         updateTable(sourceRemoveTable(), sourceSelectorRemove(), nameProject);
//         alert(data.message);
//     });
//     // Save meteo data to project
//     meteoSaveBtn().addEventListener('click', async () => {
//         const nameProject = projectName().value.trim();
//         if (nameProject === ''){ alert('Please check project name.'); return; }        
//         const table = getDataFromTable(meteoTable());
//         if (table.rows.length === 0) { alert('No data to save. Please check the table.'); return; }
//         const data = await sendQuery('save_meteo', {projectName: nameProject, data: table.rows});
//         alert(data.message);
//     });
//     // Weather data
//     weatherSelector().addEventListener('change', () => {
//         if (weatherSelector().value === '') {
//             weatherPanel().style.display = 'none'; weatherTable().style.display = 'none';
//             weatherRemove().style.display = 'none'; weatherUpload().style.display = 'none'; return;
//         }
//         weatherPanel().style.display = 'block'; weatherTable().style.display = 'block'; 
//         weatherRemove().style.display = 'block'; weatherUpload().style.display = 'block'; 
//         deleteTable(weatherTable());
//         // Add row after above function finished
//         requestAnimationFrame(() => { weatherAddRow().click(); });
//     });
//     weatherUpload().addEventListener('click', async () => {
//         const nameProject = projectName().value.trim();
//         if (nameProject === ''){ alert('Please check project name.'); return; }        
//         const table = getDataFromTable(weatherTable());
//         if (table.rows.length === 0) { alert('No data to save. Please check the table.'); return; }
//         const data = await sendQuery('save_weather', {projectName: nameProject, data: table.rows});
//         alert(data.message);
//     })
//     // Save project
//     saveProjectBtn().addEventListener('click', async () => { 
//         const userTimeSec = timeStepCalculator(userTimestepDate().value, userTimestepTime().value);
//         const nodalTimeSec = timeStepCalculator(nodalTimestepDate().value, nodalTimestepTime().value);
//         const hisInterval = timeStepCalculator(hisIntervalDate().value, hisIntervalTime().value);
//         const mapInterval = timeStepCalculator(mapIntervalDate().value, mapIntervalTime().value);
//         const wqInterval = timeStepCalculator(wqIntervalDate().value, wqIntervalTime().value);
//         const rtsInterval = timeStepCalculator(rstIntervalDate().value, rstIntervalTime().value);
//         const sttInterval = timeStepCalculator(statisticDate().value, statisticTime().value);
//         const timingInterval = timeStepCalculator(timingDate().value, timingTime().value);
//         const elements = { projectName, latitude, nLayers, gridPathText, startDate, stopDate,
//             userTimeSec, nodalTimeSec, obsPointTable, crossSectionName, crossSectionTable, salinity, 
//             temperature, initWaterLevel, initSalinity, initTemperature , outputHis, hisInterval, hisStart, 
//             hisStop, outputMap, mapInterval, mapStart, mapStop, outputWQ, wqInterval, wqStart, wqStop, 
//             outputRestart, rtsInterval, rtsStart, rtsStop, sttInterval, timingInterval };
//         await saveProject(elements); 
//     });
// }

// async function loadScenario(scenarioName){
//     // Get average latitude
//     const data = await sendQuery('get_scenario', {projectName: scenarioName});
//     if (data.status === 'new') { return; }
//     if (data.status === 'error') { alert(data.message); return; }
//     latitude().value = data.content.avgLat;
//     gridPathText().value = data.content.gridPath;
//     nLayers().value = data.content.nLayers;
//     startDate().value = data.content.startDate;
//     stopDate().value = data.content.stopDate;
//     userTimestepDate().value = data.content.userTimestepDate;
//     userTimestepTime().value = data.content.userTimestepTime;
//     nodalTimestepDate().value = data.content.nodalTimestepDate;
//     nodalTimestepTime().value = data.content.nodalTimestepTime;
//     if (data.content.obsPointTable !== undefined && data.content.obsPointTable !== '') {
//         fillTable(data.content.obsPointTable, obsPointTable());
//     }
//     if (data.content.crossSectionTable !== undefined && data.content.crossSectionTable !== '') {
//         fillTable(data.content.crossSectionTable, crossSectionTable()); 
//     }
//     let defaultOption = `<option value="" selected>--- No selected ---</option>`;
//     if (data.content.boundaryTable !== undefined && data.content.boundaryTable !== '') {
//         fillTable(data.content.boundaryTable, boundaryTable());
//         // Update boundary option
//         const options = data.content.boundaryTable.map(row => `<option value="${row[0]}">${row[0]}</option>`).join(' ');
//         defaultOption = defaultOption + options;
//     }
//     boundarySelector().innerHTML = defaultOption;
//     initWaterLevel().value = data.content.initWaterLevel;
//     initSalinity().value = data.content.initSalinity;
//     initTemperature().value = data.content.initTemperature;
//     // Get source data if exist
//     updateTable(sourceRemoveTable(), sourceSelectorRemove(), scenarioName);
//     if (data.content.meteoPath !== '' || data.content.meteoPath.length > 0) { 
//         meteoUploadText().value = data.content.meteoName;
//         fillTable(data.content.meteoPath, meteoTable());
//     }
//     if (data.content.weatherPath !== '' || data.content.weatherPath.length > 0) {
//         weatherSelector().value = data.content.weatherType;
//         weatherCSVUploadText().value = data.content.weatherName;
//         weatherPanel().style.display = 'block'; weatherTable().style.display = 'block';
//         weatherUpload().style.display = 'block'; weatherRemove().style.display = 'block';
//         fillTable(data.content.weatherPath, weatherTable());
//     } else { 
//         weatherPanel().style.display = 'none'; weatherTable().style.display = 'none';
//         weatherUpload().style.display = 'none'; weatherRemove().style.display = 'none';
//     }
//     hisIntervalDate().value = data.content.hisIntervalDate;
//     hisIntervalTime().value = data.content.hisIntervalTime;
//     hisStart().value = data.content.hisStart; hisStop().value = data.content.hisStop;
//     if (hisStart().value !== '' || hisStop().value !== '') { outputHis().checked = true; }
//     mapIntervalDate().value = data.content.mapIntervalDate;
//     mapIntervalTime().value = data.content.mapIntervalTime;
//     mapStart().value = data.content.mapStart; mapStop().value = data.content.mapStop;
//     if (mapStart().value !== '' || mapStop().value !== '') { outputMap().checked = true; }
//     wqIntervalDate().value = data.content.wqIntervalDate;
//     wqIntervalTime().value = data.content.wqIntervalTime;
//     wqStart().value = data.content.wqStart; wqStop().value = data.content.wqStop;
//     if (wqStart().value !== '' || wqStop().value !== '') { outputWQ().checked = true; }
//     statisticDate().value = data.content.statisticDate; statisticTime().value = data.content.statisticTime;
//     timingDate().value = data.content.timingDate; timingTime().value = data.content.timingTime;
// }


}







async function loadScenario(scenarioName){
    // Get average latitude
    const data = await jsonLoader('get_scenario', {projectName: scenarioName});
    if (data.status === 'new') { return; }
    if (data.status === 'error') { alert(data.message); return; }
    obj.latitude.value = data.content.avgLat;
    obj.nLayers.value = data.content.nLayers;
    obj.gridPathText.value = data.content.gridPath;
    obj.startDate.value = data.content.startDate;
    obj.stopDate.value = data.content.stopDate;
    obj.userTimestepDate.value = data.content.userTimestepDate;
    obj.userTimestepTime.value = data.content.userTimestepTime;
    obj.nodalTimestepDate.value = data.content.nodalTimestepDate;
    obj.nodalTimestepTime.value = data.content.nodalTimestepTime;
    if (data.content.obsPointTable !== undefined && data.content.obsPointTable !== '') {
        fillTable(data.content.obsPointTable, obj.obsPointTable);
    }
    if (data.content.crossSectionTable !== undefined && data.content.crossSectionTable !== '') {
        fillTable(data.content.crossSectionTable, obj.crossSectionTable); 
    }
    let defaultOption = `<option value="" selected>--- No selected ---</option>`;
    if (data.content.boundaryTable !== undefined && data.content.boundaryTable !== '') {
        fillTable(data.content.boundaryTable, obj.boundaryTable);
        // Update boundary option
        const options = data.content.boundaryTable.map(row => `<option value="${row[0]}">${row[0]}</option>`).join(' ');
        defaultOption = defaultOption + options;
    }
    obj.boundarySelector.innerHTML = defaultOption;
    obj.initWaterLevel.value = data.content.initWaterLevel;
    obj.initSalinity.value = data.content.initSalinity;
    obj.initTemperature.value = data.content.initTemperature;
    // Get source data if exist
    updateTable(obj.sourceRemoveTable, obj.sourceSelectorRemove, scenarioName);
    if (data.content.meteoPath !== '' || data.content.meteoPath.length > 0) { 
        obj.meteoUploadText.value = data.content.meteoName;
        fillTable(data.content.meteoPath, obj.meteoTable);
    }
    if (data.content.weatherPath !== '' || data.content.weatherPath.length > 0) {
        obj.weatherSelector.value = data.content.weatherType;
        obj.weatherCSVUploadText.value = data.content.weatherName;
        obj.weatherPanel.style.display = 'block'; obj.weatherTable.style.display = 'block';
        obj.weatherUpload.style.display = 'block'; obj.weatherRemove.style.display = 'block';
        fillTable(data.content.weatherPath, obj.weatherTable);
    } else { 
        obj.weatherPanel.style.display = 'none'; obj.weatherTable.style.display = 'none';
        obj.weatherUpload.style.display = 'none'; obj.weatherRemove.style.display = 'none';
    }
    obj.hisIntervalDate.value = data.content.hisIntervalDate;
    obj.hisIntervalTime.value = data.content.hisIntervalTime;
    obj.hisStart.value = data.content.hisStart; obj.hisStop.value = data.content.hisStop;
    if (obj.hisStart.value !== '' || obj.hisStop.value !== '') { obj.outputHis.checked = true; }
    obj.mapIntervalDate.value = data.content.mapIntervalDate;
    obj.mapIntervalTime.value = data.content.mapIntervalTime;
    obj.mapStart.value = data.content.mapStart; obj.mapStop.value = data.content.mapStop;
    if (obj.mapStart.value !== '' || obj.mapStop.value !== '') { obj.outputMap.checked = true; }
    obj.wqIntervalDate.value = data.content.wqIntervalDate;
    obj.wqIntervalTime.value = data.content.wqIntervalTime;
    obj.wqStart.value = data.content.wqStart; obj.wqStop.value = data.content.wqStop;
    if (obj.wqStart.value !== '' || obj.wqStop.value !== '') { obj.outputWQ.checked = true; }
    obj.statisticDate.value = data.content.statisticDate; obj.statisticTime.value = data.content.statisticTime;
    obj.timingDate.value = data.content.timingDate; obj.timingTime.value = data.content.timingTime;
}
