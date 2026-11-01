// Fuzzy subsequence scoring, reused from jotta-edit's command palette (src/main.js).
// Exact substring matches rank highest; otherwise characters must appear in
// order, with bonuses for runs of consecutive matches and for matches that
// start right after a path/word separator.
export function fuzzyScore(text, query) {
  if (!query) return 0;
  text = text.toLocaleLowerCase(); query = query.toLocaleLowerCase();
  const direct = text.indexOf(query);
  if (direct !== -1) return 2000 - direct * 3 - text.length * 0.1;
  let score = 0, at = 0, prev = -2;
  for (const char of query) {
    const i = text.indexOf(char, at);
    if (i === -1) return -Infinity;
    score += i === prev + 1 ? 18 : 5;
    if (i === 0 || '/._-'.includes(text[i - 1])) score += 25;
    at = i + 1; prev = i;
  }
  return score - text.length * .12;
}
