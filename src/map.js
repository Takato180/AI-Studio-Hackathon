// map.js -- CesiumJS + PLATEAU 3D Tiles integration
import * as Cesium from 'cesium';

let viewer = null;
let mapReady = false;

// PLATEAU 3D Tiles URLs (LOD2 with textures for better visuals)
const PLATEAU_BASE = 'https://plateau.geospatial.jp/main/data/3d-tiles/bldg/13100_tokyo';

const PLATEAU_TILES = {
    chiyoda: `${PLATEAU_BASE}/13101_chiyoda-ku/low_resolution/tileset.json`,
    chuo: `${PLATEAU_BASE}/13102_chuo-ku/low_resolution/tileset.json`,
    minato: `${PLATEAU_BASE}/13103_minato-ku/low_resolution/tileset.json`,
    shibuya: `${PLATEAU_BASE}/13113_shibuya-ku/low_resolution/tileset.json`,
    shinjuku: `${PLATEAU_BASE}/13104_shinjuku-ku/low_resolution/tileset.json`,
};

/**
 * Initialize CesiumJS viewer with PLATEAU data
 */
export async function initMap() {
    if (viewer) return viewer;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;

    viewer = new Cesium.Viewer('cesium-container', {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        creditContainer: document.createElement('div'),
        skyBox: false,
        skyAtmosphere: false,
        requestRenderMode: false,
        contextOptions: {
            webgl: {
                alpha: false,
                antialias: true,
                preserveDrawingBuffer: true,
            },
        },
    });

    // --- Cyberpunk atmosphere (virtual prison dome - bright but artificial) ---
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1e1e3f');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a35');
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.00005;
    viewer.scene.fog.minimumBrightness = 0.5; // Bright artificial fog
    viewer.scene.globe.enableLighting = false; // Disable shadows for brighter look

    // Bright ambient-like light (no harsh shadows)
    viewer.scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(0.3, 0.3, -0.9),
        color: new Cesium.Color(1.0, 1.0, 1.0, 1.0),
        intensity: 3.0,
    });

    // --- Performance optimizations ---
    const scene = viewer.scene;
    scene.globe.tileCacheSize = 200;
    scene.globe.maximumScreenSpaceError = 3;
    scene.globe.preloadSiblings = true;

    // Preload tiles for flight destinations
    scene.preloadFlightDestinations = true;

    // Reduce pick/depth test overhead
    scene.pickTranslucentDepth = false;
    scene.logarithmicDepthBuffer = true;

    // Optimize rendering
    scene.debugShowFramesPerSecond = false;
    scene.postProcessStages.fxaa.enabled = true;

    // Load PLATEAU 3D Tiles
    await loadPlateauTiles();

    // Set initial camera
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(139.7670, 35.6810, 15000),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-60),
            roll: 0,
        },
        duration: 0,
    });

    mapReady = true;
    return viewer;
}

export function isMapReady() { return mapReady; }
export function getViewer() { return viewer; }

/**
 * Load PLATEAU 3D Tiles with performance settings
 */
async function loadPlateauTiles() {
    const tilesetOptions = {
        maximumScreenSpaceError: 8,
        maximumMemoryUsage: 512,
        skipLevelOfDetail: true,
        preferLeaves: true,
        dynamicScreenSpaceError: true,
        dynamicScreenSpaceErrorDensity: 0.00278,
        dynamicScreenSpaceErrorFactor: 4.0,
    };

    const loadPromises = Object.entries(PLATEAU_TILES).map(async ([area, url]) => {
        try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(url, tilesetOptions);

            // Show original textures without color overlay
            // (cyberpunk feel comes from lighting and atmosphere instead)

            viewer.scene.primitives.add(tileset);
        } catch (err) {
            console.warn(`${area} tiles unavailable`);
        }
    });

    await Promise.all(loadPromises);
}

/**
 * Fly camera to VIEW a landmark (uses lookAt for reliable targeting)
 */
export function flyToLandmark(stage) {
    if (!viewer) return;

    const { location, cameraOffset } = stage;
    const range = cameraOffset.range || 600;

    // Target point (the landmark)
    const targetPosition = Cesium.Cartesian3.fromDegrees(
        location.longitude,
        location.latitude,
        (location.height || 200) / 2 // Look at middle of building
    );

    // Use lookAt with heading/pitch/range for reliable camera positioning
    const heading = Cesium.Math.toRadians(cameraOffset.heading);
    const pitch = Cesium.Math.toRadians(cameraOffset.pitch);

    viewer.camera.flyTo({
        destination: targetPosition,
        orientation: {
            heading: heading,
            pitch: pitch,
            roll: 0,
        },
        duration: 3.0,
        complete: () => {
            // After flying, use lookAt to ensure landmark is centered
            viewer.camera.lookAt(
                targetPosition,
                new Cesium.HeadingPitchRange(heading, pitch, range)
            );
            // Unlock camera for user control
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
    });
}

/**
 * Add marker at a landmark
 */
export function addLandmarkMarker(stage) {
    if (!viewer) return;

    const { location } = stage;

    // Marker at 2/3 height of building (not above it)
    const markerHeight = (location.height || 200) * 0.6;
    viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
            location.longitude,
            location.latitude,
            markerHeight
        ),
        point: {
            pixelSize: 14,
            color: Cesium.Color.fromCssColorString('#00ffea'),
            outlineColor: Cesium.Color.fromCssColorString('#00ffea').withAlpha(0.3),
            outlineWidth: 8,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
            text: `[ ${stage.name} ]`,
            font: '14px Orbitron, sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#00ffea'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
    });
}

export function clearMarkers() {
    if (viewer) viewer.entities.removeAll();
}

/**
 * Fly camera to look up at the sky (for ending scene)
 */
export function flyToSky() {
    if (!viewer) return;

    // Position above Shinjuku, looking up at the sky
    const position = Cesium.Cartesian3.fromDegrees(139.6917, 35.6895, 400);

    viewer.camera.flyTo({
        destination: position,
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(30), // Look up at sky more
            roll: 0,
        },
        duration: 5.0, // Slower camera movement
    });
}

/**
 * Gradually change weather to clear sky for ending (animation over 3 seconds)
 */
export async function setClearSkyWeather() {
    if (!viewer) return;

    // Start camera flying up to show sky
    flyToSky();

    const duration = 6000; // 6 seconds (longer for dramatic effect)
    const steps = 120;
    const interval = duration / steps;

    // Starting colors (cyberpunk)
    const startBg = { r: 0.12, g: 0.12, b: 0.25 }; // #1e1e3f
    const endBg = { r: 0.53, g: 0.81, b: 0.92 };   // #87CEEB

    // Gradually transition
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;

        // Interpolate background color
        const r = startBg.r + (endBg.r - startBg.r) * t;
        const g = startBg.g + (endBg.g - startBg.g) * t;
        const b = startBg.b + (endBg.b - startBg.b) * t;

        viewer.scene.backgroundColor = new Cesium.Color(r, g, b, 1.0);
        viewer.scene.globe.baseColor = new Cesium.Color(r, g, b, 1.0);

        // Reduce fog gradually
        viewer.scene.fog.density = 0.00005 * (1 - t);
        viewer.scene.fog.minimumBrightness = 0.5 + 0.5 * t;

        // Increase light intensity
        viewer.scene.light.intensity = 3.0 + 2.0 * t;

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    // Final state
    viewer.scene.fog.enabled = false;
    viewer.scene.light = new Cesium.DirectionalLight({
        direction: new Cesium.Cartesian3(0.5, 0.5, -1.0),
        color: new Cesium.Color(1.0, 1.0, 0.95, 1.0), // Warm sunlight
        intensity: 5.0,
    });

    // Remove cyberpunk styling from buildings
    viewer.scene.primitives._primitives.forEach(p => {
        if (p instanceof Cesium.Cesium3DTileset) {
            p.style = new Cesium.Cesium3DTileStyle({
                color: 'color("white", 1.0)'
            });
        }
    });
}
