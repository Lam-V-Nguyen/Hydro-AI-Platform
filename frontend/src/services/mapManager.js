import { CENTER, ZOOM, L } from "./constant.js";
import { getPendingRequest, clearPendingRequest } from "./constant.js";


export let currentMap; 
let currentTileLayer = null, timeCounter = null, html='', markersObs = [], markerCrossSection = [], curentPoints = [],
    markerBoundary = [], pathCrossSection = null, pathBoundary = null, currentPointsCross = [], currentPointsBoundary = [];
const configCrossSectionPoint = {color: 'blue', fillColor: 'yellow', radius: 4, fill: true, fillOpacity: 1},
    configBoundaryPoint = {color: 'red', fillColor: 'green', radius: 4, fill: true, fillOpacity: 1},
    configCrossSectionPath = {color: 'blue', weight: 2, dashArray: '5,5'},
    configBoundaryPath = {color: 'red', weight: 2};
const hoverTooltip = L.tooltip({
    permanent: false, direction: 'bottom',
    sticky: true, offset: [0, 10], className: 'custom-tooltip'
});

function iconAdd(iconUrl, markers, map, pointList) {
    const customIcon = L.icon({
        iconUrl: iconUrl, iconSize: [20, 20], popupAnchor: [1, -34],
    });
    // Add new markers
    pointList.forEach(row => {
        const [name, lat, lon] = row;
        if (!name || isNaN(lat) || isNaN(lon)) return;
        const marker = L.marker(
            [parseFloat(lat), parseFloat(lon)], { icon: customIcon }
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

export function renderPreview(request=null) {
    curentPoints.length = 0; if (!request) return;
    const id = request.requestId;
    if (id === 'pickPoint') { 
        const iconUrl = `/src_frontend/images/station.png?v=${Date.now()}`;
        iconAdd(iconUrl, markersObs, currentMap, request.content);
    } else if (id === 'pickPath') {
        const pointList = request.content, lineType = request.lineType;
        if (!pointList || pointList.length === 0) return;
        lineAdd(pointList, currentMap, lineType);
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
        mapContainer.style.cursor = 'crosshair';
        if (req.requestId === 'pickLocation') { html = 'Pick average latitude';
        } else if (req.requestId === 'pickPoint') { html = 'Select observation point';
        } else if (req.requestId === 'pickPath') {
            html = `
            - Click the left mouse button to select points.<br>
            - Right-click to finish the selection.<br>
            - Number of points must be at least 2.<br>
            `;
        }
        


        hoverTooltip.setLatLng(e.latlng).setContent(html);
        currentMap.openTooltip(hoverTooltip);
    });
    currentMap.on('click', (e) => { 
        let result = null;
        const req = getPendingRequest(); if (!req) return;
        if (req.requestId === 'pickLocation') { 
            result = Number(e.latlng.lat).toFixed(2);
        } else if (req.requestId === 'pickPoint') { result = e.latlng;
        } else if (req.requestId === 'pickPath') {
            const isCross = req.lineType === 'crossSection';
            const points = isCross ? currentPointsCross : currentPointsBoundary;
            const markerList = isCross ? markerCrossSection : markerBoundary;
            const configPoint = isCross ? configCrossSectionPoint : configBoundaryPoint;
            const configPath = isCross ? configCrossSectionPath : configBoundaryPath;
            let line = isCross ? pathCrossSection : pathBoundary;
            // Add point
            curentPoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
            points.push({ lat: e.latlng.lat, lng: e.latlng.lng });
            // Add marker
            const marker = L.circleMarker(e.latlng, configPoint).addTo(currentMap);
            markerList.push(marker);
            if (points.length < 2) return;
            const latlngs = points.map(p => [p.lat, p.lng]); 
            // Draw/update line
            if (line) {
                line.setLatLngs(latlngs); line.setStyle(configPath);
            } else {
                line = L.polyline(latlngs, configPath).addTo(currentMap);
                if (isCross) { pathCrossSection = line; } else { pathBoundary = line; }
            }






            
            


            
        }
        if (req.requestId !== 'pickPath') {
            req.source.postMessage({ requestId: req.requestId, result: result }, '*');
            clearPendingRequest();
            mapContainer.style.cursor = 'grab'; currentMap.closeTooltip(hoverTooltip);
        }
        console.log(curentPoints);
    });
    currentMap.on('contextmenu', (e) => { 
        e.originalEvent.preventDefault();
        const req = getPendingRequest(); if (!req) return;
        // Right-click
        if (req.requestId === 'pickPath') {
            if (curentPoints.length < 2) {
                alert(`Not enough points selected.\nPlease select at least 02 points.`); return;
            }
            req.source.postMessage({ requestId: req.requestId, result: curentPoints }, '*');
            clearPendingRequest(); curentPoints.length = 0;
            mapContainer.style.cursor = 'grab'; currentMap.closeTooltip(hoverTooltip); 
        }





    });
}