import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from './text';

const KNOB = 22;

/**
 * A pan-on-track slider (no dependency). While dragging, `onChange` fires on
 * every move — wire it to a shared value for live effects; `onCommit` fires
 * once on release — wire it to React state.
 */
export const Slider = ({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  /** Committed value, 0..1. */
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) => {
  const fraction = useSharedValue(value);
  const [liveValue, setLiveValue] = useState(value);
  const [trackWidth, setTrackWidth] = useState(0);

  // Follow outside changes (e.g. a preset tap) when not mid-drag.
  useEffect(() => {
    fraction.value = value;
    setLiveValue(value);
  }, [value, fraction]);

  const moveTo = (next: number) => {
    setLiveValue(next);
    onChange(next);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onChange((e) => {
      'worklet';
      if (trackWidth <= 0) return;
      const next = Math.max(0, Math.min(e.x / trackWidth, 1));
      fraction.value = next;
      runOnJS(moveTo)(next);
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(onCommit)(fraction.value);
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: fraction.value * trackWidth,
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fraction.value * trackWidth - KNOB / 2 }],
  }));

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-sm">{label}</Text>
        <Text className="text-sm text-muted">{Math.round(liveValue * 100)}%</Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          className="h-8 justify-center"
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          <View className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <Animated.View className="h-full rounded-full bg-accent" style={fillStyle} />
          </View>
          <Animated.View
            className="absolute rounded-full border-2 border-accent bg-foreground"
            style={[{ width: KNOB, height: KNOB }, knobStyle]}
          />
        </View>
      </GestureDetector>
    </View>
  );
};
