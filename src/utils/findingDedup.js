// Greedy non-max suppression over detection candidates.
//
// Candidates are processed highest-score first (standard NMS), so the best
// match in any overlapping cluster wins — this avoids a spurious large template
// outranking a better smaller one. The suppression radius uses the LARGER of
// the two sizes (nmsRelative * max(sizes)), so a genuine big rune still absorbs
// small fragment matches that fall inside it (e.g. a 16px template hitting part
// of a 128px rune's stroke). Genuinely separate runes (far apart) are kept.
// Output is sorted by score descending, so the first element is the best match.
export function dedupeFindings(candidates, nmsRelative) {
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
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

  return kept;
}
