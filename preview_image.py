"""Bounded viewing derivative only; never changes the original supplied bytes."""
import io,sys,warnings
from PIL import Image,ImageOps
Image.MAX_IMAGE_PIXELS=16000000
warnings.simplefilter('error',Image.DecompressionBombWarning)
try:
    raw=sys.stdin.buffer.read(8388609)
    if not raw or len(raw)>8388608:raise ValueError()
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in ('PNG','JPEG') or image.width*image.height>16000000:raise ValueError()
        image.load();image=ImageOps.exif_transpose(image)
        image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
        if image.mode in ('RGBA','LA') or 'transparency' in image.info:
            rgba=image.convert('RGBA');rgb=Image.new('RGB',rgba.size,'white');rgb.paste(rgba,mask=rgba.getchannel('A'));image=rgb
        else:image=image.convert('RGB')
        for quality in (85,70,55,40):
            out=io.BytesIO();image.save(out,format='JPEG',quality=quality,optimize=True)
            if out.tell()<=1048576:break
        else:raise ValueError()
        sys.stdout.buffer.write(out.getvalue())
except Exception:
    print('Preview unavailable',file=sys.stderr);sys.exit(1)
