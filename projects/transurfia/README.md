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
of total angle 6π: three times as much angle as a point is supposed to have. The
grey columns mark it.

An orbit mode used to take hold of the player there and sweep them around the
cone point, so that one lap cost three full turns of the mouse. It is switched
off — `SINGULARITIES.capture` in `config.js` — because it takes the controls
away mid-stride, which is a poor trade for a walking simulator. The columns are
still solid; walking is just walking. The code behind it is intact and the flag
is the whole of turning it back on.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move |
| mouse | look |
| `Shift` | run |
| `G` | tile grid |
| `C` | singularity columns |
| `T` | tile style |
| `Esc` | release the mouse |

## On a phone

It does not run on one, and says so. Transurfia is walked with WASD and looked
around with the pointer locked to the window, so a device with neither a
keyboard nor a mouse is turned away with an explanation rather than handed a
welcome screen that does nothing when tapped.

A guided demo for touch devices exists in the code — `src/autoplayer.js` drives
the real player along `DEMO.route` by pressing its movement keys, so it is the
real surface and not a recording — but it is **switched off**: it was not good
enough to show. `DEMO.enabled` in `config.js` is the whole of turning it back
on, and `tools/route.selfcheck.mjs` still keeps the route honest meanwhile.

A phone with a Bluetooth keyboard and mouse genuinely can play; `?mode=interactive`
lets one through.

## Requirements

**WebGL2** and **import map** support — Chrome/Edge 89+, Firefox 108+,
Safari 16.4+. `src/preflight.js` runs before anything else and explains on
screen whichever is missing.

Render resolution adapts to the frame rate it is actually achieving, so
integrated graphics, 4K displays, GPU-less VMs and phones degrade in sharpness
rather than in playability. Thresholds live in `RENDER.adaptive`; both ends of
the ladder differ per experience (`maxPixelRatio`/`adaptive.minPixelRatio` on
desktop, `mobileMaxPixelRatio`/`mobileMinPixelRatio` for the demo).

Resolution is load-bearing for image quality here in a way it is not in most
renderers. The image is a fragment shader over a single fullscreen quad, so MSAA
does nothing at all — it antialiases geometry edges, and there is one piece of
geometry. Supersampling is the only antialiasing available, and supersampling is
what the pixel ratio *is*. Lowering it is not a quality setting with a fallback;
it is the fallback. Two consequences worth knowing:

- The floor is 0.75, not 0.5. At 0.5 one rendered pixel covers 2x2 CSS pixels
  and the surface stops being readable.
- The upgrade threshold must stay **below 60**. `requestAnimationFrame` is
  capped at the display refresh rate, so a threshold above it is a condition
  that can never be true — which made every downgrade permanent on a 60Hz
  display and ratcheted quality to the floor. `tools/quality.selfcheck.mjs`
  caps every simulated machine at 60fps for exactly this reason.

Tile textures use anisotropic filtering at the GPU's maximum. The world is a
floor receding to the horizon, which is the grazing-angle case anisotropy exists
for; without it distance is blurred along the axis that did not need it and
shimmers as the player walks.

## Self-checks

Neither needs a browser or a build step:

```sh
node tools/preflight.selfcheck.mjs   # the support decision, over every combination
node tools/quality.selfcheck.mjs     # the quality controller, over simulated machines
node tools/route.selfcheck.mjs       # the demo route, walked through the real physics
node tools/desktop-unchanged.selfcheck.mjs   # that the demo did not touch the desktop
```

The route check is the one that matters most. `DEMO.route` is a list of
durations, and durations become distances, so whether the route is safe is a
claim about where the player ends up — and walking into a cone point would not
crash anything, it would quietly leave the demo orbiting a column for ever on a
visitor's phone. So the route is not inspected but *walked*: a real
`PlayerController` on the real surface, at six frame rates from 144fps down to
6fps plus 400 seconds of deliberately erratic ones, asserting it never comes
within twice the capture radius of any of the eight corners.

That check needs `three` to resolve under node, which `node_modules/three`
provides as a three-line alias to the same build the browser loads via the
import map. Nothing is vendored twice, and Jekyll excludes `node_modules` from
GitHub Pages, so it never reaches the published site.
