// Greedy non-max suppression over detection candidates.
//
// Overlapping detections are resolved in favor of the LARGER rune: when two
// findings overlap, the smaller one is almost always a fragment of the larger
// (e.g. a 16px template matching part of a 128px rune's stroke), so candidates
// are processed largest-first and a kept finding suppresses any later candidate
// whose center falls within nmsRelative * max(sizes) of it. Genuinely separate
// runes (far apart) are unaffected. The survivors are returned sorted by score
// descending, so the first element is the best-scoring finding.
export function dedupeFindings(candidates, nmsRelative) {
  const ordered = [...candidates].sort((a, b) => b.size - a.size || b.score - a.score);
  const kept = [];

  for (const candidate of ordered) {
    const tooClose = kept.some((k) => {
      const dx = k.x - candidate.x;
      const dy = k.y - candidate.y;
      const radius = nmsRelative * Math.max(k.size, candidate.size);
      return dx * dx + dy * dy < radius * radius;
    });
    if (!tooClose) kept.push(candidate);
  }

  return kept.sort((a, b) => b.score - a.score);
}
