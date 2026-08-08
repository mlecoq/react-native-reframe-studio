# Reframe Studio — turn a landscape interview into a vertical short

Pick a moment from a long landscape video, let a virtual camera follow the
speakers, burn captions on top, export a 9:16 short — entirely on-device,
with **Expo**, **Apple Vision / ML Kit**, **React Native Skia** and
[**@azzapp/react-native-skia-video**](https://github.com/AzzappApp/react-native-skia-video).
Seventh app of the tutorial series after
[Island Studio](https://github.com/mlecoq/react-native-video-editor),
[Caption Studio](https://github.com/mlecoq/react-native-auto-captions),
[Wave Studio](https://github.com/mlecoq/react-native-music-visualizer),
[Frame Studio](https://github.com/mlecoq/react-native-frame-studio),
[Chroma Studio](https://github.com/mlecoq/react-native-chroma-key) and
[Privacy Studio](https://github.com/mlecoq/react-native-privacy-studio) — and
the one that puts two of their engines together.

<p align="center"><em>Pick a video of any length → drag out the moment → the camera follows the speakers → export.</em></p>

## Features

- ✂️ **Pick the moment** on a filmstrip with two draggable handles — a
  podcast can be hours long, only the chosen clip is ever analyzed
- 🎥 **Virtual camera** that follows the speaker: a dead zone so small
  wobbles don't move the frame, capped speed so pans stay smooth, and hard
  **cuts** when the conversation jumps to someone else
- 🖼 **Three framings**: Follow (one moving window), Group (everyone in
  frame), Split (two speakers stacked — the podcast-clip look)
- 💬 **Captions** with four styles, drag to place, from an SRT or a Whisper
  transcript (the bundled sample ships its own)
- 📤 **Export** 1080×1920@30 with the original audio, rendered by the *same*
  worklet as the preview

## Running it

```sh
npm install
npx expo prebuild
npx expo run:ios      # or: npx expo run:android
```

(Native modules — Expo Go won't work. After pulling changes that add or
remove native modules, re-run `npx expo prebuild --clean` before building.)

## How it works

### Choosing first is what makes long videos possible

Detecting faces across a two-hour podcast would mean thousands of frames.
The segment picker ([`SegmentPicker.tsx`](src/components/SegmentPicker.tsx))
comes *before* the analysis, so the cost is proportional to the clip you
keep — a 30-second selection is about a hundred frames, a few seconds of
work ([`analyzeVideo.ts`](src/editor/analyzeVideo.ts)). Trimming itself is
free: `startTime` on the composition item tells the decoder where to begin,
so nothing is copied or re-encoded first
([`composition.ts`](src/editor/composition.ts)).

### The camera is a loop, not a formula

[`camera.ts`](src/editor/camera.ts) — a camera operator makes decisions, and
they read better as plain JS run once after the analysis than as math in the
render loop:

- a **dead zone**: the face may drift within ~14% of the crop width before
  the camera moves at all — without it every twitch of the detector becomes
  a pan and the shot feels seasick;
- an **eased follow with a speed cap**, so the frame never snaps;
- **cuts, not pans**, when focus moves to someone far away — a slow slide
  across an empty desk looks like a mistake, a cut looks like an edit;
- **focus hysteresis**, so two similarly sized faces don't trade the frame
  every other sample.

The result is a path of samples. The worklet only interpolates it
(`cameraAt`), and never interpolates *across* a cut.

### Two spaces that never meet

[`drawFrame.ts`](src/editor/drawFrame.ts) draws the video through one or two
moving windows — that is **source space**, where the camera lives — then
restores the transform and draws the captions in **output space**, fractions
of the vertical canvas. The captions never move with the camera, and the
caption engine (borrowed from Caption Studio) doesn't even know the video
was cropped.

## Bundled assets

The sample interview is generated content — the set, the two guests and
their synthesized voices — so it is free to reuse, and it ships the two JSON
files the app would otherwise compute on device: the face analysis and the
word-level transcript. Fonts (Poppins, Archivo Black) under the
[SIL OFL](assets/fonts/OFL.txt); icons [Remix Icon](https://remixicon.com/)
(Apache 2.0).

## Credits

Built on [@azzapp/react-native-skia-video](https://github.com/AzzappApp/react-native-skia-video)
([documentation](https://azzappapp.github.io/react-native-skia-video/)).

MIT — see [LICENSE](LICENSE).
