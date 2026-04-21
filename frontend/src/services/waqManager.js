import { setupTabs } from "./tabManager.js";
import { getProjectList, jsonLoader, fillTable, deleteTable, addRowToTable,
    nameChecker, iframeConnector
} from "./commonFunctions.js";
import { projectRender } from "./projectManager.js";

// let  folderName='', , pointSelected=null, nPoints=0,
//     , n_layers='', , , nLoads=0,
//       
//      , useforsTo=[];

let projectSelected = [], subKey = '', 
    volPath = '', timeStep1 = 0, timeStep2 = 0, nSegments = 0, attrPath_ =' ',
    exchange_x = 0, exchange_z = 0, exchange_y = 0, ptrPath = '', areaPath = '',
    flowPath = '', lengthPath = '', srfPath = '', vdfPath = '', temPath = '',
    salPath = '', usefors = null, initial_area = null, scheme = null, maxiter = null,
    tolerance = null, useforsFrom = [], waqContent = [], from_initial = null,
    initial_value = null, to_usefors = null, from_usesfor=null;




const $ = (id) => document.getElementById(id);
const obj = {
    descriptionTab: $('desription-tab'), controlTab: $('control-tab'),
    projectName: $('project-name'), projectList: $('project-list'),
    waqSelector: $('waq-name'), waqLabel: $('label-waq'),
    projectCreator: $('create-btn'), projectCloner: $('duplicate-btn'),
    projectRemover: $('remove-btn'), hydFilename: $('hyd-filename'), 
    nLayers: $('n-layer'), startTime: $('start-time'), stopTime: $('stop-time'),
    sourcesContainer: $('wq-sources-container'), sourcesTable: $('wq-sources-table'),
    obsPointName: $('wq-obs-point'), obsPointPicker: $('wq-obs-picker'),
    obsPointRemove: $('wq-obs-remove'), obsPointTable: $('wq-obs-table'),
    loadsPointName: $('wq-loads-point'), loadsPointPicker: $('wq-loads-picker'),
    loadsPointRemove: $('wq-loads-remove'), loadsPointTable: $('wq-loads-table'),
    timeTable: $('wq-time-series-table'), timeTableAddRow: $('time-series-add-row'),
    inputFile: $('input-csv'), csvTable: $('time-series-csv'),
    removeTable: $('time-series-remove'), timePreviewContainer: $('wq-textarea-container'),
    timePreview: $('wq-data-view'), physicalSelector: $('wq-physical'),
    physicalName: $('wq-physical-name'), usesforFromPhysical: $('wq-physical-usefors-from'),
    usesforToPhysical: $('wq-physical-usefors-to'), usesforPhysical: $('wq-usefors-physical'),
    initialFromPhysical: $('wq-physical-initial-from'), initialToPhysical: $('wq-physical-initial'),
    initialAreaPhysical: $('wq-initial-physical'), schemePhysical: $('wq-scheme-physical'),
    maxInterPhysical: $('max-iterations-physical'), tolerancePhysical: $('tolerance-physical'),
    chemicalSelector: $('wq-chemical'), chemicalName: $('wq-chemical-name'),
    usesforFromChemical: $('wq-chemical-usefors-from'), usesforToChemical: $('wq-chemical-usefors-to'),
    usesforChemical: $('wq-usefors-chemical'), initialFromChemical: $('wq-chemical-initial-from'),
    initialToChemical: $('wq-chemical-initial'), initialAreaChemical: $('wq-initial-chemical'),
    schemeChemical: $('wq-scheme-chemical'), maxInterChemical: $('max-iterations-chemical'),
    toleranceChemical: $('tolerance-chemical'), microbialSelector: $('wq-microbial'),
    microbialName: $('wq-microbial-name'), usesforFromMirobial: $('wq-microbial-usefors-from'),
    usesforToMirobial: $('wq-microbial-usefors-to'), usesforMicrobial: $('wq-usefors-microbial'),
    initialFromMirobial: $('wq-microbial-initial-from'), initialToMirobial: $('wq-microbial-initial'),
    initialAreaMirobial: $('wq-initial-microbial'), schemeMicrobial: $('wq-scheme-microbial'),
    maxInterMirobial: $('max-iterations-microbial'), toleranceMirobial: $('tolerance-microbial'),
};

getProjects(); projectOptions(); initializeProject(); waqManager();

async function getProjects(){
    projectSelected = await getProjectList();
    obj.projectName.style.pointerEvents = "auto";
    await projectRender(obj.projectName, obj.projectList, projectSelected);
}

async function waqManager(){
    // Check whether map widget exists
    const layout = localStorage.getItem('grid-layout');
    const hasMap = layout ? JSON.parse(layout).some(item => item.id === 'waq-map') : false;
    const content = { id: 'waq-map', title: 'Water Quality Scenario Map' };
    if (!hasMap) window.parent.postMessage({ type: 'addMapWidget', content: content }, '*');
    // Update location
    iframeConnector(obj.obsPointPicker, obj.latitude, 'waqPoint');

//     obsPointPicker().addEventListener('click', () => {
//         pointSelected = 'obsPoint';
//         const obsPoints = getDataFromTable(obsPointTable(), true);
//         const loadsPoints = getDataFromTable(loadsPointTable(), true);
//         window.parent.postMessage({type: 'pickPoint', data: [loadsPoints, obsPoints], pointType: 'waqPoint'}, '*');
//     });
//     loadsPointPicker().addEventListener('click', () => {
//         pointSelected = 'loadsPoint'; 
//         const obsPoints = getDataFromTable(obsPointTable(), true);
//         const loadsPoints = getDataFromTable(loadsPointTable(), true);
//         window.parent.postMessage({type: 'pickPoint', data: [obsPoints, loadsPoints], pointType: 'loadsPoint'}, '*');
//     });
//     // Copy and paste to tables
//     copyPaste(obsPointTable(), 3); copyPaste(loadsPointTable(), 3);
//     copyPaste(timeTable(), 4); copyPaste(sourcesTable(), 3);
//     // Update when user change Combobox
//     substanceChanger(waqSelector(), chemicalSelector(), chemicalName(), 'wq-chemical');
//     substanceChanger(waqSelector(), physicalSelector(), physicalName(), 'wq-physical');
//     substanceChanger(waqSelector(), microbialSelector(), microbialName(), 'wq-microbial');
//     // Add new row to table
//     timeTableAddRow().addEventListener('click', () => {
//         deleteTable(timeTable()); addRowToTable(timeTable(), ['YYYY-MM-DD HH:MM:SS', 'PointName', 'Substance', 'Value']);
//     });
//     // Delete table
//     removeTable().addEventListener('click', () => { 
//         deleteTable(timeTable()); timePreview().value = ''; timePreviewContainer().style.display = 'none';
//         addRowToTable(timeTable(), ['YYYY-MM-DD HH:MM:SS', 'PointName', 'Substance', 'Value']);
//     });
//     // Upload CSV
//     csvTable().addEventListener('click', () => { 
//         inputFile().click();
//         inputFile().addEventListener('change', () => {
//             if (inputFile().files.length > 0) {
//                 const file = inputFile().files[0];
//                 const reader = new FileReader();
//                 reader.onload = (e) => {
//                     const text = e.target.result;
//                     // Get the first row
//                     const firstLine = text.split(/\r?\n/)[0];
//                     const columns = firstLine.split(/\t|,/);
//                     if (columns.length !== 4) { 
//                     alert(`The current table has ${columns.length} columns.\nNumber of columns must be 4.`); 
//                         inputFile().value = ''; return; 
//                     }
//                     const rows = text.split(/\r?\n/).slice(1).filter(row => row.trim() !== ''); // Split into rows 
//                     const data_arr = rows.map(row => row.split(/\t|,/).slice(0, 4)); // Split into columns
//                     fillTable(data_arr, timeTable(), true);
//                     inputFile().value = "";
//                 };
//                 reader.readAsText(file, 'UTF-8');
//             }
//         }, {once: true});
//     });
//     // Remove point from table
//     obsPointRemove().addEventListener('click', () => {
//         const name = obsPointName().value.trim();
//         if (name === '') { alert('Please enter name of observation point from list to remove.'); return; }
//         removeRowFromTable(obsPointTable(), name); obsPointName().value = '';
//     });
//     loadsPointRemove().addEventListener('click', () => {
//         const name = loadsPointName().value.trim();
//         if (name === '') { alert('Please enter name of loads point from list to remove.'); return; }
//         removeRowFromTable(loadsPointTable(), name);
//         loadsPointName().value = ''; 
//     });
//     // Get data from main page
//     window.addEventListener('message', (event) => {
//         if (event.data.type === 'pointPicked') {
//             const lat = Number(event.data.content.lat).toFixed(12);
//             const lon = Number(event.data.content.lng).toFixed(12);
//             if (pointSelected === 'obsPoint') {
//                 let name = ''; nPoints++;
//                 // Define name of point
//                 if (obsPointName().value.trim() !== '') name = obsPointName().value.trim();
//                 else name = `Obs_${nPoints}`;
//                 const data_arr = [[name, lat, lon]];
//                 fillTable(data_arr, obsPointTable(), false);
//             }
//             else if (pointSelected === 'loadsPoint') {
//                 let name = ''; nLoads++;
//                 if (loadsPointName().value.trim() !== '') name = loadsPointName().value.trim();
//                 else name = `Load_${nLoads}`; 
//                 const data_arr = [[name, lat, lon]];
//                 fillTable(data_arr, loadsPointTable(), false);
//             }
//         }
//     });
//     // Check function to process time-series
//     document.querySelectorAll('.wq-process-time-series').forEach(btn => {
//         btn.addEventListener('click', async () => {
//             const loadsData = getDataFromTable(loadsPointTable(), true);
//             if (loadsData.rows.length === 0) {
//                 alert("No loads data found in the table.\nPlease check the load table in tab 'Point Settings'."); 
//                 timePreviewContainer().style.display = 'none'; return; 
//             }
//             const timeData = getDataFromTable(timeTable(), false);
//             if (timeData.rows.length === 0) {
//                 alert("No time-series data found in the table.\nPlease check the table 'Time-Series Preparation'."); 
//                 timePreviewContainer().style.display = 'none'; return; 
//             }
//             if (btn.id === 'wq-chemical') {
//                 subKey = chemicalSelector().value; folderName = chemicalName().value.trim();
//                 initial_area = initialAreaChemical(); usefors = usesforChemical();
//                 to_usefors = usesforToChemical(); initial_value = initialToChemical();
//             } else if (btn.id === 'wq-physical') {
//                 subKey = physicalSelector().value; folderName = physicalName().value.trim();
//                 initial_area = initialAreaPhysical(); usefors = usesforPhysical();
//                 to_usefors = usesforToPhysical(); initial_value = initialToPhysical();
//             } else if (btn.id === 'wq-microbial') {
//                 subKey = microbialSelector().value; folderName = microbialName().value.trim();
//                 initial_area = initialAreaMirobial(); usefors = usesforMicrobial();
//                 to_usefors = usesforToMirobial(); initial_value = initialToMirobial();
//             }
//             timePreview().value = ''; initial_area.value = ''; usefors.value = ''; initial_value.value = '0';
//             if (subKey === '') { alert('Please specify type of simulation.'); return; }
//             if (folderName === '') { alert('Please specify name of substance.'); return; }
//             const data = await sendQuery('wq_time_to_waq', { folderName: folderName, 
//                 loadsData: loadsData.rows, timeData: timeData.rows });
//             if (data.status === "error") {
//                 timePreviewContainer().style.display = 'none'; 
//                 timePreview().value = ''; alert(data.message); return;
//             };
//             timePreview().value = data.content; useforsTo = data.tos;
//             timePreviewContainer().style.display = 'flex'; to_usefors.innerHTML = '';
//             data.tos.forEach(item => {
//                 const option = document.createElement('option');
//                 option.value = item; option.text = item;
//                 to_usefors.add(option);
//             });
//         });
//     });
//     // Update USEFORS data
//     document.querySelectorAll('.wq-usefors').forEach(btn => {
//         btn.addEventListener('click', () => {
//             if (btn.dataset.info === 'physical') {
//                 from_usesfor = usesforFromPhysical(); to_usefors = usesforToPhysical();
//                 usefors = usesforPhysical();
//             } else if (btn.dataset.info === 'chemical') {
//                 from_usesfor = usesforFromChemical(); to_usefors = usesforToChemical();
//                 usefors = usesforChemical();
//             } else if (btn.dataset.info === 'microbial') {
//                 from_usesfor = usesforFromMirobial(); to_usefors = usesforToMirobial();
//                 usefors = usesforMicrobial();
//             }
//             const txt = `USEFOR '${from_usesfor.value}' '${to_usefors.value}'`;
//             let content = usefors.value;
//             content = content === '' ? txt : content + '\n' + txt;
//             // Split and remove duplicates
//             usefors.value = [...new Set(content.split('\n'))].join('\n');
//         });
//     });
//     // Update initial data
//     document.querySelectorAll('.wq-initial').forEach(btn => {
//         btn.addEventListener('click', () => {
//             if (btn.dataset.info === 'physical') {
//                 from_initial = initialFromPhysical(); initial_value = initialToPhysical();
//                 initial_area = initialAreaPhysical();
//             } else if (btn.dataset.info === 'chemical') {
//                 from_initial = initialFromChemical(); initial_value = initialToChemical();
//                 initial_area = initialAreaChemical();
//             } else if (btn.dataset.info === 'microbial') {
//                 from_initial = initialFromMirobial(); initial_value = initialToMirobial();
//                 initial_area = initialAreaMirobial();
//             }
//             const txt = `${from_initial.value} ${initial_value.value}`;
//             let content = initial_area.value;
//             content = content === '' ? txt : content + '\n' + txt;
//             content = [...new Set(content.split('\n'))].join('\n');
//             initial_area.value = content;
//         });
//     });
//     // Save and run water quality simulation
//     document.querySelectorAll('.wq-simulation').forEach(btn => {
//         btn.addEventListener('click', async () => {
//             const name = projectName().value.trim();
//             if (!name || name === '') { alert('Please define project.'); return; }
//             const hydPath = hydFilename().value.trim();
//             if (!hydPath || hydPath === '') { alert('Please define hydrological (*.hyd) file.'); return; }
//             const start = startTime().value, stop = stopTime().value;
//             if (!start || start === '' || !stop || stop === '') { alert("The fields 'Start time' and 'Stop time' are required"); return; }
//             const data = await sendQuery('select_hyd', {projectName: name});
//             if (data.status === "error") { alert(data.message); return; }
//             timeStep1 = data.content.time_step1; timeStep2 = data.content.time_step2;
//             attrPath_ = data.content.attr_path; volPath = data.content.vol_path;
//             nSegments = data.content.n_segments; ptrPath = data.content.ptr_path;
//             exchange_x = data.content.exchange_x; exchange_z = data.content.exchange_z;
//             if (data.content.exchange_y) { exchange_y = data.content.exchange_y; }
//             flowPath = data.content.flow_path; lengthPath = data.content.length_path;
//             areaPath = data.content.area_path; n_layers = nLayers().value.trim();
//             if (!n_layers || n_layers === '') { alert("The field 'Nr. sigma layers' is required"); return; }
//             srfPath = data.content.srf_path; vdfPath = data.content.vdf_path;
//             temPath = data.content.tem_path; salPath = data.content.sal_path;
//             const sourceTable = getDataFromTable(sourcesTable(), true);         
//             const obsTable = getDataFromTable(obsPointTable(), true);
//             const loadTable = getDataFromTable(loadsPointTable(), true);
//             if (loadTable.rows.length === 0) { alert('No loads data found. Please add at least one load.'); return; }
//             const timeData = timePreview().value.trim();
//             if (!timeData || timeData === '') { alert("Post-processing field is required"); return; }
//             if (btn.dataset.info === 'chemical') {
//                 subKey = chemicalSelector().value; folderName = chemicalName().value.trim();
//                 useforsFrom = usesforFromChemical(); useforsTo = usesforToChemical();
//                 usefors = usesforChemical(); initial_area = initialAreaChemical();
//                 maxiter = maxInterChemical(); tolerance = toleranceChemical(); scheme = schemeChemical(); 
//             } else if (btn.dataset.info === 'physical') {
//                 subKey = physicalSelector().value; folderName = physicalName().value.trim();
//                 useforsFrom = usesforFromPhysical(); useforsTo = usesforToPhysical();
//                 usefors = usesforPhysical(); initial_area = initialAreaPhysical();
//                 maxiter = maxInterPhysical(); tolerance = tolerancePhysical(); scheme = schemePhysical();
//             } else if (btn.dataset.info === 'microbial') {
//                 subKey = microbialSelector().value; folderName = microbialName().value.trim();
//                 useforsFrom = usesforFromMirobial(); useforsTo = usesforToMirobial();
//                 usefors = usesforMicrobial(); initial_area = initialAreaMirobial();
//                 maxiter = maxInterMirobial(); tolerance = toleranceMirobial(); scheme = schemeMicrobial();
//             }
//             if (!folderName || folderName === '') { alert("Name of substance is required"); return; }
//             const userforValue = usefors.value.trim();
//             if (userforValue === '') { alert("The field 'Assigned Substance' must has at least one value"); return; }
//             const valueFrom = Array.from(useforsFrom.options).map(option => option.value);
//             const valueTo = Array.from(useforsTo.options).map(option => option.value);
//             const initialArea = initial_area.value.trim();
//             if (maxiter.value === '' || parseInt(maxiter.value) <= 0) { alert('Please define maximum number of iterations.'); return; }
//             if (tolerance.value === '' || parseFloat(tolerance.value) <= 0) { alert('Please define tolerance.'); return; }
//             const params = { mode: btn.dataset.info, projectName: name, key: subKey, folderName: folderName,
//                 hydName: hydPath, nLayers: n_layers, timeStep1: timeStep1, timeStep2: timeStep2, nSegments: nSegments,
//                 startTime: toUTC(start), stopTime: toUTC(stop), exchangeY: exchange_y, exchangeX: exchange_x,
//                 exchangeZ: exchange_z, attrPath: attrPath_, volPath: volPath, ptrPath: ptrPath, areaPath: areaPath, 
//                 flowPath: flowPath, lengthPath: lengthPath, srfPath: srfPath, vdfPath: vdfPath, temPath: temPath,
//                 salPath: salPath, useforsFrom: valueFrom, useforsTo: valueTo, usefors: userforValue,
//                 sources: sourceTable.rows, obsPoints: obsTable.rows, loadsData: loadTable.rows, timeTable: timeData, 
//                 initial: initialArea, maxiter: maxiter.value, tolerance: tolerance.value, scheme: scheme.value
//             }
//             const waq_config = await sendQuery('waq_config_writer', params);
//             if (waq_config.status === 'error') { alert(waq_config.message); return; }
//             alert(waq_config.message);
//         });
//     });
}

async function projectOptions(){
    // Create new scenario
    obj.projectCreator.addEventListener('click', async () => {
        const name = obj.projectName.value.trim();
        if (!name || name.trim() === '') { alert('Please define a WAQ Scenario.'); return; }
        const waqName = obj.waqSelector.value;
        if (waqName === '' && obj.waqSelector.style.display !== 'none') { alert('Please define a WAQ model.'); return; }
        // Find .hyd file
        const data = await jsonLoader('select_hyd', {projectName: name});
        if (data.status === "error") { alert(data.message); return; }
        setupTabs(document);
        // Show tabs
        obj.controlTab.style.display = "block"; obj.descriptionTab.style.display = "none";
        obj.sourcesContainer.style.display = data.content.sink_sources.length > 0 ? "block":"none";
        fillTable(data.content.sink_sources, obj.sourcesTable, true);
        // Assign values
        obj.hydFilename.value = data.content.filename; volPath = data.content.vol_path;
        timeStep1 = data.content.time_step1; timeStep2 = data.content.time_step2;
        nSegments = data.content.n_segments; attrPath_ = data.content.attr_path;
        exchange_x = data.content.exchange_x; exchange_z = data.content.exchange_z;
        if (data.content.exchange_y) { exchange_y = data.content.exchange_y; }
        ptrPath = data.content.ptr_path; areaPath = data.content.area_path;
        flowPath = data.content.flow_path; lengthPath = data.content.length_path;
        if (data.content.n_layers) { obj.nLayers.value = data.content.n_layers; }
        srfPath = data.content.srf_path; vdfPath = data.content.vdf_path;
        temPath = data.content.tem_path; salPath = data.content.sal_path;
        obj.startTime.value = data.content.start_time; 
        obj.stopTime.value = data.content.stop_time;
        // Set default values
        deleteTable(obj.obsPointTable); deleteTable(obj.loadsPointTable);
        addRowToTable(obj.obsPointTable, ['Name', 'Latitude', 'Longitude']);
        addRowToTable(obj.loadsPointTable, ['Name', 'Latitude', 'Longitude']);
        // Physical tab
        obj.physicalSelector.value = ''; obj.physicalName.value = ''; 
        obj.usesforFromPhysical.innerHTML = ''; obj.usesforToPhysical.innerHTML = '';
        obj.usesforPhysical.value = ''; obj.initialFromPhysical.innerHTML = '';
        obj.initialAreaPhysical.value = ''; obj.schemePhysical.value = '15';
        obj.maxInterPhysical.value = '500'; obj.tolerancePhysical.value = '1E-07';
        // Chemical tab
        obj.chemicalSelector.value = ''; obj.chemicalName.value = '';
        obj.usesforFromChemical.innerHTML = ''; obj.usesforToChemical.innerHTML = '';
        obj.usesforChemical.value = ''; obj.initialFromChemical.innerHTML = '';
        obj.initialAreaChemical.value = ''; obj.schemeChemical.value = '15';
        obj.maxInterChemical.value = '500'; obj.toleranceChemical.value = '1E-07';
        // Microbial tab
        obj.microbialSelector.value = ''; obj.microbialName.value = '';
        obj.usesforFromMirobial.innerHTML = ''; obj.usesforToMirobial.innerHTML = '';
        obj.usesforMicrobial.value = ''; obj.initialFromMirobial.innerHTML = '';
        obj.initialAreaMirobial.value = ''; obj.schemeMicrobial.value = '15';
        obj.maxInterMirobial.value = '500'; obj.toleranceMirobial.value = '1E-07';
        obj.timePreview.value = ''; obj.timePreviewContainer.style.display = 'none';
        const waqValue = obj.waqSelector.value;
        if (waqValue !== '') { 
            const data = await jsonLoader('load_waq', {projectName: name, waqName: waqValue});
            if (data.status === "error") { alert(data.message); return; }
            if (data.content.obs.length > 0) { fillTable(data.content.obs, obj.obsPointTable, true); }
            fillTable(data.content.loads, obj.loadsPointTable, true);
            deleteTable(obj.timeTable); fillTable(data.content.time_data, obj.timeTable, true);
            if (data.content.mode === 'physical') {
                obj.physicalSelector.value = data.content.key;
                obj.physicalName.value = data.content.name;
                obj.chemicalSelector.value = ''; obj.chemicalName.value = '';
                obj.microbialSelector.value = ''; obj.microbialName.value = '';
                from_usesfor = obj.usesforFromPhysical; to_usefors = obj.usesforToPhysical;
                from_initial = obj.initialFromPhysical; usefors = obj.usesforPhysical;
                initial_area = obj.initialAreaPhysical; scheme = obj.schemePhysical;
                maxiter = obj.maxInterPhysical; tolerance = obj.tolerancePhysical;
            } else if (data.content.mode === 'chemical') {
                obj.chemicalSelector.value = data.content.key;
                obj.chemicalName.value = data.content.name;
                obj.physicalSelector.value = ''; obj.physicalName.value = '';
                obj.microbialSelector.value = ''; obj.microbialName.value = '';
                from_usesfor = obj.usesforFromChemical; to_usefors = obj.usesforToChemical;
                from_initial = obj.initialFromChemical; usefors = obj.usesforChemical;
                initial_area = obj.initialAreaChemical; scheme = obj.schemeChemical;
                maxiter = obj.maxInterChemical; tolerance = obj.toleranceChemical;
            } else if (data.content.mode === 'microbial') {
                obj.microbialSelector.value = data.content.key;
                obj.microbialName.value = data.content.name;
                obj.physicalSelector.value = ''; obj.physicalName.value = '';
                obj.chemicalSelector.value = ''; obj.chemicalName.value = '';
                from_usesfor = obj.usesforFromMirobial; to_usefors = obj.usesforToMirobial;
                from_initial = obj.initialFromMirobial; usefors = obj.usesforMicrobial;
                initial_area = obj.initialAreaMirobial; scheme = obj.schemeMicrobial;
                maxiter = obj.maxInterMirobial; tolerance = obj.toleranceMirobial;
            }
            usefors.value = data.content.usefors; initial_area.value = data.content.initial;
            scheme.value = data.content.scheme; maxiter.value = data.content.maxiter;
            tolerance.value = data.content.tolerance;
            data.content.useforsFrom.forEach(item => {
                [from_usesfor, from_initial].forEach(select => {
                    const option = document.createElement('option');
                    option.value = item; option.text = item;
                    select.add(option);
                })
            });
            data.content.useforsTo.forEach(item => {
                const option = document.createElement('option');
                option.value = item; option.text = item;
                to_usefors.add(option);
            });
            obj.timePreviewContainer.style.display = 'flex';
            obj.timePreview.value = data.content.times;
        }
    });
    // Clone scenario
    obj.projectCloner.addEventListener('click', async () => { 
        const name = obj.projectName.value.trim();
        if (!name || name === '') { alert('Please select scenario first.'); return; }
        const newName = prompt('Please enter a name for the new WAQ scenario.');
        if (!newName || newName === '') { alert('Please define clone scenario name.'); return; }
        if (nameChecker(newName)) { alert('Scenario name contains invalid characters.'); return; }
        obj.projectCloner.innerHTML = 'Cloning...';
        const data = await jsonLoader('clone_waq', {
            projectName: name, oldName: obj.waqSelector.value, newName: newName
        });
        obj.projectCloner.innerHTML = 'Clone Scenario'; alert(data.message);
        if (data.status === "error") { return; }
        waqContent.push(newName); obj.waqSelector.innerHTML = '';
        const defaultWAQ = `<option value="">-- New WAQ model --</option>`;
        const waqTemp = waqContent.map(name => `<option value="${name}">${name}</option>`).join('');
        obj.waqSelector.innerHTML = defaultWAQ + waqTemp;
        obj.waqSelector.value = newName; obj.projectCreator.click();
    });
    // Delete scenario
    obj.projectRemover.addEventListener('click', async () => {
        const name = obj.projectName.value.trim(), waqName = obj.waqSelector.value;
        obj.projectRemover.innerHTML = 'Deleting...';
        const data = await jsonLoader('delete_file', { projectName: name, name: waqName });
        obj.projectRemover.innerHTML = 'Delete Scenario'; alert(data.message);
        if (data.status === "error") { return; }
        obj.waqSelector.innerHTML = '';
        waqContent = waqContent.filter(item => item !== waqName);
        const defaultWAQ = `<option value="">-- New WAQ model --</option>`;
        const waqTemp = waqContent.map(name => `<option value="${name}">${name}</option>`).join('');
        obj.waqSelector.innerHTML = defaultWAQ + waqTemp;
        obj.waqSelector.value = ''; obj.projectCreator.click();
    });
}

function initializeProject(){
    // Update project name
    obj.projectName.addEventListener('click', () => {
        if (obj.projectList.children.length === 0) {
            projectSelected.forEach(p => {
                const li = document.createElement("li");
                li.textContent = p;
                li.addEventListener('mousedown', () => {
                    obj.projectName.value = p; 
                    obj.projectList.style.display = "none";
                });
                obj.projectList.appendChild(li);
            });
        }
        obj.projectList.style.display = "block";
    });
    // Show/Hide tabs
    obj.projectName.addEventListener('input', (e) => { 
        const value = e.target.value.trim();
        if (value === '') {
            obj.controlTab.style.display = "none"; 
            obj.descriptionTab.style.display = "block";
            obj.waqSelector.innerHTML = '';
            obj.waqSelector.style.display = "none"; 
            obj.waqLabel.style.display = "none";
            deleteTable(obj.timeTable);
            addRowToTable(obj.timeTable, [
                "YYYY-MM-DD HH:MM:SS", "Point Name", "Substance", "Value"
            ]);
        }
        projectRender(obj.projectName, obj.projectList, projectSelected);
    });
    obj.projectName.addEventListener('blur', () => { 
        setTimeout(() => { obj.projectList.style.display = "none"; }, 50);
    });
    obj.projectList.addEventListener('mousedown', async () => {
        const name = obj.projectName.value.trim();
        const data = await jsonLoader('select_waq', { projectName: name });
        if (!name || name === '' || data.status === "error") { 
            obj.waqSelector.style.display = "none"; obj.waqSelector.value = '';
            obj.waqLabel.style.display = "none"; obj.projectCloner.style.display = "none"; 
            obj.projectRemover.style.display = "none"; return; 
        }
        waqContent = data.content;
        const waqTemp = waqContent.map(name => `<option value="${name}">${name}</option>`).join('');
        const defaultWAQ = `<option value="">-- New WAQ model --</option>`;
        obj.waqSelector.innerHTML = defaultWAQ + waqTemp; obj.waqSelector.value = '';
        obj.waqSelector.style.display = "flex"; obj.waqLabel.style.display = "flex";
        obj.projectCloner.style.display = "flex"; obj.projectRemover.style.display = "flex";
    });
    obj.waqSelector.addEventListener('change', async (e) => { 
        if (e.target.value === '') { 
            obj.controlTab.style.display = "none"; obj.descriptionTab.style.display = "block";
        }
    });    
}

function substanceChanger(waqModel, target, name, type){
    target.addEventListener('change', async () => {
        if (type === 'wq-chemical') {
            from_usesfor = obj.usesforFromChemical; to_usefors = obj.usesforToChemical;
            usefors = obj.usesforChemical; from_initial = obj.initialFromChemical;
            initial_area = obj.initialAreaChemical; scheme = obj.schemeChemical;
            maxiter = obj.maxInterChemical; tolerance = obj.toleranceChemical;
            initial_value = obj.initialToChemical;
        } else if (type === 'wq-physical') {
            from_usesfor = obj.usesforFromPhysical; to_usefors = obj.usesforToPhysical;
            usefors = obj.usesforPhysical; from_initial = obj.initialFromPhysical;
            initial_area = obj.initialAreaPhysical; scheme = obj.schemePhysical;
            maxiter = obj.maxInterPhysical; tolerance = obj.tolerancePhysical;
            initial_value = obj.initialToPhysical;
        } else if (type === 'wq-microbial') {
            from_usesfor = obj.usesforFromMirobial; to_usefors = obj.usesforToMirobial;
            usefors = obj.usesforMicrobial; from_initial = obj.initialFromMirobial;
            initial_area = obj.initialAreaMirobial; scheme = obj.schemeMicrobial;
            maxiter = obj.maxInterMirobial; tolerance = obj.toleranceMirobial;
            initial_value = obj.initialToMirobial;
        }
        from_usesfor.innerHTML = ''; from_initial.innerHTML = ''; 
        initial_area.value = ''; initial_value.value = '0';
        scheme.value = '15'; maxiter.value = '500'; tolerance.value = '1E-07';
        const key = target.value;
        if (key === 'simple-oxygen') { subKey = 'Simple_Oxygen'; }
        else if (key === 'oxygen-bod-water') { subKey = 'Oxygen_BOD'; }
        else if (key === 'cadmium') { subKey = 'Cadmium'; }
        else if (key === 'eutrophication') { subKey = 'Eutrophication'; }
        else if (key === 'trace-metals') { subKey = 'Trace_Metals'; }
        else if (key === 'conservative-tracers') { subKey = 'Conservative_Tracers'; }
        else if (key === 'suspend-sediment') { subKey = 'Suspend_Sediment'; }
        else if (key === 'coliform') { subKey = 'Coliform'; }
        else { 
            obj.timePreviewContainer.style.display = 'none'; 
            obj.timePreview.value = ''; name.value = ''; 
            to_usefors.innerHTML = ''; usefors.value = ''; return;
        }
        if (waqModel.value !== '') { subKey = waqModel.value; }
        const data = await jsonLoader('wq_time_from_waq', { key: subKey });
        if (data.status === "error") {
            obj.timePreviewContainer.style.display = 'none'; 
            obj.timePreview.value = ''; alert(data.message); return;
        };
        name.value = subKey; useforsFrom = data.froms;
        [from_usesfor, from_initial].forEach(select => { 
            data.froms.forEach(item => {
                const option = document.createElement('option');
                option.value = item; option.text = item;
                select.add(option);
            }); 
        });
    });
}