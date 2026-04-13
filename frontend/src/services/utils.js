import { setState, getState } from "./constant.js";
import { initMap, map } from "./mapManager.js";


let gridInstance = null;

export function startLoading(str = '') {
    const loadingContainer = document.querySelector('.loading-container');
    if (!loadingContainer) return;
    loadingContainer.querySelector('.loading-text').textContent = str;
    loadingContainer.style.display = 'flex'; 
}
export function stopLoading() { 
    const loadingContainer = document.querySelector('.loading-container');
    if (!loadingContainer) return;
    loadingContainer.style.display = "none";
}

export function initGrid() {
    if (gridInstance) return gridInstance;
    const element = document.getElementById('grid-stack');
    if (!element) return;
    gridInstance = GridStack.init({
        cellHeight: 80, column: 12, margin: "10px 1px",
        draggable: { handle: '.widget-header' },
        resizable: { handles: 'all' }
    }, element);
    gridInstance.on('change', saveWidget); 
    gridInstance.on('added', saveWidget);
    gridInstance.on('removed', saveWidget); 
    gridInstance.on('dragstop', saveWidget);
    gridInstance.on('resizestop', saveWidget);
    return gridInstance;
}

function createWidgetHTML(title, id, iframeUrl=null) {
    return `
        <div class="widget-header">
            <img src="/src_frontend/images/logo16x16.png">
            <span class="widget-title">${title}</span>
            <button class="remove-btn">x</button>
        </div>
        <div class="widget-body">
            ${id === 'map' ? 
                `<div 
                    id="leaflet-${id}" class="widget-leaflet">
                    <img class="leaflet-compass" src="/src_frontend/images/compass.png">
                    <div class="basemap-container">
                        <button type="button" class="leaflet-basemap-btn">
                            <img src="/src_frontend/images/basemap.png">
                        </button>
                        <div class="basemap-popup">
                            <div><strong>Select Base Map</strong></div>
                            <button class="basemap-option" data-url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png">Open Street Map</button>
                            <button class="basemap-option" data-url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}">Satellite</button>
                            <button class="basemap-option" data-url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}">Street</button>
                            <button class="basemap-option" data-url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png">Carto Light</button>
                            <button class="basemap-option" data-url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png">Carto Dark</button>
                        </div>
                    </div>
                </div>` : 
                `<iframe 
                    id="iframe-${id}" class="widget-iframe" 
                    src="${iframeUrl || '/src_frontend/htmls/error.html'}">
                </iframe>`
            }
        </div>
    `;
}

export function loadWidget() {
    const saved = localStorage.getItem("grid-layout");
    if (!saved) return;
    const layout = JSON.parse(saved), grid = initGrid();
    grid.load(layout.map(item => ({
        ...item, content: createWidgetHTML(item.title, item.id, item.iframeUrl)
    })));
    // Init map
    setTimeout(() => {
        layout.forEach(item => {
            const el = document.querySelector(`[gs-id="${item.id}"]`);
            // Restore title
            el.querySelector('.widget-title').textContent = item.title;
            // Restore iframe
            const iframe = el.querySelector('.widget-iframe');
            if (iframe) iframe.src = item.iframeUrl;
            // Restore map
            if (item.id === 'map') { 
                initMap(item.id); 
                if (item.mapState) {
                    map.setView(item.mapState.center, item.mapState.zoom);
                    setTimeout(() => { map.invalidateSize(); }, 100);
                }
            }
        });
    }, 100);
}
export function saveWidget() {
    const grid = initGrid();
    const layout = grid.save();
    layout.forEach(item => {
        const el = document.querySelector(`[gs-id="${item.id}"]`);
        if (!el) return;
        // Title
        item.title = el.querySelector('.widget-title')?.textContent;
        // Iframe
        const iframe = el.querySelector('.widget-iframe');
        if (iframe) item.iframeUrl = iframe?.src;
        // Map
        if (item.id === 'map' && map) {
            item.mapState = { center: map.getCenter(), zoom: map.getZoom() };
            setTimeout(() => { map.invalidateSize(); }, 100);
        }
    });
    localStorage.setItem('grid-layout', JSON.stringify(layout));
}

export function addWidget(w, h, title, id, iframeUrl) {
    const grid = initGrid();
    grid.addWidget({
        x: 0, y: 0, w: w, h: h, id: id,
        content: createWidgetHTML(title, id, iframeUrl)
    });
    if (id === 'map') { setTimeout(() => initMap(id), 50); }
    saveWidget();
}

export function hasWidget(id) {
    const grid = initGrid();
    const nodes = grid.engine.nodes;
    return nodes.some(node => node.id === id);
}

export async function htmlLoader(functionName){
    const response = await fetch(`/${functionName}`);
    if (!response.ok) { return null; }
    const data = await response.text();
    return data;
}

export async function jsonLoader(functionName, content){
    const response = await fetch(`/${functionName}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(content)});
    const data = await response.json();
    return data;
}