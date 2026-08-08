import { PaintStyle, Skia } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import { getCaptionParagraph } from '../editor/skiaCache';
import { getStylePreset } from './styles';
import type { CaptionSettings, Transcript } from './types';

/**
 * Draws the caption for `currentTime` — the heart of the app, shared by the
 * live preview and the export. Pure function of (time, transcript, settings),
 * so both always agree.
 */

/** Painted bounds of the caption block, in canvas pixels (for gestures). */
export type CaptionBounds = { x: number; y: number; width: number; height: number };

const easeOutBack = (t: number) => {
  'worklet';
  const c = 1.70158;
  const p = Math.min(Math.max(t, 0), 1) - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};

export const drawCaptions = (
  canvas: SkCanvas,
  width: number,
  height: number,
  currentTime: number,
  transcript: Transcript,
  settings: CaptionSettings,
  boundsOut: CaptionBounds | null = null
): CaptionBounds | null => {
  'worklet';
  // Active phrase: from its start until the next phrase begins (so captions
  // linger through the small silences between phrases).
  let phraseIndex = -1;
  for (let i = 0; i < transcript.length; i++) {
    const next = transcript[i + 1];
    const holdUntil = next ? next.start : transcript[i]!.end + 0.5;
    if (currentTime >= transcript[i]!.start && currentTime < holdUntil) {
      phraseIndex = i;
      break;
    }
  }
  if (phraseIndex < 0) return null;
  const phrase = transcript[phraseIndex]!;

  // Spoken word: the last word that has started.
  let wordIndex = 0;
  for (let i = 0; i < phrase.words.length; i++) {
    if (currentTime >= phrase.words[i]!.start) wordIndex = i;
  }

  const preset = getStylePreset(settings.style);
  const fontSize = settings.size * width * (preset.mode === 'word' ? 1.35 : 1);
  const layoutWidth = width * 0.86;
  const paragraph = getCaptionParagraph(
    phrase,
    wordIndex,
    preset,
    settings.accentColor,
    fontSize,
    layoutWidth
  );
  if (!paragraph) return null;

  const textWidth = Math.min(paragraph.getLongestLine() + fontSize * 0.2, layoutWidth);
  const textHeight = paragraph.getHeight();

  // Entry animation: 'word' pops on every word, phrases rise once per phrase.
  const sinceWord = currentTime - phrase.words[wordIndex]!.start;
  const sincePhrase = currentTime - phrase.start;
  let scale = 1;
  let offsetY = 0;
  let alpha = 1;
  if (preset.mode === 'word') {
    scale = 0.75 + 0.25 * easeOutBack(sinceWord / 0.14);
  } else {
    const p = Math.min(sincePhrase / 0.18, 1);
    alpha = p;
    offsetY = (1 - p) * fontSize * 0.4;
  }

  const cx = width / 2;
  const cy = settings.y * height + offsetY;

  canvas.save();
  canvas.translate(cx, cy);
  if (preset.mode === 'word') {
    // A deterministic tiny tilt per word gives the "stamped" look.
    const tilt = ((wordIndex * 7) % 5) - 2;
    canvas.rotate(tilt, 0, 0);
  }
  canvas.scale(scale, scale);

  if (preset.pill) {
    const padX = fontSize * 0.5;
    const padY = fontSize * 0.3;
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('#000000'));
    paint.setAlphaf(0.55 * alpha);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          -textWidth / 2 - padX,
          -textHeight / 2 - padY,
          textWidth + padX * 2,
          textHeight + padY * 2
        ),
        fontSize * 0.35,
        fontSize * 0.35
      ),
      paint
    );
    paint.dispose();
  }

  if (alpha < 1) {
    const layerPaint = Skia.Paint();
    layerPaint.setAlphaf(alpha);
    canvas.saveLayer(layerPaint);
    paragraph.paint(canvas, -layoutWidth / 2, -textHeight / 2);
    canvas.restore();
    layerPaint.dispose();
  } else {
    paragraph.paint(canvas, -layoutWidth / 2, -textHeight / 2);
  }
  canvas.restore();

  const bounds: CaptionBounds = { x: cx, y: settings.y * height, width: textWidth, height: textHeight };
  if (boundsOut) {
    boundsOut.x = bounds.x;
    boundsOut.y = bounds.y;
    boundsOut.width = bounds.width;
    boundsOut.height = bounds.height;
  }
  return bounds;
};

/** Dashed frame around the caption block while the user drags it. */
export const drawCaptionFrame = (
  canvas: SkCanvas,
  bounds: CaptionBounds,
  canvasWidth: number
) => {
  'worklet';
  const pad = canvasWidth * 0.02;
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(canvasWidth * 0.006);
  paint.setColor(Skia.Color('#2DD4BF'));
  const dash = Skia.PathEffect.MakeDash([canvasWidth * 0.02, canvasWidth * 0.012]);
  paint.setPathEffect(dash);
  canvas.drawRRect(
    Skia.RRectXY(
      Skia.XYWHRect(
        bounds.x - bounds.width / 2 - pad,
        bounds.y - bounds.height / 2 - pad,
        bounds.width + pad * 2,
        bounds.height + pad * 2
      ),
      canvasWidth * 0.02,
      canvasWidth * 0.02
    ),
    paint
  );
  dash.dispose();
  paint.dispose();
};
