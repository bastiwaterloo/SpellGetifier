// Greedy non-max suppression over detection candidates.
// Keeps the highest-scoring candidate, then drops any remaining candidate
// whose center is within nmsRelative * keptSize of one already kept.
export function dedupeFindings(candidates, nmsRelative) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept = [];

  for (const candidate of sorted) {
    const tooClose = kept.some((k) => {
      const dx = k.x - candidate.x;
      const dy = k.y - candidate.y;
      const radius = nmsRelative * k.size;
      return dx * dx + dy * dy < radius * radius;
    });
    if (!tooClose) kept.push(candidate);
  }

  return kept;
}
