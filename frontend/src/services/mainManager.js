import { projectMaker, projectLoader } from "./projectManager.js";
import { 
    initGrid, addWidget, loadWidget, saveWidget, hasWidget 
} from "./widgetFunctions.js"; 
import { startLoading, stopLoading, jsonLoader, htmlLoader } from "./commonFunctions.js"; 

const widgetMenu = document.getElementById("widgetMenu"); 
const submenu = document.getElementById("submenu"); 

const githubCache = {}, currentProject = 'demo', currentParams = [];
let isLoaded = false, userName = null; 



await login(); await projectChecker(); showNotes();
updateComponent(); widgetMenuManager(); loadWidget();

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
    widgetMenu.addEventListener("click", async () => { 
        if (!isLoaded) { 
            const res = await htmlLoader('getWidgetMenu'); 
            if (!res) { alert('Could not load menu.'); return; } 
            submenu.innerHTML = res; isLoaded = true;
        } 
        submenu.style.display = 'flex'; 
    }); 
    // Click outside to close 
    document.addEventListener("click", (e) => { 
        if (!widgetMenu.contains(e.target) && !submenu.contains(e.target)) { submenu.style.display = 'none'; } 
    }); 
    // Submenu click handler 
    submenu.addEventListener("click", (e) => { 
        const item = e.target.closest(".submenu-item"); 
        if (!item) return; 
        const id = item.id, title = item.textContent.trim(), url = item.dataset.url; 
        if (hasWidget(id)) { alert('Widget already exists.'); return; } 
        let w = 5, h = 3;
        // Create a new project
        if (id === 'new-project') { projectMaker(); return; }
        else if (id === 'open-project') { projectLoader(userName); return; }
        else if (id === 'map') { w = 12; h = 5; } 
        else if (id === 'grid-generation') { w = 12; h = 9; } 
        else if (id === 'about') { w = 11; h = 10; } 
        addWidget( w, h, title, id, url); 
        submenu.style.display = 'none'; 
        saveWidget(); 
    }); 
    document.addEventListener("click", (e) => { 
        // Close button handler 
        if (e.target.classList.contains("remove-btn")) { 
            const widget = e.target.closest(".grid-stack-item"); 
            if (widget) { 
                // const mapWidget = widget.getAttribute("gs-id"); 
                // if (mapWidget === 'map') { 
                //     const isConfirmed = confirm( "Closing the map widget will prevent you from interacting with the map.\nAre you sure you want to continue?" ); 
                //     if (!isConfirmed) return; 
                // } 
                initGrid().removeWidget(widget); 
            } 
        } 
        // Edit title handler 
        if (e.target.classList.contains("widget-title")) { 
            const newTitle = prompt("Enter new title:", e.target.textContent); 
            if (newTitle) { e.target.textContent = newTitle; } 
        } 
        saveWidget(); 
    }); 
}

function updateComponent() {
    // Listen for state change
    window.addEventListener('message', (event) => {
        if (event.data.type === 'addMapWidget') addWidget(12, 6, 'Map', 'map', '');
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