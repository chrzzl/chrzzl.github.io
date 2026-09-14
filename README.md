# chrzzl.github.io

A small collection of browser experiments in real-time 3D — a walkable translation surface, and a set of WebXR viewers for volumetric scientific data. Everything
runs client-side on [three.js](https://threejs.org/); there is nothing to
install.

**Live at [chrzzl.github.io](https://chrzzl.github.io/)** each card on the
landing page opens one of the projects below. The VR ones need a headset and a
WebXR-capable browser; they will still open flat on a desktop, but the point of
them is being inside them.

---

## Transurfia: Walking on a translation surface

[`projects/transurfia/`](projects/transurfia/) ·
[open](https://chrzzl.github.io/projects/transurfia/)

A finite, flat world with no walls and no edges. The floor is an L made of three
square tiles whose boundary edges are glued in pairs: walk off one edge and you
come back on its partner, shifted by a pure translation, still facing the same
way. Nothing rotates and nothing mirrors, so look down any corridor and you are
looking at the same three tiles over and over, receding forever.

There is no portal geometry anywhere in it. The entire frame is **one fullscreen
quad** — a fragment shader builds a camera ray per pixel and walks it through the
surface analytically, applying each crossed edge's translation and carrying on.

The strange part is the corners. All eight corners of the L are the *same* point
of the surface, and there is 6π of angle packed into it instead of 2π. Walk into
one of the grey columns and you are put in orbit around it: going round once
takes three full turns of the mouse, not one. `WASD` to move, `T` to cycle the
floor style, `G` for the tile grid, `C` to hide the columns.

## VR Organ Viewer

[`projects/vr_organ/`](projects/vr_organ/) ·
[open](https://chrzzl.github.io/projects/vr_organ/)

Five human organs — kidney, heart, tongue, brain and eye — as real volumetric
scan data, ray-marched in VR. Each one hangs in front of you and turns slowly
on its own; this is the look-only version, with no controls in the way. Rendering is
per-pixel through the volume rather than from a mesh, so you are seeing the
measured density itself, shaded either as maximum intensity projection or as an
isosurface at a per-organ threshold.

## Interactive VR Organ Viewer

[`projects/vr_organ/index_controllers.html`](projects/vr_organ/index_controllers.html) ·
[open](https://chrzzl.github.io/projects/vr_organ/index_controllers.html)

The same five organs, with the controls handed to you. Your VR controllers cast
pointers at panels floating beside the specimen, and from there you can switch
organ, scale and rotate it, slide the isosurface threshold to peel through the
tissue, flip between MIP and isosurface, and change the colormap. Useful for
getting a feel for how much of what you see in a volume rendering is the data
and how much is the transfer function.

## Interactive VR C. elegans Viewer

[`projects/vr_worms/`](projects/vr_worms/) ·
[open](https://chrzzl.github.io/projects/vr_worms/)

A microscopy stack of *C. elegans* nematodes shown three ways at once: the raw
volume, a ground-truth segmentation mask, and a StarDist segmentation
prediction — side by side, in the same pose, so the model's output can be
compared against the truth by eye and at full depth.

The controls are aimed at that comparison. A cutting plane slices the stack, the
three volumes' opacities are dialled independently so one can be faded over
another, their spacing can be closed up or pulled apart, and the masks toggle
between plain foreground/background and per-instance colouring to check whether
individual worms were split or merged.

## Cubes in VR

[`projects/vr_cubes/`](projects/vr_cubes/) ·
[open](https://chrzzl.github.io/projects/vr_cubes/)

The smallest useful WebXR scene: 26 coloured cubes on a 3×3×3 lattice around
where you are standing, rotating. It is the starting point the others grew out
of, and a quick way to check that a headset, browser and stereo rendering are
all actually working before loading anything heavy.

---

## Notes

Claude Code was used as an AI-assisted development tool during the creation of
the projects. Generated code was reviewed, adapted, tested and integrated as
part of the development process.

## License

MIT — see [LICENSE](LICENSE). You are free to use, modify and redistribute this
code. If you use a substantial portion of this project in your own work, I would
appreciate credit to the original project. Thank you!
