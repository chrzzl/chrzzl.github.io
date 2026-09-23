// ============================================================================
// WORLD PARAMETERS
// ============================================================================
//
// Every knob worth turning lives in this file. Nothing here is derived from
// anything else, and no other file hard-codes these values — edit them here
// and reload.
//
// This module deliberately imports nothing (not even three.js) so that the
// Node-based self-checks can read the same numbers the browser does.

// ----------------------------------------------------------------------------
// The surface itself
// ----------------------------------------------------------------------------
export const WORLD = {
  // Edge length of ONE square tile, in world units.
  //
  // The surface is three of these tiles in an L, so the fundamental domain is
  // 2 x tileSize across. Everything else scales with it automatically: the
  // gluing translations are differences of vertex coordinates, so they grow
  // with the tiles rather than needing their own setting.
  //
  // Small values (2-4) make the world feel like a tight maze and put many
  // portal crossings in view at once; large values (8+) feel like open ground
  // and rays rarely reach the crossing budget.
  tileSize: 3,

  // How many portal crossings a single camera ray may make before it gives up
  // and returns sky.
  //
  // This is effectively the VIEW DISTANCE of the world. A ray that runs out of
  // budget is drawn as sky, so the far "horizon" you see is not fog or a far
  // plane — it is this number. Raise it to see further down the infinite
  // corridors, lower it to see the budget cutoff eat into the scene.
  //
  // Cost per pixel is roughly linear in this value. 6 is comfortable; 1-3 makes
  // the cutoff obvious for debugging; 12+ is where framerate starts to matter.
  //
  // Compiled into the fragment shader as a #define (GLSL loop bounds must be
  // compile-time constants), so changing it triggers a shader recompile rather
  // than just a uniform upload.
  maxCrossings: 12,
};

// ----------------------------------------------------------------------------
// The player
// ----------------------------------------------------------------------------
export const PLAYER = {
  // Camera height above the floor, in world units.
  eyeHeight: 1.5,

  // Walking speed in world units per second, and the multiplier applied while
  // Shift is held.
  walkSpeed: 2.5,
  runMultiplier: 2,

  // Collision radius used to push the player out of the sculptures. The
  // singularity columns do not push — see SINGULARITIES.enterRadius.
  radius: 0.3,

  // Radians of rotation per pixel of mouse movement.
  mouseSensitivity: 0.0022,

  // Vertical field of view in degrees. Wide values (90+) show more portal
  // crossings at the screen edges and exaggerate the surface's curvature-free
  // strangeness; narrow values look more conventional.
  fieldOfView: 75,

  // Starting position in fundamental-domain coordinates [x, z], or null for
  // the centre of tile 0.
  startPosition: null,
};

// ----------------------------------------------------------------------------
// Singularity markers
// ----------------------------------------------------------------------------
//
// All eight corners of the fundamental domain are the SAME point of the
// surface — a cone point of total angle 6*PI (three full turns instead of one).
// A grey column is drawn there as a landmark. Because each copy of the domain
// only contains a wedge of that column, the full column is assembled out of
// several portal crossings, which is worth looking at directly.
export const SINGULARITIES = {
  // Column radius in world units. Set to 0 to remove them from the world
  // entirely; the C key does exactly this at runtime.
  radius: 0.06,

  // Column height in world units.
  height: 2.0,

  // --- Walking into the cone point ------------------------------------------
  //
  // A column does not push the player away. Walking up to one puts the player
  // into SINGULARITY MODE: they stop being a walker and become a point on a
  // circle around the column, facing straight out along the normal with the
  // column at their back, and the mouse sweeps them around it. W puts them back
  // on their feet, walking away from where they are already looking.
  //
  // The column is also solid: a walking player can never end a frame inside
  // that circle. Normally the mode takes over well before it matters, but it
  // closes the gap just after W, when the player is briefly held un-catchable
  // and could otherwise turn around and walk into the column.
  //
  // Orbiting here is not the same as orbiting anything else. There is 6*PI of
  // angle around this point, so the circle is three times longer than a circle
  // has any right to be, and going round it once carries the player through
  // eight portal crossings and past all eight corners of the domain before
  // they arrive back where they started.
  //
  // None of it depends on the columns being drawn. C is a visibility toggle;
  // the cone point is a fact about the surface, so an invisible column catches
  // the player exactly like a visible one.

  // How close the player has to come to be caught, in world units.
  //
  // 0.36 is where the columns used to stop the player (their radius plus
  // PLAYER.radius), so the mode now begins exactly where the old wall was.
  enterRadius: 0.36,

  // Gap between the column's surface and the orbiting player, in world units.
  // The orbit radius is `radius + orbitClearance`.
  //
  // Must stay at or below enterRadius, or entering the mode would shove the
  // player backwards away from the column they just walked up to. The
  // self-check asserts it. Smaller values fill more of the screen with column;
  // larger ones show more of the world behind it.
  orbitClearance: 0.25,

  // Radians of orbit per pixel of horizontal mouse movement.
  //
  // Deliberately the same as PLAYER.mouseSensitivity, so that orbiting costs
  // exactly as much mouse travel as turning on the spot would. That is what
  // makes the 6*PI visible as something you can feel: three full sweeps of the
  // mouse to get back where you started, where anywhere else in the world one
  // sweep would do.
  orbitSensitivity: 0.0022,

  // How far the player must get from every corner, after leaving the mode,
  // before they can be caught by one again.
  //
  // Larger than the orbit radius on purpose: W drops the player at the orbit
  // radius, which is well inside enterRadius, so without this they would be
  // caught again on the very next frame and W would do nothing.
  exitGraceRadius: 0.6,
};

// ----------------------------------------------------------------------------
// Colours
// ----------------------------------------------------------------------------
//
// Written straight to the framebuffer — a raw shader never receives three.js's
// output-colour-space conversion, so these are final display values and are
// NOT gamma-corrected again anywhere downstream. What you type is what you see.
export const COLORS = {
  // One colour per tile of the L, in tile order (see surface.js; +Z is down):
  //   tile 0 = [0,s]  x [0,s]    top-left, where you start
  //   tile 1 = [0,s]  x [s,2s]   bottom-left
  //   tile 2 = [s,2s] x [s,2s]   bottom-right
  //
  // Used to generate the rgb texture set, and as the minimap's fallback fill
  // before the textures have loaded.
  tiles: ['#d94a4a', '#4ad97a', '#4a7ad9'],

  // The singularity columns.
  singularity: '#888888',
};

// ----------------------------------------------------------------------------
// Tile textures
// ----------------------------------------------------------------------------
//
// Each set supplies one image per tile, in tile order [0, 1, 2]. The floor is
// textured analytically: the shader derives UVs from the hit position and the
// tile grid, so there are no UV attributes and no geometry anywhere.
//
// To add a set, drop three PNGs in public/textures/ and add an entry here —
// nothing else needs to change. The T key cycles through whatever is listed.
//
// The paths are RELATIVE, and must stay that way. A leading slash would pin
// them to the web server's root, which is fine here but breaks the moment the
// game is served from a subdirectory — as it is when published alongside other
// projects. Relative paths resolve against the page, so they work either way.
//
// The rgb set reproduces the original flat-colour look. It is a real set of
// image files rather than a shader branch on purpose: both sets then go through
// exactly the same loader, colour space, mipmaps and filtering, so a bug that
// only appears with textures cannot hide in the plain-colour mode. Regenerate
// them from COLORS.tiles with `node scripts/make-rgb-textures.mjs`.
export const TEXTURES = {
  sets: {
    rgb: [
      'textures/rgb_tile_0.png',
      'textures/rgb_tile_1.png',
      'textures/rgb_tile_2.png',
    ],
    checkered: [
      'textures/chess_tile_0.png',
      'textures/chess_tile_1.png',
      'textures/chess_tile_2.png',
    ],
    squares: [
      'textures/colored_squares_0.png',
      'textures/colored_squares_1.png',
      'textures/colored_squares_2.png',
    ],
    // Quarter-circles in each corner, each divided into hue wedges. Because
    // all four corners of a tile are the SAME cone point, this is the set to
    // walk around a singularity with: the wedges sweep through three full
    // turns before coming back to where they started.
    singularity: [
      'textures/singularity_circle_0.png',
      'textures/singularity_circle_1.png',
      'textures/singularity_circle_2.png',
    ],
    stripes: [
      'textures/diagonal_stripes_0.png',
      'textures/diagonal_stripes_1.png',
      'textures/diagonal_stripes_2.png',
    ],
    swirl: [
      'textures/swirl_0.png',
      'textures/swirl_1.png',
      'textures/swirl_2.png',
    ],
    crossings: [
      'textures/kariert_0.png',
      'textures/kariert_1.png',
      'textures/kariert_2.png',
    ],
    circles: [
      'textures/circles_0.png',
      'textures/circles_1.png',
      'textures/circles_2.png',
    ],
  },

  // Which set the world starts with; must be a key of `sets` above.
  active: 'rgb',
};

// ----------------------------------------------------------------------------
// Sculptures
// ----------------------------------------------------------------------------
//
// Two fixed objects standing on the floor, so the world has landmarks that are
// not corner-symmetric. They are ordinary inhabitants of the fundamental
// domain, which means you see them repeated through every portal — the same
// chair, not copies of it.
//
// There are no meshes anywhere in this renderer, so they are built from the
// same closed-form primitives as everything else: the chair from axis-aligned
// boxes, the table from stacked truncated cones. See raytracer.js.
//
// Placement is given as a tile plus a position WITHIN that tile, both
// coordinates running 0..1, so it follows WORLD.tileSize automatically.
export const SCULPTURES = {
  // The sculptures belong to ONE tile style: they are drawn while this texture
  // set is active and hidden under every other one, so cycling with T changes
  // the furniture along with the floor. Must be a key of TEXTURES.sets, or null
  // to always show them.
  //
  // Hiding them also removes them from collision — you can never be held in
  // place by something you cannot see.
  visibleWithTextureSet: 'checkered',

  chair: {
    tile: 0,          // top-left
    u: 0.8,
    v: 0.8,
    // Overall height in world units. Everything else is a proportion of it, so
    // this is the only size dial. Keep it under about 2.4 (twice the 0.6
    // clearance to the nearest portal edge at u,v = 0.8) or the chair starts
    // being sliced by the boundary and reassembled on the far side.
    height: 0.95,
    color: '#7a5231',
    // Radius of the circle the player is kept out of, as a fraction of height.
    // Read by app.js for collision and by player.selfcheck.mjs, so the two
    // cannot drift apart.
    footprint: 0.34,
  },

  table: {
    tile: 2,          // bottom-right
    u: 0.8,
    v: 0.8,
    height: 0.78,
    color: '#43301f',
    // Matches the overhanging top, which is the widest part and the part the
    // player actually walks into.
    footprint: 0.46,
  },
};

// ----------------------------------------------------------------------------
// Guided demo
// ----------------------------------------------------------------------------
//
// What touch devices get instead of the game.
//
// Walking this surface needs a mouse and a keyboard — you look with the pointer
// locked to the window and turning is measured in mouse pixels — and a virtual
// joystick would be a second, worse control scheme to maintain. So a phone gets
// a fixed tour instead: the player walks a predetermined route while the
// visitor watches. Non-interactive on purpose.
//
// The route is driven by pressing the player's own movement keys (see
// autoplayer.js), so what a phone shows is the real surface with the real
// traversal, not a recording and not a simplified version of it.
//
// IMPORTANT: the route below is tuned for WORLD.tileSize 3 and
// PLAYER.walkSpeed 2.5, because legs are measured in seconds and therefore in
// distance. Change either and the route no longer lands where it was aimed —
// possibly inside a cone point, which would hijack the demo into orbiting a
// column for ever. tools/route.selfcheck.mjs asserts both values and walks the
// whole route through the real physics to prove it stays clear, so a change
// fails loudly there rather than quietly on a visitor's phone.
export const DEMO = {
  // Whether touch devices get the demo at all. False sends them to the same
  // "desktop only" screen they used to get.
  enabled: true,

  // Which way the player faces at the start of each lap, in degrees. 0 looks
  // down -Z, which is up the minimap and straight at the glued top edge of
  // tile 0 — the view where the world already reads as endless before anyone
  // has moved.
  startYaw: 0,

  // Standing-still gap between laps. The reset happens inside it, so the jump
  // back to the start lands on a frame where nothing is moving.
  restartPauseSeconds: 1.5,

  // How long the "this is a demo" note stays before fading. It can also be
  // dismissed with a tap.
  noteSeconds: 6,

  // ---- the route ----------------------------------------------------------
  //
  // Each leg: `seconds`, a `forward`/`strafe` direction, and `turn`/`pitch` as
  // TOTAL degrees to rotate across the leg. Movement is on or off (the player
  // is being driven by its keyboard), so forward is effectively 0 or +-1.
  //
  // `label` is printed in the corner while the leg runs, which is what makes it
  // a showcase rather than a screensaver — the viewer is told what they are
  // looking at. Empty means print nothing.
  //
  // The route sticks to the middle of tiles, 1.5 units from every corner,
  // against a cone-point capture radius of 0.36. Starting at the centre of
  // tile 0 (1.5, 1.5) and facing -Z:
  //
  //   x = 1.5 and x = 4.5 are safe columns, z = 1.5 and z = 4.5 safe rows.
  //
  // It is built to show three DIFFERENT gluings, because seeing only one looks
  // like a mirror and seeing three looks like a world:
  route: [
    // Standing still, facing the top edge of tile 0. Nothing has happened yet
    // and the corridor is already infinite — that is the whole idea, and it is
    // worth three seconds before any movement muddies it.
    { seconds: 3, label: 'A corridor with no end' },

    // Straight through the top edge, which is glued to the bottom of tile 1:
    // walking off the top of the world puts you at the bottom of it. 15 units
    // at walkSpeed 2.5, so two crossings, ending at (1.5, 4.5).
    { seconds: 6, forward: 1, label: 'Walking off the top, arriving at the bottom' },

    // Turn to face +X, standing.
    { seconds: 2.5, turn: -90 },

    // Along the long axis at z = 4.5, through the right edge of tile 2 — glued
    // all the way back to the left edge of tile 1, the longest jump on the
    // surface. 15 units, two crossings, ending at (4.5, 4.5).
    { seconds: 6, forward: 1, label: 'The long way round is also the short way' },

    // Back to facing -Z, standing, now inside tile 2.
    { seconds: 2.5, turn: 90 },

    // The tight one: the top of tile 2 is glued to its own bottom, a loop only
    // three units around. Four crossings in five seconds, so the repetition is
    // impossible to miss. Ends at (4.5, 4.0).
    { seconds: 5, forward: 1, label: 'The shortest loop in the world' },

    // A slow sweep on the spot. Every direction shows a different stack of
    // copies, which is the clearest way to see that this is one small world
    // seen through itself rather than a large one.
    { seconds: 7, turn: -200, label: 'The same three tiles, whichever way you look' },

    // Settle, so the lap ends still rather than mid-stride.
    { seconds: 2 },
  ],
};

// ----------------------------------------------------------------------------
// Sky
// ----------------------------------------------------------------------------
//
// Where every ray that hits nothing ends up — either because it escaped upward
// or because it ran out of crossing budget. A vertical gradient between two
// colours, blended on the ray's own direction, so it costs nothing: there is no
// sky dome and no geometry, just a different answer for rays that miss.
export const SKY = {
  // Colour looking straight at the horizon, and straight up.
  horizon: '#8fa8f4',
  zenith: '#1a39c2',

  // Shapes the blend. The mix factor is (ray.y ^ exponent), with ray.y running
  // 0 at the horizon to 1 at the zenith. Below 1 the horizon colour is held
  // close to the horizon and the transition happens higher up, which is what
  // real sky does; 1.0 is a plain linear ramp; above 1 pulls the zenith colour
  // down towards the horizon.
  exponent: 0.6,
};

// ----------------------------------------------------------------------------
// Fog
// ----------------------------------------------------------------------------
//
// Distance haze. It blends toward the SKY COLOUR IN THE RAY'S OWN DIRECTION
// rather than one flat fog colour, and that detail is the point: the ground no
// longer just stops where a ray runs out of crossings, it dissolves into
// exactly the sky that would have replaced it. The ragged edge at the horizon
// stops being visible instead of being covered up.
//
// It also calms the far field generally — at this depth the floor and the
// forest of singularity columns pile up into visual noise that carries no
// information.
export const FOG = {
  // Scale of the fade, in world units. The world is roughly 63% faded into the
  // sky at exactly this distance — that much is true whatever `falloff` is —
  // and essentially gone beyond it, so pick somewhere near half the distance
  // you want to still be able to see.
  //
  // For the horizon to be genuinely hidden rather than merely softened, this
  // wants to be small enough that fog saturates before rays start exhausting
  // WORLD.maxCrossings. Rule of thumb: keep it under about a third of the
  // furthest a ray can reach. At tileSize 3 with maxCrossings 12 the furthest
  // floor a ray reaches is ~76 units, so anything up to ~30 hides the cutoff
  // completely; 40 leaves a faint edge. Raising maxCrossings raises that
  // ceiling and lets you see further.
  //
  // Set to 0 to switch fog off entirely.
  distance: 30,

  // Shapes the curve. The haze is (1 - exp(-(d / distance) ^ falloff)), so this
  // controls how much of the fade is spent NEAR the camera.
  //
  // At 2 the curve rises immediately and everything picks up a faint grey cast,
  // including surfaces a few steps away. Raising it flattens the near field —
  // at 3 a surface at half the fog distance is about half as hazy as it was —
  // while leaving the far field essentially unchanged, since the exponential
  // has saturated there either way. Values above about 4 start to look like a
  // hard wall of fog rather than distance haze.
  falloff: 3,
};

// ----------------------------------------------------------------------------
// Lighting
// ----------------------------------------------------------------------------
//
// Deliberately minimal: one fixed direction and a flat ambient floor, no
// shadows and no distance attenuation. Anything more could hide a traversal
// mistake behind plausible-looking shading.
export const LIGHTING = {
  // Direction the light travels FROM, as [x, y, z]. Normalised on upload.
  direction: [0.39, 0.83, 0.41],

  // Brightness of a surface facing directly away from the light, 0..1. The
  // remaining (1 - ambient) is the diffuse term.
  ambient: 0.55,
};

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
export const RENDER = {
  // Upper bound on device pixel ratio. Ray tracing costs a full traversal per
  // physical pixel, so this is the main performance dial: 1.0 is fastest,
  // 2.0 is sharpest on a HiDPI display.
  //
  // This is a CEILING, not a setting. What the renderer actually uses is chosen
  // at run time by the adaptive controller below, which never exceeds it.
  //
  // 2.0 rather than 1.5 so that a Retina-class display can be rendered at its
  // native resolution instead of being permanently upscaled from below it.
  // There is no antialiasing to fall back on here — see the note on
  // minPixelRatio — so resolution IS image quality, and a machine that cannot
  // afford this will be walked back down by the controller within a couple of
  // seconds anyway.
  maxPixelRatio: 2.0,

  // Ceiling on touch devices, which run the guided demo (see DEMO below).
  //
  // Lower than the desktop one, and not only because phone GPUs are smaller: a
  // phone's devicePixelRatio is commonly 2.5-3.5, so 1.0 here is already a
  // third of native resolution in each axis and the adaptive controller can
  // still drop to RENDER.adaptive.minPixelRatio underneath it. Starting
  // conservatively matters more on a phone than on a desktop, because the demo
  // starts moving immediately and there is no welcome screen to hide the first
  // few seconds behind.
  mobileMaxPixelRatio: 1.0,

  // The floor on touch devices, which is lower than the desktop one.
  //
  // The demo is watched rather than played, on a small screen, at arm's length
  // — softness costs less there than it does on a monitor — and a weak phone
  // needs somewhere to go. On a desktop the same value produced the artefact
  // this pair of settings exists to prevent.
  mobileMinPixelRatio: 0.5,

  // Adaptive quality. See quality.js, which owns the logic; these are all of
  // its dials in one place.
  //
  // The problem being solved: this renderer's cost is linear in pixel count and
  // it has no level of detail, no culling and nothing to skip — a 4K laptop on
  // integrated graphics, a VM with no GPU at all, or a browser that has quietly
  // fallen back to software rendering will each grind through exactly the same
  // work per pixel as a desktop GPU. Rather than hand those machines an
  // unplayable frame rate at full resolution, the controller measures what it
  // is actually getting and spends the pixels it can afford.
  //
  // Only RESOLUTION moves. The shader, the crossing budget and the traversal
  // are identical at every quality level.
  adaptive: {
    // Turn the whole thing off and pin rendering at maxPixelRatio.
    enabled: true,

    // The floor.
    //
    // Raised from 0.5, which was too low and was reached in practice: on a 4K
    // display the ray tracer cannot hold the old 50fps target at full
    // resolution, so the controller walked down every rung of the ladder over
    // about fifteen seconds and sat at the bottom. 0.5 renders 11% of a
    // 150%-scaled 4K display's pixels, one rendered pixel covering 2x2 CSS
    // pixels, and it looks like it. The original note here said that below
    // roughly half ratio the surface becomes hard to read, and then set the
    // floor at exactly that point.
    //
    // It matters more here than in most renderers because there is no
    // antialiasing to soften the loss and no way to add any cheaply. The image
    // is computed by a fragment shader over a fullscreen quad, so MSAA does
    // nothing at all — it antialiases geometry edges, and there is one piece of
    // geometry, the quad. Supersampling is the only antialiasing available, and
    // supersampling is what the pixel ratio IS. Lowering it is therefore not a
    // quality setting with a fallback; it is the fallback.
    //
    // 0.75 costs roughly a third fewer pixels than 1.0 while staying visibly
    // soft rather than blocky, and the ladder below it has been removed.
    minPixelRatio: 0.75,

    // Where to start, before anything has been measured. Null means "at the
    // ceiling": a capable machine is never made to look soft while the
    // controller works out that it is capable.
    startPixelRatio: null,

    // Ratio between neighbouring rungs of the quality ladder. 0.8 is a ~36%
    // cut in pixels per step — big enough to actually rescue a struggling
    // frame rate, small enough not to be jarring when it happens.
    step: 0.8,

    // Drop quality when the smoothed frame rate sits below `targetFps`, raise
    // it when it sits above `upgradeFps`. The gap between them is a dead band
    // where nothing happens at all, and it is the first line of defence
    // against oscillation: a machine that lands inside it stays put forever.
    // Lowered from 50/75, which were wrong for this content in both
    // directions. A target of 50 is a demand a per-pixel ray tracer cannot
    // meet at 4K on ordinary hardware, so it guaranteed the slide to the floor
    // described above; and 75 as the bar for climbing back is above the refresh
    // rate of most displays, which meant a 60Hz monitor could NEVER earn an
    // upgrade however capable its GPU — measured frame rate is capped by vsync,
    // so the condition was unsatisfiable and every downgrade was permanent.
    //
    // 40 is still comfortable for walking around a world at 2.5 units per
    // second, and 55 sits below 60Hz so that recovery is actually reachable.
    targetFps: 40,
    upgradeFps: 55,

    // Fraction of the highest frame rate seen so far that counts as "pinned at
    // the refresh rate, so the GPU has headroom". This is what makes recovery
    // possible at all on a 60Hz display, where requestAnimationFrame caps the
    // measurable frame rate well below any ambitious absolute threshold. See
    // the long note at the upgrade test in quality.js.
    vsyncMargin: 0.97,

    // The lowest frame rate that could plausibly BE a display refresh rate.
    // Real panels run at 50Hz and upward; anything below this is the GPU's own
    // limit, and must not be mistaken for the comfortable, vsync-capped idling
    // that earns an upgrade.
    minRefreshFps: 48,

    // How long a verdict has to hold before it is acted on. Asymmetric on
    // purpose — a struggling machine should be rescued quickly, while a
    // comfortable one has nothing to gain from being upgraded in a hurry and
    // everything to lose from being upgraded during a quiet moment it cannot
    // sustain.
    downgradeAfterSeconds: 1.5,
    upgradeAfterSeconds: 8,

    // Ignored after a quality change: resizing the drawing buffer costs a
    // frame or two by itself, and those frames say nothing about whether the
    // new resolution is sustainable.
    settleSeconds: 0.5,

    // Ignored at startup. Shader compilation, texture decode and the first
    // pipeline warm-up are slow on every machine that exists.
    warmupSeconds: 1.5,

    // Frames longer than this are suspected of being stalls rather than
    // measurements — a backgrounded tab, a breakpoint, a garbage collection
    // pause — and are ignored until `spikeToleranceFrames` of them have
    // arrived in a row, at which point the machine is simply believed to be
    // that slow. Anything accepted is clamped to `maxMeasuredSeconds` first.
    //
    // The tolerance is what keeps a software renderer, where EVERY frame is
    // over the threshold, from having all its evidence discarded and being
    // left at full resolution for ever.
    spikeSeconds: 0.5,
    spikeToleranceFrames: 2,
    maxMeasuredSeconds: 2,

    // Time constant of the frame-time average. Long enough to ignore single
    // slow frames, short enough to notice a real change within a second.
    smoothingSeconds: 0.5,

    // If an upgrade has to be undone within this long, the rung it went to is
    // marked unreachable. Without it a machine sitting exactly on the boundary
    // would breathe between two resolutions indefinitely, which is far more
    // distracting than simply running at the lower one.
    oscillationGuardSeconds: 20,

    // ...but not unreachable for ever. "This machine cannot hold that rung" is
    // true of the machine as it is at that moment, and the cause is usually
    // temporary — another application, a video call, battery saver. After this
    // long at a comfortable frame rate with nowhere to go, the lockout is
    // lifted and the rung is tried once more. Each failed attempt doubles the
    // wait, up to the maximum, so a machine that genuinely cannot manage it
    // ends up asking roughly twice an hour rather than every other minute.
    ceilingRelaxSeconds: 90,
    ceilingRelaxMaxSeconds: 1800,
  },

  // Draw a thin darker seam along tile boundaries. It is the clearest cue for
  // reading how many copies deep a stretch of floor is, but it also draws a
  // line over the textures, so it is off by default. Toggled with G.
  grid: false,

  // Seam thickness in world units, and the factor the floor colour is
  // multiplied by inside a seam (lower = darker line).
  gridWidth: 0.02,
  gridDarkness: 0.45,
};

// ----------------------------------------------------------------------------
// Helper
// ----------------------------------------------------------------------------

// '#rrggbb' -> [r, g, b] in 0..1. Lets the settings above stay readable as hex
// while the shader receives plain floats. These are DISPLAY (sRGB) values.
export function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// World-space [x, z] of a tile's origin corner, in tile-ID order. The inverse
// of tileAt() in app.js.
export function tileOrigin(tile) {
  const s = WORLD.tileSize;
  if (tile === 0) return [0, 0];
  if (tile === 1) return [0, s];
  if (tile === 2) return [s, s];
  throw new Error(`No such tile: ${tile}. The L has tiles 0, 1 and 2.`);
}

// Radius of the circle the player is kept out of, in world units. Used by
// app.js for collision and by player.selfcheck.mjs, so the game and the check
// can never disagree about how big an obstacle is.
export function sculptureRadius(spec) {
  return spec.footprint * spec.height;
}

// Whether the sculptures are part of the world while `name` is the active
// texture set. Shared by app.js (drawing and collision) and raytracer.js (the
// initial uniform), so the two cannot disagree about what is standing there.
export function sculpturesVisible(name) {
  return SCULPTURES.visibleWithTextureSet === null
    || name === SCULPTURES.visibleWithTextureSet;
}

// A sculpture's placement, resolved from tile + (u, v) to world [x, z].
export function sculpturePosition({ tile, u, v }) {
  const [ox, oz] = tileOrigin(tile);
  return [ox + u * WORLD.tileSize, oz + v * WORLD.tileSize];
}

// '#rrggbb' -> linear-light [r, g, b], using the exact sRGB transfer function.
//
// Needed because tile textures are uploaded as sRGB, which means the GPU hands
// the shader LINEAR samples. To mix correctly with them, the shader's other
// colours (sky, columns) must be linear too, and the final result is encoded
// back to sRGB on the way out. Using the exact piecewise curve rather than a
// 2.2 power means a colour with no lighting applied round-trips back to
// precisely the hex value written above.
export function rgbLinear(hex) {
  return rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}
