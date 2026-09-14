import * as THREE from 'three';

import {
  WORLD, PLAYER, RENDER, SINGULARITIES, SCULPTURES, TEXTURES,
  sculpturePosition, sculptureRadius, sculpturesVisible,
} from './config.js';
import { createLShapeSurface } from './surface.js';
import { createRayTracer } from './raytracer.js';
import { createMinimap } from './minimap.js';
import { loadTextureSet, textureSetReady, nextTextureSet, textureSetNames } from './textures.js';
import { PlayerController } from './player.js';

// ============================================================================
// APP WIRING
// ============================================================================
//
// Everything the two entry points (main.js, debug.js) have in common: the
// surface, the WebGL canvas, the ray tracer, the player, the minimap, pointer
// lock, resizing and the frame loop.
//
// Each entry point adds only its own key bindings and its own HUD text.

export function createApp() {
  const app = document.getElementById('app');
  const hud = document.getElementById('hud');
  const blocker = document.getElementById('blocker');

  // --- surface ---------------------------------------------------------
  // The single source of truth for the topology. The ray tracer uploads these
  // corners and gluings as uniforms; the player walks the same ones on the CPU.
  const surface = createLShapeSurface(WORLD.tileSize);

  // --- renderer --------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
  app.appendChild(renderer.domElement);

  // Only this camera's position, basis and fov are read. Its projection matrix
  // is never used — the ray tracer builds its own rays.
  const camera = new THREE.PerspectiveCamera(PLAYER.fieldOfView, 1, 0.05, 1000);

  const rayTracer = createRayTracer(surface);

  function applySize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rayTracer.setSize(w, h, renderer.getPixelRatio());
  }
  applySize();
  window.addEventListener('resize', applySize);

  // --- player ----------------------------------------------------------
  // resolveMove() inside PlayerController applies the same edge gluings on the
  // CPU that the shader applies per-pixel, so walking through a portal and
  // looking through it stay consistent.
  //
  // The sculptures are the only things that push: without this the player walks
  // straight through them, which reads as a bug rather than as a design choice.
  // A single circle per object is enough — they are roughly as deep as they are
  // wide.
  //
  // The singularity columns deliberately do NOT appear here. They capture the
  // player instead of blocking them; PlayerController owns that, because it is
  // a state change rather than a push. See SINGULARITIES in config.js.
  const sculptureObstacles = [SCULPTURES.chair, SCULPTURES.table].map((spec) => {
    const [x, z] = sculpturePosition(spec);
    const radius = sculptureRadius(spec);
    return { x, z, radius, baseRadius: radius };
  });
  const obstacles = [...sculptureObstacles];

  const player = new PlayerController(camera, renderer.domElement, surface, { obstacles });

  const start = PLAYER.startPosition ?? [WORLD.tileSize * 0.5, WORLD.tileSize * 0.5];
  player.position.set(start[0], start[1]);

  blocker.addEventListener('click', () => player.requestLock());
  document.addEventListener('pointerlockchange', () => {
    blocker.classList.toggle('hidden', document.pointerLockElement === renderer.domElement);
  });

  // --- minimap ---------------------------------------------------------
  const minimap = createMinimap();
  app.appendChild(minimap.canvas);

  // --- tile textures ---------------------------------------------------
  // Sets are declared in config.js. Cycling with T is a uniform swap: no
  // shader recompile, and nothing about the traversal is touched.
  let textureSet = TEXTURES.active;
  if (!textureSetNames().includes(textureSet)) {
    throw new Error(
      `TEXTURES.active is "${textureSet}", which is not one of: ${textureSetNames().join(', ')}`
    );
  }

  function applyTextureSet(name) {
    // The shader can take the textures immediately — three.js binds a
    // placeholder until the pixels arrive. The minimap draws them into a 2D
    // canvas, so it has to wait for the images to actually decode.
    rayTracer.setTileTextures(loadTextureSet(name));

    // The sculptures belong to one style (config.js), so they come and go with
    // the floor rather than having a key of their own. They leave collision
    // along with the shader, so a hidden chair never blocks anyone.
    const showSculptures = sculpturesVisible(name);
    rayTracer.setSculptures(showSculptures);
    minimap.setSculptures(showSculptures);
    for (const o of sculptureObstacles) {
      o.radius = showSculptures ? o.baseRadius : 0;
    }

    textureSetReady(name).then(
      (textures) => {
        // Ignore a set that finished loading after the player already
        // cycled past it.
        if (name === textureSet) minimap.setTextures(textures);
      },
      () => {}
    );
  }
  applyTextureSet(textureSet);

  // --- world toggles ---------------------------------------------------
  //
  // Both are purely visual. In particular C only stops the columns being DRAWN:
  // walking into the cone point still captures the player, because that is a
  // property of the surface rather than of what is on screen. Hiding them is in
  // fact the way to get the clear view from the cone point.
  const toggles = {
    grid: RENDER.grid,
    singularities: SINGULARITIES.radius > 0,
  };

  function applyToggles() {
    rayTracer.setGrid(toggles.grid);
    rayTracer.setSingularityRadius(toggles.singularities ? SINGULARITIES.radius : 0);
  }
  applyToggles();

  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyG') {
      toggles.grid = !toggles.grid;
      applyToggles();
    } else if (e.code === 'KeyC') {
      toggles.singularities = !toggles.singularities;
      applyToggles();
    } else if (e.code === 'KeyT') {
      textureSet = nextTextureSet(textureSet);
      applyTextureSet(textureSet);
    }
  });

  // --- frame loop ------------------------------------------------------
  const clock = new THREE.Clock();

  // `hudText(dt)` is called once per frame and should return the HUD's
  // contents; return null to leave the HUD empty. The string may contain
  // markup (main.js highlights the texture set's name), so it is assigned as
  // HTML — these strings are ours, never user input.
  function start_(hudText) {
    function frame() {
      requestAnimationFrame(frame);

      // Clamped so a background tab does not teleport the player across the
      // surface on the frame it regains focus.
      const dt = Math.min(clock.getDelta(), 0.1);
      player.update(dt);

      rayTracer.setCamera(camera);
      renderer.render(rayTracer.scene, rayTracer.camera);
      minimap.draw(player.position, player.yaw);

      hud.innerHTML = hudText ? (hudText(dt) ?? '') : '';
    }
    frame();
  }

  return {
    surface,
    renderer,
    camera,
    rayTracer,
    player,
    minimap,
    toggles,
    start: start_,
    // Read as a function: the T key reassigns it, so a captured value would go
    // stale in the HUD.
    textureSet: () => textureSet,
  };
}

// Which of the three tiles a point of the fundamental domain lies in. Mirrors
// tileAt() in the fragment shader, kept here so a HUD or minimap reading and
// the rendered tile colours cannot drift apart silently.
export function tileAt(x, z) {
  if (z < WORLD.tileSize) return 0;
  return x < WORLD.tileSize ? 1 : 2;
}
