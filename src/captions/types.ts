/**
 * A transcript is a list of phrases, each made of words with their own
 * start/end times (seconds). This is the shape produced by speech-to-text
 * tools with word timestamps (Whisper, AssemblyAI, Deepgram…) — see parse.ts
 * for the supported input formats.
 */

export type CaptionWord = { text: string; start: number; end: number };

export type CaptionPhrase = {
  start: number;
  end: number;
  words: CaptionWord[];
  /**
   * Optional speaker index, when the transcript is diarized (AssemblyAI's
   * `speaker_labels`, Whisper + pyannote…). Reframe Studio uses it to know
   * who is talking; the caption drawing ignores it.
   */
  speaker?: number;
};

export type Transcript = CaptionPhrase[];

export type CaptionStyleId = 'pop' | 'karaoke' | 'pill' | 'minimal';

/** User-adjustable caption settings (geometry as canvas fractions). */
export type CaptionSettings = {
  style: CaptionStyleId;
  accentColor: string;
  /** Font size as a fraction of the canvas width. */
  size: number;
  /** Vertical center of the caption block, as a fraction of the height. */
  y: number;
};

export const DEFAULT_SETTINGS: CaptionSettings = {
  style: 'pop',
  accentColor: '#2DD4BF',
  size: 0.085,
  y: 0.7,
};

/** The video the captions are burned onto. */
export type SourceVideo = {
  uri: string;
  width: number;
  height: number;
  duration: number;
};
