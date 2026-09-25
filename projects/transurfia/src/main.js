import { createApp } from './app.js';
import { preflightPassed, reportReady, reportFailure } from './errors.js';

// ============================================================================
// TRANSURFIA — player entry point
// ============================================================================
//
// Walk around an L-shaped translation surface rendered entirely by per-pixel
// GPU ray tracing. Every knob is in config.js; all the wiring is in app.js.
//
// For the frame counter, ray-traversal statistics and the debug visualisations,
// open /debug.html instead.

// preflight.js has already decided whether this browser can run the thing, and
// has written its reason into the welcome overlay if not. Starting anyway would
// paint a canvas over that explanation, so the only correct move is to stop.
if (!preflightPassed()) throw new Error('preflight failed; not starting');

// Anything that escapes createApp() past this point is a genuine bug rather
// than an unsupported browser, but the user's situation is identical either
// way: the page does not work and nobody has told them why. The catch turns it
// into a sentence on screen and leaves the real error in the console.
let app;
try {
  app = createApp();
} catch (error) {
  reportFailure('startup-failed', error);
  throw error;
}

// Alive. Stops the startup watchdog before it concludes otherwise.
reportReady();

// Set names are lower-case keys in config.js. Three letters or fewer is an
// acronym (RGB); anything longer reads better capitalised.
const label = (name) =>
  name.length <= 3 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1);

app.start(() => {
  const onOff = (v) => (v ? 'on' : 'off');

  // ?debug — the live state of the adaptive controller.
  //
  // This exists so that "after a while it goes pixelated" can be answered with
  // a reading instead of an impression. The pixel ratio is the number that
  // matters; `bound` says whether the controller believes resolution is what
  // is limiting the frame rate, which is the difference between a downgrade
  // that is buying something and one that is pure loss.
  if (app.debugQuality) {
    if (!app.quality) {
      return `<span class="hint">adaptive off — pinned at ${app.fixedRatio().toFixed(3)}</span>`;
    }
    const s = app.quality.stats();
    const c = s.lastChange;
    return (
      `<span class="set">${s.pixelRatio.toFixed(3)}x</span>\n` +
      `<span class="hint">${s.fps.toFixed(1)} fps  (${s.frameTimeMs.toFixed(1)} ms)</span>\n` +
      `<span class="hint">rung ${s.index + 1}/${s.rungs}   best ${s.bestFps.toFixed(0)} fps</span>\n` +
      `<span class="hint">bound ${s.resolutionBound}${s.probing ? '  probing' : ''}</span>\n` +
      `<span class="hint">${c ? `${c.from.toFixed(3)} -> ${c.to.toFixed(3)}: ${c.reason}` : 'no change yet'}</span>`
    );
  }

  // On a phone the HUD has no keys to advertise, so it narrates instead: the
  // current leg's label from DEMO.route. That one line is what makes this a
  // guided showcase rather than a screensaver — the visitor is told what the
  // thing they are watching is supposed to be surprising about.
  if (app.demoMode) {
    const tour = app.autoPlayer.state();
    return tour.label ? `<span class="hint">${tour.label}</span>` : '';
  }

  // Standing at a singularity, WASD is switched off and the mouse orbits the
  // column instead. That is worth one line of its own: without it the controls
  // simply appear to have stopped working, and W — the way out — is the one
  // key a stuck player is least likely to try.
  if (app.player.mode === 'singularity') {
    return (
      `<span class="set">Singularity</span>\n` +
      `<span class="hint">mouse  sweep around the singularity</span>\n` +
      `<span class="hint">[W]    walk away</span>`
    );
  }

  return (
    `<span class="set">${label(app.textureSet())}</span>\n` +
    `<span class="hint">[T] change ground style</span>\n` +
    `<span class="hint">[C] show colums: ${onOff(app.toggles.singularities)}</span>`
  );
});
