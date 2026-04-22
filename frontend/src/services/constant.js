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






// const defaultState = {
//     layoutGrids: null, currentProject: 'demo', currentParams: [], temp: '',
//     // hydLayer: null, waqLayer: null, sourceLayer: null, crosssectionLayer: null, isHYD: false, projectName: '',
//     // mapLayer: null, isPathQuery: false, isMultiLayer: false, isClickedInsideLayer: false, isThemocline: false,
//     // lastFeatureColors: {}, featureMap: {}, polygonCentroids: [], wqObsLayer: null, wqLoadsLayer: null, gisLayers: {},
//     // globalChartData: {data: null, chartTitle: "", titleX: "", titleY: "", validColumns: []}, sigma: null,
//     // isPlaying: null, vectorSelected: '', layerSelected: '', sigmaSelected: '', scalerValue: null, showedQuery: '',
//     // , currentParams: ['FlowFM_his.zarr', 'FlowFM_map.zarr', 'Coliform_his.zarr', 'Coliform_map.zarr']
// }

// let state = structuredClone(defaultState);
// export const getState = () => state;
// export const setState = (newState) => { 
//     state = { ...state, ...newState }; 
// };
// // Reset state
// export const resetState = () => { state = structuredClone(defaultState); };

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