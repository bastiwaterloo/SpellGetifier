import { ENABLED_RUNES, RUNES_PATH } from '../config.js';

let cache = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw the image scaled to size×size, rotated by rotationDeg, centered on a
// white canvas. The canvas is the rotated bounding box (size×√2) optionally
// enlarged by marginFactor to leave a white border around the glyph, so the
// scoring penalty can see drawn ink spilling past the template. Returns its
// ImageData. The glyph stays centered, so the box center is the glyph center.
export function rasterizeRotatedScaled(image, size, rotationDeg, marginFactor = 1) {
  const radians = (rotationDeg * Math.PI) / 180;
  const dim = Math.ceil(size * Math.SQRT2 * marginFactor);
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, dim, dim);
  ctx.translate(dim / 2, dim / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  return ctx.getImageData(0, 0, dim, dim);
}

export async function loadRuneImages() {
  if (cache) return cache;

  // Only scan runes that are active in config/config.json (ENABLED_RUNES);
  // deactivated runes are excluded so the detector never matches against them.
  // The display name comes from the config label, not the file name.
  const runes = [];
  for (let index = 0; index < ENABLED_RUNES.length; index++) {
    const { file, label } = ENABLED_RUNES[index];
    const imagePath = `${RUNES_PATH}/${file}.png`;
    runes.push({
      id: index + 1,
      name: label,
      imagePath,
      image: await loadImage(imagePath),
    });
  }

  cache = runes;
  return cache;
}
