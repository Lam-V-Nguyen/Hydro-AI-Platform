import { jsonLoader, signalSender, splitLines } from "./commonFunctions.js";
import { L, ZOOM, getStateVisualization, setStateVisualization } from "./constant.js";
import { map } from "./visualizationMap.js";
import { plotChart, plotProfileSingleLayer, plotProfileMultiLayer } from "./chartManager.js";


const $ = (id) => document.getElementById(id);
const obj = { 
    summaryContainer: $("summary-container"), summaryContent: $('summaryChart'),
    summaryTitle: $("summary-title"), timeSeriesContainer: $("time-series-container"),
    colorBarTitle: $("colorbar-title"), profileContainer: $("profile-window")
}

let objContent = null, currentProject = null, pathLine = null, 
    selectedMarkers = [], pointContainer = [];

function checkUpdater(setLayer, objCheckbox, checkFunction){
    objCheckbox.checked = getStateVisualization()[setLayer] !== null;
    objCheckbox.addEventListener('change', async (e) => {
        if (e.target.checked) { 
            const layer = await checkFunction();
            setStateVisualization({[setLayer]: layer});
        } else { 
            const currentLayer = getStateVisualization()[setLayer];
            if (currentLayer) { map.removeLayer(currentLayer); }
            setStateVisualization({[setLayer]: null}); }
    });
}

export function generalOptionsManager(projectName){
    const popupContent = document.getElementById('popup-content');
    const $$ = (id) => popupContent.querySelector(`#${id}`);
    objContent = {
        projectSummaryOption: $$('projectSummaryOption'), hydStation: $$('hyd-obs-checkbox'),
        sourceStation: $$('source-checkbox'), crossSection: $$('cross-section-checkbox'),
        waqObsStation: $$('waq-obs-checkbox'), waqLoadsStation: $$('waq-loads-checkbox'),
        pathQuery: $$('path-query-checkbox'),


    }
    currentProject = projectName; generalEvents(); pathEvents(); 
    // Plot thermocline for hydrodynamic simulation
//     thermoclineHYD().addEventListener('click', () => {
//         if (updateStatus()) { updateStatus().innerHTML = 'Last Option: Thermocline for Hydrodynamic Simulation'; }
//         const titleX = 'Temperature (°C)', titleY = 'Depth (m)';
//         setState({isThemocline: true}); if (getState().isPathQuery) { deActivePathQuery(); }
//         const chartTitle = 'Thermocline for Hydrodynamic Simulation';
//         const key = 'thermocline_hyd', query = `temp_multi_dynamic`;
//         window.parent.postMessage({type: 'thermoclineGrid', key: key, query: query,
//             titleX: titleX, titleY: titleY, chartTitle: chartTitle, 
//             message: 'Preparing grid for hydrodynamic thermocline plot...'}, '*');
//     });
//     // Plot thermocline for water quality
//     waqSelector().addEventListener('click', () => {
//         hideMap(); if (updateStatus()) { updateStatus().innerHTML = 'Last Option: Vertical Profile for Water Quality Simulation'; }
//         const item = document.getElementById('thermocline-row');
//         if (item) {
//             item.style.display = item.style.display === 'none' ? 'block' : 'none';
//             // Load water quality data
//             initOptions(thermoclineWAQ, 'thermocline_waq'); return;
//         }
//     });
//     thermoclineWAQ().addEventListener('change', () => {
//         const selected = thermoclineWAQ().value, titleY = 'Depth (m)';
//         if (selected === '') { window.parent.postMessage({type: 'thermoclineGridClear'}, '*'); return; };
//         setState({isThemocline: true}); if (getState().isPathQuery) { deActivePathQuery(); }
//         const titleX = thermoclineWAQ().options[thermoclineWAQ().selectedIndex].text;
//         const chartTitle = 'Vertical Profile for Water Quality Simulation';
//         const key = 'thermocline_waq', query = `mesh2d_${selected}`;
//         window.parent.postMessage({type: 'thermoclineGrid', key: key, query: query,
//             titleX: titleX, titleY: titleY, chartTitle: chartTitle, 
//             message: 'Preparing grid for water quality thermocline plot...'}, '*');
//     });
//     configReset().addEventListener('click', async() => { 
//         const currentProject = getState().currentProject, currentParams = getState().currentParams;
//         const data = await sendQuery('reset_config', {projectName: projectName});
//         if (updateStatus()) { updateStatus().innerHTML = 'Last Option: Reset Configuration'; }
//         alert(data.message);
//         window.parent.postMessage({type: 'reset_config', projectName: currentProject, params: currentParams}, '*');
//         return;
//     });


}



function pathEvents() {
    objContent.pathQuery.checked = getStateVisualization().isPathQuery;
    if (getStateVisualization().isPathQuery === false) deActivePathQuery();
    objContent.pathQuery.addEventListener('change', () => { 
        if (objContent.pathQuery.checked) { 
            setStateVisualization({isThemocline: false}); 
            if (getStateVisualization().mapLayer === null){
                alert("No map layer available"); deActivePathQuery();
            } else {
                map.getContainer().style.cursor = "crosshair";
                map.on("click", mapPath); map.on("contextmenu", mapPath);
            }
        } else deActivePathQuery();
        setStateVisualization({isPathQuery: objContent.pathQuery.checked});
    });
}

function generalEvents(){
    objContent.projectSummaryOption.addEventListener('click', async () => { 
        const content = { projectName: currentProject, key: 'summary' };
        const data = await jsonLoader('process_data', content);
        if (data.status === 'error') { alert(data.message); return; }
        const currentDisplay = window.getComputedStyle(obj.summaryContainer).display;
        if (currentDisplay === "none") {
            // Create a table to display the summary
            let html = `<table><thead>
                <tr>
                <th style="text-align: center;">Parameter</th>
                <th style="text-align: center;">Value</th>
                </tr>
            </thead><tbody>`;
            data.content.forEach(item => {
                html += `<tr>
                    <td>${item.parameter}</td>
                    <td>${item.value}</td>
                </tr>`;
            });
            html += `</tbody></table>`;
            obj.summaryContent.innerHTML = html;
            obj.summaryTitle.textContent = `Project Summary - ${currentProject}`;
            // Open the summary window
            obj.summaryContainer.style.display = "flex";
        }
    });
    // 1. Hydrodynamic Observations
    checkUpdater("hydLayer", objContent.hydStation, loadHYDStations);
    // 2. Sources/Sinks Observations
    checkUpdater("sourceLayer", objContent.sourceStation, loadSourceStations);
    // 3. Cross-Section Observations
    checkUpdater("crosssectionLayer", objContent.crossSection, loadCrossSection);
    // 4. Update Water Quality Observation Points
    checkUpdater("wqObsLayer", objContent.waqObsStation, loadWAQStations);
    // 5. Update water quality observation points
    checkUpdater("wqLoadsLayer", objContent.waqLoadsStation, loadWAQLoads);
    // Add event when user clicks on the popup
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('in-situ')) {
            e.preventDefault();
            const [query, colorbarTitle] = e.target.dataset.info.split('|');
            const chartTitle = query.split('*')[1] + ' (' + colorbarTitle.split('(')[0].trim() + ')';
            plotChart(currentProject, obj.timeSeriesContainer, query, '_in-situ', chartTitle, 'Time', colorbarTitle);
        }
        if (e.target && e.target.classList.contains('function')) {
            e.preventDefault();
            const [key, colorbarTitle] = e.target.dataset.info.split('|');
            const chartTitle = colorbarTitle.split('(')[0].trim();
            plotChart(currentProject, obj.timeSeriesContainer, '', key, chartTitle, 'Time', colorbarTitle);
        }
    });
}

// Load hydrodynamic observation points
async function loadHYDStations() {
    signalSender('showOverlay', 'Reading Hydrodynamic Observation Points from Database.\nPlease wait...');
    const content = { projectName: currentProject, key: 'hyd_station' };
    const data = await jsonLoader('process_data', content); // Load data
    if (data.status === "error") { alert(data.message); return; }
    if (getStateVisualization().hydLayer) { map.removeLayer(getStateVisualization().hydLayer); }
    // Add station layer to the map
    const indx = data.message;
    const layer = L.geoJSON(data.content, {
        // Custom marker icon
        pointToLayer: function (feature, latlng) {
            const customIcon = L.icon({
                iconUrl: `/src_frontend/images/station.png?v=${Date.now()}`,
                iconSize: [20, 20], popupAnchor: [1, -34],
            });
            const marker = L.marker(latlng, {icon: customIcon});
            const stationId = feature.properties.name || 'Unknown';
            // Add tooltip
            const info = indx.length > 0 ? '<br>Select object to see values at each layer' : '';
            const value = `<div style="text-align: center; weight: bold; font-size: 16px;"> <b>${stationId}</b>${info}</div>`;
            marker.bindTooltip(value, { permanent: false, direction: 'top', offset: [0, 0] });
            // Get name of the station
            const name = indx.find(item => item[stationId]);
            let popupContent = `<div style="max-height: 200px; overflow-y: auto;">
                <h3 style="text-align: center;">${stationId}</h3>
                <hr style="margin: 5px 0 5px 0;"><ul style="left: 0; cursor: pointer; padding-left: 0;">`;
            if (name && Array.isArray(name[stationId])) {
                name[stationId].forEach(item => {
                    const [key, value] = Object.entries(item)[0];
                    popupContent += `<li style="margin-bottom:5px; line-height:1.3; font-size: 16px;">
                        <a class="in-situ" data-info="${key}*${stationId}*station_name|${value}">• ${value}</a></li>`;
                })
            } else popupContent += `<li><em>No data available</em></li>`;
            popupContent += `</ul></div>`;
            marker.bindPopup(popupContent, {offset: [0, 40]});
            return marker;
        }
    });
    map.addLayer(layer); map.setView(layer.getBounds().getCenter(), ZOOM);
    signalSender('hideOverlay');
    return layer;
}

// Load sources/sinks observation points
async function loadSourceStations() {
    signalSender('showOverlay', 'Reading Sources/Sinks from Database.\nPlease wait...');
    const content = { projectName: currentProject, key: 'sources' };
    const data = await jsonLoader('process_data', content);
    if (data.status === "error") { alert(data.message); return; }
    if (getStateVisualization().sourceLayer) { map.removeLayer(getStateVisualization().sourceLayer); }
    const layer = L.geoJSON(data.content, {
        pointToLayer: function (feature, latlng) {
            const customIcon = L.icon({
                iconUrl: `/src_frontend/images/source.png?v=${Date.now()}`,
                iconSize: [20, 20], popupAnchor: [1, -34],
            });
            const marker = L.marker(latlng, {icon: customIcon});
            const sourceId = feature.properties.name || 'Unknown';
            const value = `<div style="text-align: center;"><b>${sourceId}</b></div>`;
            marker.bindTooltip(value, {
                permanent: false, direction: 'top', offset: [0, 0]
            });
            return marker;
        }
    });
    map.addLayer(layer); map.setView(layer.getBounds().getCenter(), ZOOM);
    signalSender('hideOverlay');
    return layer;
}

// Load cross-section observation path
async function loadCrossSection() {
    signalSender('showOverlay', 'Reading Cross-Sections from Database.\nPlease wait...');
    const content = { projectName: currentProject, key: 'crosssections' };
    const data = await jsonLoader('process_data', content);
    if (data.status === "error") { alert(data.message); showLeafletMap(); return; }
    if (getStateVisualization().crosssectionLayer) { map.removeLayer(getStateVisualization().crosssectionLayer); }
    const indx = data.message;
    const layer = L.geoJSON(data.content, { 
        color: 'blue', weight: 3,
        onEachFeature: function (feature, layer) {
            const name = feature.properties.name || 'Unknown';
            // Add tooltip
            const info = indx.length > 0 ? '<br>Select object to see more information' : '';
            const value = `<div style="text-align: center; weight: bold; font-size: 16px;"> <b>${name}</b>${info}</div>`;
            layer.bindTooltip(value, { permanent: false, direction: 'top', offset: [0, 0] });
            let popupContent = `<div style="max-height: 200px; overflow: auto;">
                <h3 style="text-align: center;">${name}</h3>
                <hr style="margin: 5px 0 5px 0;"><ul style="left: 0; cursor: pointer; padding-left: 0;">`;
            if (Array.isArray(indx) && indx.length > 0) {
                indx.forEach(item => {
                    const [key, value] = Object.entries(item)[0];
                    popupContent += `<li style="margin-bottom:5px; line-height:1.3; font-size: 16px;">
                        <a class="function" data-info="${key}_crs|${value}">• ${value}</a></li>`;
                })
            } else popupContent += `<li><em>No data available</em></li>`;
            popupContent += `</ul></div>`;
            layer.bindPopup(popupContent, {offset: [0, 40]});      
        }
    });
    map.addLayer(layer); map.setView(layer.getBounds().getCenter(), ZOOM);
    signalSender('hideOverlay');
    return layer;
}

async function loadWAQStations() {
    signalSender('showOverlay', 'Loading Water Quality Observation Points from Database.\nPlease wait...');
    const content = { projectName: currentProject, key: 'wq_obs' };
    const data = await jsonLoader('process_data', content);
    if (data.status === "error") { alert(data.message); return; }
    if (getStateVisualization().wqObsLayer) { map.removeLayer(getStateVisualization().wqObsLayer); }
    const layer = L.geoJSON(data.content, {
        // Custom marker icon
        pointToLayer: function (feature, latlng) {
            const customIcon = L.icon({
                iconUrl: `/src_frontend/images/waq_obs.png?v=${Date.now()}`,
                iconSize: [27, 27], popupAnchor: [1, -34],
            });
            const marker = L.marker(latlng, {icon: customIcon});
            const stationId = feature.properties.name || 'Unknown';
            // Add tooltip
            const value = `<div style="text-align: center; weight: bold;">
                    <b>${stationId}</b>
                </div>`;
            marker.bindTooltip(value, {
                permanent: false, direction: 'top', offset: [0, 0]
            });
            return marker;
        }
    });
    map.addLayer(layer); map.setView(layer.getBounds().getCenter(), ZOOM);
    signalSender('hideOverlay');
    return layer;
}

async function loadWAQLoads() {
    signalSender('showOverlay', 'Loading Loads of Water Quality Observation Points from Database.\nPlease wait...');
    const content = { projectName: currentProject, key: 'wq_loads' };
    const data = await jsonLoader('process_data', content);
    if (data.status === "error") { alert(data.message); return; }
    if (getStateVisualization().wqLoadsLayer) { map.removeLayer(getStateVisualization().wqLoadsLayer); }
    const layer = L.geoJSON(data.content, {
        // Custom marker icon
        pointToLayer: function (feature, latlng) {
            const customIcon = L.icon({
                iconUrl: `/src_frontend/images/waq_loads.png?v=${Date.now()}`,
                iconSize: [20, 20], popupAnchor: [1, -34],
            });
            const marker = L.marker(latlng, {icon: customIcon});
            const stationId = feature.properties.name || 'Unknown';
            // Add tooltip
            const value = `<div style="text-align: center; weight: bold;">
                    <b>${stationId}</b>
                </div>`;
            marker.bindTooltip(value, {
                permanent: false, direction: 'top', offset: [0, 0]
            });
            return marker;
        }
    });
    map.addLayer(layer); map.setView(layer.getBounds().getCenter(), ZOOM);
    signalSender('hideOverlay');
    return layer;
}

export function deActivePathQuery() {
    if (objContent.pathQuery !== null) { objContent.pathQuery.checked = false; }
    setStateVisualization({isPathQuery: false});
    if (pathLine) { map.removeLayer(pathLine); pathLine = null;}
    selectedMarkers.forEach(m => map.removeLayer(m));
    selectedMarkers = []; pointContainer = [];
    map.getContainer().style.cursor = "default";
}

async function mapPath(e) {
    if (!getStateVisualization().isPathQuery) return;
    // Right-click
    if (e.type === "contextmenu") {
        e.originalEvent.preventDefault(); // Suppress context menu
        if (pointContainer.length < 2) { alert("Please select at least two points"); return; }
        if (!getStateVisualization().isMultiLayer){
            const titleY = obj.colorBarTitle.textContent;
            const title = 'Profile - Single Layer';
            plotProfileSingleLayer(
                obj.timeSeriesContainer, pointContainer, 
                getStateVisualization().polygonCentroids, title, titleY, 'Distance (m)'
            );
        } else {
            const orderedPoints = splitLines(pointContainer, getStateVisualization().polygonCentroids, 20)
                .map(([dist, , lat, lng]) => [dist, lat, lng]);
            if (orderedPoints.length === 0) { alert("No intersected mesh found"); return; }
            signalSender('showOverlay', 'Acquiring selected meshes from Database.\nPlease wait...');
            const key = !getStateVisualization().isHYD ? 'hyd' : 'waq';
            const unit = obj.colorBarTitle.textContent.split('(')[1].trim().split(')')[0].replace(')', '');
            const title = `Profile - ${obj.colorBarTitle.textContent.split('(')[0].trim()}`;
            const query = getStateVisualization().showedQuery;
            const queryContents = {key: key, query: query, idx: 'load', 
                points: orderedPoints, projectName: currentProject};
            const data = await jsonLoader('select_meshes', queryContents);
            if (data.status === "error") { alert(data.message); return; }
            plotProfileMultiLayer(key, query, data.content, title, unit);
            signalSender('hideOverlay');
        }
    }
    // Left-click
    if (e.type === "click" && e.originalEvent.button === 0) {
        // Check if clicked inside layer
        if (getStateVisualization().isClickedInsideLayer) {
            if (getStateVisualization().isPathQuery) {
                // Add marker
                marker = L.circleMarker(e.latlng, {
                    radius: 5, color: 'blue', fillColor: 'cyan', fillOpacity: 0.9
                }).addTo(map);
                selectedMarkers.push(marker);
                // Add point
                pointContainer.push({ lat: e.latlng.lat, lng: e.latlng.lng });
                // Plot line
                const latlngs = pointContainer.map(p => [p.lat, p.lng]);
                if (pathLine) { pathLine.setLatLngs(latlngs);
                } else { pathLine = L.polyline(latlngs, { 
                    color: 'orange', weight: 2, dashArray: '5,5' }).addTo(map); 
                }
            }
        }
        setStateVisualization({isClickedInsideLayer: false}); // Reset clicked inside layer
    }
}

// function hideMap() {
//     // Clear map
//     map.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer); });
//     if (timeControl().style.display !== 'none') timeControl().style.display = 'none'; 
//     if (colorbar_container().style.display !== 'none') colorbar_container().style.display = 'none';
//     if (colorbar_vector_container().style.display !== 'none') colorbar_vector_container().style.display = 'none';
// }









