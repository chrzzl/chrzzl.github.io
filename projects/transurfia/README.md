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

## On a phone

Walking this surface needs a mouse and a keyboard — you look with the pointer
locked to the window, and turning is measured in mouse pixels. So touch devices
get a **guided demo** instead: the player walks a fixed 34-second route through
three different edge gluings while you watch, looping until you leave.

It is not a recording, and it is not a second implementation. `src/autoplayer.js`
presses the real player's movement keys and turns its head, then lets
`player.update()` run exactly as it does for a human — same resolver, same
gluings, same cone-point capture. `PlayerController` needed no changes at all.
The route is `DEMO.route` in `config.js`.

## Requirements

**WebGL2** and **import map** support — Chrome/Edge 89+, Firefox 108+,
Safari 16.4+. `src/preflight.js` runs before anything else and explains on
screen whichever is missing.

Render resolution adapts to the frame rate it is actually achieving, so
integrated graphics, 4K displays, GPU-less VMs and phones degrade in sharpness
rather than in playability. Thresholds live in `RENDER.adaptive`; the ceiling is
`RENDER.maxPixelRatio` on desktop and the lower `RENDER.mobileMaxPixelRatio` for
the demo.

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
