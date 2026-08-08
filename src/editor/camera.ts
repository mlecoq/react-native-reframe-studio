import type { Transcript } from '../captions/types';
import type { FaceTrack, ReframeMode } from './types';
import { facesAt } from './faceTracks';

/**
 * The virtual camera: where the vertical crop window sits over the landscape
 * source, at any moment.
 *
 * The interesting part is deliberately plain JS, run once after analysis:
 * a camera operator's job is full of decisions (don't move for small
 * wobbles, never jerk, cut rather than pan between two people) and those
 * read much better as a loop than as a formula. The worklet then only
 * interpolates the resulting path — see cameraAt.
 */

/** Camera samples are computed at this rate, then interpolated. */
const PATH_FPS = 10;

/**
 * The face may wander this far from the center — as a fraction of the crop
 * window — before the camera starts moving. Without it, every breath of the
 * detector becomes a pan and the shot feels seasick.
 */
const DEAD_ZONE = 0.14;

/** Fraction of the remaining distance covered each sample (ease-out follow). */
const FOLLOW_EASE = 0.12;

/** Hard cap on camera speed, in fractions of the source width per second. */
const MAX_SPEED = 0.35;

/** Below this gap between two people, panning still reads fine; above, cut. */
const CUT_DISTANCE = 0.55;

/** A new face must be this much bigger than the current one to steal focus. */
const FOCUS_HYSTERESIS = 1.25;

/**
 * Who is on screen at a given time, when the transcript says so.
 *
 * Face size alone cannot tell two guests apart in a static two-shot — that
 * is exactly why every clip tool leans on audio. We don't decode audio, but
 * a *diarized* transcript carries the same information for free, so when the
 * phrases have speaker labels the camera follows the turns instead of
 * guessing. Speakers are matched to faces left to right, in order of first
 * appearance.
 */
export type SpeakerTurns = {
  turns: { start: number; end: number; trackIndex: number }[];
};

export const buildSpeakerTurns = (
  transcript: Transcript,
  tracks: FaceTrack[]
): SpeakerTurns | null => {
  const labelled = transcript.filter((phrase) => phrase.speaker !== undefined);
  if (labelled.length === 0 || tracks.length < 2) return null;

  const order: number[] = [];
  for (const phrase of labelled) {
    if (!order.includes(phrase.speaker!)) order.push(phrase.speaker!);
  }
  const meanX = (track: FaceTrack) =>
    track.samples.reduce((total, s) => total + s.x + s.width / 2, 0) / track.samples.length;
  const byPosition = tracks
    .map((track, trackIndex) => ({ trackIndex, x: meanX(track) }))
    .sort((a, b) => a.x - b.x);

  return {
    turns: labelled.map((phrase) => ({
      start: phrase.start,
      end: phrase.end,
      trackIndex: byPosition[order.indexOf(phrase.speaker!) % byPosition.length]!.trackIndex,
    })),
  };
};

export type CameraPath = {
  /** Crop-window center, as fractions of the source frame. */
  samples: { time: number; x: number; y: number; cut: boolean }[];
};

/**
 * Width of the crop window as a fraction of the source width, for a given
 * output aspect. Both the path builder (JS) and the drawer (worklet) need
 * it, so it lives here as a pure function of the two aspect ratios.
 */
export const cropWidthFraction = (sourceAspect: number, outputAspect: number) => {
  'worklet';
  return Math.min(1, outputAspect / sourceAspect);
};

const clamp = (value: number, half: number) => {
  'worklet';
  return Math.min(Math.max(value, half), 1 - half);
};

/** The crop-window center at `time` — pure, called on every drawn frame. */
export const cameraAt = (path: CameraPath, time: number): { x: number; y: number } => {
  'worklet';
  const samples = path.samples;
  if (samples.length === 0) return { x: 0.5, y: 0.5 };

  let after = 0;
  while (after < samples.length - 1 && samples[after]!.time < time) after++;
  const b = samples[after]!;
  const a = samples[Math.max(after - 1, 0)]!;
  // A cut is a jump, not a move: hold the incoming frame instead of sliding.
  if (b.cut) return { x: b.x, y: b.y };

  const span = b.time - a.time;
  const mix = span > 0 ? Math.min(Math.max((time - a.time) / span, 0), 1) : 1;
  return { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix };
};

/**
 * Follows the most prominent face — the one a human operator would keep in
 * frame — moving only when it leaves the dead zone, and cutting instead of
 * panning when focus jumps to someone far away.
 */
export const buildFollowPath = (
  tracks: FaceTrack[],
  duration: number,
  cropWidth: number,
  speakers: SpeakerTurns | null = null
): CameraPath => {
  const half = cropWidth / 2;
  const samples: CameraPath['samples'] = [];
  const count = Math.max(2, Math.round(duration * PATH_FPS) + 1);

  let x = 0.5;
  let focused = -1; // index of the track currently framed
  let started = false;

  for (let i = 0; i < count; i++) {
    const time = i / PATH_FPS;
    const faces = facesAt(tracks, time);
    let cut = false;

    if (faces.length > 0) {
      // Whoever is talking wins, when we know it.
      const turn = speakers?.turns.find((t) => time >= t.start && time < t.end);
      const speaking = turn ? faces.find((f) => f.trackIndex === turn.trackIndex) : undefined;

      // Otherwise: the face already framed keeps focus unless another one is
      // clearly bigger — closer to camera, usually the one being filmed.
      // Without this hysteresis two similar faces trade focus every other
      // sample.
      let best = speaking ?? faces[0]!;
      for (const face of speaking ? [] : faces) {
        const area = face.width * face.height;
        const bestArea = best.width * best.height;
        if (best.trackIndex === focused) {
          if (area > bestArea * FOCUS_HYSTERESIS) best = face;
        } else if (face.trackIndex === focused) {
          if (area * FOCUS_HYSTERESIS > bestArea) best = face;
        } else if (area > bestArea) {
          best = face;
        }
      }

      const target = best.x + best.width / 2;
      if (!started) {
        x = target;
        started = true;
      } else if (best.trackIndex !== focused && Math.abs(target - x) > CUT_DISTANCE * cropWidth) {
        // Two people far apart: a pan would feel like a slow head turn.
        x = target;
        cut = true;
      } else {
        const deadZone = DEAD_ZONE * cropWidth;
        const delta = target - x;
        if (Math.abs(delta) > deadZone) {
          // Move just enough to bring the face back to the dead zone's edge…
          const desired = target - Math.sign(delta) * deadZone;
          let step = (desired - x) * FOLLOW_EASE;
          // …never faster than a real operator could swing the camera.
          const maxStep = MAX_SPEED / PATH_FPS;
          step = Math.min(Math.max(step, -maxStep), maxStep);
          x += step;
        }
      }
      focused = best.trackIndex;
    }

    samples.push({ time, x: clamp(x, half), y: 0.5, cut });
  }
  return { samples };
};

/** Keeps everyone in frame: centered on the bounding box of all faces. */
export const buildGroupPath = (
  tracks: FaceTrack[],
  duration: number,
  cropWidth: number
): CameraPath => {
  const half = cropWidth / 2;
  const samples: CameraPath['samples'] = [];
  const count = Math.max(2, Math.round(duration * PATH_FPS) + 1);

  let x = 0.5;
  let started = false;
  for (let i = 0; i < count; i++) {
    const time = i / PATH_FPS;
    const faces = facesAt(tracks, time);
    if (faces.length > 0) {
      let left = 1;
      let right = 0;
      for (const face of faces) {
        left = Math.min(left, face.x);
        right = Math.max(right, face.x + face.width);
      }
      const target = (left + right) / 2;
      x = started ? x + (target - x) * FOLLOW_EASE : target;
      started = true;
    }
    samples.push({ time, x: clamp(x, half), y: 0.5, cut: false });
  }
  return { samples };
};

/** Follows one specific person — one half of the stacked split view. */
export const buildTrackPath = (
  track: FaceTrack,
  duration: number,
  cropWidth: number
): CameraPath => buildFollowPath([track], duration, cropWidth);

/**
 * Ranks tracks by how much of the segment they own and how big they are:
 * the split view frames the two main speakers, not a passer-by.
 */
const mainTracks = (tracks: FaceTrack[], count: number): FaceTrack[] => {
  const scored = tracks.map((track) => {
    const span = track.samples[track.samples.length - 1]!.time - track.samples[0]!.time;
    const size =
      track.samples.reduce((total, s) => total + s.width * s.height, 0) / track.samples.length;
    return { track, score: span * Math.sqrt(size) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((entry) => entry.track);
};

/** The exported short is 9:16. */
export const OUTPUT_ASPECT = 9 / 16;

/**
 * The camera paths for a mode: one window, or two stacked ones for the
 * split view. Each window gets its own crop width — half-height windows are
 * twice as wide, so they show more of the source.
 */
export const buildPaths = (
  mode: ReframeMode,
  tracks: FaceTrack[],
  duration: number,
  sourceAspect: number,
  transcript: Transcript = []
): CameraPath[] => {
  if (mode === 'split' && tracks.length >= 2) {
    const crop = cropWidthFraction(sourceAspect, OUTPUT_ASPECT * 2);
    return mainTracks(tracks, 2).map((track) => buildTrackPath(track, duration, crop));
  }
  const crop = cropWidthFraction(sourceAspect, OUTPUT_ASPECT);
  return [
    mode === 'group'
      ? buildGroupPath(tracks, duration, crop)
      : buildFollowPath(tracks, duration, crop, buildSpeakerTurns(transcript, tracks)),
  ];
};
