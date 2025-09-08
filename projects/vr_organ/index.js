import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { VolumeRenderShader1 } from './shaders/VolumeShader.js';
import { SandboxShader } from './shaders/SandboxShader.js';

let scene, camera, renderer;
let rotatingGroups = {};
let centers = {};
let thresholdUniformRefs = {};
let volumeMaterials = {};
let organTransformsGuiMeshes = {}, organDataGuiMeshes = {};
let htmlGUI;
let organTitleMesh;

// PARAMETERS
const ROTATIONSPEED = 0.00;
const FOV = 100;
const DISTANCE = 170;
const HIDEGUI = false;
const FILESUFFIX = '2MB';
const START_ORGAN = 'kidney'

const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

const organs = ['kidney', 'heart', 'tongue', 'brain', 'eye'];

// GUI + data config
const isoThresholds = {
  eye: 0.19,
  heart: 0.50,
  tongue: 0.45,
  brain: 0.26,
  kidney: 0.40,
};

const rotations = {
  eye: new THREE.Euler(-17 * Math.PI / 180, -120 * Math.PI / 180, -85 * Math.PI / 180),
  heart: new THREE.Euler(0, 80 * Math.PI / 180, 90 * Math.PI / 180),
  tongue: new THREE.Euler(-22 * Math.PI / 180, 0, 0),
  brain: new THREE.Euler(0, -90 * Math.PI / 180, 90 * Math.PI / 180),
  kidney: new THREE.Euler(108 * Math.PI / 180, 180 * Math.PI / 180, 0),
};

const organParams = {};
for (let organ of organs) {
  organParams[organ] = {
    threshold: isoThresholds[organ],
    scale: 1,
    rotLR: 0,
    rotUD: 0,
    colormap: 1,
    useIsoSurface: 1,
  };
}

const organTitles = {
  eye: 'Eye',
  heart: 'Heart',
  tongue: 'Tongue',
  brain: 'Brain',
  kidney: 'Kidney', 
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
  initializeCenters(DISTANCE);

  // Setup camera
  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.copy(vrPosition);
  camera.lookAt(centers[START_ORGAN]);

  // Setup light & environment
  setupEnvironmentLighting();

  // Load volumetric organ data
  for (let organ of organs) {
    rotatingGroups[organ] = new THREE.Group(); // Add rotating group to enable transforms
    scene.add(rotatingGroups[organ]);
    addOrganVolume(centers[organ], organ, rotatingGroups[organ]);
  }

  // Add auxiliary scene objects
  setupSceneObjects();

  // Add XR button and XR controllers
  setupXRButton();
  setupControllers();

  // Add GUI
  //setupOrganTitles();
  setupOrganGUIs();

  // Add credits
  setupCredits(renderer);
  
  // On window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate() {
  renderer.setAnimationLoop(() => {
    for (let organ of organs) {
      // Rotate the volumes
      rotatingGroups[organ].rotation.x += ROTATIONSPEED;

      // Update the GUIs
      if (organTransformsGuiMeshes[organ]) organTransformsGuiMeshes[organ].material.map.update();
      if (organDataGuiMeshes[organ]) organDataGuiMeshes[organ].material.map.update();
    }
    renderer.render(scene, camera);
  });
}


// =======================================
// Volume Loading & Material Setup
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

function addOrganVolume(center, organ, rotateGroup) {
  const nrrdPath = `../../data/${organ}_${FILESUFFIX}.nrrd`;
  const threshold = isoThresholds[organ];
  organParams[organ].threshold = threshold;
  const [cx, cy, cz] = center;

  new NRRDLoader().load(nrrdPath, (volume) => {
    const sx = volume.xLength;
    const sy = volume.yLength;
    const sz = volume.zLength;
    const texture = new THREE.Data3DTexture(volume.data, sx, sy, sz);
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
    uniforms['u_renderstyle'].value = organParams[organ].useIsoSurface;
    uniforms['u_renderthreshold'].value = organParams[organ].threshold;
    uniforms['u_cmdata'].value = cmtextures[organParams[organ].colormap];

    thresholdUniformRefs[organ] = uniforms['u_renderthreshold'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(sx / 2, sy / 2, sz / 2);
    volumeMaterials[organ] = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide
    });
    const mesh = new THREE.Mesh(geometry, volumeMaterials[organ]);
    mesh.position.set(-sx / 2, -sy / 2, -sz / 2);

    // === Create group hierarchy ===
    const yawGroup = new THREE.Group();
    const placingGroup = new THREE.Group();

    scene.add(yawGroup);
    yawGroup.add(rotateGroup);
    rotateGroup.add(placingGroup);
    placingGroup.add(mesh);

    // === Positioning ===
    yawGroup.position.set(cx, cy, cz);
    yawGroup.lookAt(vrPosition); // Make it face the camera

    // === Apply fixed organ-specific rotation to placingGroup ===
    placingGroup.rotation.copy(rotations[organ]);
  });
}


// =======================================
// Scene Objects
// =======================================

function setupSceneObjects() {
  addCylindricalFloor(scene, 2, 0.1, 64, 10);
};

function addCylindricalFloor(scene, radius = 5, height = 0.2, radialSegments = 64, gridLines = 16) {
  const USESHADER = false;
  if (!USESHADER) {
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
    const num_circles = 5;
    for (let i = 1; i < num_circles+1; i++) {
      const circleGeometry = new THREE.CircleGeometry(i * radius / num_circles, radialSegments);
      circleGeometry.rotateX(-Math.PI / 2); // face up
      const circleEdges = new THREE.EdgesGeometry(circleGeometry);
      const circleLine = new THREE.LineSegments(
        circleEdges,
        new THREE.LineBasicMaterial({ color: 0xffffff })
      );
      circleLine.position.y = 0.01; // Slightly above the floor to avoid z-fighting
      scene.add(circleLine);
    }

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
  else {
    // Use sandbox shader
    const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments);
    const shader = SandboxShader;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['u_radius'].value = radius;
    uniforms['u_height'].value = height;
    uniforms['u_segments'].value = radialSegments;
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.FrontSide
    });
    const cylinder = new THREE.Mesh(cylinderGeometry, material);
    cylinder.position.y = -height / 2; // So top surface lies at y=0
    scene.add(cylinder);
  }
}


// =======================================
// Environment Lighting 
// =======================================
function setupEnvironmentLighting() {
  // Lighting
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(0, 1, 0);
  scene.add(dirLight);

  // Skybox
  // scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  // const skybox = new THREE.CubeTextureLoader()
  // .setPath('textures/skybox/')
  // .load([
  //   'space_rt.png', // +X (right)
  //   'space_lf.png', // -X (left)
  //   'space_up.png', // +Y (up)
  //   'space_dn.png', // -Y (down)
  //   'space_ft.png', // +Z (front)
  //   'space_bk.png'  // -Z (back)
  // ]);
  // scene.background = skybox;     // ← makes it visible as background
  // scene.environment = skybox;   // ← enables reflections


}

// =======================================
// GUI
// =======================================

function setupOrganGUIs() {
  const offset = 0.081;
  const guiDistance = 0.27;
  const guiScale = 0.65;
  const guiHeight = 1.47;
  
  const group = new InteractiveGroup();
  group.listenToPointerEvents(renderer, camera);
  scene.add(group);
  for (let organ of organs) {
    // Transforms panel
    const transformsGui = new GUI({ width: 250 });
    transformsGui.title(`${organTitles[organ]} - Transforms`);
    transformsGui.add(organParams[organ], 'scale', 0.5, 2, 0.01).name('Scale').onChange((v) => {
      rotatingGroups[organ].scale.set(v, v, v);
    });
    transformsGui.add(organParams[organ], 'rotLR', -180, 180, 1).name('Rotate Left/Right').onChange((v) => {
      rotatingGroups[organ].rotation.y = v * Math.PI / 180;
    });
    transformsGui.add(organParams[organ], 'rotUD', -180, 180, 1).name('Rotate Up/Down').onChange((v) => {
      rotatingGroups[organ].rotation.x = v * Math.PI / 180;
    });
    transformsGui.domElement.style.visibility = 'hidden';
    
    organTransformsGuiMeshes[organ] = new HTMLMesh(transformsGui.domElement);
    const angle = (organs.indexOf(organ) / organs.length) * Math.PI * 2;
    const position = new THREE.Vector3(0, guiHeight, 0);
    position.x += Math.sin(angle) * guiDistance;
    position.z -= Math.cos(angle) * guiDistance;
    organTransformsGuiMeshes[organ].position.copy(position);
    organTransformsGuiMeshes[organ].lookAt(vrPosition);
    const localX = new THREE.Vector3(1, 0, 0); // local x direction
    const organTransformsOffset = localX.applyQuaternion(organTransformsGuiMeshes[organ].quaternion).multiplyScalar(offset);
    organTransformsGuiMeshes[organ].position.add(organTransformsOffset);
    organTransformsGuiMeshes[organ].scale.setScalar(guiScale);
    
    // Data panel
    const dataGui = new GUI({ width: 250 });
    dataGui.title(`${organTitles[organ]} - Visualization`);

    dataGui.add(organParams[organ], 'useIsoSurface', 0, 1, 1)
      .name('MIP <> Isosurface')
      .onChange((v) => {
        if (volumeMaterials[organ] && volumeMaterials[organ].uniforms?.u_renderstyle) {
          volumeMaterials[organ].uniforms['u_renderstyle'].value = v ? 1 : 0;
        }
      });
      dataGui.add(organParams[organ], 'threshold', 0, 1, 0.01)
      .name('Isosurf. Threshold')
      .onChange((value) => {
        if (thresholdUniformRefs[organ]) thresholdUniformRefs[organ].value = value;
      });
      dataGui.add(organParams[organ], 'colormap', 1, 4, 1).name('Colormap').onChange((v) => {
        if (volumeMaterials[organ] && volumeMaterials[organ].uniforms?.u_cmdata) {
          volumeMaterials[organ].uniforms['u_cmdata'].value = cmtextures[v];
        }
    });
    dataGui.domElement.style.visibility = 'hidden';

    organDataGuiMeshes[organ] = new HTMLMesh(dataGui.domElement);
    const position2 = new THREE.Vector3(0, guiHeight, 0);
    position2.x += Math.sin(angle) * guiDistance;
    position2.z -= Math.cos(angle) * guiDistance;
    organDataGuiMeshes[organ].position.copy(position2);
    organDataGuiMeshes[organ].lookAt(vrPosition);
    const localX2 = new THREE.Vector3(-1, 0, 0); // local x direction
    const organDataOffset = localX2.applyQuaternion(organDataGuiMeshes[organ].quaternion).multiplyScalar(offset);
    organDataGuiMeshes[organ].position.add(organDataOffset);
    organDataGuiMeshes[organ].scale.setScalar(guiScale); 

    // Add to interactive group
    group.add(organTransformsGuiMeshes[organ]);
    group.add(organDataGuiMeshes[organ]);
    
    if (HIDEGUI) {
      organTransformsGuiMeshes[organ].visible = false;
      organDataGuiMeshes[organ].visible = false;
    }
  }
  
  // Add organ selection GUI (only non-xr)
  htmlGUI = new GUI({ width: 200});
  htmlGUI.title('Organ Selection');
  
  htmlGUI.domElement.style.position = 'absolute';
  htmlGUI.domElement.style.left = '50%';
  htmlGUI.domElement.style.transform ='translateX(-50%)';
  htmlGUI.domElement.style.top = '100px';
  htmlGUI.domElement.style.zIndex = '1000'; // make sure it's on top
  
  const guiParams = { selectedOrgan: START_ORGAN };
  
  htmlGUI.add(guiParams, 'selectedOrgan', Object.keys(isoThresholds))
  .name('Organ Selection')
  .onChange((organ) => {
    camera.lookAt(centers[organ]);
  });
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

function createTextLabel(organ) {
  const text = organTitles[organ];
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

function setupOrganTitles() {
  const titleDistance = 0.5;
  for (let organ of organs) {
    organTitleMesh = createTextLabel(organ);
    const angle = (organs.indexOf(organ) / organs.length) * Math.PI * 2;
    const position = new THREE.Vector3(0, 1.93, 0);
    position.x += Math.sin(angle) * titleDistance;
    position.z -= Math.cos(angle) * titleDistance;
    organTitleMesh.position.copy(position);
    organTitleMesh.lookAt(vrPosition);
    scene.add(organTitleMesh);
  }
}

// =======================================
// Credit watermark
// =======================================

function setupCredits(renderer) {
  const creditsDiv = document.createElement('div');
  creditsDiv.id = 'credits';
  creditsDiv.innerHTML = 'Code by Christoph Karg <br>Data by Dechend Lab';
  creditsDiv.style.position = 'absolute';
  creditsDiv.style.top = '10px';
  creditsDiv.style.right = '10px';
  creditsDiv.style.fontSize = '12px';
  creditsDiv.style.color = '#888';
  creditsDiv.style.fontFamily = 'sans-serif';
  creditsDiv.style.background = 'rgba(255, 255, 255, 0.2)';
  creditsDiv.style.padding = '5px 8px';
  creditsDiv.style.borderRadius = '5px';
  creditsDiv.style.zIndex = '999';
  document.body.appendChild(creditsDiv);

  // XR session change detection
  renderer.xr.addEventListener('sessionstart', () => {
    creditsDiv.style.display = 'none';
  });

  renderer.xr.addEventListener('sessionend', () => {
    creditsDiv.style.display = 'block';
  });
}

