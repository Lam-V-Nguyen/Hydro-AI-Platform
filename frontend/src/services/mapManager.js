import { CENTER, ZOOM, L } from "./constant.js";
import { getPendingRequest, clearPendingRequest } from "./constant.js";


export let currentMap; 
let currentTileLayer = null, timeCounter = null, html='', markersPoints = [],
    pathLine = null, curentPoints = [];
const hoverTooltip = L.tooltip({
    permanent: false, direction: 'bottom',
    sticky: true, offset: [0, 10], className: 'custom-tooltip'
});

function iconAdd(iconUrl, markersPoints, map, pointList) {
    markersPoints.forEach(marker => map.removeLayer(marker)); markersPoints = [];
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
        marker.bindPopup(name); markersPoints.push(marker);
    })
}

function lineAdd(pointContainer, map, lineType) {
    const latlngs = pointContainer
        .map(p => {
            const lat = parseFloat(p[1]);
            const lon = parseFloat(p[2]);
            if (isNaN(lat) || isNaN(lon)) return null;
            return [lat, lon];
        })
        .filter(Boolean);
    if (latlngs.length < 2) return;
    let config = {color: 'orange', weight: 2, dashArray: '5,5'};
    if (lineType === 'Boundary') config = {color: 'red', weight: 2};
    if (pathLine) { pathLine.setLatLngs(latlngs);
    } else { pathLine = L.polyline(latlngs, config).addTo(map); }
    currentMap.fitBounds(pathLine.getBounds());
}

export function renderPreview(request=null) {
    if (markersPoints.length > 0) {
        markersPoints.forEach(marker => currentMap.removeLayer(marker));
        markersPoints = [];
    }
    if (curentPoints.length > 0) curentPoints = [];
    if (!request) return;
    const id = request.requestId;
    if (id === 'pickPoint') { 
        const iconUrl = `/src_frontend/images/station.png?v=${Date.now()}`;
        iconAdd(iconUrl, markersPoints, currentMap, request.content);
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
            let defaultMarker = {radius: 5, color: 'blue', fillColor: 'cyan', fillOpacity: 0.9};
            if (req.lineType === 'Boundary') { defaultMarker = {radius: 5, color: 'red', fillColor: 'blue', fillOpacity: 0.9}; }
            // Add marker
            const marker = L.circleMarker(e.latlng, defaultMarker).addTo(currentMap);
            markersPoints.push(marker);
            // Add point
            curentPoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
            // Plot line
            const latlngs = curentPoints.map(p => [p.lat, p.lng]);
            if (pathLine) { pathLine.setLatLngs(latlngs);
            } else {
                pathLine = L.polyline(latlngs, {
                    color: 'orange', weight: 2, dashArray: '5,5'
                }).addTo(currentMap);
            }


            
        }
        if (req.requestId !== 'pickPath') {
            req.source.postMessage({ requestId: req.requestId, result: result }, '*');
            clearPendingRequest();
            mapContainer.style.cursor = 'grab'; currentMap.closeTooltip(hoverTooltip);
        }
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
            clearPendingRequest(); curentPoints = [];
            currentMap.closeTooltip(hoverTooltip); mapContainer.style.cursor = 'grab';
        }





    });
}