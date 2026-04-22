import { numberFormatter, formatDateTime, interpolateJet, signalSender } from "./commonFunctions.js";

let globalChartData = {data: null, titleX: "", titleY: "", validColumns: []};

// Draw the chart using Plotly
export async function plotTimeSeries(plotDiv, checkboxList, selectBox, 
    data, title, titleX, titleY, width, height, selectedColumns=null) {
    const cols = data.columns, rows = data.data;
    const x = rows.map(r => r[0]);    
    let checkboxInputs = checkboxList.querySelectorAll('input[type="checkbox"]');
    if (selectedColumns === null) { checkboxInputs = []; checkboxInputs.legend = 0; }
    // Create checkbox list
    if (checkboxInputs.length === 0) {
        const validColumns = [];
        for (let i = 1; i < cols.length; i++) {
            const y = rows.map(r => r[i]);
            const hasValid = y.some(val => val !== null && !isNaN(val));
            if (hasValid) validColumns.push(data.columns[i]);
        }
        // Update global variable
        globalChartData = { data, titleX, titleY, validColumns };
        createCheckboxList(plotDiv, checkboxList, selectBox, title, width, height, validColumns);
        checkboxInputs = checkboxList.querySelectorAll('input[type="checkbox"]');
    }
    // Get selected columns
    if (!selectedColumns) {
        selectedColumns = Array.from(checkboxInputs)
            .filter(cb => cb.checked && cb.value !== 'All').map(cb => cb.value);
    }
    const allCheckbox = Array.from(checkboxInputs).find(cb => cb.value === 'All');
    let drawColumns, traceIndex = 0;
    if (allCheckbox && allCheckbox.checked) drawColumns = cols.slice(1);
    else drawColumns = selectedColumns;
    if (drawColumns.length === 0) { Plotly.purge(plotDiv); return; }
    const traces = [], n = drawColumns.length;  
    for (const colName of drawColumns) {
        const i = cols.indexOf(colName);
        if (i === -1) continue;
        const y = rows.map(r => r[i]);
        const t = n <= 1 ? 0 : traceIndex / (n - 1);
        const color = interpolateJet(1-t);
        traces.push({ 
            x: x, y: y, name: cols[i], type: 'scatter', 
            mode: 'lines', line: { color: color } 
        });
        traceIndex++;
    }
    if (traces.length === 0) { Plotly.purge(plotDiv); return; }
    const layout = {
        margin: {l: 60, r: 20, t: 50, b: 20}, width: width, height: height,
        paper_bgcolor: '#c2bdbdff', plot_bgcolor: '#c2bdbdff',
        title: { 
            text: title, x: 0.5, xanchor: 'center', 
            font: { size: 20, color: 'black', weight: 'bold' } 
        },
        xaxis: {
            title:{ text: titleX, font: { size: 16, weight: 'bold', color: 'black' }},
            showgrid: false, linecolor: 'black', tickfont: { color: 'black' },
            automargin: true, ticks: 'outside', linewidth: 1, tickmode: 'auto'
        },
        yaxis: {
            title:{ text: titleY, automargin: true, 
                font: { size: 16, weight: 'bold', color: 'black' }
            }, 
            showgrid: false, linecolor: 'black', tickfont: { color: 'black' },
            automargin: true, ticks: 'outside', linewidth: 1, tickmode: 'auto'
        },
        legend: { 
            orientation: 'v', x: 1.02, xanchor: 'left', y: 1, yanchor: 'top',
            font: { size: 14, color: 'black', weight: 'bold' } 
        }
    };
    const config = { responsive: true, displaylogo: false };
    if (!plotDiv._fullLayout) { Plotly.newPlot(plotDiv, traces, layout, config);
    } else { Plotly.react(plotDiv, traces, layout, config); }
}
async function updateChart(plotDiv, checkboxObj, selectBoxObj, title, width, height) {
    const checkboxes = checkboxObj.querySelectorAll('input[type="checkbox"]');
    const selectedColumns = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.value !== 'All').map(cb => cb.value);
    const {data, titleX, titleY} = globalChartData;
    await plotTimeSeries(
        plotDiv, checkboxObj, selectBoxObj, data, title, 
        titleX, titleY, width, height, selectedColumns
    );
}

export function createCheckboxList(plotDiv, checkboxObj, selectBoxObj, title, width, height, columns) {
    checkboxObj.innerHTML = '';
    // Create "All" checkbox
    const allLabel = document.createElement('label');
    allLabel.innerHTML = `<input type="checkbox" value="All" checked> All`;
    const allCheckbox = allLabel.querySelector('input');
    checkboxObj.appendChild(allLabel);
    // Create checkbox for each column
    const colCheckBoxes = [];
    columns.forEach(col => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${col}"> ${col}`;
        const cb = label.querySelector('input'); cb.checked = true;
        checkboxObj.appendChild(label); colCheckBoxes.push(cb);
    });
    // Select all columns by default
    allCheckbox.addEventListener('change', () => {
        if (allCheckbox.checked) colCheckBoxes.forEach(cb => cb.checked = true);
        else colCheckBoxes.forEach(cb => cb.checked = false);
        updateChart(plotDiv, checkboxObj, selectBoxObj, title, width, height);
        checkboxObj.style.display = 'none';
    })
    // Select other columns
    colCheckBoxes.forEach(cb => {
        cb.addEventListener('change', () => {
            allCheckbox.checked = colCheckBoxes.every(cb => cb.checked);
            updateChart(plotDiv, checkboxObj, selectBoxObj, title, width, height);
            checkboxObj.style.display = 'none';
        });
    });
}

export async function chartManager(iframe, data, title, titleX, titleY, selectedColumns=null) {
    const doc = iframe.contentDocument;
    if (!doc?.getElementById("myChart")) return;
    const $ = (selector) => doc.querySelector(selector);
    const $$id = (id) => doc.getElementById(id);
    const obj = {
        dropdown: $(".select-object"), selectBox:$(".select-box"),
        checkboxList: $(".checkbox-list"), chartDiv: $$id("myChart"),
        viewDataBtn: $$id("viewDataBtn"), downloadBtn: $$id("downloadExcel")
    };
    await plotTimeSeries(
        obj.chartDiv, obj.checkboxList, obj.selectBox, data, title, titleX, titleY, selectedColumns
    );
    // Open dropdown
    obj.selectBox.addEventListener("click", () => {
        obj.checkboxList.style.display = obj.checkboxList.style.display === 'block' ? 'none' : 'block';
    });
    // Download chart
    obj.viewDataBtn.addEventListener("click", () => viewDatafromPlot(obj.chartDiv));
    // Download data as Excel
    obj.downloadBtn.addEventListener("click", () => saveToExcelFromPlot(obj.chartDiv));
}

// Export chart data to new tab as CSV format
export function viewDatafromPlot(plotDiv) {
    signalSender('showOverlay', "Getting data from plot. Please wait...");
    // Get data
    const traces = plotDiv.data;
    if (!traces || traces.length === 0) { alert("No data to view."); return; }
    const numTraces = traces.length;
    const title = plotDiv.layout?.title?.text || "Chart";
    const titleY = plotDiv.layout?.yaxis?.title?.text || "Value";
    const xTitle = plotDiv.layout?.xaxis?.title?.text || "Time";
    // Header
    let headers = [xTitle];
    traces.forEach((trace, i) => { headers.push(trace.name || `Series_${i}`); });
    const xValues = traces[0].x || [];
    let csvContent = headers.join(",") + "\n";
    for (let i = 0; i < xValues.length; i++) {
        let rawTime = xValues[i];
        let formattedTime = rawTime ? formatDateTime(rawTime) : "";
        let row = [formattedTime];
        for (let j = 0; j < numTraces; j++) {
            const yArr = traces[j].y || [];
            let value = yArr[i];
            if (value === null || value === undefined || isNaN(value)) {
                row.push("");
            } else { row.push(numberFormatter(value, 5)); }
        }
        csvContent += row.join(",") + "\n";
    }
    const newWindow = window.open("", "_blank");
    if (newWindow) {
        const doc = newWindow.document;
        doc.title = titleY.split(' (')[0];
        const pre = doc.createElement("pre");
        pre.style.fontFamily = "monospace";
        pre.style.whiteSpace = "pre-wrap";
        pre.textContent = csvContent;
        doc.body.appendChild(pre);
    } else {
        alert("Pop-up blocked. Please allow popups for this site.");
    }
    signalSender('hideOverlay');
}

// Save to Excel
export function saveToExcelFromPlot(plotDiv) {
    signalSender('showOverlay', "Downloading data as Excel file. Please wait...");
    const traces = plotDiv.data;
    if (!traces || traces.length === 0) { alert("No data to view."); return; }
    // Get the y values
    const numTraces = plotDiv.data.length;
    const title = plotDiv.layout?.title?.text || "Chart";
    const titleText = typeof title === "string"
        ? (title.includes(':') ? title.split(':')[1].trim() : title): "Chart";
    const titleY = plotDiv.layout?.yaxis?.title?.text || "Value";
    // Prepare the data
    const title_ = plotDiv.layout?.xaxis?.title?.text || 'Unknown';
    const headers = [title_];
    for (let i = 0; i < numTraces; i++) {
        const traceName = plotDiv.data[i].name || `${titleText}_${titleY}_${i}`;
        headers.push(traceName);
    }
    const table = [headers], numPoints = plotDiv.data[0].x.length;
    for (let i = 0; i < numPoints; i++) {
        const row = [plotDiv.data[0].x[i]];
        for (let j = 0; j < numTraces; j++) {
            row.push(numberFormatter(plotDiv.data[j].y[i], 4));
        }
        table.push(row);
    }
    // Create workbook and worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(table);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ChartData");
    // Download the Excel file
    XLSX.writeFile(workbook, `${titleY.split(' (')[0]}.xlsx`);
    signalSender('hideOverlay');
}
