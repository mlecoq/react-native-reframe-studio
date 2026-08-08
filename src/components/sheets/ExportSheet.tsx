import { View } from 'react-native';
import type { useExport } from '../../editor/useExport';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/** Runs the export and confirms once the video lands in the photo library. */
export const ExportSheet = ({
  visible,
  onClose,
  exporter,
}: {
  visible: boolean;
  onClose: () => void;
  exporter: ReturnType<typeof useExport>;
}) => {
  const { phase, progress, error, start, reset } = exporter;
  const busy = phase === 'rendering' || phase === 'saving';

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title="Export video">
      {(phase === 'idle' || busy) && (
        <>
          <View className="mb-5 flex-row items-center gap-3 rounded-2xl border border-border bg-surface-2 p-4">
            <Icon name="film-line" size={22} color="#F97316" />
            <View className="flex-1">
              <Text>1080 × 1920 · the video’s audio kept</Text>
              <Text className="text-xs text-muted">Saved to your photo library</Text>
            </View>
          </View>
          {busy ? (
            <View>
              <View className="mb-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <View
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </View>
              <Text className="text-center text-sm text-muted">
                {phase === 'saving' ? 'Saving to your photos…' : `Rendering ${Math.round(progress * 100)}%`}
              </Text>
            </View>
          ) : (
            <Button onPress={start}>
              <Icon name="download-2-line" size={18} color="#2A1206" />
              <Text>Export</Text>
            </Button>
          )}
        </>
      )}

      {phase === 'done' && (
        <View className="items-center py-2">
          <Icon name="checkbox-circle-fill" size={52} color="#F97316" />
          <Text className="mb-5 mt-3">Saved to your photo library</Text>
          <Button className="self-stretch" onPress={close}>
            <Text>Done</Text>
          </Button>
        </View>
      )}

      {phase === 'error' && (
        <View className="items-center py-2">
          <Icon name="error-warning-line" size={44} color="#F87171" />
          <Text className="mb-5 mt-3 text-center text-sm text-muted">{error}</Text>
          <Button className="self-stretch" variant="secondary" onPress={reset}>
            <Text>Try again</Text>
          </Button>
        </View>
      )}
    </Sheet>
  );
};
