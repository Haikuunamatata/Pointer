from PIL import Image

# Open the PNG file
source_image = Image.open('pointer.png')

# Create different sizes
sizes = [16, 32, 48, 64, 128, 256]
images = []

for size in sizes:
    # Create a copy of the image resized to each size
    resized_image = source_image.resize((size, size), Image.Resampling.LANCZOS)
    if resized_image.mode != 'RGBA':
        resized_image = resized_image.convert('RGBA')
    images.append(resized_image)

# Save as ICO file
images[0].save(
    'pointer.ico',
    format='ICO',
    append_images=images[1:],
    sizes=[(size, size) for size in sizes]
) 