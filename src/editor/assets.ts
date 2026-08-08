import { Asset } from 'expo-asset';
import { parseWhisperJson } from '../captions/parse';
import type { Transcript } from '../captions/types';
import { registerFontFile } from './fonts';
import type { FaceAnalysis, SourceVideo } from './types';

/**
 * Bundled content: a landscape NASA interview (public domain) whose face
 * analysis and word-level transcript were precomputed at build time and ship
 * as JSON — the exact shapes the on-device analysis and the transcript
 * parser produce. Plus the caption fonts.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const SAMPLE_VIDEO = require('../../assets/samples/interview.mp4');
export const SAMPLE_THUMB = require('../../assets/samples/interview.thumb.jpg');
const SAMPLE_FACES = require('../../assets/samples/interview.faces.json') as FaceAnalysis;
const SAMPLE_TRANSCRIPT = require('../../assets/samples/interview.transcript.json');

const FONT_FILES: Record<string, number> = {
  // Family names used by the caption style presets (see captions/styles.ts).
  poppins: require('../../assets/fonts/Poppins-SemiBold.ttf'),
  archivo: require('../../assets/fonts/ArchivoBlack-Regular.ttf'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The moment the bundled sample's precomputed analysis covers — a question
 * and its answer, 68 seconds into a three-and-a-half minute interview.
 */
export const SAMPLE_SEGMENT = { start: 68, duration: 24 };

const localUri = async (module: number) => {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  return asset.localUri!;
};

export const loadSample = async (): Promise<{
  video: SourceVideo;
  faces: FaceAnalysis;
  transcript: Transcript;
}> => ({
  video: {
    uri: await localUri(SAMPLE_VIDEO),
    width: 640,
    height: 360,
    duration: 205.8,
  },
  faces: SAMPLE_FACES,
  // The transcript ships as-is from Whisper — same parser as user input.
  transcript: parseWhisperJson(JSON.stringify(SAMPLE_TRANSCRIPT)),
});

/** Registers the caption fonts into the shared Skia font provider. */
export const loadEditorFonts = async () => {
  for (const [family, module] of Object.entries(FONT_FILES)) {
    registerFontFile(family, await localUri(module));
  }
};
