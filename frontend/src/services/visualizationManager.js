import { L, getState, setState, initState } from "./constant.js";
import { getUser, signalSender, jsonLoader, moveWindow, closeWindow } from "./commonFunctions.js";
import { locationFinder, initializeMenu, projectChecker } from "./visualization.js";
import { map, initMap } from "./visualizationMap.js";


const $ = (id) => document.getElementById(id);
const obj = {
    baseMap: $("basemap-btn"), locationSearcher: $("search"), locationList: $("suggestions"), 
    popupMenu: $("popup-menu"), closeSummaryBtn: $("close-summary-btn"),
    summaryContainer: $("summary-container"), summaryHeader: $("summary-header"), 
    closeTimeSeriesBtn: $("close-time-series-btn"), timeSeriesContainer: $("time-series-container"),
    timeSeriesHeader: $("time-series-header"), substanceContainer: $("substance-container"), 
    substanceHeader: $("substance-header"), closeSubstanceBtn: $("close-substance-btn"), 
    profileContainer: $("profile-window"), profileHeader: $("profile-header"), 
    closeProfileBtn: $("close-profile-btn")
}


let currentProject = null, currentParams = null, userName = null, 
    model = null, waqName = null, hideTimeout = null, gisLayers = {};


await getProject(); await initMap(); updateManager();

async function getProject() { 
    userName = await getUser(); userName = userName.split('/').shift();
    initState(userName);
    currentProject = getState()?.currentProject || 'demo';
    model = getState()?.waqModel || 'coliform';
    currentParams = getState()?.currentParams || 
        ['FlowFM_his.zarr', 'FlowFM_map.zarr', 'Coliform_his.zarr', 'Coliform_map.zarr'];
    setState({ currentProject: currentProject, currentParams: currentParams, waqModel: model });
    waqName = currentParams[2].replace('_his.zarr', '');
    const message = `Initializing project '${getState().currentProject}' and WAQ model '${waqName}'.\nPlease wait...`;
    await projectChecker(
        getState().currentProject, getState().currentParams, getState().waqModel, message
    );
}

function updateManager() { 
    // Search locations
    locationFinder(obj.locationSearcher, obj.locationList, map);
    initializeMenu(waqName); 
    // Show popup menu on click or leave
    if (obj.popupMenu) {
        obj.popupMenu.addEventListener('mouseenter', () => {
            obj.popupMenu.classList.add('show');
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
        });
        obj.popupMenu.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                obj.popupMenu.classList.remove('show');
            }, 500);
        });
    };
    document.addEventListener('change', async (e) => {
        // Change WAQ model
        if (e.target.classList.contains('waq-model-selector')) {
            const modelType = e.target.value;
            waqName = e.target.closest('label').dataset.name;
            const message = `Opening WAQ Model '${waqName}'.\nPlease wait...`;
            const params = [
                'FlowFM_his.zarr', 'FlowFM_map.zarr', `${waqName}_his.zarr`, `${waqName}_map.zarr`
            ];
            setState({ currentParams: params }); setState({ waqModel: modelType });
            await projectChecker(getState().currentProject, params, modelType, message, false);
            initializeMenu(waqName); 
        }




    });
    // Moving window
    moveWindow(obj.summaryHeader, obj.summaryContainer);
    closeWindow(obj.closeSummaryBtn, obj.summaryContainer);
    moveWindow(obj.timeSeriesHeader, obj.timeSeriesContainer);
    closeWindow(obj.closeTimeSeriesBtn, obj.timeSeriesContainer);
    moveWindow(obj.profileHeader, obj.profileContainer);
    closeWindow(obj.closeProfileBtn, obj.profileContainer);
    moveWindow(obj.substanceHeader, obj.substanceContainer);
    closeWindow(obj.closeSubstanceBtn, obj.substanceContainer);






    document.addEventListener('click', (e) => {
        // Hide suggestions for location search
        if (e.target !== obj.locationSearcher) {
            obj.locationSearcher.value = '';
            obj.locationList.style.display = 'none';
        }
        // Close the popup menu if clicked outside
        if (obj.popupMenu && !obj.popupMenu.contains(e.target)) {
            obj.popupMenu.classList.remove('show');
        }
        // Toogle the menu if click on menu-link
        const handleMenuClick = (e, linkClass, submenuClass) => {
            const link = e.target.closest(linkClass);
            if (!link) return false;
            // e.preventDefault(); e.stopPropagation();
            const submenu = link.nextElementSibling;
            if (!submenu || !submenu.classList.contains(submenuClass)) return true;
            // Close other submenus and remove active on menu-links
            document.querySelectorAll(`.${submenuClass}.open`).forEach(s => {
                if (s !== submenu) s.classList.remove('open');
            });
            // Remove active class from other menu-links
            document.querySelectorAll(`${linkClass}.active`).forEach(l => {
                if (l !== link) l.classList.remove('active');
            });
            // Toggle class open
            submenu.classList.toggle('open');
            link.classList.toggle('active');
            return true;
        }
        if (handleMenuClick(e, '.menu-link', 'submenu')) return;
        if (handleMenuClick(e, '.menu-link-1', 'submenu-1')) return;
    });
    obj.popupMenu.addEventListener('click', async (e) => {
        // Show/hide GIS layers
        if (e.target.type === 'checkbox' && e.target.className === 'layer-gis') {
            const id = e.target.id, value = e.target.checked;
            await GISLayerChange(currentProject, id, value);
        }
        // Delete GIS layer
        if (e.target.classList.contains('delete-btn')) {
            // e.stopPropagation(); e.preventDefault();
            const id = e.target.id.replace('delete-', '');
            signalSender('showOverlay', 'Deleting GIS Layer.\nPlease wait...');
            const data = await jsonLoader('delete_gis', { projectName: currentProject, name: id });
            if (data.status === "error") { signalSender('hideOverlay'); alert(data.message); return; }
            await GISLayerChange(currentProject, id, false);
            const rowDiv = e.target.parentNode; if (rowDiv) {rowDiv.remove();}
            signalSender('hideOverlay');
        }
    });
}

async function GISLayerChange(currentProject, id, checked){
    setState({gisLayers: {...getState().gisLayers, [id]: checked}});
    if (!checked) {
        if (gisLayers[id]) { map.removeLayer(gisLayers[id]); }
        return;
    }
    if (gisLayers[id]) { map.addLayer(gisLayers[id]); return; }
    // Load gis layer
    signalSender('showOverlay', 'Loading GIS Layer.\nPlease wait...');
    const response = await jsonLoader('get_gis_layer', { projectName: currentProject, layer: id });
    if (response.status === "error") { signalSender('hideOverlay');; alert(response.message); return; }
    const hue1 = Math.floor(Math.random() * 360), hue2 = Math.floor(Math.random() * 360);
    const fillColor = `hsl(${hue1}, 70%, 50%)`, color = `hsl(${hue2}, 70%, 50%)`;
    const layer = L.geoJSON(response.content, { renderer: L.canvas(),
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 3, fillColor: fillColor, color: color,
                weight: 1, opacity: 1, fillOpacity: 0.8
            });
        },
        style: feature => {
            switch (feature.geometry.type) {
                case 'LineString': 
                case 'MultiLineString':
                    return { color: color, weight: 2 };
                case 'Polygon':
                case 'MultiPolygon':
                    return { color: color, fillColor: fillColor, fillOpacity: 0.5, weight: 1 };
                default: return {};
            }
        },
        onEachFeature: (feature, l) => {
            l.on('click', () => {
                if (!feature.properties) return;
                const content = Object.entries(feature.properties)
                    .map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br>')
                l.bindPopup(`<div style="max-height: 200px; overflow-y: auto;
                    overflow-x: hidden;">${content}</div>`).openPopup();
            });
        }
    });
    gisLayers[id] = layer; map.addLayer(layer); 
    if (layer.getLayers().length < 2000) { map.fitBounds(layer.getBounds()); }
    signalSender('hideOverlay');
}



// export async function openDemoProject() { 
//     const currentProject = getState().currentProject, currentParams = getState().currentParams;
//     await projectChecker(currentProject, currentParams);
//     // Load temperature dynamic map
//     const query = '|-1', key = 'temp_multi_dynamic', titleColorbar = 'Temperature (°C)';
//     const colorbarKey = 'Layer: Average temperature';
//     plot2DMapDynamic(false, query, key, titleColorbar, colorbarKey);
// }

// function refresh() {
//     // Close windows if open
//     if (summaryWindow().style.display !== 'none') summaryWindow().style.display = 'none';
//     if (plotWindow().style.display !== 'none') plotWindow().style.display = 'none';
//     if (substanceWindowHis().style.display !== 'none') substanceWindowHis().style.display = 'none';
// }

// function hideMap() {
//     // Clear map
//     map.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer); });
//     timeControl().style.display = 'none'; colorbar_container().style.display = 'none';
//     colorbar_vector_container().style.display = 'none';
//     if (substanceWindowMap().style.display !== 'none') substanceWindowMap().style.display = 'none';
// }






// function updateEvents() {



//     map.on('mousemove', function (e) {
//         if (!pickerState.location && !pickerState.point && !pickerState.source && !pickerState.crosssection && 
//             !pickerState.boundary) {
//             if (hoverTooltip) map.closeTooltip(hoverTooltip);
//             mapContainer().style.cursor = 'grab'; return;
//         }
//         if (pickerState.crosssection || pickerState.boundary) {
//             if (!hoverTooltip) hoverTooltip = L.tooltip({
//                 permanent: false, direction: 'bottom',
//                 sticky: true, offset: [0, 10],
//                 className: 'custom-tooltip'
//             });
//             const html = `- Click the left mouse button to select a point.<br>- Right-click to finish the selection.`;
//             hoverTooltip.setLatLng(e.latlng).setContent(html);
//             map.openTooltip(hoverTooltip);
//         }
//         mapContainer().style.cursor = 'crosshair';
//     })
//     map.on('click', function(e) {
//         if (pickerState.location) { hidePicker('location', e.latlng, 'locationPicked'); }
//         if (pickerState.point) { 
//             // Add marker
//             const marker = L.marker([parseFloat(e.latlng.lat), parseFloat(e.latlng.lng)]).addTo(map);
//                 markersPoints.push(marker);
//             hidePicker('point', e.latlng, 'pointPicked'); 
//         }
//         if (pickerState.crosssection && e.type === "click" && e.originalEvent.button === 0) { 
//             // Add marker
//             const marker = L.circleMarker(e.latlng, {
//                 radius: 5, color: 'blue', fillColor: 'cyan', fillOpacity: 0.9
//             }).addTo(map);
//             markersCrosssection.push(marker);
//             // Add point
//             crosssectionContainer.push({ lat: e.latlng.lat, lng: e.latlng.lng });
//             // Plot line
//             const latlngs = crosssectionContainer.map(p => [p.lat, p.lng]);
//             if (pathLineCrosssection) { pathLineCrosssection.setLatLngs(latlngs);
//             } else {
//                 pathLineCrosssection = L.polyline(latlngs, {
//                     color: 'orange', weight: 2, dashArray: '5,5'
//                 }).addTo(map);
//             }
//         }
//         if (pickerState.boundary && e.type === "click" && e.originalEvent.button === 0) { 
//             // Add marker
//             const marker = L.circleMarker(e.latlng, {
//                 radius: 5, color: 'red', fillColor: 'pink', fillOpacity: 0.9
//             }).addTo(map);
//             markersBoundary.push(marker);
//             boundaryContainer.push({ lat: e.latlng.lat, lng: e.latlng.lng });  // Add point
//             // Plot line
//             const latlngs = boundaryContainer.map(p => [p.lat, p.lng]);
//             if (pathLineBoundary) { pathLineBoundary.setLatLngs(latlngs);
//             } else {
//                 pathLineBoundary = L.polyline(latlngs, {
//                     color: 'orange', weight: 2, dashArray: '5,5'
//                 }).addTo(map);
//             }
//         }
//         if (pickerState.source) { 
//             const marker = L.marker([parseFloat(e.latlng.lat), parseFloat(e.latlng.lng)]).addTo(map);
//                 markersPoints.push(marker);
//             hidePicker('source', e.latlng, 'sourcePicked'); 
//         }
//     });
//     map.on('contextmenu', function(e) {
//         e.originalEvent.preventDefault(); // Suppress context menu
//         // Right-click
//         if (pickerState.crosssection) {
//             if (crosssectionContainer.length < 2) {
//                 alert("Not enough points selected. Please select at least two points."); return;
//             }
//             hidePicker('crosssection', crosssectionContainer, 'crossSectionPicked');
//         }
//         if (pickerState.boundary) {
//             if (boundaryContainer.length < 2) {
//                 alert("Not enough points selected. Please select at least two points."); return;
//             }
//             hidePicker('boundary', boundaryContainer, 'boundaryPicked');
//         }
//         if (hoverTooltip) map.closeTooltip(hoverTooltip); // Remove tooltip
//     });
// }






