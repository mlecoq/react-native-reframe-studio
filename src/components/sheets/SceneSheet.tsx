import { Pressable, View } from 'react-native';
import type { SceneId } from '../../audio/types';
import { SCENES } from '../../visualizer/scenes';
import { Icon } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/** Pick the visualizer scene. */
export const SceneSheet = ({
  visible,
  onClose,
  current,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  current: SceneId;
  onSelect: (scene: SceneId) => void;
}) => (
  <Sheet visible={visible} onClose={onClose} title="Scene">
    {SCENES.map((scene) => {
      const selected = current === scene.id;
      return (
        <Pressable
          key={scene.id}
          onPress={() => {
            onSelect(scene.id);
            onClose();
          }}
          className={`mb-2 flex-row items-center gap-3 rounded-2xl border p-3 active:opacity-80 ${
            selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'
          }`}
        >
          <View className="flex-1">
            <Text>{scene.label}</Text>
            <Text className="text-xs text-muted">{scene.description}</Text>
          </View>
          {selected && <Icon name="check-line" size={20} color="#2DD4BF" />}
        </Pressable>
      );
    })}
  </Sheet>
);
