// =======================================
// Imports
// =======================================
import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';

// =======================================
// Globals / State
// =======================================
const ORGAN = 'brain'; // Change this to 'eye', 'heart', 'tongue', 'brain', 'kidney' as needed

// All nrrd files should be 256x256x256
const file_path = `data/${ORGAN}_256.nrrd`; // Path to the NRRD file

const ISO_THRESHOLDS = {
  eye: 0.20,
  heart: 0.40,
  tongue: 0.30,
  brain: 0.24,
  kidney: 0.40,
  placeholder: 0.50 // Default threshold for placeholder
};

const STATE = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  material: null,
  cmtextures: null,
  volconfig: {
    clim1: 0,
    clim2: 1,
    renderstyle: 'iso',      // 'mip' | 'iso'
    isothreshold: ISO_THRESHOLDS[ORGAN],
    colormap: 'viridis',     // 'viridis' | 'gray'
  }
};

// Kickoff
init();

// =======================================
// Init
// =======================================
function init() {
  STATE.scene = new THREE.Scene();

  createRenderer();
  createCamera();
  createControls();
  createGUI();
  loadVolume();

  window.addEventListener('resize', onWindowResize);
}

// =======================================
// Renderer
// =======================================
function createRenderer() {
  const renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  STATE.renderer = renderer;
}

// =======================================
// Camera (Orthographic works better for this shader)
// =======================================
function createCamera() {
  const h = 512; // frustum height
  const aspect = window.innerWidth / window.innerHeight;

  const camera = new THREE.OrthographicCamera(
    (-h * aspect) / 2,
    (h * aspect) / 2,
    h / 2,
    -h / 2,
    1,
    1000
  );

  camera.position.set(-64, -64, 128);
  camera.up.set(0, 0, 1); // z is up in the data

  STATE.camera = camera;
}

// =======================================
// Controls
// =======================================
function createControls() {
  const controls = new OrbitControls(STATE.camera, STATE.renderer.domElement);
  controls.target.set(64, 64, 128);
  controls.minZoom = 0.5;
  controls.maxZoom = 4;
  controls.enablePan = false;
  controls.addEventListener('change', render);
  controls.update();

  STATE.controls = controls;
}

// =======================================
// GUI
// =======================================
function createGUI() {
  const { volconfig } = STATE;
  const gui = new GUI();

  gui.add(volconfig, 'clim1', 0, 1, 0.01).onChange(updateUniforms);
  gui.add(volconfig, 'clim2', 0, 1, 0.01).onChange(updateUniforms);
  gui
    .add(volconfig, 'colormap', { gray: 'gray', viridis: 'viridis' })
    .onChange(updateUniforms);
  gui
    .add(volconfig, 'renderstyle', { mip: 'mip', iso: 'iso' })
    .onChange(updateUniforms);
  gui.add(volconfig, 'isothreshold', 0, 1, 0.01).onChange(updateUniforms);
}

// =======================================
// Volume Loading & Material Setup
// =======================================
function loadVolume() {
  new NRRDLoader().load(file_path, (volume) => {
    // --- Create 3D texture from volume data (single-channel -> Red) ---
    const texture = new THREE.Data3DTexture(
      volume.data,
      volume.xLength,
      volume.yLength,
      volume.zLength
    );
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    // --- Colormap textures ---
    STATE.cmtextures = {
      viridis: new THREE.TextureLoader().load('textures/cm_viridis.png', render),
      gray: new THREE.TextureLoader().load('textures/cm_gray.png', render)
    };

    // --- Shader / Material ---
    const shader = VolumeRenderShader1;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    const { volconfig } = STATE;
    uniforms['u_data'].value = texture;
    uniforms['u_size'].value.set(volume.xLength, volume.yLength, volume.zLength);
    uniforms['u_clim'].value.set(volconfig.clim1, volconfig.clim2);
    uniforms['u_renderstyle'].value = volconfig.renderstyle === 'mip' ? 0 : 1; // 0: MIP, 1: ISO
    uniforms['u_renderthreshold'].value = volconfig.isothreshold;              // ISO only
    uniforms['u_cmdata'].value = STATE.cmtextures[volconfig.colormap];

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide // volume shader uses backfaces as entry points
    });

    STATE.material = material;

    // --- Geometry & Mesh ---
    const geometry = new THREE.BoxGeometry(
      volume.xLength,
      volume.yLength,
      volume.zLength
    );

    // Center volume at origin-ish; the -0.5 accounts for voxel center alignment
    geometry.translate(
      volume.xLength / 2 - 0.5,
      volume.yLength / 2 - 0.5,
      volume.zLength / 2 - 0.5
    );

    const mesh = new THREE.Mesh(geometry, material);
    STATE.scene.add(mesh);

    render();
  });
}

// =======================================
// Uniform Updates (GUI callbacks)
// =======================================
function updateUniforms() {
  const { material, volconfig, cmtextures } = STATE;
  if (!material) return; // do nothing until material exists

  material.uniforms['u_clim'].value.set(volconfig.clim1, volconfig.clim2);
  material.uniforms['u_renderstyle'].value = volconfig.renderstyle === 'mip' ? 0 : 1;
  material.uniforms['u_renderthreshold'].value = volconfig.isothreshold;
  material.uniforms['u_cmdata'].value = cmtextures[volconfig.colormap];

  render();
}

// =======================================
// Resize Handling
// =======================================
function onWindowResize() {
  const { renderer, camera } = STATE;

  renderer.setSize(window.innerWidth, window.innerHeight);

  const aspect = window.innerWidth / window.innerHeight;
  const frustumHeight = camera.top - camera.bottom;

  camera.left = (-frustumHeight * aspect) / 2;
  camera.right = (frustumHeight * aspect) / 2;
  camera.updateProjectionMatrix();

  render();
}

// =======================================
// Render
// =======================================
function render() {
  const { renderer, scene, camera } = STATE;
  renderer.render(scene, camera);
}
