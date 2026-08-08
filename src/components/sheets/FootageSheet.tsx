import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, View } from 'react-native';
import { SAMPLE_THUMB } from '../../editor/assets';
import type { SourceVideo } from '../../editor/types';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/**
 * Pick the source: the bundled interview (which ships its analysis) or any
 * video from the gallery — of any length, since only the chosen moment is
 * ever analyzed.
 */
export const FootageSheet = ({
  visible,
  onClose,
  onSelectSample,
  onSelectVideo,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectSample: () => void;
  onSelectVideo: (video: SourceVideo) => void;
}) => {
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
    const asset = result.assets?.[0];
    if (!asset) return;
    onSelectVideo({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      duration: (asset.duration ?? 10_000) / 1000,
    });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Choose a video">
      <Pressable
        onPress={() => {
          onSelectSample();
          onClose();
        }}
        className="mb-3 flex-row items-center gap-4 rounded-2xl border border-border bg-surface-2 p-3 active:opacity-80"
      >
        <View className="h-16 w-28 overflow-hidden rounded-xl border border-border">
          <Image source={SAMPLE_THUMB} className="h-full w-full" resizeMode="cover" />
        </View>
        <View className="flex-1">
          <Text>Two-guest interview (sample)</Text>
          <Text className="text-xs text-muted">
            Landscape · ships with its face track and transcript
          </Text>
        </View>
        <Icon name="film-line" size={20} color="#8A94A6" />
      </Pressable>
      <Button variant="secondary" onPress={pickFromGallery}>
        <Icon name="gallery-line" size={18} />
        <Text>Choose from gallery</Text>
      </Button>
      <Text className="mt-3 text-xs text-muted">
        Any length — a podcast, a talk, a livestream. You pick the moment next, and only
        that moment is analyzed on your device.
      </Text>
    </Sheet>
  );
};
