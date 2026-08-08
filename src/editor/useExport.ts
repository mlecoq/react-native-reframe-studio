import { exportVideoComposition, getValidEncoderConfigurations } from '@azzapp/react-native-skia-video';
import { Paths } from 'expo-file-system';
import { Asset as MediaAsset, requestPermissionsAsync } from 'expo-media-library';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import type { CameraPath } from './camera';
import { buildComposition } from './composition';
import { drawFrame } from './drawFrame';
import type { Project, Settings } from './types';

const WIDTH = 1080;
const HEIGHT = 1920;
const FRAME_RATE = 30;
const BIT_RATE = 8_000_000;

export type ExportPhase = 'idle' | 'rendering' | 'saving' | 'done' | 'error';

/**
 * Renders the reframed short to a 1080x1920 MP4 (the speaker's audio kept)
 * and saves it to the photo library — the exact same drawFrame as the
 * preview, replayed frame-perfect on a background thread.
 */
export const useExport = (
  project: Project | null,
  paths: CameraPath[],
  settings: Settings
) => {
  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!project) return;
    try {
      const permission = await requestPermissionsAsync(true);
      if (!permission.granted) {
        throw new Error('Permission to save to the photo library was denied.');
      }
      setPhase('rendering');
      setProgress(0);

      const encoderConfig =
        Platform.OS === 'android'
          ? getValidEncoderConfigurations(WIDTH, HEIGHT, FRAME_RATE, BIT_RATE)?.[0]
          : null;

      // Plain-data snapshots captured by the export worklet.
      const snapshotPaths = paths;
      const snapshotTranscript = project.transcript;
      const snapshotSettings = settings;

      const outPath = `${Paths.cache.uri}short-${Date.now()}.mp4`.replace('file://', '');
      await exportVideoComposition({
        videoComposition: buildComposition(project.video, project.segment),
        outPath,
        width: encoderConfig?.width ?? WIDTH,
        height: encoderConfig?.height ?? HEIGHT,
        frameRate: encoderConfig?.frameRate ?? FRAME_RATE,
        bitRate: encoderConfig?.bitRate ?? BIT_RATE,
        encoderName: encoderConfig?.encoderName,
        drawFrame: ({ canvas, width, height, currentTime, frames }) => {
          'worklet';
          drawFrame({
            canvas,
            width,
            height,
            currentTime,
            frames,
            paths: snapshotPaths,
            transcript: snapshotTranscript,
            settings: snapshotSettings,
          });
        },
        // One scheduled state update per frame can starve the JS thread and
        // freeze the progress bar; only commit whole-percent changes —
        // returning the previous value lets React bail out of the render.
        onProgress: ({ framesCompleted, nbFrames }) =>
          setProgress((previous) => {
            const next = framesCompleted / nbFrames;
            return Math.round(next * 100) > Math.round(previous * 100) ? next : previous;
          }),
      });

      setPhase('saving');
      await MediaAsset.create(`file://${outPath}`);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
      setPhase('error');
    }
  }, [project, paths, settings]);

  const reset = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setError(null);
  }, []);

  return { phase, progress, error, start, reset };
};
