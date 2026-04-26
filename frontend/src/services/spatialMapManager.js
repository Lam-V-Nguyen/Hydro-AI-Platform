import { jsonLoader, signalSender, splitLines, initOptions } from "./commonFunctions.js";
import { L, ZOOM, getStateVisualization, setStateVisualization } from "./constant.js";
import { map } from "./visualizationMap.js";
import { plot2DMapStatic, plot2DMapDynamic
// , plot2DVectorMap, 
//     timeControl, colorbar_container, colorbar_vector_container 
} from "./map2DManager.js";


const $ = (id) => document.getElementById(id);
const obj = { 
    timeControl: $("time-controls"), substanceContainer: $("substance-container"),
    colorbarContainer: $("custom-colorbar"), 
}




let objContent = {};

export async function spatialMapManager(projectName) {


    const popupContent = document.getElementById('popup-content');
    const $$ = (id) => popupContent.querySelector(`#${id}`);
    objContent = {
        layerSelector: $$('layer-selector'), vectorSelector: $$('vector-selector'), 
        sigmaSelector: $$('sigma-selector'), vectorPlotBtn: $$('plotVectorBtn'),
        scale: $$('custom-colorbar-scaler')


    }
    await initOptions(objContent.layerSelector, 'layer_hyd', projectName); 
    await initOptions(objContent.vectorSelector, 'vector', projectName);
    await initOptions(objContent.sigmaSelector, 'sigma_waq', projectName); 
    await checkVectorComponents();
    setStateVisualization({layerSelected: objContent.layerSelector.value});
    setStateVisualization({vectorSelected: objContent.vectorSelector.value});
    setStateVisualization({sigmaSelected: objContent.sigmaSelector.value});
    // Add event listener for objects
    reAssign(objContent.layerSelector, 'layerSelected');
    reAssign(objContent.vectorSelector, 'vectorSelected');
    reAssign(objContent.sigmaSelector, 'sigmaSelected');
    // Set function for 2D dynamic map plot
    document.querySelectorAll('.map2D_dynamic').forEach(plot => {
        plot.addEventListener('click', () => {
            if (obj.substanceContainer.style.display !== 'none') {
                obj.substanceContainer.style.display = 'none';
            }
            const [key, colorbarTitle, colorbarKey] = plot.dataset.info.split('|');
            if (!key.includes('single')) {
                titleColorbar = objContent.layerSelector.value==='-1' 
                    ? `${colorbarTitle}\nLayer: ${objContent.layerSelector.selectedOptions[0].text}`
                    : `${colorbarTitle}\n${objContent.layerSelector.selectedOptions[0].text}`;
            } else { titleColorbar = colorbarTitle; }
            const query = `|${objContent.layerSelector.value}`;
            plot2DMapDynamic(projectName, false, objContent.scale, query, key, titleColorbar, colorbarKey);
        });
    });    
    
    
    
    // Plot vector map
    objContent.vectorPlotBtn.addEventListener('click', () => {
        if (objContent.vectorSelector.value === '') { 
            alert('Please select a vector.'); 
            document.querySelector('.hide-maps').click(); return;
        }
        const vectorName = objContent.vectorSelector.value;
        const layerName = objContent.layerSelector.value;
        titleColorbar = '', colorbarKey = '';
        if (vectorName === '0') {titleColorbar = 'Velocity (m/s)'; colorbarKey = 'vector';}
        const colorbarTitle = objContent.layerSelector.value==='-1' 
            ? `${titleColorbar}\nLayer: ${objContent.layerSelector.selectedOptions[0].text}` 
            : `${titleColorbar}\n${objContent.layerSelector.selectedOptions[0].text}`;

        plot2DVectorMap('load', layerName, colorbarTitle, colorbarKey);
    });




    // Select static map
    document.querySelectorAll('.map2D_static').forEach(plot => {
        plot.addEventListener('click', () => {
            const [key, title, colorbarKey] = plot.dataset.info.split('|');
            plot2DMapStatic(
                projectName, map, obj.timeControl, obj.substanceContainer, 
                obj.colorbarContainer, key, title, colorbarKey
            );
        });
    });
    // Hide maps
    document.querySelector('.hide-maps').addEventListener('click', () => {
        // Clear map
        map.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer); layer = null; });
        // timeControl().style.display = 'none'; colorbar_container().style.display = 'none';
        // colorbar_vector_container().style.display = 'none';
        // if (substanceWindowHis().style.display !== 'none') {substanceWindowHis().style.display = 'none';}
        // if (substanceWindowMap().style.display !== 'none') {substanceWindowMap().style.display = 'none';}
        // Object.keys(getState().gisLayers).forEach(layerName => {
        //     setState({gisLayers: {...getState().gisLayers, [layerName]: false}});
        // });
        // setState({hydLayer: null, sourceLayer: null, wqLoadsLayer: null, wqObsLayer: null, isMultiLayer: false,
        //     isClickedInsideLayer: false, isThemocline: false, crosssectionLayer: null, isPathQuery: false});
    });
}

async function checkVectorComponents() {
    // Initiate objects for vector object
    if (getStateVisualization().layerSelected !== '') { 
        objContent.layerSelector.value = getStateVisualization().layerSelected; 
    }
    if (getStateVisualization().vectorSelected !== '') { 
        objContent.vectorSelector.value = getStateVisualization().vectorSelected; 
    }
    if (getStateVisualization().sigmaSelected !== '') { 
        objContent.sigmaSelector.value = getStateVisualization().sigmaSelected; 
    }
}

function reAssign(target, key){
    target.addEventListener('change', () => { 
        setStateVisualization({[key]: target.value});
        document.querySelector('.hide-maps').click();
    });
}


// export const substanceWindowHis = () => document.getElementById('substance-window-his');
// export const substanceWindowMap = () => document.getElementById('substance-window-map');
// const substanceWindowContentMap = () => document.getElementById('substance-window-content-map');

// let newKey = '', newQuery = '', titleColorbar = '', colorbarKey = ''; 


// export async function spatialMapManager() {


//     // Set function for water quality
//     document.querySelectorAll('.waq-function').forEach(obj => {
//         obj.addEventListener('click', async() => {
//             substanceWindowHis().style.display = 'none';
//             if (plotWindow().style.display !== 'none') plotWindow().style.display = 'none';
//             const [query, type] = obj.dataset.info.split('|');
//             const data = await sendQuery('process_data', {query: query, key: 'substance_check', projectName: getState().projectName});
//             if (data.status === "error") { 
//                 map.eachLayer((layer) => { if (!(layer instanceof L.TileLayer)) map.removeLayer(layer); });
//                 alert(data.message); substanceWindowMap().style.display = 'none'; return; 
//             }
//             substanceWindowContentMap().innerHTML = ''; substanceWindowMap().style.display = 'flex'; 
//             // Add content
//             substanceWindowContentMap().innerHTML = data.content.map((substance, i) => {
//                 return `<label for="map-${substance}"><input type="radio" name="waq-substance-map" id="map-${substance}"
//                     value="${data.content[i]}|${type}" ${i === 0 ? 'checked' : ''}>${data.message[i]}</label>`;
//             }).join('');
//             const name = data.content[0]; titleColorbar = data.message[0];
//             if (type === 'single') {
//                 newKey = `${name}_waq_single_dynamic`; newQuery = `mesh2d_2d_${name}|${sigmaSelector().value}`;
//             } else {
//                 newKey = `${name}_waq_multi_dynamic`; newQuery = `mesh2d_${name}|${sigmaSelector().value}`;
//                 titleColorbar = sigmaSelector().value==='-1' ? `${titleColorbar}\nSigma layer: ${sigmaSelector().selectedOptions[0].text}`
//                     : `${titleColorbar}\n${sigmaSelector().selectedOptions[0].text}`;
//             }
//             setState({sigma: sigmaSelector()}); 
//             if (updateStatus()) { 
//                 updateStatus().innerHTML = `Last Option: Plot Dynamic Water Quality Map: ${titleColorbar.split('(')[0].trim()} - ${sigmaSelector().selectedOptions[0].text}`; 
//             }
//             plot2DMapDynamic(true, newQuery, newKey, titleColorbar, '');
//         });
//     });
//     // Listen to substance selection
//     substanceWindowContentMap().addEventListener('change', (e) => {
//         if (e.target && e.target.name === "waq-substance-map") {
//             if (plotWindow().style.display !== 'none') plotWindow().style.display = 'none';
//             const [value, type] = e.target.value.split('|');
//             const label = e.target.closest('label');
//             titleColorbar = label ? label.textContent.trim() : value;
//             const sigma = getState().sigma;
//             if (type === 'single') {
//                 newKey = `${value}_waq_single_dynamic`; newQuery = `mesh2d_2d_${value}|${sigma.value}`;
//             } else {
//                 newKey = `${value}_waq_multi_dynamic`; newQuery = `mesh2d_${value}|${sigma.value}`;
//                 titleColorbar = sigma.value==='-1'
//                     ? `${titleColorbar}\nLayer: ${sigma.selectedOptions[0].text}`
//                     : `${titleColorbar}\n${sigma.selectedOptions[0].text}`;
//             }
//             if (updateStatus()) { 
//                 updateStatus().innerHTML = `Last Option: Plot Dynamic Water Quality Map: ${titleColorbar.split('(')[0].trim()} - ${sigma.selectedOptions[0].text}`; 
//             }
//             plot2DMapDynamic(true, newQuery, newKey, titleColorbar, '');
//         }
//     });


// }