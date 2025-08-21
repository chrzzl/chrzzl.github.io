import os
from PIL import Image

# Settings
TARGET_DIR = "projects"
TARGET_NAME = "thumbnail.jpg"
OUTPUT_NAME = "thumbnail.webp"
MAX_SIZE_KB = 50
QUALITY_STEP = 5
REMOVE_ORIGINAL = False  # Set to True to delete .jpg after conversion

def convert_and_compress_to_webp(input_path, output_path, max_size_kb):
    img = Image.open(input_path).convert("RGB")

    quality = 95
    while quality >= 10:
        img.save(output_path, format="WEBP", quality=quality)
        size_kb = os.path.getsize(output_path) / 1024
        if size_kb <= max_size_kb:
            print(f"✔ Converted {input_path} → {output_path} ({int(size_kb)} KB @ quality={quality})")
            return
        quality -= QUALITY_STEP

    print(f"⚠ Couldn't compress {input_path} below {max_size_kb} KB")

def process_directory(base_dir):
    for root, dirs, files in os.walk(base_dir):
        if TARGET_NAME in files:
            input_path = os.path.join(root, TARGET_NAME)
            output_path = os.path.join(root, OUTPUT_NAME)

            convert_and_compress_to_webp(input_path, output_path, MAX_SIZE_KB)

            if REMOVE_ORIGINAL:
                os.remove(input_path)
                print(f"🗑 Removed original: {input_path}")

if __name__ == "__main__":
    process_directory(TARGET_DIR)
