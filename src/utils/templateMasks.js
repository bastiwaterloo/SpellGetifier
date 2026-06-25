import { RUNE_NAMES, RUNES_PATH } from '../config.js';

let cache = null;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw the image scaled to size×size, rotated by rotationDeg, onto a white
// canvas big enough to hold the rotated square. Returns its ImageData.
export function rasterizeRotatedScaled(image, size, rotationDeg) {
  const radians = (rotationDeg * Math.PI) / 180;
  const diag = Math.ceil(size * Math.SQRT2);
  const canvas = document.createElement('canvas');
  canvas.width = diag;
  canvas.height = diag;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, diag, diag);
  ctx.translate(diag / 2, diag / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  return ctx.getImageData(0, 0, diag, diag);
}

export async function loadRuneImages() {
  if (cache) return cache;

  const runes = [];
  for (let index = 0; index < RUNE_NAMES.length; index++) {
    const fileName = RUNE_NAMES[index];
    const imagePath = `${RUNES_PATH}/${fileName}.png`;
    runes.push({
      id: index + 1,
      name: fileName.replace(/_/g, ' '),
      imagePath,
      image: await loadImage(imagePath),
    });
  }

  cache = runes;
  return cache;
}
