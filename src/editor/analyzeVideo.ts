import { File } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { detectFaces } from '../../modules/face-detector';
import type { FaceAnalysis, FaceBox, Segment, SourceVideo } from './types';

/**
 * On-device face analysis — of the chosen segment only.
 *
 * That "only" is the whole reason the app works on a two-hour podcast:
 * analysis costs a few frames per second of KEPT footage, not of source
 * footage. Times come back relative to the segment start, so everything
 * downstream (camera path, captions, composition) shares one clock that
 * starts at zero.
 */

const ANALYSIS_FPS = 3;

export const analyzeSegment = async (
  video: SourceVideo,
  segment: Segment,
  onProgress: (fraction: number) => void
): Promise<FaceAnalysis> => {
  const count = Math.max(1, Math.floor(segment.duration * ANALYSIS_FPS) + 1);
  const samples: FaceAnalysis['samples'] = [];
  for (let i = 0; i < count; i++) {
    const time = i / ANALYSIS_FPS;
    const sourceTime = Math.min(
      (segment.start + time) * 1000,
      (segment.start + segment.duration) * 1000 - 50
    );
    const thumbnail = await VideoThumbnails.getThumbnailAsync(video.uri, {
      time: sourceTime,
      quality: 0.5,
    });
    const faces: FaceBox[] = await detectFaces(thumbnail.uri);
    samples.push({ time, faces });
    try {
      new File(thumbnail.uri).delete();
    } catch {
      // temp files get cleaned up by the OS anyway
    }
    onProgress((i + 1) / count);
  }
  return { duration: segment.duration, sampleRate: ANALYSIS_FPS, samples };
};
