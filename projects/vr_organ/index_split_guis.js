import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let scene, camera, renderer, rotatingGroup;
let thresholdUniformRef;
let geometryGuiMesh, dataGuiMesh;
let thresholdController;
let organTitleMesh;
let htmlGUI;

const ROTATIONSPEED = 0.00;
const FOV = 50;
const DISTANCE = 312;
const VOLSIZE = 128;

const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

const params = {
  organ: 'eye',
  threshold: 0.2,
  scale: 1.0,
  rotLR: 0,
  rotUD: 0,
};

const isoThresholds = {
  eye: 0.20,
  heart: 0.40,
  tongue: 0.30,
  brain: 0.24,
  kidney: 0.40,
};

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  rotatingGroup = new THREE.Group();
  scene.add(rotatingGroup);

  organTitleMesh = createTextLabel(params.organ);
  organTitleMesh.position.set(0, 2.0, -1);
  scene.add(organTitleMesh);

  loadCurrentOrganVolume();

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

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setupDesktopGUI();
  setupControllers();

  renderer.xr.addEventListener('sessionstart', () => {
    if (htmlGUI) {
      htmlGUI.destroy();
      htmlGUI = null;
    }
    setupVRGUI();
  });
}

function loadCurrentOrganVolume() {
  if (rotatingGroup.userData.volumeMesh) {
    rotatingGroup.remove(rotatingGroup.userData.volumeMesh);
    rotatingGroup.userData.volumeMesh.geometry.dispose();
    rotatingGroup.userData.volumeMesh.material.dispose();
  }

  const organ = params.organ;
  const threshold = isoThresholds[organ];
  params.threshold = threshold;

  const size = [VOLSIZE, VOLSIZE, VOLSIZE];
  const distance = DISTANCE;
  const offset = vrDirection.clone().multiplyScalar(distance);
  const center = vrPosition.clone().add(offset);

  const nrrdPath = `../../data/${organ}_${VOLSIZE}.nrrd`;
  addNrrdVolume(center, size, nrrdPath);
  updateTitle();
}

function addNrrdVolume(center, size, nrrdPath) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;

  const cmtextures = {
    plasma: new THREE.TextureLoader().load('textures/cm_plasma.png'),
  };

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
    uniforms['u_renderstyle'].value = 0;
    uniforms['u_renderthreshold'].value = params.threshold;
    uniforms['u_cmdata'].value = cmtextures['plasma'];

    thresholdUniformRef = uniforms['u_renderthreshold'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(sx / 2, sy / 2, sz / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide
    }));

    rotatingGroup.position.set(cx, cy, cz);
    mesh.position.set(-sx / 2, -sy / 2, -sz / 2);
    rotatingGroup.add(mesh);
    rotatingGroup.userData.volumeMesh = mesh;
  });
}

function setupDesktopGUI() {
  htmlGUI = new GUI({ width: 300});
  htmlGUI.title('Organ Viewer');

  htmlGUI.domElement.style.position = 'auto';
  htmlGUI.domElement.style.left = '10px';
  htmlGUI.domElement.style.top = '60vh';
  htmlGUI.domElement.style.zIndex = '1000'; // make sure it's on top

  htmlGUI.add(params, 'organ', Object.keys(isoThresholds))
    .name('Organ')
    .onChange((organ) => {
      params.threshold = isoThresholds[organ];
      thresholdController.setValue(params.threshold);
      loadCurrentOrganVolume();
    });

  thresholdController = htmlGUI.add(params, 'threshold', 0, 1, 0.01)
    .name('Isosurface Threshold')
    .onChange((value) => {
      if (thresholdUniformRef) thresholdUniformRef.value = value;
    });

  htmlGUI.add(params, 'scale', 0.5, 2, 0.01).name('Scale').onChange((v) => {
    rotatingGroup.scale.set(v, v, v);
  });
  htmlGUI.add(params, 'rotLR', -180, 180, 1).name('Rotate L/R').onChange((v) => {
    rotatingGroup.rotation.y = v * Math.PI / 180;
  });
  htmlGUI.add(params, 'rotUD', -90, 90, 1).name('Rotate U/D').onChange((v) => {
    rotatingGroup.rotation.x = v * Math.PI / 180;
  });
}

function setupVRGUI() {
  const geometryGui = new GUI({ width: 280 });
  geometryGui.title('Object Transforms');
  geometryGui.add(params, 'scale', 0.5, 1.5, 0.01).name('Scale').onChange((v) => {
    rotatingGroup.scale.set(v, v, v);
  });
  geometryGui.add(params, 'rotLR', -180, 180, 1).name('Rotate L/R').onChange((v) => {
    rotatingGroup.rotation.y = v * Math.PI / 180;
  });
  geometryGui.add(params, 'rotUD', -90, 90, 1).name('Rotate U/D').onChange((v) => {
    rotatingGroup.rotation.x = v * Math.PI / 180;
  });
  geometryGui.domElement.style.visibility = 'hidden';

  geometryGuiMesh = new HTMLMesh(geometryGui.domElement);
  geometryGuiMesh.position.set(0.15, 1.5, -0.55);
  geometryGuiMesh.rotation.x = -65 * Math.PI / 180;
  geometryGuiMesh.scale.setScalar(1);

  const dataGui = new GUI({ width: 280 });
  dataGui.title('Data');
  const organList = Object.keys(isoThresholds);
  let currentIndex = organList.indexOf(params.organ);

  function switchOrgan(direction) {
    currentIndex = (currentIndex + direction + organList.length) % organList.length;
    params.organ = organList[currentIndex];
    params.threshold = isoThresholds[params.organ];
    thresholdController.setValue(params.threshold);
    loadCurrentOrganVolume();
  }

  dataGui.add({ prev: () => switchOrgan(-1) }, 'prev').name('← Prev Organ');
  dataGui.add({ next: () => switchOrgan(1) }, 'next').name('Next Organ →');

  thresholdController = dataGui.add(params, 'threshold', 0, 1, 0.01)
    .name('Isosurface Threshold')
    .onChange((value) => {
      if (thresholdUniformRef) thresholdUniformRef.value = value;
    });

  dataGui.domElement.style.visibility = 'hidden';
  dataGuiMesh = new HTMLMesh(dataGui.domElement);
  dataGuiMesh.position.set(-0.15, 1.5, -0.55);
  dataGuiMesh.rotation.x = -65 * Math.PI / 180;
  dataGuiMesh.scale.setScalar(1);

  const group = new InteractiveGroup();
  group.listenToPointerEvents(renderer, camera);
  scene.add(group);
  group.add(geometryGuiMesh);
  group.add(dataGuiMesh);
}

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

function animate() {
  renderer.setAnimationLoop(() => {
    rotatingGroup.rotation.y += ROTATIONSPEED;
    if (geometryGuiMesh) geometryGuiMesh.material.map.update();
    if (dataGuiMesh) dataGuiMesh.material.map.update();
    renderer.render(scene, camera);
  });
}

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

function updateTitle() {
  if (organTitleMesh) scene.remove(organTitleMesh);
  organTitleMesh = createTextLabel(params.organ);
  organTitleMesh.position.set(0, 2.0, -1);
  scene.add(organTitleMesh);
}
