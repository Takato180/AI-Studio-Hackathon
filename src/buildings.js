// buildings.js -- PLATEAU building data interaction for CesiumJS

import * as Cesium from 'cesium';

let selectedEntity = null;
let highlightedTilesets = [];
let onBuildingClickCallback = null;

/**
 * Setup building click interaction on PLATEAU 3D Tiles
 * @param {Cesium.Viewer} viewer - CesiumJS viewer instance
 * @param {Function} callback - Called with building info when a building is clicked
 */
export function setupBuildingInteraction(viewer, callback) {
    onBuildingClickCallback = callback;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement) => {
        const pickedFeature = viewer.scene.pick(movement.position);

        if (Cesium.defined(pickedFeature) && pickedFeature instanceof Cesium.Cesium3DTileFeature) {
            const info = extractBuildingInfo(pickedFeature);

            // Highlight the clicked building
            highlightFeature(pickedFeature);

            if (onBuildingClickCallback) {
                onBuildingClickCallback(info);
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return handler;
}

/**
 * Extract building attributes from a PLATEAU 3D Tile feature
 * PLATEAU attributes can be in Japanese or English depending on the dataset
 */
function extractBuildingInfo(feature) {
    const propertyIds = feature.getPropertyIds();
    const props = {};

    propertyIds.forEach(id => {
        props[id] = feature.getProperty(id);
    });

    // Common PLATEAU attribute names (may vary by dataset)
    const height = props['bldg:measuredHeight']
        || props['measuredHeight']
        || props['建物高さ']
        || props['height']
        || props['bldg:height']
        || null;

    const usage = props['bldg:usage']
        || props['usage']
        || props['用途']
        || null;

    const name = props['gml:name']
        || props['name']
        || props['名称']
        || null;

    const storeysAboveGround = props['bldg:storeysAboveGround']
        || props['storeysAboveGround']
        || props['地上階数']
        || null;

    const yearOfConstruction = props['bldg:yearOfConstruction']
        || props['yearOfConstruction']
        || props['建築年']
        || null;

    const address = props['bldg:address']
        || props['address']
        || props['住所']
        || null;

    return {
        height: height ? parseFloat(height) : null,
        usage,
        name,
        floors: storeysAboveGround ? parseInt(storeysAboveGround) : null,
        yearBuilt: yearOfConstruction,
        address,
        allProperties: props,
    };
}

/**
 * Highlight a picked building feature
 */
function highlightFeature(feature) {
    // Reset previous highlight
    if (selectedEntity) {
        try {
            selectedEntity.color = selectedEntity._originalColor || Cesium.Color.WHITE;
        } catch (e) {
            // Feature may have been unloaded
        }
    }

    // Store original and set highlight
    try {
        feature._originalColor = feature.color ? feature.color.clone() : Cesium.Color.WHITE;
        feature.color = Cesium.Color.fromCssColorString('#00ffea').withAlpha(0.8);
        selectedEntity = feature;
    } catch (e) {
        // Feature may not support color
    }
}

/**
 * Scan visible PLATEAU tiles for buildings matching a condition
 * Returns array of matching building info objects
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Cesium3DTileset} tileset
 * @param {Function} conditionFn - (buildingInfo) => boolean
 * @returns {Array} matching buildings
 */
export function findBuildingsByCondition(viewer, tileset, conditionFn) {
    const matches = [];

    if (!tileset || !tileset.root) return matches;

    // Walk the tile tree to find loaded features
    function walkTile(tile) {
        if (tile.content) {
            const featuresLength = tile.content.featuresLength;
            for (let i = 0; i < featuresLength; i++) {
                try {
                    const feature = tile.content.getFeature(i);
                    const info = extractBuildingInfo(feature);
                    if (conditionFn(info)) {
                        matches.push({ feature, info });
                    }
                } catch (e) {
                    // Skip inaccessible features
                }
            }
        }
        if (tile.children) {
            tile.children.forEach(child => walkTile(child));
        }
    }

    walkTile(tileset.root);
    return matches;
}

/**
 * Highlight buildings that match a condition with a specific color
 */
export function highlightBuildingsByCondition(viewer, tileset, conditionFn, color = '#ff00ff') {
    const matches = findBuildingsByCondition(viewer, tileset, conditionFn);

    matches.forEach(({ feature }) => {
        try {
            feature._originalColor = feature.color ? feature.color.clone() : Cesium.Color.WHITE;
            feature.color = Cesium.Color.fromCssColorString(color).withAlpha(0.7);
            highlightedTilesets.push(feature);
        } catch (e) {
            // Skip
        }
    });

    return matches.length;
}

/**
 * Clear all highlighted buildings
 */
export function clearHighlights() {
    highlightedTilesets.forEach(feature => {
        try {
            feature.color = feature._originalColor || Cesium.Color.WHITE;
        } catch (e) {
            // Feature may have been unloaded
        }
    });
    highlightedTilesets = [];
    selectedEntity = null;
}

/**
 * Get info about a clicked building (for use in puzzles)
 */
export function getClickedBuildingInfo(viewer, position) {
    const pickedFeature = viewer.scene.pick(position);
    if (Cesium.defined(pickedFeature) && pickedFeature instanceof Cesium.Cesium3DTileFeature) {
        return extractBuildingInfo(pickedFeature);
    }
    return null;
}
