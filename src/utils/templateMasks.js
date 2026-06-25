import {
  ENABLED_RUNES,
  ENABLED_SIGNS,
  RUNES_PATH,
  SIGNS_PATH,
} from '../config.js';

let cache = null;

// Pure list of every template the iterative detector scans, with no image
// loading. Combines the enabled runes/modifiers ("sign", from RUNES_PATH) and
// the enabled sigils ("sigil", from SIGNS_PATH). ids are 1-based and sequential
// across the whole list so they stay unique. Kept separate from image loading
// so the selection logic is unit-testable without a browser Image.
export function buildTemplateDescriptors() {
  const groups = [
    { items: ENABLED_RUNES, type: 'sign', path: RUNES_PATH },
    { items: ENABLED_SIGNS, type: 'sigil', path: SIGNS_PATH },
  ];

  const descriptors = [];
  for (const { items, type, path } of groups) {
    for (const { file, label } of items) {
      descriptors.push({
        id: descriptors.length + 1,
        name: label,
        type,
        imagePath: `${path}/${file}.png`,
      });
    }
  }
  return descriptors;
}

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

export async function loadTemplateImages() {
  if (cache) return cache;

  // Load every active template (enabled runes + enabled sigils) from
  // buildTemplateDescriptors; deactivated entries are excluded so the detector
  // never matches against them. Each entry keeps its type so findings can be
  // tagged sign/sigil downstream.
  const templates = [];
  for (const descriptor of buildTemplateDescriptors()) {
    templates.push({
      ...descriptor,
      image: await loadImage(descriptor.imagePath),
    });
  }

  cache = templates;
  return cache;
}
