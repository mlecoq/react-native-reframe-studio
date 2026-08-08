import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import type { Track } from '../../audio/types';
import { loadCustomTrack, loadTrack, registerCustomCover, TRACKS } from '../../editor/assets';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/**
 * Pick a bundled track, bring your own from the files app — it is decoded
 * and analyzed on-device, right here under a progress bar — or swap the
 * artwork for an image from the gallery.
 */
export const TrackSheet = ({
  visible,
  onClose,
  current,
  onSelect,
  onCoverChange,
}: {
  visible: boolean;
  onClose: () => void;
  current: Track | null;
  onSelect: (track: Track) => void;
  onCoverChange: (coverId: string) => void;
}) => {
  const [analyzing, setAnalyzing] = useState<{ progress: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickCustomCover = async () => {
    if (!current) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    const asset = result.assets?.[0];
    if (!asset) return;
    onCoverChange(registerCustomCover(current.id, asset.uri));
    onClose();
  };

  const pickOwnMusic = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    });
    const asset = result.assets?.[0];
    if (!asset) return;
    setAnalyzing({ progress: 0 });
    try {
      const track = await loadCustomTrack(asset.uri, asset.name, (progress) =>
        setAnalyzing({ progress })
      );
      onSelect(track);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze this track');
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={analyzing ? () => {} : onClose} title="Track">
      {TRACKS.map((meta) => {
        const selected = current?.id === meta.id;
        return (
          <Pressable
            key={meta.id}
            disabled={!!analyzing}
            onPress={async () => {
              onSelect(await loadTrack(meta));
              onClose();
            }}
            className={`mb-2 flex-row items-center gap-3 rounded-2xl border p-3 active:opacity-80 ${
              selected ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'
            } ${analyzing ? 'opacity-40' : ''}`}
          >
            <Image source={meta.cover} className="h-14 w-14 rounded-xl" resizeMode="cover" />
            <View className="flex-1">
              <Text>{meta.title}</Text>
              <Text className="text-xs text-muted">
                {meta.artist} · {Math.round(meta.analysis.duration)}s
              </Text>
            </View>
            {selected && <Icon name="check-line" size={20} color="#2DD4BF" />}
          </Pressable>
        );
      })}

      {analyzing ? (
        <View className="mt-2 rounded-2xl border border-border bg-surface-2 p-4">
          <View className="mb-2 h-2 overflow-hidden rounded-full bg-surface">
            <View
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(analyzing.progress * 100)}%` }}
            />
          </View>
          <Text className="text-center text-sm text-muted">
            Analyzing on your device… {Math.round(analyzing.progress * 100)}%
          </Text>
        </View>
      ) : (
        <Button variant="secondary" className="mt-2" onPress={pickOwnMusic}>
          <Icon name="music-2-line" size={18} />
          <Text>Choose your own music</Text>
        </Button>
      )}
      {current && !analyzing && (
        <Button variant="secondary" className="mt-2" onPress={pickCustomCover}>
          <Icon name="gallery-line" size={18} />
          <Text>Replace the artwork (image)</Text>
        </Button>
      )}
      {error && <Text className="mt-3 text-center text-xs text-danger">{error}</Text>}
      <Text className="mt-3 text-center text-xs text-muted">
        Your music never leaves the phone: it is decoded and analyzed right here,
        into the same data the bundled tracks ship as JSON.
      </Text>
    </Sheet>
  );
};
