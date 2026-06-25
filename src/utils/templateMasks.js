import {
  RUNE_NAMES,
  RUNES_PATH,
  ITERATIVE_SIZES,
  ITERATIVE_ROTATIONS,
} from '../config.js';
import { imageDataToMask } from './maskUtils.js';

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

export async function loadTemplateMasks() {
  if (cache) return cache;

  const variants = [];
  for (let index = 0; index < RUNE_NAMES.length; index++) {
    const fileName = RUNE_NAMES[index];
    const imagePath = `${RUNES_PATH}/${fileName}.png`;
    const image = await loadImage(imagePath);

    for (const size of ITERATIVE_SIZES) {
      for (const rotation of ITERATIVE_ROTATIONS) {
        const imageData = rasterizeRotatedScaled(image, size, rotation);
        variants.push({
          id: index + 1,
          name: fileName.replace(/_/g, ' '),
          imagePath,
          size,
          rotation,
          mask: imageDataToMask(imageData),
        });
      }
    }
  }

  cache = variants;
  return cache;
}
