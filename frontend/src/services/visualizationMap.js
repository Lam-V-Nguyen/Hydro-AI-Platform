import { CENTER, ZOOM, L, getStateVisualization } from "./constant.js";

export let map;
let currentTileLayer = null, mapContainer = null, timeCounter = null, html = null;

const hoverTooltip = L.tooltip({
    permanent: false, direction: 'bottom',
    sticky: true, offset: [0, 10], className: 'custom-tooltip'
});

const $ = (id) => document.getElementById(id);
const obj = { baseMap: $("basemap-btn") };

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
    map.on('mousemove', function (e) { 
        if (getStateVisualization().isPathQuery) {
            html = `- Click the left mouse button to draw a profile.<br>- Right-click to finish.`;
        } else if (getStateVisualization().isThemocline) {
            html = `- Click the left mouse button to select a point.<br>- Then change the name (optional).`;
        } else { 
            map.closeTooltip(hoverTooltip); mapContainer.style.cursor = ""; return; 
        }
        hoverTooltip.setLatLng(e.latlng).setContent(html);
        map.openTooltip(hoverTooltip);
    });
}