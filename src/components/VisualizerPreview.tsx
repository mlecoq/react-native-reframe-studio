import { useVideoCompositionPlayer } from '@azzapp/react-native-skia-video';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { Track, VisualizerSettings } from '../audio/types';
import { buildComposition } from '../editor/composition';
import { drawVisualizer } from '../visualizer/drawVisualizer';
import { Icon } from './ui/icon';

type Size = { width: number; height: number };

/**
 * Live preview: the composition is audio-only, so `frames` is always empty —
 * the extractor just drives the clock and plays the track while
 * drawVisualizer paints every pixel.
 */
export const VisualizerPreview = ({
  track,
  settings,
  size,
}: {
  track: Track;
  settings: VisualizerSettings;
  size: Size;
}) => {
  const composition = useMemo(() => buildComposition(track), [track]);
  const playbackTime = useSharedValue(0);

  const { currentFrame, player } = useVideoCompositionPlayer({
    composition,
    drawFrame: ({ canvas, width, height, currentTime }) => {
      'worklet';
      drawVisualizer({
        canvas,
        width,
        height,
        currentTime,
        track,
        settings,
        playbackTimeOut: playbackTime,
      });
    },
    width: size.width,
    height: size.height,
    autoPlay: true,
    isLooping: true,
  });

  const [isPlaying, setIsPlaying] = useState(true);
  useEffect(() => setIsPlaying(true), [composition]);
  const togglePlayback = () => {
    if (!player) return;
    if (isPlaying) player.pause();
    else player.play();
    setIsPlaying(!isPlaying);
  };

  const [barWidth, setBarWidth] = useState(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: track.duration > 0 ? (playbackTime.value / track.duration) * barWidth : 0,
  }));
  const seekTo = (fraction: number) => {
    player?.seekTo(Math.max(0, Math.min(fraction, 0.999)) * track.duration);
  };
  const seek = Gesture.Pan()
    .minDistance(0)
    .onChange((e) => {
      'worklet';
      if (barWidth > 0) runOnJS(seekTo)(e.x / barWidth);
    });

  return (
    <View>
      <View className="overflow-hidden rounded-3xl border border-border bg-surface" style={size}>
        <Canvas style={size}>
          <SkiaImage
            image={currentFrame}
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fit="fill"
          />
        </Canvas>
      </View>

      <View className="mt-3 flex-row items-center gap-3 px-1">
        <Pressable
          onPress={togglePlayback}
          className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 active:opacity-80"
        >
          <Icon name={isPlaying ? 'pause-fill' : 'play-fill'} size={18} />
        </Pressable>
        <GestureDetector gesture={seek}>
          <View
            className="h-8 flex-1 justify-center"
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          >
            <View className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <Animated.View className="h-full rounded-full bg-accent" style={progressStyle} />
            </View>
          </View>
        </GestureDetector>
      </View>
    </View>
  );
};
