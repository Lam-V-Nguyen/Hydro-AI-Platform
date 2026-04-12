import { initMap, map } from "./mapManager.js";

let grid;

export function initGrid() {
    const element = document.getElementById('grid-stack');
    grid = GridStack.init({
        cellHeight: 80, column: 12, margin: "10px 1px",
        draggable: { handle: '.widget-header' },
        resizable: { handles: 'all' }
    }, element);
    grid.on('change', saveWidget); grid.on('added', saveWidget);
    grid.on('removed', saveWidget); grid.on('dragstop', saveWidget);
    grid.on('resizestop', saveWidget);
}
export function getGrid() {
    return grid;
}
export function saveWidget() {
    const layout = getGrid().save();
    layout.forEach(item => {
        const el = document.querySelector(`[gs-id="${item.id}"]`);
        if (!el) return;
        // Title
        item.title = el.querySelector('.widget-title')?.textContent;
        // Iframe
        const iframe = document.querySelector('.widget-iframe');
        if (iframe) item.iframeUrl = iframe?.src;
        // Map
        if (item.id === 'map' && map) {
            item.mapState = { center: map.getCenter(), zoom: map.getZoom() };
            setTimeout(() => { map.invalidateSize(); }, 100);
        }
    });
    localStorage.setItem('grid-layout', JSON.stringify(layout));
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
    const layout = JSON.parse(saved);
    getGrid().load(layout.map(item => ({
        ...item, content: createWidgetHTML(item.title, item.id, item.iframeUrl)
    })));
    // Init map
    setTimeout(() => {
        layout.forEach(item => {
            const el = document.querySelector(`[gs-id="${item.id}"]`);
            // Restore title
            el.querySelector('.widget-title').textContent = item.title;
            // Restore iframe
            const iframe = document.querySelector('.widget-iframe');
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

export function addWidget(w, h, title, id, iframeUrl) {
    grid.addWidget({
        x: 0, y: 0, w: w, h: h, id: id,
        content: createWidgetHTML(title, id, iframeUrl)
    });
    if (id === 'map') { setTimeout(() => initMap(id), 50); }
    saveWidget();
}

export function exitWidget(id) {
    const nodes = getGrid().engine.nodes;
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







