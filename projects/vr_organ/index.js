import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let scene, camera, renderer;
let rotatingGroup, rotatingGroup1;
let rotatingGroups = {};
let centers = {};
let thresholdUniformRef;
let volumeMaterial;
let geometryGuiMesh, dataGuiMesh;
let thresholdController;
let organTitleMesh;

// PARAMETERS
const ROTATIONSPEED = 0.003;
const FOV = 60;
const DISTANCE = 312;
const VOLSIZE = 128;
const HIDEGUI = false;

const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

const organs = ['eye', 'heart', 'tongue', 'brain', 'kidney'];

// GUI + data config
const params = {
  threshold: 0.2,
  scale: 1.0,
  rotLR: 0,
  rotUD: 0,
  colormap: 1,
  useIsoSurface: 0,
};

const isoThresholds = {
  eye: 0.20,
  heart: 0.40,
  tongue: 0.30,
  brain: 0.24,
  kidney: 0.40,
};

const cmtextures = {
  4: new THREE.TextureLoader().load('textures/cm_viridis.png'),
  3: new THREE.TextureLoader().load('textures/cm_plasma.png'),
  2: new THREE.TextureLoader().load('textures/cm_inferno.png'),
  1: new THREE.TextureLoader().load('textures/cm_turbo.png'),
};

// =======================================
// Init
// =======================================

init();
animate();

function init() {
  // Setup scene
  scene = new THREE.Scene();

  // Setup camera
  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));

  // Setup light & environment
  setupEnvironmentLighting();

  // Load volumetric organ data
  const size = [VOLSIZE, VOLSIZE, VOLSIZE];
  initializeCenters(DISTANCE);
  for (let organ of organs) {
    // Add rotating group to enable transforms
    rotatingGroups[organ] = new THREE.Group();
    scene.add(rotatingGroups[organ]);
    addOrganVolume(centers[organ], size, organ, rotatingGroups[organ]);
  }

  // TODO: Take care of rotating groups and GUIs

  rotatingGroup = new THREE.Group();
  scene.add(rotatingGroup);
  const organ = 'kidney';
  // Compute position
  // const offset = vrDirection.clone().multiplyScalar(distance);
  // const center = vrPosition.clone().add(offset);
  // addOrganVolume(center, size, organ, rotatingGroup);

  rotatingGroup1 = new THREE.Group();
  scene.add(rotatingGroup1);
  const organ1 = 'eye';
  // Compute position
  // const size1 = [VOLSIZE, VOLSIZE, VOLSIZE];
  // const distance1 = DISTANCE;
  // const offset1 = vrDirection.clone().multiplyScalar(distance);
  // const center1 = vrPosition.clone().add(offset);
  // center1.x += VOLSIZE * 0.8;
  // addOrganVolume(center1, size1, organ1, rotatingGroup1);

  // Add auxiliary scene objects
  setupSceneObjects();

  // Add GUI, XR button, title, controllers
  setupOrganTitle(organ);
  setupXRButton();
  setupGUI();
  setupControllers();

  // On window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate() {
  renderer.setAnimationLoop(() => {
    rotatingGroup.rotation.y += ROTATIONSPEED;
    rotatingGroup1.rotation.y += ROTATIONSPEED;
    if (geometryGuiMesh) geometryGuiMesh.material.map.update();
    if (dataGuiMesh) dataGuiMesh.material.map.update();
    renderer.render(scene, camera);
  });
}


// =======================================
// Volume Loading & Material Setup
// =======================================

function addOrganVolume(center, size, organ, rotateGroup) {
  const nrrdPath = `../../data/${organ}_${VOLSIZE}.nrrd`;
  const threshold = isoThresholds[organ];
  params.threshold = threshold;
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;

  new NRRDLoader().load(nrrdPath, (volume) => {
    const texture = new THREE.Data3DTexture(volume.data, volume.xLength, volume.yLength, volume.zLength);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    const shader = VolumeRenderShader1;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['u_data'].value = texture;
    uniforms['u_size'].value.set(sx, sy, sz);
    uniforms['u_clim'].value.set(0, 1);
    uniforms['u_renderstyle'].value = params.useIsoSurface;
    uniforms['u_renderthreshold'].value = params.threshold;
    uniforms['u_cmdata'].value = cmtextures[params.colormap];

    thresholdUniformRef = uniforms['u_renderthreshold'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(sx / 2, sy / 2, sz / 2);
    volumeMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide
    });
    // const dummyMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
    // const mesh = new THREE.Mesh(geometry, dummyMaterial);
    const mesh = new THREE.Mesh(geometry, volumeMaterial);

    // Center the group and place mesh at origin-relative
    rotateGroup.position.set(cx, cy, cz);
    mesh.position.set(-sx / 2, -sy / 2, -sz / 2);
    rotateGroup.add(mesh);
    rotateGroup.lookAt(vrPosition);
  });
}

// =======================================
// Scene Objects
// =======================================

function initializeCenters(distance) {
  for (let organ of organs) {
    const center = new THREE.Vector3(0, 1.7, 0);
    const angle = (organs.indexOf(organ) / organs.length) * Math.PI * 2;
    center.x += Math.sin(angle) * distance;
    center.z -= Math.cos(angle) * distance;
    centers[organ] = center;
  }
}

function setupSceneObjects() {
  // Add floor
  addCylindricalFloor(scene, 5, 0.1, 64, 16);

  // generateCubes([VOLSIZE*0.5, VOLSIZE*0.5, VOLSIZE*0.5], 5, DISTANCE*0.5, scene);
  const path = `../../data/tongue_${VOLSIZE}.nrrd`
  const size2 = [VOLSIZE, VOLSIZE, VOLSIZE];
  const distance = DISTANCE;
  const offset = vrDirection.clone().multiplyScalar(distance);
  const center2 = vrPosition.clone().add(offset);
  center2.x += VOLSIZE * 0.5;
  //addNrrdVolume(center2, size2, path);

};

function addCylindricalFloor(scene, radius = 5, height = 0.2, radialSegments = 64, gridLines = 16) {
  // 1. Cylinder floor (grey)
  const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments);
  const cylinderMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const metallicMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,       // base grey color
    metalness: 0.6,         // fully metallic
    roughness: 0.2          // low roughness = shinier
  });
  const cylinder = new THREE.Mesh(cylinderGeometry, metallicMaterial);
  cylinder.position.y = -height / 2; // So top surface lies at y=0
  scene.add(cylinder);

  // 2. Grid circle on top face (white edges)
  const circleGeometry = new THREE.CircleGeometry(radius, radialSegments);
  circleGeometry.rotateX(-Math.PI / 2); // face up
  const circleEdges = new THREE.EdgesGeometry(circleGeometry);
  const circleLine = new THREE.LineSegments(
    circleEdges,
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  circleLine.position.y = 0.01; // Slightly above the floor to avoid z-fighting
  scene.add(circleLine);

  // 3. Radial lines (white)
  const center = new THREE.Vector3(0, 0.011, 0); // Slightly above for visibility
  for (let i = 0; i < gridLines; i++) {
    const angle = (i / gridLines) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const points = [center.clone(), new THREE.Vector3(x, center.y, z)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
    scene.add(line);
  }
}

function generateCubes(size, N, D, scene) {
  const [w, h, d] = size;
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2; // Distribute evenly over circle

    // Position on circle
    const x = D * Math.cos(angle);
    const z = D * Math.sin(angle);
    const y = 0; // flat circle on XZ plane

    // Create cube
    const geometry = new THREE.BoxGeometry(w, h, d);
    const cube = new THREE.Mesh(geometry, redMat);
    cube.position.set(x, y, z);

    // Make front face point toward origin
    cube.lookAt(0, y, 0); // Rotate so Z+ points toward origin

    scene.add(cube);
  }
}


// =======================================
// Environment Lighting 
// =======================================
function setupEnvironmentLighting() {
  // Lighting
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(5, 10, 7.5);
  scene.add(dirLight);

  // Skybox
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  const skybox = new THREE.CubeTextureLoader()
  .setPath('textures/skybox/')
  .load([
    'space_rt.png', // +X (right)
    'space_lf.png', // -X (left)
    'space_up.png', // +Y (up)
    'space_dn.png', // -Y (down)
    'space_ft.png', // +Z (front)
    'space_bk.png'  // -Z (back)
  ]);
  scene.background = skybox;     // ← makes it visible as background
  scene.environment = skybox;   // ← enables reflections


}

// =======================================
// GUI
// =======================================

function setupGUI() {
  // Geometry panel
  const geometryGui = new GUI({ width: 280 });
  geometryGui.title('Object Transforms');
  geometryGui.add(params, 'scale', 0.5, 1.5, 0.01).name('Scale').onChange((v) => {
    rotatingGroup.scale.set(v, v, v);
  });
  geometryGui.add(params, 'rotLR', -180, 180, 1).name('Rotate Left/Right').onChange((v) => {
    rotatingGroup.rotation.y = v * Math.PI / 180;
  });
  geometryGui.add(params, 'rotUD', -90, 90, 1).name('Rotate Up/Down').onChange((v) => {
    rotatingGroup.rotation.x = v * Math.PI / 180;
  });
  geometryGui.add(params, 'colormap', 1, 4, 1).name('Colormap').onChange((v) => {
    if (volumeMaterial && volumeMaterial.uniforms?.u_cmdata) {
      volumeMaterial.uniforms['u_cmdata'].value = cmtextures[v];
    }
  });
  geometryGui.domElement.style.visibility = 'hidden';

  const geometryHtmlMesh = new HTMLMesh(geometryGui.domElement);
  geometryHtmlMesh.position.set(0.15, 1.5, -0.55);
  geometryHtmlMesh.rotation.x = -65 * Math.PI / 180;
  geometryHtmlMesh.scale.setScalar(1);
  geometryGuiMesh = geometryHtmlMesh;

  // Data panel
  const dataGui = new GUI({ width: 280 });
  dataGui.title('Data Selection');

  // let organList = Object.keys(isoThresholds);
  // let currentIndex = organList.indexOf(params.organ);

 dataGui.add(params, 'useIsoSurface', 0, 1, 1)
    .name('MIP <> Isosurface')
    .onChange((v) => {
      if (volumeMaterial && volumeMaterial.uniforms?.u_renderstyle) {
        volumeMaterial.uniforms['u_renderstyle'].value = v ? 1 : 0;
      }
    });

  thresholdController = dataGui.add(params, 'threshold', 0, 1, 0.01)
    .name('Isosurface Threshold')
    .onChange((value) => {
      if (thresholdUniformRef) thresholdUniformRef.value = value;
    });

  dataGui.domElement.style.visibility = 'hidden';

  const dataHtmlMesh = new HTMLMesh(dataGui.domElement);
  dataHtmlMesh.position.set(-0.15, 1.5, -0.55);
  dataHtmlMesh.rotation.x = -65 * Math.PI / 180;
  dataHtmlMesh.scale.setScalar(1);
  dataGuiMesh = dataHtmlMesh;

  const group = new InteractiveGroup();
  group.listenToPointerEvents(renderer, camera);
  scene.add(group);
  group.add(geometryGuiMesh);
  group.add(dataGuiMesh);

  if (HIDEGUI) {
    dataHtmlMesh.visible = false;
    geometryHtmlMesh.visible = false;
  } 
}

// =======================================
// VR Controls
// =======================================

// Setup XR Button
function setupXRButton() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  const vrButton = VRButton.createButton(renderer);
  vrButton.style.position = 'absolute';
  vrButton.style.top = '50px';
  vrButton.style.height = '50px';
  vrButton.style.zIndex = '999';
  document.body.appendChild(vrButton);
};

function setupControllers() {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)]);

  const controller1 = renderer.xr.getController(0);
  controller1.add(new THREE.Line(geometry));
  scene.add(controller1);

  const controller2 = renderer.xr.getController(1);
  controller2.add(new THREE.Line(geometry));
  scene.add(controller2);

  const factory = new XRControllerModelFactory();

  const grip1 = renderer.xr.getControllerGrip(0);
  grip1.add(factory.createControllerModel(grip1));
  scene.add(grip1);

  const grip2 = renderer.xr.getControllerGrip(1);
  grip2.add(factory.createControllerModel(grip2));
  scene.add(grip2);
}

// =======================================
// Text Labels
// =======================================

function createTextLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 0.4, 1);
  return sprite;
}

function setupOrganTitle(organ) {
  organTitleMesh = createTextLabel(organ);
  organTitleMesh.position.set(0, 2.0, -1); // Adjust position as needed
  scene.add(organTitleMesh);
}
