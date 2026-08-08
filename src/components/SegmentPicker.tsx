import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as VideoThumbnails from 'expo-video-thumbnails';
import type { AudioEnvelope } from '../editor/audio';
import { findSilences, snapToSilence, suggestMoments } from '../editor/moments';
import type { Segment, SourceVideo } from '../editor/types';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

/** How many stills the filmstrip shows across the whole video. */
const THUMBS = 12;
const MIN_DURATION = 5;
const MAX_DURATION = 90;
const HANDLE = 22;
const WAVE_HEIGHT = 36;

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

/**
 * Picks the moment to turn into a short.
 *
 * This screen exists because analysis is the expensive part: detecting faces
 * across a two-hour podcast would take forever, while analyzing the 30
 * seconds actually kept takes a few seconds. Choosing first makes the cost
 * proportional to the clip, not to the source.
 *
 * When the source is short enough to decode its audio in one piece, the
 * picker also LISTENS (see editor/audio.ts): the loudness envelope is drawn
 * under the filmstrip, released handles snap to the nearest pause so the
 * clip never starts mid-word, and the most talkative windows are offered as
 * suggested moments. All of it degrades away silently on very long sources.
 */
export const SegmentPicker = ({
  video,
  envelope,
  onConfirm,
}: {
  video: SourceVideo;
  envelope: AudioEnvelope | null;
  onConfirm: (segment: Segment) => void;
}) => {
  const [strip, setStrip] = useState<string[]>([]);
  const [trackWidth, setTrackWidth] = useState(0);
  const initialDuration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, video.duration / 4));
  const [segment, setSegment] = useState<Segment>({ start: 0, duration: initialDuration });

  // One still every duration/THUMBS — enough to recognize a scene, cheap
  // enough to generate while the user reads the header.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uris: string[] = [];
      for (let i = 0; i < THUMBS; i++) {
        const time = ((i + 0.5) / THUMBS) * video.duration * 1000;
        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(video.uri, { time, quality: 0.4 });
          uris.push(thumb.uri);
        } catch {
          uris.push('');
        }
        if (cancelled) return;
        setStrip([...uris]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [video]);

  const silences = useMemo(() => (envelope ? findSilences(envelope) : []), [envelope]);
  const moments = useMemo(() => (envelope ? suggestMoments(envelope) : []), [envelope]);

  // The loudness envelope as bars along the bottom of the filmstrip.
  const wavePath = useMemo(() => {
    if (!envelope || trackWidth === 0) return null;
    const path = Skia.Path.Make();
    const count = Math.floor(trackWidth / 4);
    const perBar = envelope.values.length / count;
    for (let i = 0; i < count; i++) {
      let peak = 0;
      const from = Math.floor(i * perBar);
      const to = Math.min(Math.ceil((i + 1) * perBar), envelope.values.length);
      for (let j = from; j < to; j++) peak = Math.max(peak, envelope.values[j]!);
      const height = Math.max(2, peak * (WAVE_HEIGHT - 6));
      path.addRRect(
        Skia.RRectXY(Skia.XYWHRect(i * 4, WAVE_HEIGHT - height, 2.5, height), 1.2, 1.2)
      );
    }
    return path;
  }, [envelope, trackWidth]);

  // Handle positions live as fractions of the video duration: shared values
  // while dragging (no React render per finger move), state on release.
  const startFraction = useSharedValue(segment.start / video.duration);
  const endFraction = useSharedValue((segment.start + segment.duration) / video.duration);

  /**
   * Lands a released selection: each edge snaps to the middle of the nearest
   * pause (a clip should never start mid-word) as long as the snapped pair
   * still respects the duration bounds — tried both edges, then one, then
   * none. The handles visually settle onto the snapped position.
   */
  const commitSeconds = (rawStart: number, rawEnd: number) => {
    const snappedStart = snapToSilence(rawStart, silences);
    const snappedEnd = snapToSilence(rawEnd, silences);
    const valid = (start: number, end: number) =>
      end - start >= MIN_DURATION && end - start <= MAX_DURATION && start >= 0 && end <= video.duration;
    const [start, end] = valid(snappedStart, snappedEnd)
      ? [snappedStart, snappedEnd]
      : valid(snappedStart, rawEnd)
        ? [snappedStart, rawEnd]
        : valid(rawStart, snappedEnd)
          ? [rawStart, snappedEnd]
          : [rawStart, rawEnd];
    startFraction.value = start / video.duration;
    endFraction.value = end / video.duration;
    setSegment({ start, duration: end - start });
  };

  const commit = (start: number, end: number) =>
    commitSeconds(start * video.duration, end * video.duration);

  const minFraction = MIN_DURATION / video.duration;
  const maxFraction = MAX_DURATION / video.duration;

  const dragHandle = (isStart: boolean) =>
    Gesture.Pan()
      .minDistance(0)
      .onChange((e) => {
        'worklet';
        if (trackWidth <= 0) return;
        const delta = e.changeX / trackWidth;
        if (isStart) {
          const next = Math.min(
            Math.max(startFraction.value + delta, 0),
            endFraction.value - minFraction
          );
          startFraction.value = Math.max(next, endFraction.value - maxFraction);
        } else {
          const next = Math.max(
            Math.min(endFraction.value + delta, 1),
            startFraction.value + minFraction
          );
          endFraction.value = Math.min(next, startFraction.value + maxFraction);
        }
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(commit)(startFraction.value, endFraction.value);
      });

  // Dragging the window itself slides both handles together.
  const dragWindow = Gesture.Pan()
    .minDistance(0)
    .onChange((e) => {
      'worklet';
      if (trackWidth <= 0) return;
      const span = endFraction.value - startFraction.value;
      let next = startFraction.value + e.changeX / trackWidth;
      next = Math.min(Math.max(next, 0), 1 - span);
      startFraction.value = next;
      endFraction.value = next + span;
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(commit)(startFraction.value, endFraction.value);
    });

  const windowStyle = useAnimatedStyle(() => ({
    left: startFraction.value * trackWidth,
    width: (endFraction.value - startFraction.value) * trackWidth,
  }));
  const startStyle = useAnimatedStyle(() => ({
    left: startFraction.value * trackWidth - HANDLE / 2,
  }));
  const endStyle = useAnimatedStyle(() => ({
    left: endFraction.value * trackWidth - HANDLE / 2,
  }));
  const dimLeftStyle = useAnimatedStyle(() => ({ width: startFraction.value * trackWidth }));
  const dimRightStyle = useAnimatedStyle(() => ({
    left: endFraction.value * trackWidth,
    width: (1 - endFraction.value) * trackWidth,
  }));

  const isActiveMoment = (start: number) => Math.abs(segment.start - start) < 1;

  return (
    <View className="flex-1 justify-center gap-6 px-5">
      <View className="items-center gap-2">
        <Icon name="scissors-cut-line" size={36} color="#F97316" />
        <Text className="text-center text-lg">Pick the moment</Text>
        <Text className="text-center text-sm text-muted">
          {envelope
            ? 'Drag the handles — they snap to pauses, so the\nclip never starts mid-word.'
            : 'Drag the handles — only this part gets analyzed\nand turned into a vertical short.'}
        </Text>
      </View>

      {moments.length > 0 && (
        <View className="flex-row items-center justify-center gap-2">
          <Icon name="sparkling-line" size={16} color="#F97316" />
          <Text className="text-sm text-muted">Talkative moments:</Text>
          {moments.map((moment) => (
            <Pressable
              key={moment.start}
              onPress={() => commitSeconds(moment.start, moment.start + moment.duration)}
              className={`rounded-full border px-3 py-1 active:opacity-70 ${
                isActiveMoment(moment.start)
                  ? 'border-accent bg-accent/15'
                  : 'border-border bg-surface-2'
              }`}
            >
              <Text
                className={`text-sm ${isActiveMoment(moment.start) ? 'text-accent' : 'text-muted'}`}
              >
                {formatTime(moment.start)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View>
        <View
          className="h-24 flex-row overflow-hidden rounded-2xl border border-border bg-surface-2"
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          {Array.from({ length: THUMBS }).map((_, i) => (
            <View key={i} className="flex-1">
              {strip[i] ? (
                <Image source={{ uri: strip[i] }} className="h-full w-full" resizeMode="cover" />
              ) : null}
            </View>
          ))}
          {wavePath && (
            <View
              pointerEvents="none"
              className="absolute bottom-0 left-0 right-0 bg-background/40"
              style={{ height: WAVE_HEIGHT }}
            >
              <Canvas style={{ width: trackWidth, height: WAVE_HEIGHT }}>
                <Path path={wavePath} color="rgba(243, 246, 250, 0.85)" />
              </Canvas>
            </View>
          )}
        </View>

        {/* Everything outside the window is dimmed. */}
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-0 left-0 top-0 rounded-l-2xl bg-background/70"
          style={dimLeftStyle}
        />
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-0 top-0 rounded-r-2xl bg-background/70"
          style={dimRightStyle}
        />

        <GestureDetector gesture={dragWindow}>
          <Animated.View
            className="absolute bottom-0 top-0 border-y-2 border-accent"
            style={windowStyle}
          />
        </GestureDetector>

        <GestureDetector gesture={dragHandle(true)}>
          <Animated.View
            className="absolute -bottom-2 -top-2 items-center justify-center rounded-xl bg-accent"
            style={[{ width: HANDLE }, startStyle]}
          >
            <View className="h-6 w-0.5 rounded-full bg-accent-foreground" />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={dragHandle(false)}>
          <Animated.View
            className="absolute -bottom-2 -top-2 items-center justify-center rounded-xl bg-accent"
            style={[{ width: HANDLE }, endStyle]}
          >
            <View className="h-6 w-0.5 rounded-full bg-accent-foreground" />
          </Animated.View>
        </GestureDetector>
      </View>

      <View className="flex-row items-center justify-between px-1">
        <Text className="text-sm text-muted">{formatTime(segment.start)}</Text>
        <Text className="text-sm">{segment.duration.toFixed(0)}s selected</Text>
        <Text className="text-sm text-muted">{formatTime(segment.start + segment.duration)}</Text>
      </View>

      <Button onPress={() => onConfirm(segment)}>
        <Icon name="sparkling-line" size={18} color="#2A1206" />
        <Text>Analyze this moment</Text>
      </Button>
    </View>
  );
};
