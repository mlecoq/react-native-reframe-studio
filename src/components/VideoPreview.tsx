import { useVideoCompositionPlayer } from '@azzapp/react-native-skia-video';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { CameraPath } from '../editor/camera';
import { buildComposition } from '../editor/composition';
import { drawFrame } from '../editor/drawFrame';
import type { Project, Settings } from '../editor/types';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

type Size = { width: number; height: number };

/**
 * Live preview of the reframed short. Dragging on the canvas moves the
 * captions: the drag writes a shared value the drawing worklet merges on
 * the next frame, and only the release touches React state.
 */
export const VideoPreview = ({
  project,
  paths,
  settings,
  onMoveCaptions,
  size,
}: {
  project: Project;
  paths: CameraPath[];
  settings: Settings;
  onMoveCaptions: (y: number) => void;
  size: Size;
}) => {
  const composition = useMemo(
    () => buildComposition(project.video, project.segment),
    [project]
  );
  const playbackTime = useSharedValue(0);
  const captionOverride = useSharedValue<{ y: number; size: number } | null>(null);

  const { currentFrame, player } = useVideoCompositionPlayer({
    composition,
    drawFrame: ({ canvas, width, height, currentTime, frames }) => {
      'worklet';
      drawFrame({
        canvas,
        width,
        height,
        currentTime,
        frames,
        paths,
        transcript: project.transcript,
        settings,
        captionOverride,
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

  // ----- drag the captions up and down -----------------------------------

  const moveCaptions = Gesture.Pan()
    .minDistance(8)
    .onChange((e) => {
      'worklet';
      const current = captionOverride.value?.y ?? settings.captions.y;
      const next = Math.min(Math.max(current + e.changeY / size.height, 0.08), 0.94);
      captionOverride.value = { y: next, size: settings.captions.size };
    })
    .onFinalize(() => {
      'worklet';
      const value = captionOverride.value;
      if (value) runOnJS(onMoveCaptions)(value.y);
    });

  // ----- progress bar -----------------------------------------------------

  const [barWidth, setBarWidth] = useState(0);
  const progressStyle = useAnimatedStyle(() => ({
    width:
      project.segment.duration > 0
        ? (playbackTime.value / project.segment.duration) * barWidth
        : 0,
  }));
  const seekTo = (fraction: number) => {
    player?.seekTo(Math.max(0, Math.min(fraction, 0.999)) * project.segment.duration);
  };
  const seek = Gesture.Pan()
    .minDistance(0)
    .onChange((e) => {
      'worklet';
      if (barWidth > 0) runOnJS(seekTo)(e.x / barWidth);
    });

  return (
    <View>
      <GestureDetector gesture={moveCaptions}>
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
      </GestureDetector>
      {settings.showCaptions && (
        <Text className="mt-2 text-center text-xs text-muted">
          Drag to move the captions
        </Text>
      )}

      <View className="mt-2 flex-row items-center gap-3 px-1">
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
