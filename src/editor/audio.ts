import { File, Paths } from 'expo-file-system';
import { decodeAudioData } from 'react-native-audio-api';
import type { SourceVideo } from './types';

/**
 * The segment picker's ears: the source's audio track decoded to PCM
 * on-device (react-native-audio-api) and reduced to a loudness envelope —
 * the same seam Cut Studio is built around. Reframe only uses it to help
 * CHOOSE the moment (waveform, snap-to-pause, suggested moments), so
 * everything here is best-effort: when the source is too long to decode in
 * one piece or the decode fails, the picker simply works without it.
 */

export type AudioEnvelope = {
  duration: number;
  hop: number;
  values: number[];
};

/** Envelope resolution: one loudness value per 50ms. */
const HOP_S = 0.05;

/** Speech needs no fidelity: 16kHz costs a third of the memory of 48kHz. */
const DECODE_SAMPLE_RATE = 16000;

/**
 * `decodeAudioData` has no ranged decode, so the whole track lands in memory
 * at once. Past this, skip the envelope instead of risking an OOM — the
 * picker is still fully usable, that is the point of best-effort.
 */
const MAX_DECODE_MINUTES = 15;

/**
 * iPhone cameras record QuickTime `.mov`: the decoder's demuxer handles the
 * container but routes by extension and only ships `.mp4/.m4a/.aac`, so a
 * `.mov` is copied under an `.mp4` name first.
 */
export const decodableUri = (uri: string): string => {
  if (!/\.mov$/i.test(uri)) return uri;
  const copy = new File(Paths.cache, `decode-${hashUri(uri)}.mp4`);
  if (!copy.exists) new File(uri).copy(copy);
  return copy.uri;
};

const hashUri = (uri: string): string => {
  let hash = 5381;
  for (let i = 0; i < uri.length; i++) hash = ((hash << 5) + hash + uri.charCodeAt(i)) >>> 0;
  return hash.toString(36);
};

/** Decodes the audio track into a normalized RMS envelope — or null. */
export const tryDecodeEnvelope = async (video: SourceVideo): Promise<AudioEnvelope | null> => {
  if (video.duration > MAX_DECODE_MINUTES * 60) return null;
  try {
    const buffer = await decodeAudioData(decodableUri(video.uri), DECODE_SAMPLE_RATE);

    const hopFrames = Math.round(buffer.sampleRate * HOP_S);
    const count = Math.max(1, Math.floor(buffer.length / hopFrames));
    const values = new Array<number>(count).fill(0);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < count; i++) {
        let sum = 0;
        const from = i * hopFrames;
        for (let j = from; j < from + hopFrames; j++) sum += samples[j]! * samples[j]!;
        values[i] += Math.sqrt(sum / hopFrames) / buffer.numberOfChannels;
      }
    }

    // Normalize to the source's own speaking level (a loud percentile).
    const speakingLevel = [...values].sort((a, b) => a - b)[Math.floor(count * 0.92)]!;
    if (speakingLevel > 0) {
      for (let i = 0; i < count; i++) values[i] = Math.min(1, values[i]! / speakingLevel);
    }
    return { duration: video.duration, hop: HOP_S, values };
  } catch {
    return null;
  }
};
