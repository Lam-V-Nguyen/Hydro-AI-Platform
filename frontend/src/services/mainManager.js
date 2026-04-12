import { jsonLoader, htmlLoader, initGrid, addWidget,
    getGrid, loadWidget, saveWidget, exitWidget
} from "./utils.js";



const widgetMenu = document.getElementById("widgetMenu");
const submenu = document.getElementById("submenu");


let isLoaded = false;


initGrid(); updateComponent(); widgetMenuManager(); loadWidget();
showGitHubLastUpdate('Lam-V-Nguyen', 'Hydro-AI-Platform', 'dev');


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
        if (!widgetMenu.contains(e.target) && !submenu.contains(e.target)) {
            submenu.style.display = 'none';
        }
    });
    // Submenu click handler
    submenu.addEventListener("click", (e) => {
        const item = e.target.closest(".submenu-item");
        if (!item) return;
        const id = item.id, title = item.textContent.trim(), url = item.dataset.url;
        if (exitWidget(id)) { alert('Widget already exists.'); return; }
        let w = 5, h = 2;
        if (id === 'map') { w = 12; h = 6; }
        else if (id === 'about') { w = 11; h = 10; }
        addWidget( w, h, title, id, url);
        submenu.style.display = 'none'; saveWidget();
    });
    document.addEventListener("click", (e) => {
        // Close button handler
        if (e.target.classList.contains("remove-btn")) {
            const widget = e.target.closest(".grid-stack-item");
            if (widget) { getGrid().removeWidget(widget); }
        }
        // Edit title handler
        if (e.target.classList.contains("widget-title")) {
            const newTitle = prompt("Enter new title:", e.target.textContent);
            if (newTitle) { e.target.textContent = newTitle;  }
        }
        saveWidget();
    });
}

function updateComponent() {

}

async function showGitHubLastUpdate(username, repo, branch='main') {
    const url = `https://api.github.com/repos/${username}/${repo}/commits?sha=${branch}&per_page=1`;
    const displayDiv = document.getElementById('github-last-update');
    try {
        const response = await fetch(url);
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