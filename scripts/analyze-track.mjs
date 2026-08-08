#!/usr/bin/env node
/**
 * Precomputes the per-frame audio analysis a visualizer scene needs:
 *
 *   node scripts/analyze-track.mjs song.m4a > assets/music/song.analysis.json
 *
 * Output (30 fps): smoothed bass/mid/high envelopes (0..1), a 24-bin
 * log-spaced spectrum and a 48-point waveform per frame. The app ships this
 * JSON next to each bundled track — at ~2 decimal places it stays small and
 * the render worklet just indexes it by frame.
 *
 * Requires ffmpeg on your PATH (only to decode the file to raw PCM).
 */
import { execFileSync } from 'node:child_process';
import { argv, exit } from 'node:process';

const FPS = 30;
const SAMPLE_RATE = 44100;
const WINDOW = 2048; // FFT size
const SPECTRUM_BINS = 24;
const WAVE_POINTS = 48;
const FMIN = 40;
const FMAX = 12000;

const file = argv[2];
if (!file) {
  console.error('usage: analyze-track.mjs <audio file>');
  exit(1);
}

// ---- decode to mono float PCM ----
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const raw = execFileSync(ffmpeg, [
  '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-',
], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);

// ---- tiny iterative radix-2 FFT ----
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
};

const hann = Float32Array.from({ length: WINDOW }, (_, i) =>
  0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1))
);
const binOf = (hz) => Math.round((hz / SAMPLE_RATE) * WINDOW);

// log-spaced spectrum bin edges
const edges = Array.from({ length: SPECTRUM_BINS + 1 }, (_, i) =>
  binOf(FMIN * Math.pow(FMAX / FMIN, i / SPECTRUM_BINS))
);

const hop = SAMPLE_RATE / FPS;
const frameCount = Math.floor(pcm.length / hop);
const frames = [];
for (let f = 0; f < frameCount; f++) {
  const at = Math.floor(f * hop);
  const re = new Float64Array(WINDOW);
  const im = new Float64Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) re[i] = (pcm[at + i] ?? 0) * hann[i];
  fft(re, im);
  const mag = new Float64Array(WINDOW / 2);
  for (let i = 0; i < WINDOW / 2; i++) mag[i] = Math.hypot(re[i], im[i]);

  const bandEnergy = (lo, hi) => {
    let sum = 0;
    for (let i = binOf(lo); i < Math.min(binOf(hi), mag.length); i++) sum += mag[i] * mag[i];
    return Math.sqrt(sum / Math.max(1, binOf(hi) - binOf(lo)));
  };
  const spectrum = [];
  for (let b = 0; b < SPECTRUM_BINS; b++) {
    let sum = 0;
    const from = edges[b], to = Math.max(edges[b] + 1, edges[b + 1]);
    for (let i = from; i < to; i++) sum += mag[i] * mag[i];
    spectrum.push(Math.sqrt(sum / (to - from)));
  }
  const wave = [];
  const step = hop / WAVE_POINTS;
  for (let w = 0; w < WAVE_POINTS; w++) wave.push(pcm[at + Math.floor(w * step)] ?? 0);

  frames.push({ bass: bandEnergy(FMIN, 160), mid: bandEnergy(300, 2000), high: bandEnergy(4000, FMAX), spectrum, wave });
}

// ---- normalize (95th percentile), smooth envelopes (fast attack, slow release) ----
const percentile95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] || 1;
};
const normalizeEnvelope = (key) => {
  const scale = percentile95(frames.map((fr) => fr[key]));
  let env = 0;
  return frames.map((fr) => {
    const v = Math.min(fr[key] / scale, 1);
    env = v > env ? v : env * 0.88 + v * 0.12;
    return +env.toFixed(2);
  });
};
const bass = normalizeEnvelope('bass');
const mid = normalizeEnvelope('mid');
const high = normalizeEnvelope('high');
const spectrumScale = percentile95(frames.flatMap((fr) => fr.spectrum));
const spectrum = frames.map((fr) => fr.spectrum.map((v) => +Math.min(v / spectrumScale, 1).toFixed(2)));
const waveScale = percentile95(frames.flatMap((fr) => fr.wave.map(Math.abs)));
const wave = frames.map((fr) => fr.wave.map((v) => +Math.max(-1, Math.min(v / waveScale, 1)).toFixed(2)));

process.stdout.write(
  JSON.stringify({ fps: FPS, duration: +(frameCount / FPS).toFixed(2), bass, mid, high, spectrum, wave })
);
