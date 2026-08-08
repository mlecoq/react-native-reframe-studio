import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as VideoThumbnails from 'expo-video-thumbnails';
import type { Segment, SourceVideo } from '../editor/types';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

/** How many stills the filmstrip shows across the whole video. */
const THUMBS = 12;
const MIN_DURATION = 5;
const MAX_DURATION = 90;
const HANDLE = 22;

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
 */
export const SegmentPicker = ({
  video,
  onConfirm,
}: {
  video: SourceVideo;
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

  // Handle positions live as fractions of the video duration: shared values
  // while dragging (no React render per finger move), state on release.
  const startFraction = useSharedValue(segment.start / video.duration);
  const endFraction = useSharedValue((segment.start + segment.duration) / video.duration);

  const commit = (start: number, end: number) => {
    setSegment({ start: start * video.duration, duration: (end - start) * video.duration });
  };

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

  return (
    <View className="flex-1 justify-center gap-6 px-5">
      <View className="items-center gap-2">
        <Icon name="scissors-cut-line" size={36} color="#F97316" />
        <Text className="text-center text-lg">Pick the moment</Text>
        <Text className="text-center text-sm text-muted">
          Drag the handles — only this part gets analyzed{'\n'}and turned into a vertical short.
        </Text>
      </View>

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
