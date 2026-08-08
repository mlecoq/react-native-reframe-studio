import { File, Paths } from 'expo-file-system';
import { decodeAudioData } from 'react-native-audio-api';
import type { TrackAnalysis } from './types';

/**
 * The on-device twin of scripts/analyze-track.mjs: decode the user's own
 * music to PCM (react-native-audio-api) and run the exact same analysis the
 * bundled tracks ship as JSON — same FFT, same bands, same normalization,
 * same output shape. The visualizer can't tell a picked song from a bundled
 * one, which is the point: analysis is data, wherever it was computed.
 *
 * A three-minute song is ~5400 FFT frames of plain JS. That takes a few
 * seconds on a phone, so the loop yields to the UI regularly and reports
 * progress — the same "analyze once, index per frame" contract as the other
 * Studios' on-device passes.
 */

const FPS = 30;
const SAMPLE_RATE = 44100;
const WINDOW = 2048; // FFT size
const SPECTRUM_BINS = 24;
const WAVE_POINTS = 48;
const FMIN = 40;
const FMAX = 12000;

/** Decoding holds the whole track in memory; past this, refuse politely. */
export const MAX_TRACK_MINUTES = 10;

/** Frames processed between two yields to the UI thread. */
const CHUNK_FRAMES = 90;

// ---- tiny iterative radix-2 FFT (identical to the build-time script) ----
const fft = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * wr - im[i + k + len / 2]! * wi;
        const vi = re[i + k + len / 2]! * wi + im[i + k + len / 2]! * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
};

const hann = Float64Array.from({ length: WINDOW }, (_, i) =>
  0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1))
);
const binOf = (hz: number) => Math.round((hz / SAMPLE_RATE) * WINDOW);

// log-spaced spectrum bin edges
const edges = Array.from({ length: SPECTRUM_BINS + 1 }, (_, i) =>
  binOf(FMIN * Math.pow(FMAX / FMIN, i / SPECTRUM_BINS))
);

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const hashUri = (uri: string): string => {
  let hash = 5381;
  for (let i = 0; i < uri.length; i++) hash = ((hash << 5) + hash + uri.charCodeAt(i)) >>> 0;
  return hash.toString(36);
};

/**
 * decodeAudioData routes by file EXTENSION: mp3/wav/flac/ogg go to its
 * miniaudio decoder, which chokes on some real-world files (heavy ID3v2
 * tags, AAC masquerading as .mp3…). Its FFmpeg decoder probes CONTENT — but
 * only .mp4/.m4a/.aac extensions reach it. So when the first attempt fails,
 * retry under an .mp4 name: FFmpeg opens it and identifies the actual
 * format, whatever the file was called.
 */
const decodeRobust = async (uri: string, sampleRate: number) => {
  try {
    return await decodeAudioData(uri, sampleRate);
  } catch (firstError) {
    const copy = new File(Paths.cache, `decode-${hashUri(uri)}.mp4`);
    try {
      if (!copy.exists) new File(uri).copy(copy);
      return await decodeAudioData(copy.uri, sampleRate);
    } catch {
      throw firstError;
    }
  }
};

type RawFrame = { bass: number; mid: number; high: number; spectrum: number[]; wave: number[] };

export const analyzeTrack = async (
  uri: string,
  onProgress?: (fraction: number) => void
): Promise<TrackAnalysis> => {
  const buffer = await decodeRobust(uri, SAMPLE_RATE);
  if (buffer.duration > MAX_TRACK_MINUTES * 60) {
    throw new Error(
      `This track is longer than ${MAX_TRACK_MINUTES} minutes — decoding and ` +
        'analyzing it in one piece would not fit in memory.'
    );
  }

  // Mix down to mono, like the build-time script's ffmpeg -ac 1.
  const pcm = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < pcm.length; i++) pcm[i] += samples[i]! / buffer.numberOfChannels;
  }

  const hop = SAMPLE_RATE / FPS;
  const frameCount = Math.floor(pcm.length / hop);
  const frames: RawFrame[] = [];
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);

  for (let f = 0; f < frameCount; f++) {
    const at = Math.floor(f * hop);
    for (let i = 0; i < WINDOW; i++) {
      re[i] = (pcm[at + i] ?? 0) * hann[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const mag = new Float64Array(WINDOW / 2);
    for (let i = 0; i < WINDOW / 2; i++) mag[i] = Math.hypot(re[i]!, im[i]!);

    const bandEnergy = (lo: number, hi: number) => {
      let sum = 0;
      for (let i = binOf(lo); i < Math.min(binOf(hi), mag.length); i++) sum += mag[i]! * mag[i]!;
      return Math.sqrt(sum / Math.max(1, binOf(hi) - binOf(lo)));
    };
    const spectrum: number[] = [];
    for (let b = 0; b < SPECTRUM_BINS; b++) {
      let sum = 0;
      const from = edges[b]!;
      const to = Math.max(from + 1, edges[b + 1]!);
      for (let i = from; i < to; i++) sum += mag[i]! * mag[i]!;
      spectrum.push(Math.sqrt(sum / (to - from)));
    }
    const wave: number[] = [];
    const step = hop / WAVE_POINTS;
    for (let w = 0; w < WAVE_POINTS; w++) wave.push(pcm[at + Math.floor(w * step)] ?? 0);

    frames.push({
      bass: bandEnergy(FMIN, 160),
      mid: bandEnergy(300, 2000),
      high: bandEnergy(4000, FMAX),
      spectrum,
      wave,
    });

    if (f % CHUNK_FRAMES === CHUNK_FRAMES - 1) {
      onProgress?.(f / frameCount);
      await yieldToUi();
    }
  }

  // ---- normalize (95th percentile), smooth envelopes (fast attack, slow release) ----
  const percentile95 = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)] || 1;
  };
  const normalizeEnvelope = (key: 'bass' | 'mid' | 'high') => {
    const scale = percentile95(frames.map((frame) => frame[key]));
    let env = 0;
    return frames.map((frame) => {
      const v = Math.min(frame[key] / scale, 1);
      env = v > env ? v : env * 0.88 + v * 0.12;
      return +env.toFixed(2);
    });
  };
  const bass = normalizeEnvelope('bass');
  const mid = normalizeEnvelope('mid');
  const high = normalizeEnvelope('high');
  const spectrumScale = percentile95(frames.flatMap((frame) => frame.spectrum));
  const spectrum = frames.map((frame) =>
    frame.spectrum.map((v) => +Math.min(v / spectrumScale, 1).toFixed(2))
  );
  const waveScale = percentile95(frames.flatMap((frame) => frame.wave.map(Math.abs)));
  const wave = frames.map((frame) =>
    frame.wave.map((v) => +Math.max(-1, Math.min(v / waveScale, 1)).toFixed(2))
  );

  onProgress?.(1);
  return { fps: FPS, duration: +(frameCount / FPS).toFixed(2), bass, mid, high, spectrum, wave };
};
