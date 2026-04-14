import { getState, setState } from "./constant.js";
import { 
    initGrid, addWidget, loadWidget, saveWidget, hasWidget 
} from "./widgetFunctions.js"; 
import { startLoading, stopLoading, jsonLoader, htmlLoader } from "./commonFunctions.js"; 


const widgetMenu = document.getElementById("widgetMenu"); 
const submenu = document.getElementById("submenu"); 

let isLoaded = false, userName = null; 



await login(); await projectChecker(); 
updateComponent(); widgetMenuManager(); 
loadWidget(); 
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
        projectName: getState().currentProject, params: getState().currentParams 
    }); 
    if (data.status === "error") { alert(data.message); location.reload(); return; } 
    stopLoading(); 
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
        if (id === 'map') { w = 12; h = 5; } 
        else if (id === 'grid-generation') { w = 11; h = 5; } 
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
    const displayDiv = document.querySelector('.github-last-update');
    try {
        const header = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "Hydro-AI-Platform"
        }
        const response = await fetch(url, { headers: header });
        if (!response.ok) throw new Error('GitHub API error');
        const data = await response.json();
        if (data.length > 0) {
            const lastCommit = data[0].commit;
            const date = new Date(lastCommit.committer.date);
            const formatted = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            displayDiv.textContent = `Branch: ${branch} | Last update: ${formatted}`;
        } else {
            displayDiv.textContent = 'Last update: unknown';
        }
    } catch (err) { console.error(err); displayDiv.textContent = 'Last update: error'; }
}