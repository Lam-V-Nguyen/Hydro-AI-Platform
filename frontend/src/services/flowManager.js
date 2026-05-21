import { jsonLoader, signalSender } from "./commonFunctions.js";
import { highlightColor } from "./constant.js";

export async function catchmentDelineation(projectName, inputTextObj, lat, lon, snapDistance) {
    const layerCheck = inputTextObj.value;
    if (layerCheck === '') { 
        alert('Please upload terrain data first.'); return false; 
    }
    // Check if flow direction and flow accumulation have been run
    const contentDir = { projectName: projectName, filename: layerCheck, key: 'flow_direction' };
    const flowDirectionCheck = await jsonLoader('raster_check', contentDir);
    if (flowDirectionCheck.status === 'error') { alert(flowDirectionCheck.message); return; }
    const contentAcc = { projectName: projectName, filename: layerCheck, key: 'flow_accumulation' };
    const flowAccumulationCheck = await jsonLoader('raster_check', contentAcc);
    if (flowAccumulationCheck.status === 'error') { alert(flowAccumulationCheck.message); return; }
    if (lat === null || lon === null) { alert('Please set the pourpoint coordinates and create a catchment first.'); return; }
    if (threshold === '') { alert('Please set the threshold first.'); return; }
    if (snapDistance === '') { alert('Please set the snap distance first.'); return; }
    try {
        signalSender('showOverlay', 'Delineating catchment. Please wait ...');
        const contents = { projectName: projectName, filename: layerCheck,
            lat: lat, lon: lon, snapDistance: snapDistance
        };
        const response = await jsonLoader('catchment', contents);
        signalSender('hideOverlay');
        if (response.status === "error") { alert(response.message); return null; }
        return response.content;
    } catch (error) { 
        alert(`Running catchment algorithm failed: ${error.message}`); return null;
    }
}

export async function geoJSONExporter(data, fileName) {
    try { 
        const json = JSON.stringify(data, null, 2);
        if ('showSaveFilePicker' in window) {
            // --- Chrome/Edge/Opera ---
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'GeoJSON',
                    accept: { 'application/json': ['.geojson'] }
                }]
            });
            const writable = await fileHandle.createWritable();
            await writable.write(json); await writable.close();
            await new Promise(res => setTimeout(res, 200));
        } else {
            // --- Fallback cho Firefox, Safari ---
            const blob = new Blob([json], { type: 'application/geo+json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); 
            setTimeout(() => a.click(), 0);
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        alert(`Exporting succeeded.`);
    } catch (error) { alert(`Exporting failed: ${error.message}`); }
}

export async function mapPlotter(data, map, key) {
    const isRiver = key === 'river'; let type = null;
    const resetStyle = (layer) => {
        const id = layer.feature.properties._id;
        layer.setStyle({  // Reset to default style
            color: 'black', weight: isRiver ? 3 : 1, opacity: 1,
            ...(isRiver ? {} : { fillOpacity: 0.8, fillColor: highlightColor(id) })
        });
    };
    const layer = L.geoJSON(data, { 
        pointToLayer: () => null,
        style: feature => ({ 
            color: 'black', weight: isRiver ? 3 : 1, opacity: 1,
            ...(isRiver ? {} : { fillOpacity: 0.8, fillColor: highlightColor(feature.properties._id) }) 
        }),
        onEachFeature: (feature, featureLayer) => { 
            featureLayer.on('click', (e) => { 
                L.DomEvent.stopPropagation(e);
                // Reset the color of all features
                layer.eachLayer(resetStyle);
                // Highlight the clicked feature
                featureLayer.setStyle({ color: 'yellow', weight: isRiver ? 7 : 5 });
                const result = tableAdjust(feature.properties, key);
                const id = feature.properties._id;
                if (key === 'soil') { type = feature.properties.soil; }
                else if (key === 'land') { type = feature.properties.land; }
                signalSender('updateUIState', { 
                    key: key, ids: [id], data: [result], objType: type
                });
            });
            featureLayer.bindTooltip(`${buildTooltip(feature.properties, key)}`, {sticky: true});
        }
    }).addTo(map);
    map.on('click', () => { layer.eachLayer(resetStyle); });
    return layer;
}

export function buildTooltip(props, key) {
    let html = `<div style="font-size: 15px;">
        <div style="font-weight: bold; text-align: center;">ID: ${props._id || 'Unknown'}</div>
        <hr style="margin: 5px 0 5px 0;">
    `;
    if (key === 'soil') {
        html += `
            <strong>• Type:</strong> ${props.soil ?? 'Unknown'}<br>
            <strong>• θS (m³/m³):</strong> ${props.theta_s ?? 'Unknown'}<br>
            <strong>• θR (m³/m³):</strong> ${props.theta_r ?? 'Unknown'}<br>
            <strong>• KsatVer (mm/day):</strong> ${props.k_sat_ver ?? 'Unknown'}<br>
            <strong>• SoilDepth (mm):</strong> ${props.soil_depth ?? 'Unknown'}<br>
            <strong>• Conductivity decay:</strong> ${props.conductivity_decay ?? 'Unknown'}<br>
            <strong>• Brooks-Corey:</strong> ${props.brooks_corey ?? 'Unknown'}<br>
            <hr style="margin: 5px 0 5px 0;">
            <strong>Click to change attributes</strong>
        `;
    } else if (key === 'land') {
        html += `
            <strong>• Type:</strong> ${props.land ?? 'Unknown'}<br>
            <strong>• Leaf Area Index (ha):</strong> ${props.LAI ?? 'Unknown'}<br>
            <strong>• Root Depth (m):</strong> ${props.root_depth ?? 'Unknown'}<br>
            <strong>• Interception (mm):</strong> ${props.interception ?? 'Unknown'}<br>
            <strong>• Manning roughness:</strong> ${props.manning_n ?? 'Unknown'}<br>
            <strong>• Albedo:</strong> ${props.albedo ?? 'Unknown'}<br>
            <strong>• Crop coefficient:</strong> ${props.kc ?? 'Unknown'}<br>
            <hr style="margin: 5px 0 5px 0;">
            <strong>Click to change attributes</strong>
        `;
    } else if (key === 'river') {
        html += `
            <strong>• Width (m):</strong> ${props.width ?? 'Unknown'}<br>
            <strong>• Depth (m):</strong> ${props.depth ?? 'Unknown'}<br>
            <hr style="margin: 5px 0 5px 0;">
            <strong>Click to change attributes</strong>
        `;
    } else if (key === 'eklima' || key === 'ntnu' || key === 'nve') {
        html += `
            <div style="font-weight: bold; text-align: center;">Name: ${props.name || 'Unknown'}</div>
            <hr style="margin: 5px 0 5px 0;">
            <strong>• ID:</strong> ${props.id ?? 'Unknown'}<br>
            <strong>• County:</strong> ${props.county ?? 'Unknown'}<br>
            <strong>• Municipality:</strong> ${props.municipality ?? 'Unknown'}<br>
            <strong>• Station Holders:</strong> ${props.stationHolders ?? 'Unknown'}<br>
            <hr style="margin: 5px 0 5px 0;">
            <strong>Click to get weather data</strong>
        `;
    }
    html += `</div>`;
    return html;
}

function tableAdjust(props, key) { 
    let values = [];
    if (key === 'soil') {
        values = [
            props._id, props.soil, props.theta_s, props.theta_r, props.k_sat_ver, 
            props.soil_depth, props.conductivity_decay, props.brooks_corey
        ];
    } else if (key === 'land') {
        values = [
            props._id, props.land, props.LAI, props.root_depth, props.interception, 
            props.manning_n, props.albedo, props.kc
        ];
    } else if (key === 'river') {
        values = [props._id, props.width, props.depth];
    }
    return values;
}

