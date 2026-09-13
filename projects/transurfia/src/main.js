import { createApp } from './app.js';

// ============================================================================
// TRANSURFIA — player entry point
// ============================================================================
//
// Walk around an L-shaped translation surface rendered entirely by per-pixel
// GPU ray tracing. Every knob is in config.js; all the wiring is in app.js.
//
// For the frame counter, ray-traversal statistics and the debug visualisations,
// open /debug.html instead.

const app = createApp();

// Set names are lower-case keys in config.js. Three letters or fewer is an
// acronym (RGB); anything longer reads better capitalised.
const label = (name) =>
  name.length <= 3 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1);

app.start(() => {
  const onOff = (v) => (v ? 'on' : 'off');

  // Standing at a singularity, WASD is switched off and the mouse orbits the
  // column instead. That is worth one line of its own: without it the controls
  // simply appear to have stopped working, and W — the way out — is the one
  // key a stuck player is least likely to try.
  if (app.player.mode === 'singularity') {
    return (
      `<span class="set">Singularity</span>\n` +
      `<span class="hint">mouse  sweep around it — three turns to get back</span>\n` +
      `<span class="hint">[W]    walk away</span>`
    );
  }

  return (
    `<span class="set">${label(app.textureSet())}</span>\n` +
    `<span class="hint">[T] change ground style</span>\n` +
    `<span class="hint">[C] singularities   ${onOff(app.toggles.singularities)}</span>`
  );
});
