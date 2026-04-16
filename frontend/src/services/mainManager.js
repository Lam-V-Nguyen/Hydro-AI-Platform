import { menuManager } from "./menuManager.js";
import { projectMaker, projectModifier, pdfOpener } from "./projectManager.js";
import { initGrid, addWidget, loadWidget, saveWidget, hasWidget } from "./widgetFunctions.js"; 
import { startLoading, stopLoading, jsonLoader, htmlLoader } from "./commonFunctions.js"; 

const widgetMenu = document.getElementById("widgetMenu"); 
const menuContainer = document.getElementById('menu-container');

const githubCache = {}, currentProject = 'demo', currentParams = [];
let isLoaded = false, userName = null, hideTimeout = null; 


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
        else if (id === 'visualization') { w = 12; h = 9; }
        else if (id === 'about') { w = 8; h = 5; }
        addWidget( w, h, title, id, url); closeMenu();
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
}

function updateComponent() {
    // Listen for state change
    window.addEventListener('message', (event) => {
        // Get project destination
        if (event.data.type === 'GET_USER') {
            const project = document.querySelector(".project-note");
            if (!project) return;
            const content = project.textContent.split(':').pop().split('/').shift().trim();
            event.source.postMessage({ type: 'USER', content: content }, '*');
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