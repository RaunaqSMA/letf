import type { DrawdownEpisode } from "./types";

export function monthsBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return (
    (db.getUTCFullYear() - da.getUTCFullYear()) * 12 +
    (db.getUTCMonth() - da.getUTCMonth()) +
    (db.getUTCDate() >= da.getUTCDate() ? 0 : -1)
  );
}

/**
 * Peak-to-trough episodes of a value series. An episode opens at a running
 * peak, bottoms at its trough and closes when the series regains the peak.
 * Episodes shallower than `threshold` are ignored.
 */
export function drawdownEpisodes(
  dates: string[],
  values: ArrayLike<number>,
  threshold = 0.1,
): DrawdownEpisode[] {
  const episodes: DrawdownEpisode[] = [];
  let peak = -Infinity;
  let peakIdx = 0;
  let troughIdx = -1;
  let trough = Infinity;
  let open = false;

  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!isFinite(v) || v <= 0) continue;
    if (v >= peak) {
      if (open && trough / peak - 1 <= -threshold) {
        episodes.push({
          peakDate: dates[peakIdx]!,
          peakValue: peak,
          troughDate: dates[troughIdx]!,
          troughValue: trough,
          maxDrawdown: trough / peak - 1,
          recoveryDate: dates[i]!,
          drawdownMonths: monthsBetween(dates[peakIdx]!, dates[troughIdx]!),
          recoveryMonths: monthsBetween(dates[troughIdx]!, dates[i]!),
        });
      }
      peak = v;
      peakIdx = i;
      trough = Infinity;
      troughIdx = -1;
      open = false;
    } else {
      open = true;
      if (v < trough) {
        trough = v;
        troughIdx = i;
      }
    }
  }

  if (open && troughIdx >= 0 && trough / peak - 1 <= -threshold) {
    episodes.push({
      peakDate: dates[peakIdx]!,
      peakValue: peak,
      troughDate: dates[troughIdx]!,
      troughValue: trough,
      maxDrawdown: trough / peak - 1,
      recoveryDate: null,
      drawdownMonths: monthsBetween(dates[peakIdx]!, dates[troughIdx]!),
      recoveryMonths: null,
    });
  }

  return episodes.sort((a, b) => a.maxDrawdown - b.maxDrawdown);
}