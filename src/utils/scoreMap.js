import * as tf from '@tensorflow/tfjs';

let backendReady = null;

// Set the fastest available backend once. WebGL is the browser default;
// callers in tests may set 'cpu' before importing this.
export function getBackendReady() {
  if (!backendReady) {
    backendReady = (async () => {
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
    })();
  }
  return backendReady;
}

// Score a whole batch of equal-sized templates against the drawing in a single
// pass. All masks must share the same width/height (true for every rotation of
// one rune size, since the rasterized footprint depends only on the size). The
// templates are packed as output channels of one conv2d filter, so N rotations
// cost one convolution and one GPU->CPU readback instead of N.
//
// tf.conv2d performs cross-correlation (no kernel flip), so it computes
// coverage directly. drawingTensor is a [1, dh, dw, 1] tensor owned by the
// caller — referenced but NOT disposed here.
//
// Per channel the score is the same coverage+penalty metric as a single match:
//   score = coverage/inkCount - penaltyWeight * penalty/(area - inkCount)
// with penalty = inkUnderFootprint - coverage. A blank template (inkCount 0)
// scores 0; a fully-inked template (area === inkCount) suppresses the penalty
// term, matching the single-template semantics.
//
// Returns { results: [{ score, col, row }], outWidth, outHeight,
//           filterWidth, filterHeight } — one result per input mask, holding
// that template's best position (top-left col/row in the score map).
export function computeBatchedScoreMap(drawingTensor, masks, penaltyWeight) {
  const n = masks.length;
  const { width: fw, height: fh } = masks[0];
  const area = fw * fh;

  // Ink count per template.
  const inkCounts = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    const d = masks[c].data;
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i];
    inkCounts[c] = sum;
  }

  // Pack masks into a [fh, fw, 1, n] filter. Filter data is row-major with the
  // output channel as the fastest dimension: index = (y * fw + x) * n + c.
  const filterData = new Float32Array(area * n);
  for (let c = 0; c < n; c++) {
    const d = masks[c].data;
    for (let p = 0; p < area; p++) filterData[p * n + c] = d[p];
  }

  // Safe per-channel denominators (avoid divide-by-zero); degenerate channels
  // are corrected below. penaltyScale zeroes the penalty term when area===ink.
  const inkSafe = Array.from(inkCounts, (v) => (v > 0 ? v : 1));
  const denomSafe = Array.from(inkCounts, (v) => (area - v > 0 ? area - v : 1));
  const penaltyScale = Array.from(inkCounts, (v) => (area - v > 0 ? 1 : 0));

  return tf.tidy(() => {
    const filter = tf.tensor4d(filterData, [fh, fw, 1, n]);
    const ones = tf.ones([fh, fw, 1, 1]);

    const coverage = tf.conv2d(drawingTensor, filter, 1, 'valid'); // [1,oH,oW,n]
    const footprint = tf.conv2d(drawingTensor, ones, 1, 'valid'); // [1,oH,oW,1]

    const inkT = tf.tensor1d(inkSafe);
    const denomT = tf.tensor1d(denomSafe);
    const penaltyScaleT = tf.tensor1d(penaltyScale);

    const coverageRatio = coverage.div(inkT);
    const penalty = footprint.sub(coverage);
    const penaltyRatio = penalty.div(denomT).mul(penaltyScaleT);
    const score = coverageRatio.sub(penaltyRatio.mul(penaltyWeight)); // [1,oH,oW,n]

    const [, outH, outW] = score.shape;
    const flat = score.reshape([outH * outW, n]);
    const bestScores = flat.max(0).dataSync(); // [n]
    const bestIdx = flat.argMax(0).dataSync(); // [n]

    const results = [];
    for (let c = 0; c < n; c++) {
      const idx = bestIdx[c];
      results.push({
        // A blank template can never be a real match.
        score: inkCounts[c] > 0 ? bestScores[c] : 0,
        col: idx % outW,
        row: Math.floor(idx / outW),
      });
    }

    return {
      results,
      outWidth: outW,
      outHeight: outH,
      filterWidth: fw,
      filterHeight: fh,
    };
  });
}
