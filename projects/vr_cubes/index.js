import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer, box;

// NOTE: The standard XR direction is (0, 0, -1), which is the default forward direction in Three.js.
// NOTE: The standard XR origin is at (0, 1.7, 0), which is the default position of the camera in Three.js.
const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

init();
animate();

function addCube(position, sides, color) {
  const [w, h, d] = sides; // destructure the 3-tuple
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({ color });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.copy(position);
  scene.add(cube);
  return cube;
}

function init() {
  // Scene
  scene = new THREE.Scene();

  // Camera at origin, looking at the box in direction of (0,0,-1) (The standard XR direction)
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));


  // Red box at (0, 0, -5)
  const color = 0xff0000;
  const dist = 5;
  const position = vrPosition.clone().addScaledVector(vrDirection, dist);
  box = addCube(position, [1, 2, 3], color);

  // Lighting to make standard material visible
  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(light);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Resize handling
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}


function animate() {
  renderer.setAnimationLoop(() => {
    box.rotation.x += 0.01;
    box.rotation.y += 0.01;
    renderer.render(scene, camera);
  });
}
