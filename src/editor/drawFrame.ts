import { ClipOp, FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import type { VideoFrame } from '@azzapp/react-native-skia-video';
import type { SharedValue } from 'react-native-reanimated';
import { drawCaptions } from '../captions/drawCaptions';
import type { CaptionBounds } from '../captions/drawCaptions';
import type { Transcript } from '../captions/types';
import { cameraAt } from './camera';
import type { CameraPath } from './camera';
import type { Settings } from './types';

/**
 * Draws one frame: the source video seen through one (or two) moving crop
 * windows, then the captions on top. One worklet for the live preview AND
 * the export.
 *
 * The two halves of the app never meet: the camera works in SOURCE space
 * (which slice of the landscape frame to show), the captions in OUTPUT
 * space (fractions of the vertical canvas). Captions are drawn after the
 * crop transform is restored, so they never move with the camera.
 *
 * NOTE: worklet closures are captured where a function is DEFINED, so every
 * helper must appear before the function that calls it.
 */

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Draws the video frame into `dest`, showing the slice centered on `center`
 * (fractions of the source frame). Cover-fitted: the slice always fills the
 * destination, whatever the two aspect ratios are.
 */
const drawWindow = (
  canvas: SkCanvas,
  frame: VideoFrame,
  dest: Rect,
  center: { x: number; y: number },
  zoom: number
) => {
  'worklet';
  const image = Skia.Image.MakeImageFromNativeTextureUnstable(
    frame.texture,
    frame.width,
    frame.height
  );
  const rotated = frame.rotation % 180 !== 0;
  const visibleWidth = rotated ? image.height() : image.width();
  const visibleHeight = rotated ? image.width() : image.height();
  const scale = Math.max(dest.width / visibleWidth, dest.height / visibleHeight) * zoom;

  // How far the requested center sits from the frame's own center, in
  // destination pixels — the camera pan, in other words.
  const panX = (center.x - 0.5) * visibleWidth * scale;
  const panY = (center.y - 0.5) * visibleHeight * scale;

  const matrix = Skia.Matrix();
  matrix.translate(dest.x + dest.width / 2 - panX, dest.y + dest.height / 2 - panY);
  matrix.scale(scale, scale);
  matrix.rotate((frame.rotation * Math.PI) / 180);
  matrix.translate(-image.width() / 2, -image.height() / 2);

  const shader = image.makeShaderOptions(
    TileMode.Clamp,
    TileMode.Clamp,
    FilterMode.Linear,
    MipmapMode.None,
    matrix
  );
  const paint = Skia.Paint();
  paint.setShader(shader);
  canvas.save();
  canvas.clipRect(
    Skia.XYWHRect(dest.x, dest.y, dest.width, dest.height),
    ClipOp.Intersect,
    false
  );
  canvas.drawPaint(paint);
  canvas.restore();
  paint.dispose();
  shader.dispose();
  image.dispose();
};

export type DrawFrameOptions = {
  canvas: SkCanvas;
  width: number;
  height: number;
  currentTime: number;
  frames: Record<string, VideoFrame>;
  /** One path per window: 1 for follow/group, 2 for the split view. */
  paths: CameraPath[];
  transcript: Transcript;
  settings: Settings;
  /** Preview only: caption placement being dragged, merged in live. */
  captionOverride?: SharedValue<{ y: number; size: number } | null> | null;
  /** Preview only: where the captions landed, for hit-testing. */
  captionBoundsOut?: SharedValue<CaptionBounds> | null;
  /** Preview only: drives the progress bar without re-rendering React. */
  playbackTimeOut?: SharedValue<number> | null;
};

export const drawFrame = (options: DrawFrameOptions) => {
  'worklet';
  const { canvas, width, height, currentTime, settings } = options;

  canvas.drawColor(Skia.Color('#000000'));
  const frame = options.frames['video'];
  if (!frame) return;

  const windows = options.paths.length;
  const windowHeight = height / Math.max(windows, 1);
  for (let i = 0; i < windows; i++) {
    const dest = { x: 0, y: i * windowHeight, width, height: windowHeight };
    const path = options.paths[i]!;
    drawWindow(canvas, frame, dest, cameraAt(path, currentTime), path.zoom);
  }

  if (settings.showCaptions) {
    const override = options.captionOverride?.value;
    const captions = override ? { ...settings.captions, ...override } : settings.captions;
    drawCaptions(
      canvas,
      width,
      height,
      currentTime,
      options.transcript,
      captions,
      options.captionBoundsOut?.value ?? null
    );
  }

  if (options.playbackTimeOut) options.playbackTimeOut.value = currentTime;
};
