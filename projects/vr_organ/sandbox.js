import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { VolumeRenderShader1 } from './shaders/VolumeShader.js';
import { SandboxShader } from './shaders/SandboxShader.js';

let scene, camera, renderer, rotatingGroup;
let thresholdUniformRef;
let volumeMaterial;
let geometryGuiMesh, dataGuiMesh;
let mesh;
let cylinder;

// PARAMETERS
const ROTATIONSPEED = 0.004;
const FOV = 60;
const DISTANCE = 312;
const VOLSIZE = 128;
const HIDEGUI = true;

const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);


// GUI + data config
const params = {
  organ: 'eye',
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

  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(10, 20, 10);
  scene.add(light);

  // Setup camera
  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));

  // Initial load of volumetric organ data
  // rotatingGroup = new THREE.Group();
  // scene.add(rotatingGroup);
  // loadOrganVolume(params.organ);

  addCylinder();

  // Add GUI, XR button, title, controllers
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
    const rot = 0;//1.1;
    //rotatingGroup.rotation.y = rot;
    if (mesh) {
      mesh.rotation.x = rot;
    }
    if (cylinder) {
      cylinder.rotation.x += 0.004;
      cylinder.rotation.z += 0.004;
    }

    if (geometryGuiMesh) geometryGuiMesh.material.map.update();
    if (dataGuiMesh) dataGuiMesh.material.map.update();
    renderer.render(scene, camera);
  });
}


// =======================================
// Volume Loading & Material Setup
// =======================================

function addNrrdVolume(center, nrrdPath) {
  const [cx, cy, cz] = center;

  new NRRDLoader().load(nrrdPath, (volume) => {
    const sx = volume.xLength;
    const sy = volume.yLength;
    const sz = volume.zLength;
    const texture = new THREE.Data3DTexture(volume.data, volume.xLength, volume.yLength, volume.zLength);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    const shader = VolumeRenderShader1;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['u_data'].value = texture; // 2D texture with voxels starting at (0,0,0)
    uniforms['u_size'].value.set(sx, sy, sz);
    uniforms['u_clim'].value.set(0, 1);
    uniforms['u_renderstyle'].value = params.useIsoSurface;
    uniforms['u_renderthreshold'].value = params.threshold;
    uniforms['u_cmdata'].value = cmtextures[params.colormap];

    thresholdUniformRef = uniforms['u_renderthreshold'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz); // Box centered at origin
    geometry.translate(sx / 2, sy / 2, sz / 2); // Box centered at (sx/2, sy/2, sz/2), starting at (0,0,0)
    volumeMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide
    });
    mesh = new THREE.Mesh(geometry, volumeMaterial);


    // Center the group and place mesh at origin-relative
    rotatingGroup.position.copy(center);
    mesh.position.set(-sx / 2, -sy / 2, -sz / 2);
    rotatingGroup.add(mesh);

    rotatingGroup.position.x += 90;
    rotatingGroup.position.y += 60;
    rotatingGroup.rotation.y += 80;
    rotatingGroup.rotation.x += -78;

    // Save reference to mesh for later removal
    rotatingGroup.userData.volumeMesh = mesh;
  });
}

function loadOrganVolume(organ) {
  // Compute position
  const distance = DISTANCE;
  const offset = vrDirection.clone().multiplyScalar(distance);
  const center = vrPosition.clone().add(offset);

  // Load new volume
  const nrrdPath = `../../data/ball_${VOLSIZE}.nrrd`;
  addNrrdVolume(center, nrrdPath);
}

function addCylinder() {
  // Compute position
  const distance = 40;
  const offset = vrDirection.clone().multiplyScalar(distance);
  const center = vrPosition.clone().add(offset);
  const radius = 10;
  const height = 1;
  const radialSegments = 40;
  const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments);
  const cylinderMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });

  const shader = SandboxShader;
  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      'u_radius': { value: radius },
      'u_height': { value: height },
      'u_segments': { value: radialSegments }
    },
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    side: THREE.FrontSide
  });

  cylinder = new THREE.Mesh(cylinderGeometry, shaderMaterial);
  cylinder.position.copy(center);
  scene.add(cylinder);

  cylinder.rotation.x = Math.PI / 4;
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
  geometryGui.add(params, 'useIsoSurface', 0, 1, 1)
    .name('MIP <> Isosurface')
    .onChange((v) => {
      if (volumeMaterial && volumeMaterial.uniforms?.u_renderstyle) {
        volumeMaterial.uniforms['u_renderstyle'].value = v ? 1 : 0;
      }
    });
  geometryGui.domElement.style.visibility = 'hidden';

  const geometryHtmlMesh = new HTMLMesh(geometryGui.domElement);
  geometryHtmlMesh.position.set(0, 1.5, -0.55);
  geometryHtmlMesh.rotation.x = -65 * Math.PI / 180;
  geometryHtmlMesh.scale.setScalar(1);
  geometryGuiMesh = geometryHtmlMesh;

  const group = new InteractiveGroup();
  group.listenToPointerEvents(renderer, camera);
  scene.add(group);
  group.add(geometryGuiMesh);

  if (HIDEGUI) {
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
