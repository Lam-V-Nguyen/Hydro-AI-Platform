import { menuManager } from "./menuManager.js";
import { projectMaker, projectModifier, pdfOpener } from "./projectManager.js";
import { initGrid, addWidget, loadWidget, saveWidget, hasWidget } from "./widgetFunctions.js"; 
import { startLoading, stopLoading, jsonLoader, htmlLoader, 
    waitForWidgetReady } from "./commonFunctions.js"; 
import { setPendingRequest, clearPendingRequest } from "./constant.js";
import { renderPreview } from "./mapManager.js";
import { chartManager } from "./chartManager.js";


const widgetMenu = document.getElementById("widgetMenu"); 
const menuContainer = document.getElementById('menu-container');

const githubCache = {}, currentProject = 'demo', currentParams = [];
let isLoaded = false, userName = null; 
// const exits = ['hyd-plot-source', 'hyd-plot-meteo', 'run-hyd', 'run-waq'];

await login(); await projectChecker(); showNotes(); loadWidget();
widgetMenuManager(); updateComponent(); 
// showGitHubLastUpdate('Lam-V-Nguyen', 'Hydro-AI-Platform', 'dev'); 


async function login() { 
    const data = await jsonLoader('auth_check', {}); 
    if (data.user === 'admin') { userName = ''; } else { userName = `${ data.user }`; } 
}

async function projectChecker() { 
    if (userName === 'admin' || userName === null) return; 
    startLoading('Setting up Database.\nThis takes a while (especially the first time). Please wait...'); 
    // await new Promise(requestAnimationFrame);
    const data = await jsonLoader('setup_database', { 
        projectName: currentProject, params: currentParams
    }); stopLoading();
    if (data.status === "error") { alert(data.message); return; } 
    userName = data.user;
} 

function widgetMenuManager() {
    widgetMenu.addEventListener("mouseenter", (e) => {
        e.target.dispatchEvent(new Event('click'));
    })
    widgetMenu.addEventListener("click", async () => { 
        if (!isLoaded) { 
            const res = await htmlLoader('getWidgetMenu'); 
            if (!res) { alert('Could not load menu.'); return; }
            menuManager(menuContainer, res); isLoaded = true;
        } 
        menuContainer.style.display = 'flex'; 
    }); 
    // Menu click handler 
    menuContainer.addEventListener("click", (e) => { 
        const item = e.target.closest(".submenu-item") || e.target.closest(".menu-link"); 
        if (!item) return;
        const id = item.id; if (!id) return;
        const title = item.textContent.replace(/▸|◂/g, '').trim();
        const url = item.dataset?.url;
        let w = 11, h = 7;
        const closeMenu = () => { menuContainer.style.display = 'none'; saveWidget(); };
        if (hasWidget(id)) { alert('Widget already exists.'); closeMenu(); return; }
        if (id === 'new-project') { projectMaker(); closeMenu(); return; }
        else if (id === 'open-project') { projectModifier(userName, 'open'); closeMenu(); return; }
        else if (id === 'delete-project') { projectModifier(userName, 'delete'); closeMenu(); return; }
        else if (id === 'help-docs') { pdfOpener(url); closeMenu(); return; }
        else if (id === 'run-hyd') { w = 9; h = 2; }
        else if (id === 'run-waq') { w = 7; h = 2; }
        else if (id === 'visualization') { w = 12; h = 9; }
        else if (id === 'about') { w = 8; h = 5; }
        addWidget(w, h, title, id, url); closeMenu();
    });
    document.addEventListener("click", (e) => { 
        // Close button handler 
        if (e.target.classList.contains("remove-btn")) { 
            const widget = e.target.closest(".grid-stack-item"); 
            if (widget) initGrid().removeWidget(widget); 
        } 
        // Edit title handler 
        if (e.target.classList.contains("widget-title")) { 
            const newTitle = prompt("Enter new title:", e.target.textContent); 
            if (newTitle) { e.target.textContent = newTitle; } 
        } 
        saveWidget(); 
    });
    // // Check whether widget exists and remove
    // const layoutStr = localStorage.getItem('grid-layout');
    // if (layoutStr) {
    //     let layout = JSON.parse(layoutStr);
    //     layout = layout.filter(item => !exits.includes(item.id));
    //     localStorage.setItem('grid-layout', JSON.stringify(layout));
    // }



}

function updateComponent() {
    clearPendingRequest();
    // Listen for state change
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'addMapWidget') { // Add map
            const id = event.data.content.id;
            if (!hasWidget(id)) addWidget(12, 6, event.data.content.title, id);
        } else if (event.data.type === 'GET_USER') { // Get project destination
            const project = document.querySelector(".project-note");
            if (!project) return;
            const content = project.textContent.split(':').pop().split('/').shift().trim();
            event.source.postMessage({ type: 'USER', content: content }, '*');
        } else if (event.data.id === 'hyd') {
            const req = { 
                source: event.source, lineType: event.data.lineType,
                requestId: event.data.requestId, content: event.data.content
            };
            setPendingRequest(req); renderPreview(req);
        } else if (event.data.type === 'showOverlay') { 
            startLoading(event.data.message);
            await new Promise(requestAnimationFrame);
        } else if (event.data.type === 'hideOverlay') { 
            stopLoading(); await new Promise(requestAnimationFrame);
        } else if (event.data.type === 'updateObsPoint') { 
            const req = { 
                source: event.source, requestId: event.data.type, 
                content: event.data.content
            };
            setPendingRequest(req); renderPreview(req);
        } else if (event.data.type === 'clearCrossSection') { 
            renderPreview({ requestId: event.data.type });
        } else if (event.data.type === 'clearBoundary') { 
            renderPreview({ requestId: event.data.type });
        } else if (event.data.type === 'plotSource') {
            startLoading('Initializing data for time series graph. Please wait...');
            const rows = event.data.rows, columns = event.data.columns;
            const chartData = { columns, data: rows }, id = event.data.id;
            const width = 1200, height = 300, iframeSource = '/src_frontend/htmls/timeSeriesUI.html';
            if (!hasWidget(id)) addWidget(9, 7, event.data.titleWindow, id, iframeSource);
            const iframe = await waitForWidgetReady(id);
            await new Promise( r => setTimeout(r, 200));
            await chartManager(iframe, chartData, event.data.title, 'Time', 'Value', width, height);
            stopLoading();
        // } else if (event.data.type === 'init-simulation') { 
        //     console.log(mode);
        //     const iframe = await waitForWidgetReady(mode);
        //     if (!iframe) return;
        //     await simulationManager(iframe, mode);

        }
    });



}

async function showGitHubLastUpdate(username, repo, branch = 'main') {
    const url = `https://api.github.com/repos/${username}/${repo}/commits?sha=${branch}&per_page=1`;
    const key = `${username}/${repo}/${branch}`;
    if (githubCache[key]) {
        document.querySelector('.github-last-update').textContent = githubCache[key];
        return;
    }
    const displayDiv = document.querySelector('.github-last-update');
    if (!displayDiv) return;
    try {
        const header = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "Hydro-AI-Platform"
        }
        const response = await fetch(url, { headers: header });
        if (!response.ok) throw new Error('GitHub API error');
        const data = await response.json();
        if (data.length > 0) {
            const date = new Date(data[0].commit.committer.date);
            const formatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            const text = `Branch: ${branch} | Last update: ${formatted}`;
            githubCache[key] = text; displayDiv.textContent = text;
        } else {
            displayDiv.textContent = 'Last update: unknown';
        }
    } catch (err) { console.error(err); displayDiv.textContent = 'Last update: error'; }
}

function showNotes() {
    const noteDiv = document.querySelector('.project-note');
    if (!noteDiv || !userName) return;
    noteDiv.textContent = `Project: ${userName}`;
}