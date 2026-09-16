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

## Requirements

A desktop browser with **WebGL2** and **import map** support — Chrome/Edge 89+,
Firefox 108+, Safari 16.4+. Mouse and keyboard are required; touch devices are
detected and turned away rather than left on a welcome screen that cannot be
dismissed. `src/preflight.js` runs before anything else and explains on screen
whichever of these is missing.

Render resolution adapts to the frame rate it is actually achieving, between
`RENDER.adaptive.minPixelRatio` and `RENDER.maxPixelRatio`, so integrated
graphics, 4K displays and GPU-less VMs degrade in sharpness rather than in
playability. All of its thresholds live in `RENDER.adaptive` in `config.js`.

## Self-checks

Neither needs a browser or a build step:

```sh
node tools/preflight.selfcheck.mjs   # the support decision, over every combination
node tools/quality.selfcheck.mjs     # the quality controller, over simulated machines
```
