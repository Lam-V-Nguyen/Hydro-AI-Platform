export const origin = '*';
export const CENTER = [62.476969, 6.471598];
export const ZOOM = 13, L = window.L, n_decimals = 2;

export const gridId = 'grid-generation-map', 
    hydMapId = 'new-hyd-map', waqMapId = 'new-waq-map';


export const superscriptMap = {
    '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³',
    '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
};

function toSuperscript(num) {
    return String(num).split('').map(ch => superscriptMap[ch] || ch).join('');
}

export function valueFormatter(value, minDiff) {
    const absVal = Math.abs(value);
    let decimalPlaces = 2;
    if (minDiff >= 0.01) decimalPlaces = 2;
    else if (0.001 <= minDiff < 0.01) decimalPlaces = 3;
    else if (0.0001 <= minDiff < 0.001) decimalPlaces = 4;
    else decimalPlaces = 6;
    if (absVal < 0.01) {
        const expStr = value.toExponential(n_decimals);
        const [mantissa, exponent] = expStr.split('e');
        const expNum = parseInt(exponent, 10);
        return `${mantissa}×10${toSuperscript(expNum)}`;
    } else { return value.toFixed(decimalPlaces); }
}

const defaultState = {
    currentProject: 'demo', waqModel: 'coliform',
    currentParams: ['FlowFM_his.zarr', 'FlowFM_map.zarr', 'Coliform_his.zarr', 'Coliform_map.zarr']
}

let state = {}, currentProjectId = null;
const getKey = (projectId) => `app_state_${projectId}`;
const loadState = (projectId) => {
    const saved = localStorage.getItem(getKey(projectId));
    return saved ? JSON.parse(saved) : structuredClone(defaultState);
};

const saveState = (projectId, state) => {
    localStorage.setItem(getKey(projectId), JSON.stringify(state));
};

export const initState = (projectId) => {
    currentProjectId = projectId;
    state = loadState(projectId);
};
export const getState = () => state;
export const setState = (newState) => {
    state = { ...state, ...newState };
    if (currentProjectId) saveState(currentProjectId, state);
};
export const resetState = () => {
    state = structuredClone(defaultState);
    if (currentProjectId) saveState(currentProjectId, state);
};


const defaultVisualization = { 
    hydLayer: null, sourceLayer: null, crosssectionLayer: null, 
    wqObsLayer: null, wqLoadsLayer: null, isPathQuery: false, 
    isThemocline: false, mapLayer: null, isMultiLayer: false, gisLayers: {},
    polygonCentroids: [], showedQuery: '', isClickedInsideLayer: false,
    vectorSelected: '', layerSelected: '', sigmaSelected: '', isPlaying: null, 
    lastFeatureColors: {}, featureMap: {}, isHYD: false, sigma: null,
    
    //  
    // globalChartData: {data: null, chartTitle: "", titleX: "", titleY: "", validColumns: []},
    //  scalerValue: null, 
}
let stateVisualization = structuredClone(defaultVisualization);
export const getStateVisualization = () => stateVisualization;
export const setStateVisualization = (newState) => { stateVisualization = { ...stateVisualization, ...newState }; };
// Reset state



let pendingRequest = null;

export function setPendingRequest(req) {
    pendingRequest = req;
}

export function getPendingRequest() {
    return pendingRequest;
}

export function clearPendingRequest() {
    pendingRequest = null;
}


export const arrowShape = new Path2D();
arrowShape.moveTo(0, 0);          // Origin
arrowShape.lineTo(1, 0);          // Main length
arrowShape.moveTo(1, 0);
arrowShape.lineTo(0.8, 0.1);      // Left branch
arrowShape.moveTo(1, 0);
arrowShape.lineTo(0.8, -0.1);     // Right branch