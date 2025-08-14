import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// === CONFIG ===
const usePerspectiveCamera = true; // ← Toggle this to switch views
const showWireframe = false;      // ← Toggle this to show/hide wireframe

let scene, camera, renderer, rotatingGroup;

init();
addVolumeBox('data/kidney_256.nrrd', [0, 0, 0], [256, 256, 256]);

function init() {
  scene = new THREE.Scene();

  const aspect = window.innerWidth / window.innerHeight;

  if (usePerspectiveCamera) {
    const fov = 30;
    camera = new THREE.PerspectiveCamera(fov, aspect, 1, 2000);
    camera.position.set(500, 0, 0);
  } else {
    const d = 200;
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 2000);
    camera.position.set(100, 0, 0);
  }

  camera.up.set(0, 0, 1);
  //camera.lookAt(0, 0, 0);

  // --- Renderer with XR enabled ---
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true; // XR support
  document.body.appendChild(renderer.domElement);

  // Add VR button to enter headset view
  document.body.appendChild(VRButton.createButton(renderer));

  window.addEventListener('resize', onWindowResize);

  // --- Rotating group ---
  rotatingGroup = new THREE.Group();
  scene.add(rotatingGroup);

  renderer.setAnimationLoop(animate); // XR-safe loop
}

function addVolumeBox(nrrdPath, center, size) {
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
    uniforms['u_renderthreshold'].value = 0.4;
    uniforms['u_cmdata'].value = cmtextures['viridis'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(sx / 2, sy / 2, sz / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide
    }));
    mesh.position.set(cx - sx / 2, cy - sy / 2, cz - sz / 2);

    const edges = new THREE.EdgesGeometry(geometry);
    const wireframe = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x00ff00 })
    );
    wireframe.position.copy(mesh.position);

    rotatingGroup.add(mesh);
    if (showWireframe) rotatingGroup.add(wireframe);
  });
}

function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;

  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
  } else {
    const d = 200;
    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;
  }

  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  rotatingGroup.rotation.z += 0.003;
  renderer.render(scene, camera);
}
