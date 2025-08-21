import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

let scene, camera, renderer;
const cubes = []; // array to track all rotating cubes

// Standard XR starting pose
const vrPosition = new THREE.Vector3(0, 1.7, 0);
const vrDirection = new THREE.Vector3(0, 0, -1);

init();
animate();

// Helper to add a single cube
function addCube(position, sides, color) {
  const [w, h, d] = sides;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({ color });
  const cube = new THREE.Mesh(geometry, material);
  cube.position.copy(position);
  scene.add(cube);
  return cube;
}

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.copy(vrPosition);
  camera.lookAt(vrPosition.clone().add(vrDirection));

  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  scene.add(light);

  // Add 26 cubes around vrPosition
  const offsets = [-5, 0, 5];
  const size = [1, 1, 1]; // uniform cube
  let hueIndex = 0;

  for (let x of offsets) {
    for (let y of offsets) {
      for (let z of offsets) {
        if (x === 0 && y === 0 && z === 0) continue;

        const offset = new THREE.Vector3(x, y, z);
        const position = vrPosition.clone().add(offset);

        const hue = (hueIndex * 360 / 26) % 360;
        const color = new THREE.Color().setHSL(hue / 360, 1.0, 0.5);

        const cube = addCube(position, size, color);
        cubes.push(cube);
        hueIndex++;
      }
    }
  }

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
    for (const cube of cubes) {
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
    }
    renderer.render(scene, camera);
  });
}
