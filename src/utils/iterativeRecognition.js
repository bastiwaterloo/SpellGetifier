import * as tf from '@tensorflow/tfjs';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MATCH_THRESHOLD,
  PENALTY_WEIGHT,
  NMS_RELATIVE,
} from '../config.js';
import { imageDataToMask } from './maskUtils.js';
import { loadTemplateMasks } from './templateMasks.js';
import { computeScoreMap, getBackendReady } from './scoreMap.js';
import { dedupeFindings } from './findingDedup.js';

// Re-rasterize the canvas (its backing store is DPR-scaled) to logical
// 500x500 on a white background, then threshold to an ink mask.
export function canvasToMask(canvas) {
  const off = document.createElement('canvas');
  off.width = CANVAS_WIDTH;
  off.height = CANVAS_HEIGHT;
  const ctx = off.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.drawImage(canvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return imageDataToMask(imageData);
}

export async function detectRunes(canvas) {
  await getBackendReady();
  const drawingMask = canvasToMask(canvas);
  const templates = await loadTemplateMasks();

  const candidates = [];
  let lastRuneId = null;

  for (const variant of templates) {
    const { scores, width, height } = computeScoreMap(
      drawingMask,
      variant.mask,
      PENALTY_WEIGHT,
    );

    // Keep the single best position for this rune/size/rotation; cross-scale
    // and cross-position duplicates are merged later by dedupeFindings.
    let bestScore = -Infinity;
    let bestIndex = -1;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIndex = i;
      }
    }

    if (bestScore >= MATCH_THRESHOLD && bestIndex >= 0) {
      const col = bestIndex % width;
      const row = Math.floor(bestIndex / width);
      candidates.push({
        id: variant.id,
        name: variant.name,
        imagePath: variant.imagePath,
        size: variant.size,
        rotation: variant.rotation,
        x: col + variant.mask.width / 2,
        y: row + variant.mask.height / 2,
        score: bestScore,
      });
    }

    // Yield to the UI between runes so the "Wirke Zauber…" indicator updates.
    if (variant.id !== lastRuneId) {
      lastRuneId = variant.id;
      await tf.nextFrame();
    }
  }

  const findings = dedupeFindings(candidates, NMS_RELATIVE).map((f) => ({
    ...f,
    score: Math.round(f.score * 100),
  }));

  if (findings.length === 0) {
    return { match: null, confidence: 0, message: 'Keine Runen gefunden', findings: [] };
  }

  const top = findings[0];
  return {
    match: { id: top.id, name: top.name, imagePath: top.imagePath },
    confidence: top.score,
    message: `${findings.length} Runen gefunden`,
    findings,
  };
}
