import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  StrokeCap,
  TileMode,
} from '@shopify/react-native-skia';
import type { SkCanvas, SkImage } from '@shopify/react-native-skia';
import type { AnalysisFrame } from '../audio/types';
import { getEffect } from '../editor/skiaCache';
import type { Theme } from './themes';

/**
 * The three visualizer scenes. Each is a pure worklet drawing one frame from
 * the analysis data — no state survives between frames, which is what makes
 * preview and export renders identical.
 *
 * (Helpers are defined before the scenes that call them: worklet closures
 * are captured at the definition site.)
 */

/** Metadata for the scene picker UI. */
export const SCENES: { id: 'ring' | 'scope' | 'nebula'; label: string; description: string }[] = [
  { id: 'ring', label: 'Ring', description: 'Radial spectrum around the spinning artwork' },
  { id: 'scope', label: 'Scope', description: 'Glowing oscilloscope over a spectrum floor' },
  { id: 'nebula', label: 'Nebula', description: 'Audio-reactive SkSL shader clouds' },
];

export type SceneArgs = {
  canvas: SkCanvas;
  width: number;
  height: number;
  time: number;
  frame: AnalysisFrame;
  theme: Theme;
  cover: SkImage | null;
};

const hexToVec = (hex: string): [number, number, number] => {
  'worklet';
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
};

/** Vertical background gradient from the theme. */
const drawBackground = ({ canvas, width, height, theme }: SceneArgs) => {
  'worklet';
  const paint = Skia.Paint();
  const shader = Skia.Shader.MakeLinearGradient(
    { x: 0, y: 0 },
    { x: 0, y: height },
    [Skia.Color(theme.background[0]), Skia.Color(theme.background[1])],
    null,
    TileMode.Clamp
  );
  paint.setShader(shader);
  canvas.drawPaint(paint);
  shader.dispose();
  paint.dispose();
};

/** The artwork clipped in a spinning circle, scaled by the bass. */
const drawCoverDisc = (
  { canvas, time, frame, cover, theme }: SceneArgs,
  cx: number,
  cy: number,
  radius: number
) => {
  'worklet';
  const scale = 1 + 0.05 * frame.bass;
  canvas.save();
  canvas.translate(cx, cy);
  canvas.scale(scale, scale);
  canvas.rotate(time * 12, 0, 0); // slow vinyl spin (12°/s)
  if (cover) {
    const clip = Skia.Path.Make();
    clip.addCircle(0, 0, radius);
    canvas.save();
    canvas.clipPath(clip, ClipOp.Intersect, true);
    canvas.drawImageRect(
      cover,
      Skia.XYWHRect(0, 0, cover.width(), cover.height()),
      Skia.XYWHRect(-radius, -radius, radius * 2, radius * 2),
      Skia.Paint()
    );
    canvas.restore();
    clip.dispose();
  }
  const ring = Skia.Paint();
  ring.setStyle(PaintStyle.Stroke);
  ring.setStrokeWidth(radius * 0.03);
  ring.setColor(Skia.Color(theme.colors[2]));
  ring.setAlphaf(0.7);
  canvas.drawCircle(0, 0, radius, ring);
  ring.dispose();
  canvas.restore();
};

// ---------------------------------------------------------------------------
// Scene 1 — Ring: radial spectrum bars around the spinning artwork
// ---------------------------------------------------------------------------

export const drawRing = (args: SceneArgs) => {
  'worklet';
  const { canvas, width, height, time, frame, theme } = args;
  drawBackground(args);

  const cx = width / 2;
  const cy = height * 0.42;
  const discRadius = width * 0.24;

  // bass halo behind everything
  const halo = Skia.Paint();
  const haloShader = Skia.Shader.MakeRadialGradient(
    { x: cx, y: cy },
    discRadius * (1.8 + frame.bass * 1.1),
    [Skia.Color(theme.colors[0] + '66'), Skia.Color('#00000000')],
    null,
    TileMode.Clamp
  );
  halo.setShader(haloShader);
  canvas.drawPaint(halo);
  haloShader.dispose();
  halo.dispose();

  // 48 bars, the 24 spectrum bins mirrored, slowly rotating
  const bars = 48;
  const inner = discRadius * 1.16;
  const paint = Skia.Paint();
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width * 0.012);
  paint.setStrokeCap(StrokeCap.Round);
  for (let i = 0; i < bars; i++) {
    const bin = i < bars / 2 ? i : bars - 1 - i;
    const value = frame.spectrum[bin] ?? 0;
    const angle = (i / bars) * Math.PI * 2 - Math.PI / 2 + time * 0.25;
    const length = discRadius * (0.08 + 0.55 * value);
    paint.setColor(Skia.Color(theme.colors[Math.floor((i % (bars / 2)) / 8) % 3]!));
    paint.setAlphaf(0.45 + 0.55 * value);
    canvas.drawLine(
      cx + Math.cos(angle) * inner,
      cy + Math.sin(angle) * inner,
      cx + Math.cos(angle) * (inner + length),
      cy + Math.sin(angle) * (inner + length),
      paint
    );
  }
  paint.dispose();

  drawCoverDisc(args, cx, cy, discRadius);
};

// ---------------------------------------------------------------------------
// Scene 2 — Scope: glowing oscilloscope + spectrum floor
// ---------------------------------------------------------------------------

export const drawScope = (args: SceneArgs) => {
  'worklet';
  const { canvas, width, height, frame, theme } = args;
  drawBackground(args);

  drawCoverDisc(args, width / 2, height * 0.2, width * 0.13);

  // waveform, drawn twice: blurred glow then crisp core
  const cy = height * 0.5;
  const amplitude = height * 0.07 * (0.5 + 0.9 * frame.mid);
  const path = Skia.Path.Make();
  const points = frame.wave.length;
  for (let i = 0; i < points; i++) {
    const x = width * 0.06 + (i / (points - 1)) * width * 0.88;
    const y = cy + (frame.wave[i] ?? 0) * amplitude;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  const glow = Skia.Paint();
  glow.setStyle(PaintStyle.Stroke);
  glow.setStrokeWidth(width * 0.02);
  glow.setStrokeCap(StrokeCap.Round);
  glow.setColor(Skia.Color(theme.colors[0]));
  glow.setAlphaf(0.5);
  const blur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, width * 0.012, true);
  glow.setMaskFilter(blur);
  canvas.drawPath(path, glow);
  blur.dispose();
  glow.dispose();

  const core = Skia.Paint();
  core.setStyle(PaintStyle.Stroke);
  core.setStrokeWidth(width * 0.006);
  core.setStrokeCap(StrokeCap.Round);
  core.setColor(Skia.Color(theme.colors[2]));
  canvas.drawPath(path, core);
  core.dispose();
  path.dispose();

  // spectrum floor
  const bins = frame.spectrum.length;
  const barWidth = (width * 0.88) / bins;
  const floor = height * 0.78;
  const bar = Skia.Paint();
  bar.setColor(Skia.Color(theme.colors[1]));
  for (let i = 0; i < bins; i++) {
    const value = frame.spectrum[i] ?? 0;
    bar.setAlphaf(0.35 + 0.6 * value);
    const barHeight = Math.max(height * 0.004, value * height * 0.1);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          width * 0.06 + i * barWidth + barWidth * 0.15,
          floor - barHeight,
          barWidth * 0.7,
          barHeight
        ),
        barWidth * 0.35,
        barWidth * 0.35
      ),
      bar
    );
  }
  bar.dispose();
};

// ---------------------------------------------------------------------------
// Scene 3 — Nebula: a full-screen SkSL shader driven by the audio bands
// ---------------------------------------------------------------------------

const NEBULA_SKSL = `
uniform float2 res;
uniform float time;
uniform float bass;
uniform float mid;
uniform float high;
uniform float3 c1;
uniform float3 c2;
uniform float3 c3;
uniform float3 b1;
uniform float3 b2;

float hash(float2 p) { return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), f.x),
             mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x), f.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 11.5;
    a *= 0.5;
  }
  return v;
}

half4 main(float2 xy) {
  float2 uv = xy / res;
  float2 p = (uv - 0.5) * float2(res.x / res.y, 1.0) * 2.4;
  float t = time * 0.13;

  // domain-warped fbm; the bass deepens the warp, so the clouds "breathe"
  float2 q = float2(fbm(p + t), fbm(p + float2(5.2, 1.3) - t));
  float f = fbm(p + q * (1.4 + bass * 1.6) + float2(t * 0.7, -t * 0.4));

  float3 col = mix(b1, b2, uv.y);
  col = mix(col, c1, smoothstep(0.35, 0.85, f) * (0.5 + 0.5 * bass));
  col = mix(col, c2, smoothstep(0.5, 0.95, fbm(p * 1.7 - q + t)) * (0.3 + 0.45 * mid));
  col += c3 * pow(max(f - 0.55, 0.0), 2.0) * (0.5 + 1.6 * high);

  float2 d = uv - 0.5;
  col *= 1.0 - 1.1 * dot(d, d); // vignette
  return half4(col, 1.0);
}`;

export const drawNebula = (args: SceneArgs) => {
  'worklet';
  const { canvas, width, height, time, frame, theme } = args;
  const effect = getEffect('nebula', NEBULA_SKSL);
  const shader = effect.makeShader([
    width, height,
    time,
    frame.bass, frame.mid, frame.high,
    ...hexToVec(theme.colors[0]),
    ...hexToVec(theme.colors[1]),
    ...hexToVec(theme.colors[2]),
    ...hexToVec(theme.background[0]),
    ...hexToVec(theme.background[1]),
  ]);
  const paint = Skia.Paint();
  paint.setShader(shader);
  canvas.drawPaint(paint);
  shader.dispose();
  paint.dispose();

  drawCoverDisc(args, width / 2, height * 0.4, width * 0.17);
};
