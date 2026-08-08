import type { FaceAnalysis, FaceBox, FaceTrack } from './types';

/**
 * From raw per-sample detections to stable per-face tracks, and from tracks
 * to interpolated boxes at any playback time.
 */

/** Extra time a face stays covered before/after its track (fade window). */
const FADE = 0.25;
/** A detection matches a track if boxes overlap at least this much. */
const MATCH_IOU = 0.15;
/** A track may skip this many seconds of missed detections before closing. */
const MAX_GAP = 0.8;
/** Tracks shorter than this are detector noise — drop them (seconds). */
const MIN_TRACK_DURATION = 1.2;
/**
 * A living face is never perfectly still: even someone listening quietly
 * bobs enough for the detection box to wander a few tenths of a percent of
 * the frame between samples. A "face" whose box stays put to the fourth
 * decimal is a statue — a poster, a screen pattern, an empty spacesuit on
 * display (the bundled NASA sample has all three in shot). Real faces in
 * that same footage measure σ ≥ 0.003.
 */
const STATUE_STD = 0.0015;

const iou = (a: FaceBox, b: FaceBox) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter);
};

/**
 * Greedy tracker: each detection joins the open track it overlaps best,
 * or starts a new one. Simple, and plenty for a phone video — the detector
 * runs several times per second and faces don't teleport.
 */
export const buildFaceTracks = (analysis: FaceAnalysis): FaceTrack[] => {
  const tracks: (FaceTrack & { closed: boolean })[] = [];
  for (const sample of analysis.samples) {
    for (const track of tracks) {
      const last = track.samples[track.samples.length - 1]!;
      if (!track.closed && sample.time - last.time > MAX_GAP) track.closed = true;
    }
    for (const face of sample.faces) {
      let best: (typeof tracks)[number] | null = null;
      let bestIou = MATCH_IOU;
      for (const track of tracks) {
        if (track.closed) continue;
        const last = track.samples[track.samples.length - 1]!;
        if (last.time >= sample.time) continue; // already got a face this sample
        const overlap = iou(face, last);
        if (overlap > bestIou) {
          best = track;
          bestIou = overlap;
        }
      }
      const entry = { time: sample.time, ...face };
      if (best) best.samples.push(entry);
      else tracks.push({ samples: [entry], closed: false });
    }
  }
  return tracks
    .filter((track) => {
      const samples = track.samples;
      const duration = samples[samples.length - 1]!.time - samples[0]!.time;
      if (duration < MIN_TRACK_DURATION) return false;
      const std = (values: number[]) => {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        return Math.sqrt(
          values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length
        );
      };
      const wobble = Math.max(
        std(samples.map((s) => s.x + s.width / 2)),
        std(samples.map((s) => s.y + s.height / 2))
      );
      return wobble >= STATUE_STD;
    })
    .map(({ samples }) => ({ samples }));
};

export type FaceAt = FaceBox & {
  /** 0..1 — fades in/out at the track's boundaries. */
  alpha: number;
  /** Stable index of the track this face belongs to. */
  trackIndex: number;
};

/** The interpolated face boxes visible at `time` — pure, called per frame. */
export const facesAt = (tracks: FaceTrack[], time: number): FaceAt[] => {
  'worklet';
  const result: FaceAt[] = [];
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const samples = tracks[trackIndex]!.samples;
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    if (time < first.time - FADE || time > last.time + FADE) continue;

    // find the two samples around `time` and interpolate
    let after = 0;
    while (after < samples.length - 1 && samples[after]!.time < time) after++;
    const b = samples[after]!;
    const a = samples[Math.max(after - 1, 0)]!;
    const span = b.time - a.time;
    const mix = span > 0 ? Math.min(Math.max((time - a.time) / span, 0), 1) : 1;

    result.push({
      x: a.x + (b.x - a.x) * mix,
      y: a.y + (b.y - a.y) * mix,
      width: a.width + (b.width - a.width) * mix,
      height: a.height + (b.height - a.height) * mix,
      alpha: Math.min(1, (time - (first.time - FADE)) / FADE, ((last.time + FADE) - time) / FADE),
      trackIndex,
    });
  }
  return result;
};
