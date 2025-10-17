#!/usr/bin/env python3
"""
convert_to_nrrd.py

Converts Vaa3D .raw (Hang-Chuan Peng format) or .tif volumetric files into .nrrd,
with optional downscaling.

Requirements:
    pip install pynrrd tifffile numpy scipy
    (and v3dpy must be importable: from v3dpy.loaders import Raw)

Usage:
    python convert_to_nrrd.py --input yourfile.raw --output yourfile.nrrd --scale 0.5
"""

import argparse
import os
import numpy as np
import tifffile
import nrrd
from scipy.ndimage import zoom

# Try importing v3dpy
try:
    from v3dpy.loaders import Raw
    HAS_V3DPY = True
except ImportError:
    HAS_V3DPY = False
    print("v3dpy not found. Cannot read .raw files without it.")


def read_volume(path):
    ext = os.path.splitext(path)[1].lower()

    if ext in [".tif", ".tiff"]:
        print(f"Reading TIFF: {path}")
        vol = tifffile.imread(path)
        vol = vol.astype(np.float32)
        if vol.ndim < 3:
            raise ValueError(f"Expected volumetric data, got shape {vol.shape}")
        return vol

    elif ext == ".raw":
        if not HAS_V3DPY:
            raise ImportError("v3dpy.loaders.Raw not available. Install or copy the module manually.")
        print(f"Reading Vaa3D RAW: {path}")

        # Adjusted for v3dpy API: use Raw().load() instead of Raw(path)
        raw_loader = Raw()
        vol = raw_loader.load(path)

        vol = vol.astype(np.float32)
        if vol.ndim < 3:
            raise ValueError(f"Expected volumetric data, got shape {vol.shape}")
        return vol

    else:
        raise ValueError(f"Unsupported file extension: {ext}")


def scale_volume(vol, scale):
    if scale == 1.0:
        return vol
    print(f"Scaling volume by factor {scale} ...")
    try:
        scaled = zoom(vol, zoom=scale, order=1)
    except MemoryError:
        raise MemoryError("Scaling operation failed due to insufficient memory.")
    return scaled


def convert_to_nrrd(input_path, output_path, scale=1.0):
    print(f"\nProcessing {input_path} ...")
    vol = read_volume(input_path)
    # If shape is 4d apply max projection along the 1st dimension
    if vol.ndim == 4:
        print("4D volume detected, applying max projection along the 1st dimension.")
        vol = np.max(vol, axis=0)
    print(f"Original shape: {vol.shape}")

    if scale != 1.0:
        vol = scale_volume(vol, scale)
        print(f"Scaled shape: {vol.shape}")

    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    print(f"Writing NRRD to: {output_path}")
    nrrd.write(output_path, vol.astype(np.float32))
    print("Conversion complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert .raw or .tif to .nrrd with optional downscaling.")
    parser.add_argument("--input", required=True, help="Input file path (.raw or .tif)")
    parser.add_argument("--output", required=True, help="Output NRRD file path")
    parser.add_argument("--scale", type=float, default=1.0, help="Scaling factor (e.g., 0.5 to reduce resolution)")

    args = parser.parse_args()
    convert_to_nrrd(args.input, args.output, args.scale)
