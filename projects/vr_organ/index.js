import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { HTMLMesh } from 'three/addons/interactive/HTMLMesh.js';
import { InteractiveGroup } from 'three/addons/interactive/InteractiveGroup.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

let scene, camera, renderer, rotatingGroup;
let thresholdUniformRef; // keep reference for GUI control
let guiMesh;

const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

// GUI config object
const params = {
  threshold: 0.2,
  scale: 1.0,
  rotLR: 0,
  rotUD: 0,
};

init();
animate();

function addNrrdVolume(center, size, nrrdPath) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;

  const cmtextures = {
    viridis: new THREE.TextureLoader().load('textures/cm_viridis.png')
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
    uniforms['u_renderstyle'].value = 1; // ISO
    uniforms['u_renderthreshold'].value = params.threshold; // link to GUI param
    uniforms['u_cmdata'].value = cmtextures['viridis'];

    thresholdUniformRef = uniforms['u_renderthreshold']; // store reference

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
  });
}

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(light);

  rotatingGroup = new THREE.Group();
  scene.add(rotatingGroup);

  const nrrdPath = 'data/eye_256.nrrd';
  const scale = 1;
  const nrrdSize = [256 * scale, 256 * scale, 256 * scale];
  const nrrdDistance = 200 * scale;
  const nrrdOffset = vrDirection.clone().multiplyScalar(nrrdDistance);
  const center = vrPosition.clone().add(nrrdOffset);
  addNrrdVolume(center, nrrdSize, nrrdPath);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setupGUI();
  setupControllers();
}

function setupGUI() {
  const gui = new GUI({ width: 280 });
  gui.add(params, 'threshold', 0, 1, 0.01).name('Isosurface Threshold').onChange((value) => {
    if (thresholdUniformRef) thresholdUniformRef.value = value;
  });
  gui.add(params, 'scale', 0.5, 1.5, 0.01).name('Scale').onChange((value) => {
    rotatingGroup.scale.set(value, value, value);
  });
  gui.add(params, 'rotLR', -180, 180, 1).name('Rotate Left/Right').onChange((value) => {
    rotatingGroup.rotation.y = value * Math.PI / 180;
  });
  gui.add(params, 'rotUD', -90, 90, 1).name('Rotate Up/Down').onChange((value) => {
    rotatingGroup.rotation.x = value * Math.PI / 180;
  });
  gui.domElement.style.visibility = 'hidden';

  const htmlMesh = new HTMLMesh(gui.domElement);
  htmlMesh.position.set(0, 1.35, -1);
  htmlMesh.rotation.x = -55 * Math.PI / 180; // tilt down
  htmlMesh.scale.setScalar(1.5);
  guiMesh = htmlMesh;

  const group = new InteractiveGroup();
  group.listenToPointerEvents(renderer, camera);
  scene.add(group);
  group.add(guiMesh);
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

  const controllerModelFactory = new XRControllerModelFactory();

  const controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  const controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);
}

function animate() {
  renderer.setAnimationLoop(() => {
    rotatingGroup.rotation.y += 0.00;
    if (guiMesh) guiMesh.material.map.update();
    renderer.render(scene, camera);
  });
}
