import { CENTER, ZOOM, L } from "./constant.js";

export let map;
let currentTileLayer = null, mapContainer = null, timeCounter = null, 
    timeOut = null, hideTimeout = null;

const hoverTooltip = L.tooltip({
    permanent: false, direction: 'bottom',
    sticky: true, offset: [0, 10], className: 'custom-tooltip'
});



const $ = (id) => document.getElementById(id);
const obj = {
    baseMap: $("basemap-btn"),




}

export async function initMap() { 
    if (map) return;
    map = L.map('leaflet-map', { center: CENTER, zoom: ZOOM, zoomControl: false, attributionControl: true });
    currentTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    L.control.scale({imperial: false, metric: true, maxWidth: 200}).addTo(map);
    setTimeout(() => { map.invalidateSize(); }, 0); mapContainer = map.getContainer();
    const baseMapPopup = document.querySelector('.basemap-popup');
    obj.baseMap.addEventListener('mouseenter', () => { 
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
    // map.on('mousemove', function (e) { 
    //     mapContainer.style.cursor = "grab";
    //     if (refineChecked) {
    //         if (pointContainer.length === 0) { html = "Select start point to refine"; }
    //         hoverTooltip.setLatLng(e.latlng).setContent(html);
    //         map.openTooltip(hoverTooltip);
    //     }
    //     else if (deleteChecked) {
    //         if (pointContainer.length === 0) { html = "Select start point to delete"; }
    //         hoverTooltip.setLatLng(e.latlng).setContent(html);
    //         map.openTooltip(hoverTooltip);
    //     }
    //     if (drawChecked) { 
    //         mapContainer.style.cursor = "crosshair";
    //         if (pointContainer.length === 0) { 
    //             html = `Draw a polygon with the left mouse button`; 
    //         }
    //         hoverTooltip.setLatLng(e.latlng).setContent(html);
    //         map.openTooltip(hoverTooltip);
    //     }
    //     else if (moveChecked) { 
    //         mapContainer.style.cursor = "move";
    //         html = `Move a vertex using the left mouse button`;
    //         hoverTooltip.setLatLng(e.latlng).setContent(html);
    //         map.openTooltip(hoverTooltip);
    //     }
    // });
    // map.on('click', async function (e) {
    //     if (drawChecked) { 
    //         mapContainer.style.cursor = "crosshair";
    //         html = `Finish drawing with the right mouse button`;
    //         // Add marker
    //         L.circleMarker(e.latlng, {
    //             radius: 5, color: 'red', fillColor: 'pink', fillOpacity: 0.9
    //         }).addTo(map);
    //         pointContainer.push([e.latlng.lat, e.latlng.lng]);
    //         // Plot polygon
    //         if (tempLine) { tempLine.setLatLngs(pointContainer);
    //         } else {
    //             tempLine = L.polyline(pointContainer, { 
    //                 color: 'red', weight: 2
    //             }).addTo(map);
    //         }
    //         if (hoverTooltip) map.closeTooltip(hoverTooltip); return; 
    //     }
    // });
    // map.on('contextmenu', async function (e) { 
    //     e.originalEvent.preventDefault();
    //     if (drawChecked) { 
    //         if (pointContainer.length < 3) { 
    //             alert("Polygon must have at least 3 points."); return; 
    //         }
    //         tempLine = clearMap(tempLine, map); 
    //         lakeLayer = clearMap(lakeLayer, map);
    //         // Plot polygon
    //         await drawPolygon(pointContainer); drawChecked = false;
    //         pointContainer = []; mapContainer.style.cursor = "auto";
    //     }
    // });
}