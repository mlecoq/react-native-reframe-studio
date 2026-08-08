import type { VideoComposition } from '@azzapp/react-native-skia-video';
import type { Segment, SourceVideo } from './types';

/** Decoders don't need to work above the export size. */
const MAX_DECODE_SIZE = 1920;

/**
 * One video item, trimmed to the chosen segment. Trimming is free here:
 * `startTime` tells the decoder where to start inside the file, so a 3-hour
 * podcast costs exactly the same as a 30-second clip — nothing is copied or
 * re-encoded first.
 */
export const buildComposition = (video: SourceVideo, segment: Segment): VideoComposition => {
  const scale = Math.min(1, MAX_DECODE_SIZE / Math.max(video.width, video.height));
  return {
    duration: segment.duration,
    items: [
      {
        kind: 'video',
        id: 'video',
        path: video.uri.replace('file://', ''),
        compositionStartTime: 0,
        startTime: segment.start,
        duration: segment.duration,
        resolution: {
          width: Math.round(video.width * scale),
          height: Math.round(video.height * scale),
        },
        audio: true, // keep the speaker's voice
      },
    ],
  };
};
