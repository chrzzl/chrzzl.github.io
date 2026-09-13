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
