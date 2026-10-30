// Posting times a campaign needs, derived from the ones the user chose.
//
// Twelve posts over six days with two chosen times used to be refused: the two
// times give twelve slots only if none of them has already passed today, so a
// session started in the afternoon lost the first day and the workspace told
// the user to extend the range. Asking for twelve posts in three days was
// impossible for the same reason. The count and the date range are what the
// user actually decided, so the posting times give way instead: extra ones are
// placed in the largest gaps between the chosen times, which are all kept.
//
// This module is deliberately dependency-free and shared verbatim by the
// workspace and the scheduler. The workspace decides whether to let the session
// start and the server decides where the posts land, so the two must agree.
export const DAY_START = 6 * 60, DAY_END = 21 * 60, MIN_GAP = 30;

const toMinutes = value => Number(String(value).slice(0, 2)) * 60 + Number(String(value).slice(3, 5));
const toClock = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');

// Times the user chose are never moved or dropped; the result is sorted.
export function fillPostingTimes(times = [], perDay = 0) {
  const chosen = [...new Set(times.map(toMinutes))].filter(Number.isFinite).sort((a, b) => a - b);
  if (!chosen.length || chosen.length >= perDay) return chosen.map(toClock);
  while (chosen.length < perDay) {
    let widest = 0, at = null;
    const edges = [DAY_START, ...chosen, DAY_END];
    for (let i = 0; i < edges.length - 1; i++) {
      const span = edges[i + 1] - edges[i];
      // Round to five minutes so a generated time reads like one a person set.
      const middle = Math.round((edges[i] + edges[i + 1]) / 2 / 5) * 5;
      const clearOfNeighbours = chosen.every(m => Math.abs(m - middle) >= MIN_GAP);
      if (span > widest && clearOfNeighbours && middle > DAY_START && middle < DAY_END) { widest = span; at = middle; }
    }
    if (at === null) break;
    chosen.push(at);
    chosen.sort((a, b) => a - b);
  }
  return chosen.map(toClock);
}

// How many posts a day this campaign needs to fit the range the user chose.
export function perDayFor(contentCount, days) {
  return days > 0 ? Math.ceil(contentCount / days) : contentCount;
}
