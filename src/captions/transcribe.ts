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
 * ggml-tiny: multilingual, ~75MB, roughly real-time on a recent phone.
 * Downloaded once into the app's documents on first use — bundling it would
 * make the repo unclonable.
 */
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin';
/** A partial download must never pass for a model. */
const MODEL_MIN_BYTES = 70_000_000;

const modelFile = () => new File(Paths.document, 'ggml-tiny.bin');

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

  const context = await getContext();
  const { promise } = context.transcribeData(mono.buffer as ArrayBuffer, {
    language: 'auto',
    // Word-level mode: token timestamps + a 1-character wrap makes
    // whisper.cpp emit one segment per token; token pieces are glued back
    // into words below (a token starting with a space starts a new word).
    tokenTimestamps: true,
    maxLen: 1,
    onProgress: (progress) => onProgress?.(progress / 100),
  });
  const result = await promise;
  return phrasesFromTokenSegments(result.segments);
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
