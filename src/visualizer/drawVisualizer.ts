import { Skia } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { analysisAt, type Track, type VisualizerSettings } from '../audio/types';
import type { AssetBytes } from '../editor/assetRegistry';
import { getCachedImage, getParagraph, primeSkiaCaches } from '../editor/skiaCache';
import { drawNebula, drawRing, drawScope, type SceneArgs } from './scenes';
import { getTheme } from './themes';

/**
 * Draws one frame of the visualizer — the single worklet behind both the
 * live preview and the export. The composition has no video items at all:
 * everything on screen is generated from the precomputed audio analysis.
 */
export type DrawVisualizerOptions = {
  canvas: SkCanvas;
  width: number;
  height: number;
  currentTime: number;
  track: Track;
  settings: VisualizerSettings;
  /** Export only: bytes to prime this runtime's Skia caches. */
  assets?: AssetBytes | null;
  /** Preview only: drives the progress bar without re-rendering React. */
  playbackTimeOut?: SharedValue<number> | null;
};

export const drawVisualizer = (options: DrawVisualizerOptions) => {
  'worklet';
  const { canvas, width, height, currentTime, track, settings } = options;
  if (options.assets) primeSkiaCaches(options.assets);

  canvas.drawColor(Skia.Color('#000000'));

  const args: SceneArgs = {
    canvas,
    width,
    height,
    time: currentTime,
    frame: analysisAt(track.analysis, currentTime),
    theme: getTheme(settings.themeId),
    cover: getCachedImage(track.coverId),
  };
  if (settings.scene === 'ring') drawRing(args);
  else if (settings.scene === 'scope') drawScope(args);
  else drawNebula(args);

  // Title + artist, shared by every scene.
  const layoutWidth = width * 0.9;
  if (settings.title.length > 0) {
    const title = getParagraph(
      settings.title.toUpperCase(),
      'archivo',
      width * 0.06,
      '#FFFFFF',
      layoutWidth
    );
    if (title) title.paint(canvas, (width - layoutWidth) / 2, height * 0.8);
  }
  if (settings.artist.length > 0) {
    const artist = getParagraph(
      settings.artist,
      'poppins',
      width * 0.034,
      args.theme.colors[0],
      layoutWidth
    );
    if (artist) artist.paint(canvas, (width - layoutWidth) / 2, height * 0.8 + width * 0.085);
  }

  if (options.playbackTimeOut) options.playbackTimeOut.value = currentTime;
};
