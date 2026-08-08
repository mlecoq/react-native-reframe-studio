import { Pressable, View } from 'react-native';
import { ACCENT_COLORS, CAPTION_STYLES } from '../../captions/styles';
import type { CaptionSettings } from '../../captions/types';
import { Icon } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/** Pick the caption style preset and accent color. */
export const StyleSheet = ({
  visible,
  onClose,
  settings,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  settings: CaptionSettings;
  onChange: (patch: Partial<CaptionSettings>) => void;
}) => (
  <Sheet visible={visible} onClose={onClose} title="Caption style">
    {CAPTION_STYLES.map((preset) => {
      const selected = settings.style === preset.id;
      return (
        <Pressable
          key={preset.id}
          onPress={() => onChange({ style: preset.id })}
          className={`mb-2 flex-row items-center gap-3 rounded-2xl border p-3 active:opacity-80 ${
            selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'
          }`}
        >
          <View className="flex-1">
            <Text>{preset.label}</Text>
            <Text className="text-xs text-muted">{preset.description}</Text>
          </View>
          {selected && <Icon name="check-line" size={20} color="#2DD4BF" />}
        </Pressable>
      );
    })}

    <Text className="mb-2 mt-3 text-sm text-muted">Accent color</Text>
    <View className="mb-2 flex-row gap-3">
      {ACCENT_COLORS.map((color) => (
        <Pressable
          key={color}
          onPress={() => onChange({ accentColor: color })}
          className={`h-9 w-9 rounded-full border-2 ${
            settings.accentColor === color ? 'border-accent' : 'border-border'
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </View>
    <Text className="text-xs text-muted">
      Tip: drag the caption on the preview to move it, pinch to resize it.
    </Text>
  </Sheet>
);
