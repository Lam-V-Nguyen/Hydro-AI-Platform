import { numberFormatter, formatDateTime, interpolateJet, signalSender, 
    jsonLoader, splitLines
} from "./commonFunctions.js";

let globalChartData = {title: "", data: null, checkBox: null, selectBox:null, titleX: "", titleY: "", validColumns: []};

export async function plotTimeSeries(plotContainer, title, data, titleChart, 
    titleX='Time', titleY='Value', selectedColumns=null) {
    const {columns, rows} = data;
    if (rows.length === 0) { alert('No data to plot. Please check the table.'); return; }
    const $ = (selector) => plotContainer.querySelector(selector);
    const obj = {
        dropdown: $(".select-object"), selectBox:$(".select-box"),
        titlePlot: $(".plot-title"), checkboxList: $(".checkbox-list"), 
        chartDiv: $("#myChart"), viewDataBtn: $("#viewDataBtn"),
        downloadBtn: $("#downloadExcel")
    };
    // Draw the chart using Plotly
    let checkboxInputs = obj.checkboxList.querySelectorAll('input[type="checkbox"]');
    if (selectedColumns === null) { checkboxInputs = []; checkboxInputs.legend = 0; }
    // Create checkbox list
    if (checkboxInputs.length === 0) {
        const validColumns = [];
        for (let i = 1; i < columns.length; i++) {
            const y = rows.map(r => r[i]);
            const hasValid = y.some(val => val !== null && !isNaN(val));
            if (hasValid) validColumns.push(data.columns[i]);
        }
        // Update global variable
        globalChartData = { 
            title: title, data: data, checkBox: obj.checkboxList, selectBox: obj.selectBox, 
            titleX: titleX, titleY: titleY, validColumns: validColumns 
        };
        createCheckboxList(plotContainer, obj.checkboxList, obj.selectBox, titleChart, validColumns);
        checkboxInputs = obj.checkboxList.querySelectorAll('input[type="checkbox"]');
    }
    // Get selected columns
    if (!selectedColumns) {
        selectedColumns = Array.from(checkboxInputs)
            .filter(cb => cb.checked && cb.value !== 'All').map(cb => cb.value);
    }
    const allCheckbox = Array.from(checkboxInputs).find(cb => cb.value === 'All');
    let drawColumns;
    if (allCheckbox && allCheckbox.checked) drawColumns = columns.slice(1);
    else drawColumns = selectedColumns;
    if (drawColumns.length === 0) { Plotly.purge(obj.chartDiv); return; }
    renderChart(obj.chartDiv, columns, rows, drawColumns, titleChart, titleX, titleY);
    // Update title
    plotContainer.style.display = 'flex'; obj.titlePlot.innerHTML = title;
    // Download chart
    if (!obj.viewDataBtn.dataset.bound) {
        obj.viewDataBtn.addEventListener("click", () => viewDatafromPlot(obj.chartDiv));
        obj.viewDataBtn.dataset.bound = true;
    }
    // Download data as Excel
    if (!obj.downloadBtn.dataset.bound) {
        obj.downloadBtn.addEventListener("click", () => saveToExcelFromPlot(obj.chartDiv));
        obj.downloadBtn.dataset.bound = true;
    }
    // Open dropdown
    if (!obj.selectBox.dataset.bound) {
        obj.selectBox.addEventListener("click", () => {
            obj.checkboxList.style.display = 
                obj.checkboxList.style.display === 'block' ? 'none' : 'block';
        });
        obj.selectBox.dataset.bound = true;
    }
    // Close dropdown when click outside
    plotContainer.addEventListener('click', e => {
        if (!obj.dropdown.contains(e.target)) obj.checkboxList.style.display = 'none';
    });
}

export function createCheckboxList(plotContainer, checkboxObj, selectBoxObj, titleChart, columns) {
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
        updateChart(plotContainer, checkboxObj, titleChart);
        checkboxObj.style.display = 'none';
    })
    // Select other columns
    colCheckBoxes.forEach(cb => {
        cb.addEventListener('change', () => {
            allCheckbox.checked = colCheckBoxes.every(cb => cb.checked);
            updateChart(plotContainer, checkboxObj, titleChart);
            checkboxObj.style.display = 'none';
        });
    });
}

async function updateChart(plotContainer, checkboxObj, titleChart) {
    const { data, titleX, titleY } = globalChartData;
    const { columns, rows } = data;
    const checkboxes = checkboxObj.querySelectorAll('input[type="checkbox"]');
    const selectedColumns = Array.from(checkboxes)
        .filter(cb => cb.checked && cb.value !== 'All').map(cb => cb.value);
    const chartDiv = plotContainer.querySelector("#myChart");
    if (selectedColumns.length === 0) {
        Plotly.purge(chartDiv); return;
    }
    renderChart(chartDiv, columns, rows, selectedColumns, titleChart, titleX, titleY);
}

function renderChart(chartDiv, columns, rows, drawColumns, titleChart, titleX, titleY) {
    const x = rows.map(r => r[0]);
    let traceIndex = 0;
    const traces = [], n = drawColumns.length;  
    for (const colName of drawColumns) {
        const i = columns.indexOf(colName);
        if (i === -1) continue;
        const y = rows.map(r => r[i]);
        const t = n <= 1 ? 0 : traceIndex / (n - 1);
        const color = interpolateJet(1-t);
        traces.push({ 
            x: x, y: y, name: columns[i], type: 'scatter', 
            mode: 'lines', line: { color: color } 
        });
        traceIndex++;
    }
    if (traces.length === 0) { Plotly.purge(chartDiv); return; }
    const layout = {
        margin: {l: 60, r: 20, t: 50, b: 20}, 
        paper_bgcolor: '#c2bdbdff', plot_bgcolor: '#c2bdbdff',
        title: { 
            text: titleChart, x: 0.5, xanchor: 'center', 
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
    setTimeout(() => {
        Plotly.react(chartDiv, traces, layout, config);
        new ResizeObserver(() => {
            Plotly.Plots.resize(chartDiv);
        }).observe(chartDiv.parentElement);
    }, 50);
}

// Export chart data to new tab as CSV format
export function viewDatafromPlot(plotDiv) {
    signalSender('showOverlay', "Getting data from plot.\nPlease wait...");
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
    signalSender('showOverlay', "Downloading data as Excel file.\nPlease wait...");
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

export async function plotChart(projectName, plotContainer, query, key, chartTitle, titleX, titleY) {
    signalSender('showOverlay', 'Preparing Data for Chart.\nPlease wait...');
    const content = { projectName: projectName, key: key, query: query };
    const response = await jsonLoader('process_data', content);
    if (response.status === 'error') { signalSender('hideOverlay'); alert(response.message); return; }
    plotTimeSeries(plotContainer, chartTitle, response.content, chartTitle, titleX, titleY);
    signalSender('hideOverlay');
}

export function plotProfileSingleLayer(plotContainer, pointContainer, polygonCentroids, title, titleY, titleX) {
    const interpolatedPoints = splitLines(pointContainer, polygonCentroids, 20).map(([dist, val]) => [dist, val]);
    const input = { columns: [titleX, titleY], data: interpolatedPoints };
    // plotTimeSeries(plotWindow(), chartDiv(), checkboxList(), selectBox(), plotTitle(),
    //     input, title, titleX, titleY);
    plotTimeSeries(plotContainer, title, input, title, titleX, titleY);
}

export function plotProfileMultiLayer(key, query, data, title, unit) { 
    // animationToken++;
    // const myToken = animationToken;
    // chartDivProfile().style.border = "1px solid #aaa"; 
    // chartDivProfile().style.borderRadius = "10px"; 
    // chartDivProfile().style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)"; 
    // if (profileWindow()._resizeObserver) profileWindow()._resizeObserver.disconnect(); 
    // colorCombo().style.display = "block"; minValue().style.display = "block"; maxValue().style.display = "block";
    // colorComboLabel().style.display = "block"; minLabel().style.display = "block"; maxLabel().style.display = "block";
    // const { timestamps, distance, values, depths, local_minmax } = data;
    // minValue().value = valueFormatter(local_minmax[0], 1e-3); maxValue().value = valueFormatter(local_minmax[1], 1e-3);
    // nColors = parseInt(colorCombo().value);
    // // Set up time slider
    // timeSlider().min = 0; timeSlider().max = timestamps.length - 1;
    // timeSlider().step = 1; timeSlider().value = 0;
    // timeLabelStart().textContent = `Start: ${timestamps[0]}`;
    // timeLabelEnd().textContent = `End: ${timestamps[timestamps.length - 1]}`;
    // timeLabel().textContent = `Time: ${timestamps[0]}`;
    // // Render plot
    // profileWindow()._resizeObserver = renderPlot(chartDivProfile(), distance, depths, 
    //         values, local_minmax[0], local_minmax[1], nColors, title, unit);
    // // Change header title of window
    // profileWindowHeader().childNodes[0].nodeValue = 'Profile Plot';
    // // Update a single frame
    // async function updateFrame(index) {
    //     if (myToken !== animationToken) return;
    //     const queryContents = { key: key, query: query, idx: index, projectName: getState().projectName };
    //     const data = await sendQuery('select_meshes', queryContents);
    //     if (data.status === "error") { 
    //         alert(data.message); animating = false;
    //         playPauseBtn().textContent = '▶ Play'; return;
    //     }
    //     const { values, local_minmax } = data.content;
    //     minValue().value = valueFormatter(local_minmax[0], 1e-3); 
    //     maxValue().value = valueFormatter(local_minmax[1], 1e-3);
    //     nColors = parseInt(colorCombo().value);
    //     const discreteColors = getColors(nColors);
    //     const colorScale = [], step = 1 / nColors;
    //     for (let i = 0; i < nColors; i++) {
    //         colorScale.push([i * step, discreteColors[i]]);
    //         colorScale.push([(i + 1) * step, discreteColors[i]]);
    //     }
    //     // Update the frame
    //     colorTicks = colorbarTicks(local_minmax[0], local_minmax[1], nColors);
    //     colorTickLabels = colorTicks.map(v => valueFormatter(v, 1e-3));
    //     await Plotly.update(chartDivProfile(), { z: [values], zmin: [local_minmax[0]], 
    //         zmax: [local_minmax[1]], colorscale: [colorScale], showscale: [true], 
    //         colorbar: [{ title: { text: unit, font: { color: 'black' } }, tickvals: colorTicks, 
    //             ticktext: colorTickLabels, tickfont: { color: 'black' } }]
    //     }, {}, [0]);
    //     // Update time slider
    //     timeSlider().value = index; timeLabel().textContent = `Time: ${timestamps[index]}`;
    // }
    // // === Play / Pause control === 
    // async function playAnimation() { 
    //     duration = parseFloat(durationValue().value)*1000
    //     while (animating && frameIndex < timestamps.length && myToken === animationToken) { 
    //         await updateFrame(frameIndex);
    //         frameIndex++;
    //         await new Promise(r => setTimeout(r, duration)); 
    //     }
    //     if (myToken !== animationToken) return;
    //     if (frameIndex >= timestamps.length) { 
    //         animating = false; playPauseBtn().textContent = '▶ Play'; 
    //         frameIndex = 0; // Reset index
    //     }
    // }
    // playPauseBtn().onclick = () => { 
    //     if (!animating){ 
    //         animating = true; playPauseBtn().textContent = '⏸ Pause'; 
    //         playAnimation(); 
    //     } else { animating = false; playPauseBtn().textContent = '▶ Play'; } 
    // }
    // // === Slider control === 
    // timeSlider().addEventListener('input', resetAnimation);
    // // === Duration control ===
    // durationValue().addEventListener('change', resetAnimation);
    // // === Color control === 
    // colorCombo().addEventListener('change', async() => { 
    //     animating = false; playPauseBtn().textContent = '▶ Play';
    //     const queryContents = { key: key, query: query, idx: frameIndex, projectName: getState().projectName };
    //     const refreshed = await sendQuery('select_meshes', queryContents);
    //     if (refreshed.status === "error") { alert(data.message); return; }
    //     const { values, local_minmax } = refreshed.content;
    //     minValue().value = valueFormatter(local_minmax[0], 1e-3); 
    //     maxValue().value = valueFormatter(local_minmax[1], 1e-3);
    //     renderPlot(chartDivProfile(), distance, depths, values, local_minmax[0],
    //         local_minmax[1], parseInt(colorCombo().value), title, unit); 
    // })
    // profileWindow().style.display = "flex";
}