import { CENTER, ZOOM } from "./constant.js";

export let map;
let currentTileLayer = null;

export function initMap(mapId){
    map = L.map(`leaflet-${mapId}`, {center:CENTER, zoom: ZOOM, zoomControl: false, attributionControl: true});
    currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    // Add scale bar
    L.control.scale({imperial: false, metric: true, maxWidth: 200}).addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    // return map;
}


