import { CENTER, ZOOM, L, getPendingRequest, clearPendingRequest, origin } from "./constant.js";
import { gridPlotter, polygonPlotter, pointsToPolygon, updateColorbar,
    getColorFromValue, toggleMoveMode, addPointLayer
} from "./unstructuredGrid.js";
import { jsonLoader, signalSender } from "./commonFunctions.js";

export let currentMap;
let currentTileLayer = null, timeCounter = null, html='', markersObs = [], 
    markerCrossSection = [], currentPoints = [], markerBoundary = [], 
    pathCrossSection = null, pathBoundary = null, currentPointsCross = [], 
    currentPointsBoundary = [], waqObs = [], waqLoads = [], gridLayer = null,
    polygonLayer = null, pointLayer = null, orthoLayer = null, tempLine = null;
const configCrossSectionPoint = { color: 'blue', fillColor: 'yellow', radius: 4, fill: true, fillOpacity: 1 }, 
    configBoundaryPoint = { color: 'red', fillColor: 'green', radius: 4, fill: true, fillOpacity: 1 }, 
    configCrossSectionPath = { color: 'blue', weight: 2, dashArray: '5,5' }, 
    configBoundaryPath = {color: 'red', weight: 2};

const hoverTooltip = L.tooltip({
    permanent: false, direction: 'bottom', sticky: true, 
    offset: [0, 10], className: 'custom-tooltip'
});

function iconAdd(iconUrl, markers, map, pointList) {
    if (!pointList || pointList.length === 0) return;
    const customIcon = iconUrl ? L.icon({
        iconUrl: iconUrl, iconSize: [20, 20], popupAnchor: [1, -34],
    }) : null;
    // Add new markers
    pointList.forEach(row => {
        const [name, lat, lon] = row;
        if (!name || isNaN(lat) || isNaN(lon)) return;
        const markerOptions = customIcon ? { icon: customIcon } : {};
        const marker = L.marker(
            [parseFloat(lat), parseFloat(lon)], markerOptions
        ).addTo(map);
        marker.bindPopup(name); markers.push(marker);
    })
}

function lineAdd(pointContainer, map, lineType) {
    const latlngs = pointContainer
        .map(p => {
            const lat = parseFloat(p[1]), lon = parseFloat(p[2]);
            if (isNaN(lat) || isNaN(lon)) return null;
            return [lat, lon];
        })
        .filter(Boolean);
    if (latlngs.length < 2) return;
    if (lineType === 'crossSection') { 
        pathCrossSection = L.polyline(latlngs, configCrossSectionPath).addTo(map);
        currentMap.fitBounds(pathCrossSection.getBounds());
    } else if (lineType === 'boundary') { 
        pathBoundary = L.polyline(latlngs, configBoundaryPath).addTo(map); 
        currentMap.fitBounds(pathBoundary.getBounds());
    }
}

export async function renderPreview(request=null) {
    currentPoints.length = 0; if (!request) return;
    const type = request.requestId;
    if (type === 'pickPoint' || type === 'updateObsPoint') {
        const iconUrl = `/src_frontend/images/station.png?v=${Date.now()}`;
        iconAdd(iconUrl, markersObs, currentMap, request.content.rows);
        if (type === 'updateObsPoint') alert('Observation points are updated.\nSee the map for details.');
    } else if (type === 'pickPath') {
        const pointList = request.content.rows, lineType = request.content.lineType;
        if (!pointList || pointList.length === 0) return;
        lineAdd(pointList, currentMap, lineType);
    } else if (type === 'updateObsPoint') {
        const pointList = request.content.rows, lineType = request.lineType;
        if (!pointList || pointList.length === 0) return;
        lineAdd(pointList, currentMap, lineType);
    } else if (type === 'clearCrossSection') {
        if (pathCrossSection) {
            pathCrossSection.remove(); pathCrossSection = null;
        }
        if (markerCrossSection.length > 0) {
            markerCrossSection.forEach(marker => marker.remove()); 
            markerCrossSection.length = 0;
        }
        currentPointsCross.length = 0; currentPoints.length = 0;
    } else if (type === 'clearBoundary') {
        if (pathBoundary) {
            pathBoundary.remove(); pathBoundary = null;
        }
        if (markerBoundary.length > 0) {
            markerBoundary.forEach(marker => marker.remove()); 
            markerBoundary.length = 0;
        }
        currentPointsBoundary.length = 0; currentPoints.length = 0;    
    } else if (type === 'waqPoint' || type === 'loadsPoint' 
        || type === 'waqUpdate' || type === 'loadsUpdate') {
        let iconUrl = null;
        if (type === 'waqPoint' || type === 'waqUpdate') {
            iconUrl =`/src_frontend/images/waq_obs.png?v=${Date.now()}`
        } else {
            iconUrl =`/src_frontend/images/waq_loads.png?v=${Date.now()}`
        }
        if (type === 'waqUpdate') {
            waqObs.forEach(marker => marker.remove()); waqObs.length = 0;
            iconAdd(iconUrl, waqObs, currentMap, request.content.rows);
        } else if (type === 'loadsUpdate') {
            waqLoads.forEach(marker => marker.remove()); waqLoads.length = 0; 
            iconAdd(iconUrl, waqLoads, currentMap, request.content.rows);
        }
    // } else if (type === 'gridPlotter') {    
    //     const widgetEl = document.querySelector(`[gs-id="${request.content.id}"]`);
    //     const colorbar = widgetEl?.querySelector('.custom-colorbar');
    //     if (!colorbar) return;
    //     gridLayer = gridPlotter(
    //         request.content.legend, request.content.dataLake, 
    //         request.content.dataDepth, currentMap, colorbar
    //     );
    // } else if (type === 'polygonPlotter') { 
    //     polygonLayer = polygonPlotter(
    //         request.content.polygon, currentMap, 
    //         request.content.entireNorway, request.content.zoom
    //     );
    } else if (type === 'clearGridMap') { 
        gridLayer = clearMap(gridLayer, currentMap); 
        polygonLayer = clearMap(polygonLayer, currentMap);
        pointLayer = clearMap(pointLayer, currentMap); 
        orthoLayer = clearMap(orthoLayer, currentMap);
    } else if (type === 'colorbarOption') { 
        const widgetEl = document.querySelector(`[gs-id="${request.content.id}"]`);
        const colorbar = widgetEl?.querySelector('.custom-colorbar');
        if (!colorbar) return; colorbar.style.display = request.content.display;
    } else if (type === 'gridPlot') {
        const layer = request.content.layer;
        const checked = request.content.checked;
        if (layer === 'polygonGrid') {
            polygonLayer = clearMap(polygonLayer, currentMap);
            if (checked) polygonLayer = polygonPlotter(
                request.content.polygon, currentMap, 
                request.content.entireNorway, request.content.zoom
            );
        } else if (layer === 'depthGrid') {
            const widgetEl = document.querySelector(`[gs-id="${request.content.id}"]`);
            const colorbar = widgetEl?.querySelector('.custom-colorbar');
            if (!colorbar) return;
            gridLayer = clearMap(gridLayer, currentMap);
            colorbar.style.display = 'none';
            if (checked) {
                signalSender('showOverlay', 'Plotting depth grid. Please wait...');
                gridLayer = gridPlotter(
                    request.content.legend, request.content.polygon, 
                    request.content.dataDepth, currentMap, colorbar
                );
                signalSender('hideOverlay');
            }
        }
    } else if (type === 'gridOptions') {
        const layer = request.content.layer;
        if (layer === 'vertexGrid') {
            pointLayer = clearMap(pointLayer, currentMap);
            pointLayer = addPointLayer(
                request.content.currentProject, request.content.points, 
                currentMap, request.content.key, request.content.move
            );
            signalSender('updateUIState', { requestId: request.content.requestId });
        } else if (layer === 'refineGrid') {
            const isPointLayer = pointLayer !== null ? true : false;
            if (isPointLayer) {
                orthoLayer = clearMap(orthoLayer, currentMap);
                gridLayer = clearMap(gridLayer, currentMap);
            }
            signalSender('updateUIState', { 
                requestId: request.content.requestId, isPointLayer: isPointLayer
            });
        } else if (layer === 'orthoGrid') {
            const widgetEl = document.querySelector(`[gs-id="${request.content.id}"]`);
            const colorbar = widgetEl?.querySelector('.custom-colorbar');
            if (!colorbar) return;
            const colorbar_title = colorbar.querySelector('.colorbar-title');
            const colorbar_label = colorbar.querySelector('.colorbar-labels');
            const colorbar_color = colorbar.querySelector('.colorbar-gradient');
            if (checked) {
                if (gridLayer === null) { 
                    alert("Please generate grid first."); 
//                 orthoCheckbox().checked = false; return; 
                }
                signalSender('showOverlay', 'Generating Orthogonality Grid. Please wait...');
                const contents = { projectName: request.content.currentProject };
                const response = await jsonLoader('grid_ortho', contents);
                signalSender('hideOverlay');
                if (response.status === "error") { alert(response.message); return; }
                gridLayer = clearMap(gridLayer, currentMap);
                orthoLayer = clearMap(orthoLayer, currentMap); 
                // depthCheckbox().checked = false;
                const vmin = response.content.min, vmax = response.content.max, colorKey = 'ortho';
                orthoLayer = L.geoJSON(response.content.data, {
                    pointToLayer: (feature, latlng) => {
                        const value = Number(feature.properties.orth);
                        const { r, g, b, a } = getColorFromValue(value, vmin, vmax, colorKey);
                        const col = `rgb(${r},${g},${b})`;
                        return L.circleMarker(latlng, {
                            color: col, fillColor: col, radius: 2, fillOpacity: a
                        });
                    },
                    onEachFeature: (feature, layer) => {
                        layer.bindTooltip(`Orthogonality: ${feature.properties.orth}`, {
                            sticky: true, permanent: false, direction: 'center', opacity: 1
                        });
                    }
                }).addTo(currentMap);
                updateColorbar(
                    vmin, vmax, 'Orthogonality', colorKey, 
                    colorbar_color, colorbar_title, colorbar_label
                ); colorbar.style.display = 'block';
            } else {
                orthoLayer = clearMap(orthoLayer, currentMap);
                if (gridLayer === null) colorbar.style.display = 'none';
            }
//         } else if (layer === 'moveGrid') {
//             if (checked) {
//                 currentPoints = [];
//                 if (pointLayer === null) {
//                     alert("Select the button 'Get/Reset Vertexes' to create vertexes first.");
// //                 e.target.checked = false;
//                     return;
//                 }
//                 toggleMoveMode(pointLayer, true);
//                 pointLayer.eachLayer(layer => {
//                     const latlng = layer.getLatLng();
//                     currentPoints.push([latlng.lat, latlng.lng]);
//                 });
//                 if (currentPoints.length === 0) { alert("No vertexes found."); return; }
//                 currentPoints.push(currentPoints[0]);
// //             moveChecked = true; refineChecked = false; deleteChecked = false;
// //             deleteCheckbox().checked = false; refinementCheckbox().checked = false;
//                 signalSender('showOverlay', 'Regenerating vertexes. Please wait...');
//                 const contents = { projectName: request.content.currentProject, pointCollection: currentPoints };
//                 const response = await jsonLoader('vertex_mover', contents); 
//                 signalSender('hideOverlay');
//                 if (response.status === "error") { alert(response.message); return; }
// //             if (!polygonCheckbox().checked) { polygonCheckbox().checked = true; }
//                 polygonLayer = clearMap(polygonLayer, currentMap);
//                 polygonLayer = polygonPlotter(request.content.polygon, currentMap);
//                 pointLayer = clearMap(pointLayer, lakeMap);
//                 pointLayer = addPointLayer(
//                     request.content.currentProject, response.content.point, currentPoints,
//                     request.content.polygon, pointLayer, currentMap, 'moveChecked', true
//                 );
//             } else {
//                 // moveChecked = false; 
//                 toggleMoveMode(pointLayer, false);
//             }




        }











    }
}

export function initMap(mapId='map') { 
    currentMap = L.map(`leaflet-${mapId}`, {
        center:CENTER, zoom: ZOOM, zoomControl: false, attributionControl: true
    }); 
    currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(currentMap); 
    // Add scale bar 
    L.control.scale({imperial: false, metric: true, maxWidth: 200}).addTo(currentMap); 
    setTimeout(() => currentMap.invalidateSize(), 100); 
    // Prepare base map
    const container = document.querySelector(`#leaflet-${mapId}`);
    const baseMapBtn = container.querySelector('.leaflet-basemap-btn'); 
    const baseMapPopup = container.querySelector('.basemap-popup'); 
    baseMapBtn.addEventListener('mouseenter', () => { 
        baseMapPopup.classList.add('show'); clearTimeout(timeCounter); 
        // Hide the popup after 4 seconds 
        timeCounter = setTimeout(() => {
            baseMapPopup.classList.remove('show');
        }, 4000);
    }); 
    // Change base map 
    baseMapPopup.addEventListener('click', (e) => { 
        if (e.target.classList.contains('basemap-option')) { 
            const url = e.target.dataset.url; 
            currentTileLayer.setUrl(url); 
            baseMapPopup.classList.remove('show'); 
        } 
    });
    const mapContainer = currentMap.getContainer();
    currentMap.on('mousemove', (e) => { 
        const req = getPendingRequest();
        if (!req) return;
        if (req.requestId === 'waqUpdate' || req.requestId === 'loadsUpdate') return;
        mapContainer.style.cursor = 'crosshair';
        if (req.requestId === 'pickLocation') { html = 'Pick average latitude';
        } else if (req.requestId === 'pickPoint') { html = 'Select an HYD point';
        } else if (req.requestId === 'pickPath') {
            html = `
            - Click the left mouse button to select points.<br>
            - Right-click to finish the selection.<br>
            - Number of points must be at least 2.<br>
            `;
        } else if (req.requestId === 'pickSource') { html = 'Select a HYD source';
        } else if (req.requestId === 'waqPoint') { html = 'Select a WAQ observation point';
        } else if (req.requestId === 'loadsPoint') { html = 'Select a WAQ load point';
        } else if (req.requestId === 'drawChecked') { html = 'Draw a polygon using the left mouse button';
        } else if (req.requestId === 'gridOptions') { 
            if (req.content.key === 'moveChecked' && req.content.move && req.content.layer === 'vertexGrid') {
                mapContainer.style.cursor = 'move';
                html = 'Move a vertex using the left mouse button';





            } else {
                mapContainer.style.cursor = ''; 
                currentMap.closeTooltip(hoverTooltip);
                currentMap.removeLayer(hoverTooltip);
            }
            







        } else if (req.requestId === 'updateObsPoint') { 
            mapContainer.style.cursor = 'grab'; return;
        }
        hoverTooltip.setLatLng(e.latlng).setContent(html);
        currentMap.openTooltip(hoverTooltip);

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


//     });






    });
    currentMap.on('click', (e) => { 
        let result = null;
        const req = getPendingRequest(); if (!req) return;
        if (req.requestId === 'pickLocation') { 
            result = Number(e.latlng.lat).toFixed(2);
        } else if (req.requestId === 'pickPoint' || req.requestId === 'pickSource'
            || req.requestId === 'waqPoint' || req.requestId === 'loadsPoint') { result = e.latlng;
        } else if (req.requestId === 'pickPath') {
            const isCross = req.lineType === 'crossSection';
            const points = isCross ? currentPointsCross : currentPointsBoundary;
            const markerList = isCross ? markerCrossSection : markerBoundary;
            const configPoint = isCross ? configCrossSectionPoint : configBoundaryPoint;
            const configPath = isCross ? configCrossSectionPath : configBoundaryPath;
            let line = isCross ? pathCrossSection : pathBoundary;
            // Add point
            currentPoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
            points.push({ lat: e.latlng.lat, lng: e.latlng.lng });
            // Add marker
            const marker = L.circleMarker(e.latlng, configPoint).addTo(currentMap);
            markerList.push(marker);
            if (points.length < 2) return;
            const latlngs = points.map(p => [p.lat, p.lng]); 
            // Draw/update line
            if (line) { line.setLatLngs(latlngs); line.setStyle(configPath);
            } else {
                line = L.polyline(latlngs, configPath).addTo(currentMap);
                if (isCross) { pathCrossSection = line; } else { pathBoundary = line; }
            }
        // } else if (req.requestId === 'drawChecked') {
        //     html = "Finish drawing with the right mouse button";
        //     // Add marker
        //     L.circleMarker(e.latlng, {
        //         radius: 5, color: 'red', fillColor: 'pink', fillOpacity: 0.9
        //     }).addTo(currentMap);
        //     currentPoints.push([e.latlng.lat, e.latlng.lng]);
        //     // Plot polygon
        //     if (tempLine) { tempLine.setLatLngs(pointContainer);
        //     } else {
        //         tempLine = L.polyline(pointContainer, { 
        //             color: 'red', weight: 2
        //         }).addTo(currentMap);
        //     }
        //     clearPendingRequest();
        //     mapContainer.style.cursor = 'grab'; currentMap.closeTooltip(hoverTooltip);


        }





        if (req.requestId !== 'pickPath') {
            req.source.postMessage({ requestId: req.requestId, result: result }, origin);
            clearPendingRequest();
            mapContainer.style.cursor = 'grab'; currentMap.closeTooltip(hoverTooltip);
        }
    });
    currentMap.on('contextmenu', async (e) => { 
        e.originalEvent.preventDefault();
        const req = getPendingRequest(); if (!req) return;
        // Right-click
        if (req.requestId === 'pickPath') {
            if (currentPoints.length < 2) {
                alert("Not enough points selected.\nPlease select at least 02 points."); return;
            }
            req.source.postMessage({ requestId: req.requestId, result: currentPoints }, origin);
        // } else if (req.requestId === 'drawChecked') {
        //     if (currentPoints.length < 3) {
        //         alert("Polygon must have at least 3 points."); return;
        //     }
        //     tempLine = clearMap(tempLine, currentMap);
        //     polygonLayer = clearMap(polygonLayer, currentMap);
        //     // Plot polygon
        //     await pointsToPolygon(
        //         req.content.currentProject, currentPoints, polygonLayer, 
        //         pointLayer, currentMap, req.content.action
        //     ); 
        //     // drawChecked = false;




        }
        clearPendingRequest(); currentPoints.length = 0;
        mapContainer.style.cursor = 'grab'; currentMap.closeTooltip(hoverTooltip); 
    });
}

function clearMap(layer, map) {
    if (layer) { map.removeLayer(layer); }
    return null;
}

export function getColor(id){
    const hue = (id * 57) % 360;
    return `hsl(${hue},70%,60%)`;
}