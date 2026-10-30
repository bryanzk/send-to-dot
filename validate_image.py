import io, sys, warnings
from PIL import Image
Image.MAX_IMAGE_PIXELS = 16_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
try:
    data = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
    if not 0 < len(data) <= 8 * 1024 * 1024: raise ValueError()
    with Image.open(io.BytesIO(data)) as image:
        if image.format not in ('PNG', 'JPEG') or getattr(image, 'n_frames', 1) != 1: raise ValueError()
        fmt = image.format
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.width * image.height > 16_000_000: raise ValueError()
    print('image/png' if fmt == 'PNG' else 'image/jpeg')
except Exception:
    sys.exit(1)
