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
    `<span class="hint">[C] singularities   ${onOff(app.toggles.singularities)}</span>`
  );
});
