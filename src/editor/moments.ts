import type { AudioEnvelope } from './audio';

/**
 * What the picker does with its ears — all pure functions over the envelope:
 * find the pauses, snap a handle to the nearest one (a clip should never
 * start mid-word), and rank windows of the source by how much talking is in
 * them, which is a surprisingly good "interesting moment" heuristic for
 * interviews: the animated parts of a conversation are dense, the dead parts
 * are not.
 */

export type Silence = { start: number; end: number };

/** Below this fraction of the speaking level, a moment counts as quiet. */
const QUIET_THRESHOLD = 0.12;

/** Pauses shorter than this are breathing, not sentence boundaries. */
const MIN_SILENCE = 0.3;

export const findSilences = (envelope: AudioEnvelope): Silence[] => {
  const { values, hop, duration } = envelope;
  const silences: Silence[] = [];
  let start: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const quiet = values[i]! < QUIET_THRESHOLD;
    if (quiet && start === null) start = i * hop;
    if (!quiet && start !== null) {
      const end = i * hop;
      if (end - start >= MIN_SILENCE) silences.push({ start, end });
      start = null;
    }
  }
  if (start !== null && duration - start >= MIN_SILENCE) silences.push({ start, end: duration });
  return silences;
};

/**
 * The nearest pause within `maxDelta` seconds — its middle, where the cut
 * lands between two sentences — or the time unchanged.
 */
export const snapToSilence = (time: number, silences: Silence[], maxDelta = 0.8): number => {
  let best = time;
  let bestDistance = maxDelta;
  for (const silence of silences) {
    const middle = (silence.start + silence.end) / 2;
    const distance = Math.abs(middle - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = middle;
    }
  }
  return best;
};

export type Moment = { start: number; duration: number; score: number };

/**
 * The most talkative windows of the source, non-overlapping, in
 * chronological order. Score = speech density (how much of the window is
 * above the quiet threshold) plus a little mean energy, so a lively exchange
 * beats a slow monologue of the same length.
 */
export const suggestMoments = (
  envelope: AudioEnvelope,
  { duration = 30, count = 3 }: { duration?: number; count?: number } = {}
): Moment[] => {
  const { values, hop } = envelope;
  const windowLength = Math.round(duration / hop);
  if (values.length <= windowLength) return [];

  const step = Math.max(1, Math.round(5 / hop));
  const candidates: Moment[] = [];
  for (let from = 0; from + windowLength <= values.length; from += step) {
    let dense = 0;
    let energy = 0;
    for (let i = from; i < from + windowLength; i++) {
      if (values[i]! >= QUIET_THRESHOLD) dense++;
      energy += values[i]!;
    }
    candidates.push({
      start: from * hop,
      duration,
      score: dense / windowLength + 0.4 * (energy / windowLength),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked: Moment[] = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    const overlaps = picked.some(
      (moment) =>
        candidate.start < moment.start + moment.duration &&
        moment.start < candidate.start + candidate.duration
    );
    if (!overlaps) picked.push(candidate);
  }
  return picked.sort((a, b) => a.start - b.start);
};
