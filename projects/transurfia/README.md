# Transurfia

A walkable **translation surface**, rendered entirely by per-pixel GPU ray
tracing. The world is an L made of three square tiles whose boundary edges are
glued in pairs: walk off one edge and you reappear on its partner, moved by a
pure translation with your orientation unchanged. Nothing rotates, nothing
mirrors. The result is a finite, flat world with no walls and no edges — look
down any corridor and you are looking at the same three tiles over and over.

There is no portal geometry anywhere. The whole frame is **one fullscreen
quad**: a fragment shader builds a camera ray per pixel and walks it through the
surface analytically, applying each crossed edge's translation and carrying on
in the same direction.

All eight corners of the L are **the same point** of the surface — a cone point
of total angle 6π. Walk into one of the grey columns and you are put on a circle
around it, facing outward, with the mouse sweeping you around. Going round once
takes three full turns of the mouse, not one, because there is three times as
much angle there as a point is supposed to have.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move |
| mouse | look |
| `Shift` | run |
| `G` | tile grid |
| `C` | singularity columns |
| `T` | tile style |
| `W` (at a singularity) | stop orbiting and walk away |
| `Esc` | release the mouse |

## About this copy

This is a **copy** of the standalone project, which is a Vite app with a test
suite, a debug page and a GPU-vs-CPU verification harness. Only what the game
needs at runtime is here.

It carries exactly one edit over the original: `index.html` adds an importmap
pointing `three` at this repository's own `build/three.module.js`, since there
is no build step here. Everything else — `src/`, `style.css`, `textures/` — is
byte-identical to the source, so re-syncing is a straight file copy.

`thumbnail.jpg` is a CPU render rather than a screenshot: it walks the same
topology with the same crossing budget, but draws flat tile colours instead of
textures.
