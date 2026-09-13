import { WORLD, COLORS, PLAYER } from './config.js';

// ============================================================================
// MINIMAP
// ============================================================================
//
// A top-down plan of the fundamental domain in the corner of the screen: the
// three tiles showing their current textures, and the player's position and
// facing.
//
// It shows the domain ONLY — not the unfolded plane the ray tracer draws. That
// is the point: however far the view recedes through portal crossings, the
// player is always somewhere inside these three tiles, and walking off one edge
// puts them back on the glued partner edge.
//
// Orientation: +X is right, +Z is down, matching surface.js's layout. The
// camera looks down -Z at yaw 0, so "forward at yaw 0" points up the map.
//
//     +-----+
//     |  0  |        tile 0 top-left, 1 bottom-left, 2 bottom-right
//     +-----+-----+
//     |  1  |  2  |
//     +-----+-----+

const SIZE = 150; // canvas edge in CSS pixels
const PADDING = 14; // gap between the domain and the canvas edge

// Tile textures are 2048px; scaling one down every frame would be wasteful, so
// each is drawn once into a small offscreen canvas and that is blitted instead.
const PREVIEW_PX = 64;

// How far the view cone reaches on the map, in CSS pixels. Purely a matter of
// legibility — see draw().
const CONE_RADIUS = 34;

// Dark wash laid over the tile previews.
//
// The previews are there to say WHICH style is on the floor, which a dim
// thumbnail answers just as well as a bright one. Painted at full strength they
// compete with the only thing on this map that has to be read instantly — where
// the player is and which way they are facing — and several of the tile sets are
// nearly white. Knocking them back is what buys the marker its contrast.
const TILE_WASH = 'rgba(6, 9, 14, 0.55)';

// The player marker and their view cone. Pink because nothing in the world is:
// the tile sets run through greys, primaries and pastels, so a hue none of them
// reach stays legible whichever style is active.
const PLAYER_COLOR = '#ff2d95';
const PLAYER_RGB = '255, 45, 149';

// Half the HORIZONTAL field of view, in radians. PLAYER.fieldOfView is the
// vertical one (that is three.js's convention and what the ray tracer builds
// its rays from), so the window's aspect ratio has to widen it. Read per frame
// because resizing the window genuinely changes how much you can see.
function horizontalHalfAngle() {
  const aspect = window.innerWidth / window.innerHeight;
  const vertical = (PLAYER.fieldOfView * Math.PI) / 180;
  return Math.atan(Math.tan(vertical / 2) * aspect);
}

export function createMinimap() {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = canvas.height = SIZE * dpr;
  canvas.style.cssText = `
    position: absolute; top: 12px; right: 12px;
    width: ${SIZE}px; height: ${SIZE}px;
    background: rgba(8, 12, 18, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 6px; pointer-events: none;
  `;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const s = WORLD.tileSize;
  const span = 2 * s; // the domain's bounding box
  const scale = (SIZE - PADDING * 2) / span;

  const toCanvas = (x, z) => [PADDING + x * scale, PADDING + z * scale];

  // Tile origins in world coordinates, in tile-ID order. Must match tileAt().
  const TILES = [
    [0, 0], // 0 = top-left, where the player starts
    [0, s], // 1 = bottom-left
    [s, s], // 2 = bottom-right
  ];

  // Outline of the L in tile units, counter-clockwise. Same shape as
  // surface.js's octagon, minus the two split points that only matter for the
  // gluing (they sit mid-edge and would draw identically).
  const OUTLINE = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [0, 2]];

  // One downscaled canvas per tile, or null before the textures have loaded.
  let previews = [null, null, null];

  // `textures` is [tile0, tile1, tile2] of loaded THREE.Texture objects.
  function setTextures(textures) {
    previews = textures.map((texture) => {
      const image = texture && texture.image;
      if (!image || !image.width) return null;
      const off = document.createElement('canvas');
      off.width = off.height = PREVIEW_PX;
      // No vertical flip: the shader puts an image's top row at minimum Z, and
      // this map draws +Z downward, so image-top is map-top in both.
      off.getContext('2d').drawImage(image, 0, 0, PREVIEW_PX, PREVIEW_PX);
      return off;
    });
  }

  function draw(position, yaw) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    const side = s * scale;

    TILES.forEach(([ox, oz], i) => {
      const [cx, cy] = toCanvas(ox, oz);

      if (previews[i]) {
        ctx.drawImage(previews[i], cx, cy, side, side);
      } else {
        // Flat fallback until the images arrive.
        ctx.fillStyle = COLORS.tiles[i];
        ctx.fillRect(cx, cy, side, side);
      }

      // Painted over the tile rather than drawing it faintly: the minimap is a
      // translucent panel, so a faint tile would let the rendered world show
      // through it and the brightness would depend on where the player happened
      // to be looking.
      ctx.fillStyle = TILE_WASH;
      ctx.fillRect(cx, cy, side, side);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, side, side);
    });

    // Outline of the L, i.e. the portal boundary.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    OUTLINE.forEach(([ux, uz], i) => {
      const [cx, cy] = toCanvas(ux * s, uz * s);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.stroke();

    // Player.
    const [px, py] = toCanvas(position.x, position.y);
    // Camera forward at yaw 0 is world (0, -1), rotated by yaw about Y. The map
    // draws +X right and +Z down, so that vector is already a canvas direction
    // and its angle can go straight into arc().
    const facing = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));

    // The wedge the player can actually see. It is the real view frustum, not a
    // decoration: PLAYER.fieldOfView is VERTICAL, so it has to be widened by the
    // window's aspect ratio to get the horizontal angle the minimap shows.
    //
    // What it does NOT show is how far that view reaches — on this surface the
    // wedge wraps around through the portals and comes back into the domain
    // again, so any radius here would be a lie. It is drawn as a short fade
    // instead of a hard arc for that reason.
    const half = horizontalHalfAngle();

    const cone = ctx.createRadialGradient(px, py, 0, px, py, CONE_RADIUS);
    cone.addColorStop(0, `rgba(${PLAYER_RGB}, 0.85)`);
    cone.addColorStop(0.55, `rgba(${PLAYER_RGB}, 0.4)`);
    cone.addColorStop(1, `rgba(${PLAYER_RGB}, 0)`);

    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, CONE_RADIUS, facing - half, facing + half);
    ctx.closePath();
    ctx.fill();

    // White ring rather than black: the tiles underneath are washed dark now,
    // so a light outline is what separates the marker from them.
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  return { canvas, draw, setTextures };
}
