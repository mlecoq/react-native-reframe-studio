import { Pressable, View } from 'react-native';
import type { ReframeMode } from '../../editor/types';
import { Icon, type IconName } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

const MODES: { id: ReframeMode; label: string; description: string; icon: IconName }[] = [
  {
    id: 'follow',
    label: 'Follow',
    description: 'One window on whoever is most prominent, cutting between people',
    icon: 'user-follow-line',
  },
  {
    id: 'group',
    label: 'Group',
    description: 'One window wide enough to keep everyone in frame',
    icon: 'group-line',
  },
  {
    id: 'split',
    label: 'Split',
    description: 'Two speakers stacked — the podcast-clip look (needs two faces)',
    icon: 'layout-row-line',
  },
];

/** How the landscape source is turned into a vertical frame. */
export const ModeSheet = ({
  visible,
  onClose,
  mode,
  trackCount,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  mode: ReframeMode;
  trackCount: number;
  onChange: (mode: ReframeMode) => void;
}) => (
  <Sheet visible={visible} onClose={onClose} title="Framing">
    {MODES.map((preset) => {
      const selected = mode === preset.id;
      const disabled = preset.id === 'split' && trackCount < 2;
      return (
        <Pressable
          key={preset.id}
          disabled={disabled}
          onPress={() => onChange(preset.id)}
          className={`mb-2 flex-row items-center gap-3 rounded-2xl border p-3 active:opacity-80 ${
            selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'
          } ${disabled ? 'opacity-40' : ''}`}
        >
          <Icon name={preset.icon} size={24} color={selected ? '#F97316' : '#F3F6FA'} />
          <View className="flex-1">
            <Text>{preset.label}</Text>
            <Text className="text-xs text-muted">
              {disabled ? 'Only one face in this moment' : preset.description}
            </Text>
          </View>
          {selected && <Icon name="check-line" size={20} color="#F97316" />}
        </Pressable>
      );
    })}
    <Text className="mt-1 text-xs text-muted">
      {trackCount === 0
        ? 'No face found — the frame stays centered.'
        : `${trackCount} ${trackCount > 1 ? 'people' : 'person'} followed in this moment.`}
    </Text>
  </Sheet>
);
