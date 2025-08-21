import * as THREE from 'three';
import { NRRDLoader } from 'three/addons/loaders/NRRDLoader.js';
import { VolumeRenderShader1 } from 'three/addons/shaders/VolumeShader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';


let scene, camera, renderer, rotatingGroup;

// === CONFIG ===
// const usePerspectiveCamera = true; // ← Toggle this to switch views
const showWireframe = false;      // ← Toggle this to show/hide wireframe


// Standard XR starting pose
const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

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
    uniforms['u_renderthreshold'].value = 0.2;
    uniforms['u_cmdata'].value = cmtextures['viridis'];

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(sx / 2, sy / 2, sz / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      side: THREE.BackSide
    }));
    rotatingGroup.position.set(cx, cy, cz);
    mesh.position.set(-sx / 2, -sy / 2, -sz / 2); // center relative to group
    rotatingGroup.add(mesh);


    const edges = new THREE.EdgesGeometry(geometry);
    const wireframe = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x00ff00 })
    );
    wireframe.position.copy(mesh.position);
    if (showWireframe) rotatingGroup.add(wireframe);
  });
}

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));

  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(light);

  // --- Rotating group ---
  rotatingGroup = new THREE.Group();
  scene.add(rotatingGroup);

  // Add NRRD volume
  const nrrdPath = 'data/eye_256.nrrd';
  const scale = 1;
  const nrrdSize = [256*scale, 256*scale, 256*scale];
  const nrrdDistance = 200*scale;
  const nrrdOffset = vrDirection.clone().multiplyScalar(nrrdDistance);
  const center = vrPosition.clone().add(nrrdOffset);
  addNrrdVolume(center, nrrdSize, nrrdPath);


  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate() {
  renderer.setAnimationLoop(() => {
    rotatingGroup.rotation.y += 0.005;
    renderer.render(scene, camera);
  });
}
