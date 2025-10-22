import numpy as np
import colorsys
from PIL import Image

# Parameters
n_entries = 1024  # total number of colors
seed = 42         # for reproducibility

# Initialize color array
colormap = np.zeros((n_entries, 3), dtype=np.float32)

# Deterministic RNG for stable output
rng = np.random.default_rng(seed=seed)

# Index 0 -> black
colormap[0] = (0.0, 0.0, 0.0)

# Fill remaining entries with random hues
for i in range(1, n_entries):
    h = rng.random()       # random hue [0,1)
    s, v = 1.0, 1.0        # full saturation and brightness
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    colormap[i] = (r, g, b)

# Convert to 8-bit and save as 1×1024 PNG texture
img_data = (colormap * 255).astype(np.uint8)[np.newaxis, :, :]
img = Image.fromarray(img_data, mode='RGB')
img.save("cm_random_hue.png")

print("Saved colormap with shape", img_data.shape, "-> instance_colormap_1024.png")
