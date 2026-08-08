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

/** A new face must be this much bigger than the current one to steal focus. */
const FOCUS_HYSTERESIS = 1.25;

/**
 * A focus change must hold for this many samples before the camera reacts —
 * one mislabelled phrase or one detector flicker shouldn't yank the frame.
 * (Waived when the focused face has left the screen: there is nothing to
 * keep framing.)
 */
const CONFIRM_SAMPLES = 2;

/**
 * Who is talking, when the transcript says so.
 *
 * Face size alone cannot tell two guests apart in a two-shot — that is
 * exactly why every clip tool leans on audio. We don't decode audio, but a
 * *diarized* transcript carries the same information for free (AssemblyAI's
 * `speaker_labels`, Whisper + pyannote, or a build-time pass like the
 * bundled sample's).
 *
 * A turn stores a `rank`, not a face: speakers are numbered by order of
 * first appearance and matched, at each instant, to the faces on screen
 * sorted left to right. Ranks survive what track identities cannot — a
 * source that is *itself* an edited interview, cutting between a wide shot
 * and close-ups, so the same person is a different track before and after
 * every cut.
 */
export type SpeakerTurns = {
  turns: { start: number; end: number; rank: number }[];
};

export const buildSpeakerTurns = (transcript: Transcript): SpeakerTurns | null => {
  const labelled = transcript.filter((phrase) => phrase.speaker !== undefined);
  if (labelled.length === 0) return null;

  const order: number[] = [];
  for (const phrase of labelled) {
    if (!order.includes(phrase.speaker!)) order.push(phrase.speaker!);
  }
  return {
    turns: labelled.map((phrase) => ({
      start: phrase.start,
      end: phrase.end,
      rank: order.indexOf(phrase.speaker!),
    })),
  };
};

export type CameraPath = {
  /** Crop-window center, as fractions of the source frame. */
  samples: { time: number; x: number; y: number; cut: boolean }[];
  /** Extra tightening on top of the cover fit (1 = cover, 1.7 = closer in). */
  zoom: number;
};

/** How much of the source a window shows, per axis, as fractions. */
export type View = { width: number; height: number; zoom: number };

const viewFor = (sourceAspect: number, outputAspect: number, zoom: number): View => ({
  width: Math.min(1, outputAspect / sourceAspect) / zoom,
  height: Math.min(1, sourceAspect / outputAspect) / zoom,
  zoom,
});

const clamp = (value: number, half: number) => {
  'worklet';
  return half >= 0.5 ? 0.5 : Math.min(Math.max(value, half), 1 - half);
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
 * Follows the face a human operator would keep in frame, moving only when
 * it leaves the dead zone — and when focus changes to ANOTHER person, it
 * CUTS, always: panning between two people sweeps the empty set between
 * them, which reads as a mistake at short-form zoom. A focus change must
 * also persist a couple of samples before the camera commits, so a
 * mislabelled phrase can't yank the frame back and forth.
 *
 * `preferTrack` pins one person: that face is framed whenever it is on
 * screen, and the usual selection only applies while it is absent — this is
 * what each window of the split view uses, so a window falls back to
 * whoever IS visible when the source cuts away from its person instead of
 * holding stale coordinates over a different shot.
 */
export const buildFollowPath = (
  tracks: FaceTrack[],
  duration: number,
  view: View,
  speakers: SpeakerTurns | null = null,
  preferTrack: number | null = null
): CameraPath => {
  const cropWidth = view.width;
  const half = cropWidth / 2;
  const halfY = view.height / 2;
  const samples: CameraPath['samples'] = [];
  const count = Math.max(2, Math.round(duration * PATH_FPS) + 1);

  let x = 0.5;
  let y = 0.5;
  let focused = -1; // index of the track currently framed
  let started = false;
  let pendingTrack = -1; // candidate focus waiting for confirmation
  let pendingCount = 0;

  for (let i = 0; i < count; i++) {
    const time = i / PATH_FPS;
    const faces = facesAt(tracks, time);
    let cut = false;

    if (faces.length > 0) {
      // Who should be framed? The pinned person when visible; otherwise a
      // single face decides itself, then whoever is talking (rank matched
      // to on-screen faces left to right), then size with hysteresis.
      const pinned =
        preferTrack !== null
          ? faces.find((face) => face.trackIndex === preferTrack)
          : undefined;
      let desired = pinned;
      if (!desired && faces.length === 1) desired = faces[0]!;
      if (!desired) {
        const turn = speakers?.turns.find((t) => time >= t.start && time < t.end);
        if (turn) {
          const leftToRight = [...faces].sort((a, b) => a.x - b.x);
          desired = leftToRight[Math.min(turn.rank, leftToRight.length - 1)]!;
        }
      }
      if (!desired) {
        let best = faces[0]!;
        for (const face of faces) {
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
        desired = best;
      }

      const focusedFace = faces.find((face) => face.trackIndex === focused);
      const target = desired.x + desired.width / 2;
      // Vertically, aim a little above the face's middle: heads look right
      // with some room above and the shoulders showing below.
      const targetY = desired.y + desired.height * 1.1;

      if (!started) {
        x = target;
        y = targetY;
        started = true;
        focused = desired.trackIndex;
      } else if (desired.trackIndex !== focused) {
        pendingCount = desired.trackIndex === pendingTrack ? pendingCount + 1 : 1;
        pendingTrack = desired.trackIndex;
        if (pendingCount >= CONFIRM_SAMPLES || !focusedFace) {
          // Committed: jump both axes at once. A cut is a jump, not a move.
          cut = Math.abs(target - x) > DEAD_ZONE * cropWidth;
          x = target;
          y = targetY;
          focused = desired.trackIndex;
          pendingTrack = -1;
          pendingCount = 0;
        } else if (focusedFace) {
          // Unconfirmed: keep quietly framing the current person.
          followWithinDeadZone(focusedFace);
        }
      } else {
        pendingTrack = -1;
        pendingCount = 0;
        followWithinDeadZone(desired);
      }
    }

    samples.push({ time, x: clamp(x, half), y: clamp(y, halfY), cut });

    // Nested so it can mutate x/y: the regular dead-zone pan, used only for
    // the person ALREADY framed — never to travel between two people.
    function followWithinDeadZone(face: { x: number; y: number; width: number; height: number }) {
      const faceTarget = face.x + face.width / 2;
      const faceTargetY = face.y + face.height * 1.1;
      y += (faceTargetY - y) * FOLLOW_EASE;
      const deadZone = DEAD_ZONE * cropWidth;
      const delta = faceTarget - x;
      if (Math.abs(delta) > deadZone) {
        // Move just enough to bring the face back to the dead zone's edge…
        const desiredX = faceTarget - Math.sign(delta) * deadZone;
        let step = (desiredX - x) * FOLLOW_EASE;
        // …never faster than a real operator could swing the camera.
        const maxStep = MAX_SPEED / PATH_FPS;
        step = Math.min(Math.max(step, -maxStep), maxStep);
        x += step;
      }
    }
  }
  return { samples, zoom: view.zoom };
};

/** Keeps everyone in frame: centered on the bounding box of all faces. */
export const buildGroupPath = (
  tracks: FaceTrack[],
  duration: number,
  view: View
): CameraPath => {
  const half = view.width / 2;
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
  return { samples, zoom: view.zoom };
};

/**
 * One half of the stacked split view: pinned to one person, falling back to
 * whoever is visible when the source cuts away from them.
 */
const buildSplitWindowPath = (
  tracks: FaceTrack[],
  trackIndex: number,
  duration: number,
  view: View
): CameraPath => buildFollowPath(tracks, duration, view, null, trackIndex);

/**
 * The pair of tracks the split view should stack: the two people who are on
 * screen *at the same time* the longest.
 *
 * Picking the two biggest tracks would be wrong on an edited source, where
 * consecutive close-ups of the same person are the biggest tracks of all and
 * never coexist — each half would then show the same face, or nothing.
 */
const splitPair = (tracks: FaceTrack[]): [FaceTrack, FaceTrack] | null => {
  const span = (track: FaceTrack) => ({
    from: track.samples[0]!.time,
    to: track.samples[track.samples.length - 1]!.time,
  });
  let best: { pair: [FaceTrack, FaceTrack]; overlap: number } | null = null;
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = span(tracks[i]!);
      const b = span(tracks[j]!);
      const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
      if (overlap > (best?.overlap ?? 1)) {
        // left first, so the top half is the person on the left
        const meanX = (track: FaceTrack) =>
          track.samples.reduce((total, s) => total + s.x + s.width / 2, 0) / track.samples.length;
        const pair: [FaceTrack, FaceTrack] =
          meanX(tracks[i]!) <= meanX(tracks[j]!)
            ? [tracks[i]!, tracks[j]!]
            : [tracks[j]!, tracks[i]!];
        best = { pair, overlap };
      }
    }
  }
  return best?.pair ?? null;
};

/** The exported short is 9:16. */
export const OUTPUT_ASPECT = 9 / 16;

/**
 * A half-height window is twice as wide, so a plain cover fit would show
 * most of the room. The split view tightens in on each person instead.
 */
const SPLIT_ZOOM = 1.75;

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
  const pair = mode === 'split' ? splitPair(tracks) : null;
  if (pair) {
    const view = viewFor(sourceAspect, OUTPUT_ASPECT * 2, SPLIT_ZOOM);
    return pair.map((track) =>
      buildSplitWindowPath(tracks, tracks.indexOf(track), duration, view)
    );
  }
  const view = viewFor(sourceAspect, OUTPUT_ASPECT, 1);
  return [
    mode === 'group'
      ? buildGroupPath(tracks, duration, view)
      : buildFollowPath(tracks, duration, view, buildSpeakerTurns(transcript)),
  ];
};
