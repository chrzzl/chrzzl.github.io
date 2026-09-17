import * as THREE from 'three';

import {
  WORLD, PLAYER, RENDER, SINGULARITIES, SCULPTURES, TEXTURES, DEMO,
  sculpturePosition, sculptureRadius, sculpturesVisible,
} from './config.js';
import { createLShapeSurface } from './surface.js';
import { createRayTracer } from './raytracer.js';
import { createMinimap } from './minimap.js';
import { loadTextureSet, textureSetReady, nextTextureSet, textureSetNames } from './textures.js';
import { PlayerController } from './player.js';
import { createQualityController } from './quality.js';
import { createAutoPlayer } from './autoplayer.js';
import { reportFailure, isTouchDevice } from './errors.js';

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

  // Touch devices watch the guided demo instead of playing (see DEMO in
  // config.js and autoplayer.js). Decided once, here, and everything that
  // differs between the two reads this flag — there is no second code path
  // through the renderer, the surface or the player.
  const demoMode = DEMO.enabled && isTouchDevice();

  // Cleared when the application must stop for good — currently only a lost
  // WebGL context. The frame loop checks it and stops requesting frames, so a
  // dead renderer is not left spinning behind the error screen.
  let running = true;

  // --- renderer --------------------------------------------------------
  //
  // Built FIRST, before anything else in this function, and that ordering is
  // deliberate. It is the only step that can fail on a machine that got this
  // far — preflight.js has already confirmed the browser offers WebGL2, but a
  // browser can offer a thing and still refuse to hand one over — and doing it
  // first means a failure leaves nothing behind. No event listeners are
  // registered yet, no canvas is in the document, no animation frame is
  // queued, so there is no half-built application still running underneath the
  // error screen.
  //
  // three.js throws a plain Error when context creation fails. It is caught,
  // turned into a sentence the user can act on, and rethrown so that main.js
  // stops rather than carrying on with an undefined renderer.
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false });
  } catch (error) {
    reportFailure('renderer-failed', error);
    throw error;
  }

  // Belt and braces. WebGLRenderer is supposed to throw rather than return
  // without a context, but the check costs nothing and the alternative — every
  // later call failing one at a time against a null context — is much harder to
  // read in a bug report.
  if (!renderer.getContext()) {
    const error = new Error('WebGLRenderer produced no WebGL2 context');
    reportFailure('renderer-failed', error);
    throw error;
  }

  app.appendChild(renderer.domElement);

  // A lost context is a driver reset, a GPU hot-unplug, or the browser reaping
  // a background tab's context. The frame loop would otherwise keep running
  // against a dead context and simply show the last frame forever, which looks
  // exactly like a freeze. Preventing the default stops three.js attempting a
  // silent restore that this renderer is not set up to complete.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    running = false;
    reportFailure('context-lost', new Error('WebGL context lost'));
  });

  // --- surface ---------------------------------------------------------
  // The single source of truth for the topology. The ray tracer uploads these
  // corners and gluings as uniforms; the player walks the same ones on the CPU.
  const surface = createLShapeSurface(WORLD.tileSize);

  // Only this camera's position, basis and fov are read. Its projection matrix
  // is never used — the ray tracer builds its own rays.
  const camera = new THREE.PerspectiveCamera(PLAYER.fieldOfView, 1, 0.05, 1000);

  const rayTracer = createRayTracer(surface);

  // --- adaptive quality ------------------------------------------------
  // Chooses the pixel ratio to render at, from frame times. See quality.js;
  // every threshold is in RENDER.adaptive. Disabled, the renderer simply pins
  // itself to the ceiling, which is what it always used to do.
  const pixelCeiling = demoMode ? RENDER.mobileMaxPixelRatio : RENDER.maxPixelRatio;

  const quality = RENDER.adaptive.enabled
    ? createQualityController({
        maxPixelRatio: pixelCeiling,
        deviceRatio: window.devicePixelRatio || 1,
        ...RENDER.adaptive,
      })
    : null;

  // The single place the drawing buffer's size is decided, called both on
  // resize and whenever the quality controller changes its mind. Keeping it to
  // one function is what stops the renderer's pixel ratio and the shader's
  // uResolution drifting apart — the shader builds its rays from uResolution,
  // so a disagreement there is not a blurry frame but a wrong one.
  function applySize() {
    // visualViewport is the part of the page actually on screen. On a phone
    // that is the difference between the canvas fitting and the canvas being
    // taller than the display: window.innerHeight there includes the space the
    // address bar is occupying, and it changes as the bar slides away.
    //
    // Consulted ONLY in demo mode, even though every current desktop browser
    // supports it. On a desktop the two agree — with overflow hidden there are
    // no scrollbars to account for — except under trackpad pinch-zoom, where
    // visualViewport shrinks and innerWidth does not. Reading it there would
    // mean the interactive experience no longer takes the same measurement it
    // took before this file learned about phones, for no benefit at all. The
    // desktop expression below is the original one, unchanged.
    const viewport = demoMode ? window.visualViewport : null;
    const w = viewport ? Math.round(viewport.width) : window.innerWidth;
    const h = viewport ? Math.round(viewport.height) : window.innerHeight;

    // Re-read per resize: dragging the window to a second monitor, or zooming
    // the browser, changes it without any other notification.
    const dpr = window.devicePixelRatio || 1;
    if (quality) quality.setDeviceRatio(dpr);

    const ratio = quality ? quality.current() : Math.min(dpr, RENDER.maxPixelRatio);

    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rayTracer.setSize(w, h, ratio);
  }
  applySize();
  window.addEventListener('resize', applySize);

  // A phone rotating, and the address bar appearing or collapsing, do not
  // always arrive as a plain resize. orientationchange in particular fires
  // before the new dimensions are readable, so the size is taken again on the
  // next frame rather than immediately.
  //
  // Registered only in demo mode. A desktop has no orientation to change, and
  // its visualViewport resize would fire on browser zoom — an extra, redundant
  // applySize() on a path that already handles zoom through window.resize.
  if (demoMode) {
    window.addEventListener('orientationchange', () => requestAnimationFrame(applySize));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', applySize);
  }

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

  // --- the two ways in -------------------------------------------------
  //
  // Interactive: the welcome overlay is a button that asks for pointer lock,
  // and comes back whenever the lock is released.
  //
  // Demo: there is nothing to ask for. The overlay is dismissed immediately and
  // replaced by a note explaining why nothing responds to touch, which fades on
  // its own. Pointer lock is never requested — on a phone the request either
  // fails or, worse, succeeds and swallows the visitor's scrolling.
  const autoPlayer = demoMode ? createAutoPlayer(player, { start }) : null;

  if (demoMode) {
    blocker.classList.add('hidden');
    showDemoNote();
  } else {
    blocker.addEventListener('click', () => player.requestLock());
    document.addEventListener('pointerlockchange', () => {
      blocker.classList.toggle('hidden', document.pointerLockElement === renderer.domElement);
    });
  }

  function showDemoNote() {
    const note = document.getElementById('demo-note');
    if (!note) return;

    note.classList.remove('hidden');

    // Removed from the layout after the fade rather than merely made
    // transparent: an invisible element over the canvas would still eat the tap
    // that dismisses it, and on a phone that is the only input there is.
    const dismiss = () => {
      note.classList.add('faded');
      window.setTimeout(() => note.classList.add('hidden'), 1000);
    };

    note.addEventListener('click', dismiss);
    window.setTimeout(dismiss, DEMO.noteSeconds * 1000);
  }

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
      if (!running) return;
      requestAnimationFrame(frame);

      // Two readings of the same interval, for two different jobs.
      //
      // The player gets it clamped, so that a background tab does not teleport
      // them across the surface on the frame it regains focus. The quality
      // controller gets it RAW, because the clamp would hide exactly the
      // information it needs: a genuinely slow frame and a tab that was asleep
      // for a minute both arrive as 0.1, and it has to tell them apart. It does
      // its own outlier rejection — see RENDER.adaptive.spikeSeconds.
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.1);

      // The demo presses the player's keys and turns its head; player.update()
      // then runs exactly as it does for a human, through the same resolver and
      // the same edge gluings. See autoplayer.js.
      if (autoPlayer) autoPlayer.update(dt);
      player.update(dt);

      rayTracer.setCamera(camera);
      renderer.render(rayTracer.scene, rayTracer.camera);
      minimap.draw(player.position, player.yaw);

      hud.innerHTML = hudText ? (hudText(dt) ?? '') : '';

      // Measured after the frame it describes has been drawn. A non-null answer
      // means the pixel ratio changed and the drawing buffer has to follow.
      if (quality && quality.frame(rawDt) !== null) applySize();
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
    // Null when RENDER.adaptive.enabled is false. Read by debug HUDs.
    quality,
    // Null on desktop. main.js reads its label to narrate the tour.
    autoPlayer,
    demoMode,
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
