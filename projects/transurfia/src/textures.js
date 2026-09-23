import * as THREE from 'three';

import { TEXTURES } from './config.js';

// ============================================================================
// TILE TEXTURES
// ============================================================================
//
// Loading and switching of the tile texture sets defined in config.js.
//
// A "set" is three images, one per tile. They are handed to the ray tracer as
// three sampler2D uniforms; the shader derives UVs analytically from the hit
// position, so no geometry and no UV attributes are involved.
//
// Sets are cached after first load, so cycling with T is instant after the
// first visit and never re-downloads.

const loader = new THREE.TextureLoader();

// Anisotropic filtering level, set once from the renderer's capabilities by
// app.js. 1 means none, which is the default and was what shipped.
//
// This matters more here than in almost any other scene, because the entire
// world is a floor seen at a grazing angle receding to the horizon — the exact
// case anisotropy exists for. A mip level has to be chosen from a single
// number, and without anisotropy that number comes from the LARGER of the two
// screen-space derivatives. Near the horizon those differ enormously: one
// pixel spans a few centimetres across the floor and many metres along it. So
// the coarse mip needed for the long axis is applied to both, and detail that
// was perfectly resolvable across the short axis is thrown away. The result is
// distance that turns to mush and shimmers as the player walks.
//
// With anisotropy the hardware takes several samples along the long axis
// instead, which is close to free on any GPU that can run this shader at all.
let anisotropy = 1;

// Called by app.js with renderer.capabilities.getMaxAnisotropy(), before any
// set is loaded. Existing textures are updated too, so the order cannot matter.
export function setAnisotropy(level) {
  const next = Math.max(1, Math.floor(level) || 1);
  if (next === anisotropy) return;
  anisotropy = next;

  for (const record of cache.values()) {
    for (const texture of record.textures) {
      if (!texture) continue;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
  }
}

// name -> { textures, ready }. `ready` resolves once all three images have
// actually decoded, which verify.js needs before it can compare pixels.
const cache = new Map();

function configure(texture) {
  // The images are authored in sRGB. Setting this makes three.js upload them
  // with an sRGB internal format, so the GPU decodes to linear on every fetch
  // — which is why raytracer.js works in linear light and encodes back to sRGB
  // as its final step.
  texture.colorSpace = THREE.SRGBColorSpace;

  // Mipmaps matter a great deal here: the floor recedes through several portal
  // crossings, so a single screen pixel can cover an enormous stretch of
  // texture. Without them a fine pattern turns into aliased noise at distance.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // REPEAT, not CLAMP, and that is load-bearing rather than cosmetic. The
  // shader hands the sampler an unwrapped, continuous coordinate and lets the
  // hardware wrap it, precisely so that wrapping happens AFTER the mip level
  // has been derived from screen-space derivatives. Clamping here (or wrapping
  // in the shader) reintroduces the bright seam at portal crossings that this
  // arrangement exists to remove. See tileUV in raytracer.js.
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  // See the note on `anisotropy` above: this is the floor of a world that
  // recedes to the horizon, so it is the whole reason distance looks the way
  // it does.
  texture.anisotropy = anisotropy;

  return texture;
}

function entry(name) {
  if (cache.has(name)) return cache.get(name);

  const paths = TEXTURES.sets[name];
  if (!paths) {
    throw new Error(
      `Unknown texture set "${name}". Available: ${textureSetNames().join(', ')}`
    );
  }
  if (paths.length !== 3) {
    throw new Error(`Texture set "${name}" needs exactly 3 paths, got ${paths.length}`);
  }

  const textures = [];
  const pending = paths.map(
    (path, i) =>
      new Promise((resolve, reject) => {
        // loader.load returns the Texture synchronously and fills in its pixels
        // when the download finishes, so it can be bound to a uniform right
        // away; the promise is only for callers that must wait for real pixels.
        textures[i] = configure(
          loader.load(path, resolve, undefined, () =>
            reject(new Error(`Failed to load texture ${path}`))
          )
        );
      })
  );

  const record = { textures, ready: Promise.all(pending).then(() => textures) };
  cache.set(name, record);
  return record;
}

// The three textures for a named set, usable immediately.
export function loadTextureSet(name) {
  return entry(name).textures;
}

// Resolves once the set's images have actually decoded.
export function textureSetReady(name) {
  return entry(name).ready;
}

export function textureSetNames() {
  return Object.keys(TEXTURES.sets);
}

// Name of the set after the current one, wrapping around. Used by the T key.
export function nextTextureSet(current) {
  const names = textureSetNames();
  return names[(names.indexOf(current) + 1) % names.length];
}
