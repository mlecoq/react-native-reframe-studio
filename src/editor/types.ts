import type { CaptionSettings, Transcript } from '../captions/types';

/**
 * Reframe Studio turns a landscape video (a podcast, an interview, a talk)
 * into a vertical short: it picks a moment, follows the speakers with a
 * virtual camera, and burns captions on top.
 */

/** The source video — any length: only the chosen segment is ever analyzed. */
export type SourceVideo = {
  uri: string;
  width: number;
  height: number;
  duration: number;
};

/** The moment kept from the source, in seconds. */
export type Segment = {
  start: number;
  duration: number;
};

/** One detected face box, as fractions of the video frame. */
export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Raw detector output over the chosen segment: faces sampled `sampleRate`
 * times per second, with times relative to the segment start.
 */
export type FaceAnalysis = {
  duration: number;
  sampleRate: number;
  samples: { time: number; faces: FaceBox[] }[];
};

/** A face followed through time (see faceTracks.ts). */
export type FaceTrack = {
  samples: { time: number; x: number; y: number; width: number; height: number }[];
};

export type ReframeMode = 'follow' | 'group' | 'split';

export type Settings = {
  mode: ReframeMode;
  captions: CaptionSettings;
  showCaptions: boolean;
};

/** What the editor hands to the drawer once a segment has been analyzed. */
export type Project = {
  video: SourceVideo;
  segment: Segment;
  tracks: FaceTrack[];
  /** Transcript times are segment-relative, like everything else. */
  transcript: Transcript;
};
