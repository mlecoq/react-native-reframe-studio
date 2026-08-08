import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icon';
import { Text } from './text';

/**
 * Minimal bottom sheet: a transparent modal with a fading backdrop and a
 * panel sliding up from the bottom. Tap the backdrop or the ✕ to close.
 */
export const Sheet = ({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal transparent statusBarTranslucent visible onRequestClose={onClose} animationType="none">
      <Animated.View entering={FadeIn.duration(150)} className="flex-1 bg-black/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1 justify-end"
        >
          <Pressable className="flex-1" onPress={onClose} />
          <Animated.View
            entering={SlideInDown.duration(260)}
            className="rounded-t-3xl border-t border-border bg-surface px-5 pt-3"
            style={{ paddingBottom: insets.bottom + 20 }}
          >
            <View className="mb-3 h-1.5 w-10 self-center rounded-full bg-border" />
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg">{title}</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Icon name="close-line" size={22} color="#8A94A6" />
              </Pressable>
            </View>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
};
