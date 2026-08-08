import { Pressable, View } from 'react-native';
import { THEMES } from '../../visualizer/themes';
import { Icon } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/** Pick the color theme. */
export const ThemeSheet = ({
  visible,
  onClose,
  current,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  current: string;
  onSelect: (themeId: string) => void;
}) => (
  <Sheet visible={visible} onClose={onClose} title="Theme">
    {THEMES.map((theme) => {
      const selected = current === theme.id;
      return (
        <Pressable
          key={theme.id}
          onPress={() => {
            onSelect(theme.id);
            onClose();
          }}
          className={`mb-2 flex-row items-center gap-3 rounded-2xl border p-3 active:opacity-80 ${
            selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'
          }`}
        >
          <View className="flex-row gap-1.5">
            {theme.colors.map((color) => (
              <View
                key={color}
                className="h-7 w-7 rounded-full border border-border"
                style={{ backgroundColor: color }}
              />
            ))}
          </View>
          <Text className="flex-1">{theme.label}</Text>
          {selected && <Icon name="check-line" size={20} color="#2DD4BF" />}
        </Pressable>
      );
    })}
  </Sheet>
);
