/**
 * Per-frame audio analysis, precomputed by scripts/analyze-track.mjs and
 * bundled next to each track. The visualizer worklet just indexes it by
 * frame — no audio processing happens at runtime.
 */
export type TrackAnalysis = {
  /** Analysis frame rate (frames per second). */
  fps: number;
  duration: number;
  /** Smoothed 0..1 envelopes, one value per analysis frame. */
  bass: number[];
  mid: number[];
  high: number[];
  /** 24 log-spaced spectrum bins (0..1) per frame. */
  spectrum: number[][];
  /** 48 waveform samples (-1..1) per frame. */
  wave: number[][];
};

/** One analysis frame, sampled at the current playback time. */
export type AnalysisFrame = {
  bass: number;
  mid: number;
  high: number;
  spectrum: number[];
  wave: number[];
};

export const analysisAt = (analysis: TrackAnalysis, time: number): AnalysisFrame => {
  'worklet';
  const index = Math.min(
    Math.max(Math.floor(time * analysis.fps), 0),
    analysis.bass.length - 1
  );
  return {
    bass: analysis.bass[index] ?? 0,
    mid: analysis.mid[index] ?? 0,
    high: analysis.high[index] ?? 0,
    spectrum: analysis.spectrum[index] ?? [],
    wave: analysis.wave[index] ?? [],
  };
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  /** Local file URI of the audio. */
  uri: string;
  duration: number;
  /** Key of the artwork in the image registry. */
  coverId: string;
  analysis: TrackAnalysis;
};

export type SceneId = 'ring' | 'scope' | 'nebula';

export type VisualizerSettings = {
  scene: SceneId;
  themeId: string;
  title: string;
  artist: string;
};
