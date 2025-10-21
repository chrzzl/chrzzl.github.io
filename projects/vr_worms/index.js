import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import { WormShader } from './shaders/WormShader.js';
import { SandboxShader } from './shaders/SandboxShader.js';

let scene, camera, renderer;
let rotatingGroups = {};
let centers = {};
let thresholdUniformRefs = {};
let volumeMaterials = {};
let wormTransformsGuiMesh, wormDataGuiMesh;
let wormTitleMesh;
let controller1, controller2;
let group; // GUI group

// PARAMETERS
const ROTATIONSPEED = 0.0;
const FOV = 90;
const DISTANCE = 270;
const HIDEGUI = false;
const START_worm = 'raw'
const SCALE_COEFF = 0.5;

const vrPosition = new THREE.Vector3(0, 1.7, 0);

const volumes = ['raw', 'gt_mask', 'stardist_mask'];

// GUI + data config
const isoThresholds = {
  raw: 0.09,
  gt_mask: 0.00,
  stardist_mask: 0.00,
};

const colormaps = {
  raw: 3,
  gt_mask: 1,
  stardist_mask: 1,
};

// NOTE: 0 = raw, 1 = fg_bg, 2 = instances
const renderstyles = {
  raw: 0,
  gt_mask: 2,
  stardist_mask: 2,
};

const rotations = {
  raw: new THREE.Euler(90 * Math.PI / 180, 90 * Math.PI / 180, 0 * Math.PI / 180),
  gt_mask: new THREE.Euler(90 * Math.PI / 180, 90 * Math.PI / 180, 0 * Math.PI / 180),
  stardist_mask: new THREE.Euler(90 * Math.PI / 180, 90 * Math.PI / 180, 0 * Math.PI / 180),
};

const wormParams = {};
for (let worm of volumes) {
  wormParams[worm] = {
    threshold: isoThresholds[worm],
    renderstyle: renderstyles[worm],
    colormap: colormaps[worm],
    opacity: 1,
  };
}

const transformParams = {
  scale: 1,
  rotLR: 0,
  rotUD: 0,
  interwormDistance: 100,
  leftrightOffset: 0,
}

const filePaths = {
  raw: '../../data/worms/raw.nrrd',
  gt_mask: '../../data/worms/mask.nrrd',
  stardist_mask: '../../data/worms/stardist_mask.nrrd',
};

const wormTitles = {
  raw: 'Raw',
  gt_mask: 'GT Mask',
  stardist_mask: 'StarDist Mask',
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
  camera.lookAt(centers[START_worm]);

  // Setup light & environment
  setupEnvironmentLighting();

  // Load volumetric worm data
  for (let worm of volumes) {
    rotatingGroups[worm] = new THREE.Group(); // Add rotating group to enable transforms
    scene.add(rotatingGroups[worm]);
    addwormVolume(centers[worm], worm, rotatingGroups[worm]);
  }

  // Add auxiliary scene objects
  setupSceneObjects();

  // Add XR button and XR controllers
  setupXRButton();
  setupControllers();

  // Add GUI
  //setupwormTitles();
  setupwormGUIs();

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
    for (let worm of volumes) {
      // Rotate the volumes
      rotatingGroups[worm].rotation.x += ROTATIONSPEED;

      // Update the GUIs
      if (wormTransformsGuiMesh) wormTransformsGuiMesh.material.map.update();
      if (wormDataGuiMesh) wormDataGuiMesh.material.map.update();
    }
    renderer.render(scene, camera);
  });
}


// =======================================
// Volume Loading & Material Setup
// =======================================

function initializeCenters(distance) {
  const rawCenter = new THREE.Vector3(0, 1.7, -distance);
  centers['raw'] = rawCenter;
  const gt_maskCenter = new THREE.Vector3(0, 1.7, -distance);
  centers['gt_mask'] = gt_maskCenter;
  const stardist_maskCenter = new THREE.Vector3(0, 1.7, -distance);
  centers['stardist_mask'] = stardist_maskCenter;
}

function addwormVolume(center, worm, rotateGroup) {
  const nrrdPath = filePaths[worm];
  const threshold = isoThresholds[worm];
  wormParams[worm].threshold = threshold;
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

    const shader = WormShader;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms['u_data'].value = texture;
    uniforms['u_size'].value.set(sx, sy, sz);
    uniforms['u_clim'].value.set(0, 1);
    uniforms['u_opacity'].value = wormParams[worm].opacity;
    uniforms['u_renderstyle'].value = wormParams[worm].renderstyle;
    uniforms['u_renderthreshold'].value = wormParams[worm].threshold;
    uniforms['u_cmdata'].value = cmtextures[wormParams[worm].colormap];

    thresholdUniformRefs[worm] = uniforms['u_renderthreshold'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(sx / 2, sy / 2, sz / 2);
    volumeMaterials[worm] = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, volumeMaterials[worm]);
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

    // === Apply fixed worm-specific rotation to placingGroup ===
    placingGroup.rotation.copy(rotations[worm]);

    // Scale
    const volumescale = transformParams.scale * SCALE_COEFF;
    rotatingGroups[worm].scale.set(volumescale, volumescale, volumescale);

    // Offset
    rotatingGroups['raw'].position.y = 1.7 - transformParams.interwormDistance;
    rotatingGroups['gt_mask'].position.y = 1.7;
    rotatingGroups['stardist_mask'].position.y = 1.7 + transformParams.interwormDistance;
  });
}


// =======================================
// Scene Objects
// =======================================

function setupSceneObjects() {
  const floorRadius = 2;
  addCylindricalFloor(scene, floorRadius, 0.1, 64, 10);
};

function addCylindricalFloor(scene, radius, height, radialSegments, gridLines) {
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

function setupwormGUIs() {
  const offset = 0.75;
  const guiDistance = 3.5;
  const guiScale = 6.0;
  const guiHeight = -0.5;
  const guiWidth = 250;

  if (!group) {
    group = new InteractiveGroup();
    group.listenToPointerEvents(renderer, camera);
    scene.add(group);

    // if controllers already exist, hook them up now
    if (controller1) group.listenToXRControllerEvents(controller1);
    if (controller2) group.listenToXRControllerEvents(controller2);
  }

  // Transforms panel
  const transformsGui = new GUI({ width: guiWidth });
  transformsGui.title(`Transforms`);
  transformsGui.add(transformParams, 'scale', 1, 3, 0.1).name('Scale').onChange((v) => {
    rotatingGroups['raw'].scale.set(v*SCALE_COEFF, v*SCALE_COEFF, v*SCALE_COEFF);
    rotatingGroups['gt_mask'].scale.set(v*SCALE_COEFF, v*SCALE_COEFF, v*SCALE_COEFF);
    rotatingGroups['stardist_mask'].scale.set(v*SCALE_COEFF, v*SCALE_COEFF, v*SCALE_COEFF);
  });
  // transformsGui.add(transformParams, 'rotLR', -180, 180, 1).name('Rotate Left/Right').onChange((v) => {
  //   rotatingGroups['raw'].rotation.y = v * Math.PI / 180;
  //   rotatingGroups['gt_mask'].rotation.y = v * Math.PI / 180;
  //   rotatingGroups['stardist_mask'].rotation.y = v * Math.PI / 180;
  // });
  transformsGui.add(transformParams, 'rotUD', -180, 180, 1).name('Rotate Up/Down').onChange((v) => {
    rotatingGroups['raw'].rotation.x = v * Math.PI / 180;
    rotatingGroups['gt_mask'].rotation.x = v * Math.PI / 180;
    rotatingGroups['stardist_mask'].rotation.x = v * Math.PI / 180;
  });
  transformsGui.add(transformParams, 'interwormDistance', 0, 100, 1).name('Interworm Distance').onChange((v) => {
    rotatingGroups['raw'].position.y = 1.7 - v;
    rotatingGroups['gt_mask'].position.y = 1.7;
    rotatingGroups['stardist_mask'].position.y = 1.7 + v;
  });
  transformsGui.domElement.style.visibility = 'hidden';
  
  wormTransformsGuiMesh = new HTMLMesh(transformsGui.domElement);
  const angle = 0;
  const position = new THREE.Vector3(0, guiHeight, 0);
  position.x += Math.sin(angle) * guiDistance;
  position.z -= Math.cos(angle) * guiDistance;
  wormTransformsGuiMesh.position.copy(position);
  wormTransformsGuiMesh.lookAt(vrPosition);
  const localX = new THREE.Vector3(1, 0, 0); // local x direction
  const wormTransformsOffset = localX.applyQuaternion(wormTransformsGuiMesh.quaternion).multiplyScalar(offset);
  wormTransformsGuiMesh.position.add(wormTransformsOffset);
  wormTransformsGuiMesh.scale.setScalar(guiScale);
  
  // Data panel
  const dataGui = new GUI({ width: guiWidth });
  dataGui.title(`Visualization`);

  // dataGui.add(wormParams['raw'], 'useIsoSurface', 0, 1, 1)
  //   .name('MIP <> Isosurface')
  //   .onChange((v) => {
  //     if (volumeMaterials[worm] && volumeMaterials[worm].uniforms?.u_renderstyle) {
  //       volumeMaterials[worm].uniforms['u_renderstyle'].value = v ? 1 : 0;
  //     }
  //   });
  dataGui.add(wormParams['raw'], 'threshold', 0, 1, 0.01)
    .name('Isosurf. Threshold')
    .onChange((value) => {
      if (thresholdUniformRefs['raw']) thresholdUniformRefs['raw'].value = value;
    });
  for (let worm of volumes) {
    dataGui.add(wormParams[worm], 'opacity', 0, 1, 0.01)
      .name(`${worm} volume opacity`)
      .onChange((value) => {
        if (volumeMaterials[worm] && volumeMaterials[worm].uniforms?.u_opacity) {
          volumeMaterials[worm].uniforms['u_opacity'].value = value;
        }
      });
  }
  // dataGui.add(wormParams[worm], 'colormap', 1, 4, 1).name('Colormap').onChange((v) => {
  //     if (volumeMaterials[worm] && volumeMaterials[worm].uniforms?.u_cmdata) {
  //       volumeMaterials[worm].uniforms['u_cmdata'].value = cmtextures[v];
  //     }
  // });
  dataGui.domElement.style.visibility = 'hidden';

  wormDataGuiMesh = new HTMLMesh(dataGui.domElement);
  const position2 = new THREE.Vector3(0, guiHeight, 0);
  position2.x += Math.sin(angle) * guiDistance;
  position2.z -= Math.cos(angle) * guiDistance;
  wormDataGuiMesh.position.copy(position2);
  wormDataGuiMesh.lookAt(vrPosition);
  const localX2 = new THREE.Vector3(-1, 0, 0); // local x direction
  const wormDataOffset = localX2.applyQuaternion(wormDataGuiMesh.quaternion).multiplyScalar(offset);
  wormDataGuiMesh.position.add(wormDataOffset);
  wormDataGuiMesh.scale.setScalar(guiScale); 

  // Add to interactive group
  group.add(wormTransformsGuiMesh);
  group.add(wormDataGuiMesh);
  
  if (HIDEGUI) {
    wormTransformsGuiMesh.visible = false;
    wormDataGuiMesh.visible = false;
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
  const geometry = new THREE.BufferGeometry()
    .setFromPoints([ new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-5) ]);

  controller1 = renderer.xr.getController(0);
  controller1.add(new THREE.Line(geometry));
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.add(new THREE.Line(geometry));
  scene.add(controller2);

  const factory = new XRControllerModelFactory();
  const grip1 = renderer.xr.getControllerGrip(0);
  grip1.add(factory.createControllerModel(grip1));
  scene.add(grip1);

  const grip2 = renderer.xr.getControllerGrip(1);
  grip2.add(factory.createControllerModel(grip2));
  scene.add(grip2);

  // hook controllers into the interactive group if it already exists
  if (group) {
    group.listenToXRControllerEvents(controller1);
    group.listenToXRControllerEvents(controller2);
  }
}


// =======================================
// Text Labels
// =======================================

function createTextLabel(worm) {
  const text = wormTitles[worm];
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

function setupwormTitle(worm) {
  wormTitleMesh = createTextLabel(worm);
  wormTitleMesh.position.set(0, 2.0, -1); // Adjust position as needed
  scene.add(wormTitleMesh);
}

function setupwormTitles() {
  const titleDistance = 0.5;
  for (let worm of volumes) {
    wormTitleMesh = createTextLabel(worm);
    const angle = (volumes.indexOf(worm) / volumes.length) * Math.PI * 2;
    const position = new THREE.Vector3(0, 1.93, 0);
    position.x += Math.sin(angle) * titleDistance;
    position.z -= Math.cos(angle) * titleDistance;
    wormTitleMesh.position.copy(position);
    wormTitleMesh.lookAt(vrPosition);
    scene.add(wormTitleMesh);
  }
}

// =======================================
// Credit watermark
// =======================================

function setupCredits(renderer) {
  const creditsDiv = document.createElement('div');
  creditsDiv.id = 'credits';
  creditsDiv.innerHTML = 'Code by C. Karg from Kainmüller Lab <br>Data by TODO';
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

