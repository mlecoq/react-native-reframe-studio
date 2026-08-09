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
- 👂 **A picker that listens**: on sources short enough to decode, the audio
  track is decoded on-device (react-native-audio-api) — waveform under the
  filmstrip, handles that snap to pauses so the clip never starts mid-word,
  and the most **talkative moments** suggested as one-tap chips
- 🎥 **Virtual camera** that follows the speaker: a dead zone so small
  wobbles don't move the frame, capped speed so pans stay smooth, and hard
  **cuts** when the conversation jumps to someone else
- 🗣 **Speaker turns** from a diarized transcript, so the camera knows *who*
  is talking — not just who is biggest
- 🖼 **Three framings**: Follow (one moving window), Group (everyone in
  frame), Split (two speakers stacked — the podcast-clip look)
- 💬 **True auto-captions**: Whisper (whisper.cpp) transcribes the chosen
  segment **on the device** — word-level timestamps, ~75MB model fetched
  once, nothing uploaded. Pasting an SRT / Whisper JSON still works, and the
  bundled sample ships its own transcript
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

### The picker listens before you choose

On sources short enough to decode in one piece (~15 minutes — `decodeAudioData`
has no ranged decode yet), the audio track is decoded to PCM on-device with
[react-native-audio-api](https://github.com/software-mansion/react-native-audio-api)
and reduced to a loudness envelope ([`audio.ts`](src/editor/audio.ts)). The
picker uses those ears three ways ([`moments.ts`](src/editor/moments.ts)):
the waveform is drawn under the filmstrip, a released handle snaps to the
middle of the nearest pause — a clip should never start mid-word — and the
most *talkative* 30-second windows (speech density plus a little mean
energy: lively exchanges beat dead air) are offered as one-tap suggested
moments. It is all best-effort: on an hours-long podcast the decode is
skipped and the picker works exactly as before.

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

### Knowing who is talking

Face size cannot tell two guests apart in a two-shot — which is why every
clip tool leans on audio. We don't decode audio, but a **diarized**
transcript carries the same information for free (AssemblyAI's
`speaker_labels`, Whisper + pyannote…), so when phrases have speaker labels
the camera follows the turns.

A turn stores a *rank*, not a face: speakers are numbered by order of first
appearance and matched, at each instant, to the faces on screen sorted left
to right. That survives what track identities cannot — the bundled sample is
*itself* an edited interview that cuts between a wide shot and close-ups, so
the same person is a different track before and after each of the source's
own cuts. And when a single face is on screen, there is nothing to decide:
the source's editor already chose.

### Auto-captions are segment-sized

Whisper runs on the phone ([whisper.rn](https://github.com/mybigday/whisper.rn),
i.e. whisper.cpp) and the segment-first design is what makes it pleasant: only
the chosen 30–90 seconds are transcribed, so the tiny multilingual model
answers in seconds. The audio reaches it through the same seam as everything
else — `decodeAudioData` at 16kHz (exactly what Whisper wants), sliced to the
segment, mixed to mono, no files written
([`transcribe.ts`](src/captions/transcribe.ts)). Word-level timestamps come
from whisper.cpp's token timestamps (`maxLen: 1` emits one segment per token;
leading spaces glue the pieces back into words), and the words are grouped
into caption-sized phrases on pauses, word count and span — all pure,
testable code.

### Two spaces that never meet

[`drawFrame.ts`](src/editor/drawFrame.ts) draws the video through one or two
moving windows — that is **source space**, where the camera lives — then
restores the transform and draws the captions in **output space**, fractions
of the vertical canvas. The captions never move with the camera, and the
caption engine (borrowed from Caption Studio) doesn't even know the video
was cropped.

## Bundled assets

The sample is a NASA interview with astronauts Jessica Meir and Christina
Koch (Expedition 59, NASA/JSC — public domain), and it ships the two JSON
files the app would otherwise compute on device:

- the **face analysis**, from the same class of detector the phone runs;
- the **word-level transcript**, from an offline speech-to-text pass, with a
  speaker label per phrase obtained from **mouth motion**: the source camera
  is static, so the pixels under a face move far more while that person is
  talking. It is the visual half of what audio diarization does, it needs no
  extra model, and it runs at build time — see the generator in this repo's
  history.

Fonts (Poppins, Archivo Black) under the [SIL OFL](assets/fonts/OFL.txt);
icons [Remix Icon](https://remixicon.com/) (Apache 2.0).

## Credits

Built on [@azzapp/react-native-skia-video](https://github.com/AzzappApp/react-native-skia-video)
([documentation](https://azzappapp.github.io/react-native-skia-video/)), with
[react-native-audio-api](https://github.com/software-mansion/react-native-audio-api)
lending the picker its ears.

MIT — see [LICENSE](LICENSE).
