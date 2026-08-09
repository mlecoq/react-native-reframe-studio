import { File, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import { decodeAudioData } from 'react-native-audio-api';
// The package's `exports` map has no "." entry, so the bare specifier
// resolves for Metro but not for TypeScript — the /index subpath works
// for both.
import { initWhisper } from 'whisper.rn/index';
import type { WhisperContext } from 'whisper.rn/index';
import { decodableUri } from '../editor/audio';
import type { Segment, SourceVideo } from '../editor/types';
import type { CaptionWord, Transcript } from './types';

/**
 * True auto-captions: Whisper (whisper.cpp via whisper.rn) transcribing the
 * chosen segment ON THE DEVICE. The segment-first design is what makes this
 * viable — a 30-second clip transcribes in seconds with the tiny model,
 * whatever the length of the source.
 *
 * The audio reaches Whisper through the same seam as everything else:
 * decodeAudioData at 16kHz (exactly what Whisper wants), sliced to the
 * segment, mixed to mono. No files are written, no re-encode happens.
 */

/**
 * ggml-base: multilingual, ~142MB, a few seconds per 30s segment on a
 * recent phone. Downloaded once into the app's documents on first use —
 * bundling it would make the repo unclonable. (tiny is half the size and
 * twice as fast, but its word timing on non-English speech is noticeably
 * rougher — this app burns the words on screen, so timing wins.)
 */
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
/** A partial download must never pass for a model. */
const MODEL_MIN_BYTES = 135_000_000;

const modelFile = () => new File(Paths.document, 'ggml-base.bin');

export const isModelReady = (): boolean => {
  const file = modelFile();
  return file.exists && (file.size ?? 0) > MODEL_MIN_BYTES;
};

export const downloadModel = async (
  onProgress?: (fraction: number) => void
): Promise<void> => {
  if (isModelReady()) return;
  const download = createDownloadResumable(MODEL_URL, modelFile().uri, {}, (progress) =>
    onProgress?.(
      progress.totalBytesWritten / Math.max(progress.totalBytesExpectedToWrite, 1)
    )
  );
  await download.downloadAsync();
  if (!isModelReady()) {
    throw new Error('The model download did not complete — check your connection.');
  }
};

/** The Whisper context is expensive: created once, reused across segments. */
let contextPromise: Promise<WhisperContext> | null = null;
const getContext = () => {
  contextPromise ??= initWhisper({
    filePath: modelFile().uri.replace('file://', ''),
  }).catch((error) => {
    contextPromise = null; // a failed init must not poison future attempts
    throw error;
  });
  return contextPromise;
};

/**
 * Transcribes the chosen segment. Times in the returned transcript are
 * segment-relative — the app's clock — because the audio handed to Whisper
 * starts at the segment's first sample.
 */
export const transcribeSegment = async (
  video: SourceVideo,
  segment: Segment,
  onProgress?: (fraction: number) => void
): Promise<Transcript> => {
  const buffer = await decodeAudioData(decodableUri(video.uri), 16000);
  const from = Math.max(0, Math.floor(segment.start * buffer.sampleRate));
  const to = Math.min(
    buffer.length,
    Math.ceil((segment.start + segment.duration) * buffer.sampleRate)
  );
  const mono = new Float32Array(Math.max(0, to - from));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < mono.length; i++) {
      mono[i] += samples[from + i]! / buffer.numberOfChannels;
    }
  }

  // Whisper smears its first token timestamps across whatever leading
  // non-speech the audio starts with — early captions then run seconds
  // ahead until the first sentences lock in. Trim the leading quiet and
  // shift the returned times back by the same amount.
  const leadSeconds = leadingQuiet(mono, buffer.sampleRate);
  const trimmed = leadSeconds > 0 ? mono.subarray(Math.floor(leadSeconds * buffer.sampleRate)) : mono;

  // whisper.rn's TYPES say float32, but its JSI native decodes the
  // ArrayBuffer as SIGNED 16-BIT PCM (decodePcm16 in RNWhisperJSI.cpp).
  // Hand it float32 and Whisper hears white noise — and hallucinates a
  // transcript that has nothing to do with the segment.
  const pcm16 = new Int16Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) {
    const v = Math.max(-1, Math.min(1, trimmed[i]!));
    pcm16[i] = Math.round(v * 32767);
  }

  const context = await getContext();
  const { promise } = context.transcribeData(pcm16.buffer as ArrayBuffer, {
    language: 'auto',
    // Word-level mode: token timestamps + a 1-character wrap makes
    // whisper.cpp emit one segment per token; token pieces are glued back
    // into words below (a token starting with a space starts a new word).
    tokenTimestamps: true,
    maxLen: 1,
    onProgress: (progress) => onProgress?.(progress / 100),
  });
  const result = await promise;
  return phrasesFromTokenSegments(
    result.segments.map((seg) => ({
      ...seg,
      t0: seg.t0 + leadSeconds * 100,
      t1: seg.t1 + leadSeconds * 100,
    }))
  );
};

/**
 * Seconds of quiet before the first speech in the slice — measured against
 * the slice's own loud level, with a quarter second of pre-roll kept so the
 * first word never starts clipped.
 */
const leadingQuiet = (samples: Float32Array, sampleRate: number): number => {
  const hop = Math.round(sampleRate * 0.05);
  const count = Math.floor(samples.length / hop);
  if (count === 0) return 0;
  const rms = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) sum += samples[j]! * samples[j]!;
    rms[i] = Math.sqrt(sum / hop);
  }
  const loud = [...rms].sort((a, b) => a - b)[Math.floor(count * 0.92)]!;
  if (loud <= 0) return 0;
  const first = rms.findIndex((v) => v / loud > 0.12);
  if (first < 0) return 0;
  return Math.max(0, first * 0.05 - 0.25);
};

/** One whisper.cpp output segment — t0/t1 are centiseconds. */
export type TokenSegment = { text: string; t0: number; t1: number };

/** A new phrase starts after a pause this long (seconds)… */
const PHRASE_GAP = 0.6;
/** …or when the current one already carries this many words… */
const PHRASE_MAX_WORDS = 7;
/** …or spans this long (seconds). Short phrases read better as captions. */
const PHRASE_MAX_SPAN = 3.5;

/**
 * Token segments → words → phrases. Pure, so it is testable offline: glue
 * token pieces into words (a leading space opens a new word), drop
 * bracketed sound events ([MUSIC], (laughs)…), then group words into
 * caption-sized phrases on pauses, word count and span.
 */
export const phrasesFromTokenSegments = (segments: TokenSegment[]): Transcript => {
  const words: CaptionWord[] = [];
  for (const segment of segments) {
    const text = segment.text;
    if (text.trim().length === 0) continue;
    const opensWord = /^\s/.test(text) || words.length === 0;
    if (opensWord) {
      words.push({ text: text.trim(), start: segment.t0 / 100, end: segment.t1 / 100 });
    } else {
      const current = words[words.length - 1]!;
      current.text += text.trim();
      current.end = segment.t1 / 100;
    }
  }

  const spoken = words.filter(
    (word) =>
      /[\dA-Za-zÀ-ɏЀ-ӿ一-鿿]/.test(word.text) &&
      !/^[[(].*[)\]]$/.test(word.text)
  );

  const transcript: Transcript = [];
  for (const word of spoken) {
    const phrase = transcript[transcript.length - 1];
    const fits =
      phrase &&
      word.start - phrase.words[phrase.words.length - 1]!.end < PHRASE_GAP &&
      phrase.words.length < PHRASE_MAX_WORDS &&
      word.end - phrase.start < PHRASE_MAX_SPAN;
    if (fits) {
      phrase.words.push(word);
      phrase.end = word.end;
    } else {
      transcript.push({ start: word.start, end: word.end, words: [word] });
    }
  }
  return transcript;
};
