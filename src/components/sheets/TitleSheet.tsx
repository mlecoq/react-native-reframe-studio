import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/** Edit the title and artist lines displayed on the video. */
export const TitleSheet = ({
  visible,
  onClose,
  title,
  artist,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  artist: string;
  onSubmit: (title: string, artist: string) => void;
}) => {
  const [titleValue, setTitleValue] = useState(title);
  const [artistValue, setArtistValue] = useState(artist);
  useEffect(() => {
    if (visible) {
      setTitleValue(title);
      setArtistValue(artist);
    }
  }, [visible, title, artist]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Title">
      <Text className="mb-2 text-sm text-muted">Title</Text>
      <Input value={titleValue} onChangeText={setTitleValue} placeholder="Island Breeze" className="mb-4" />
      <Text className="mb-2 text-sm text-muted">Artist</Text>
      <Input value={artistValue} onChangeText={setArtistValue} placeholder="Your name" className="mb-5" />
      <View className="gap-2">
        <Button
          onPress={() => {
            onSubmit(titleValue.trim(), artistValue.trim());
            onClose();
          }}
        >
          <Text>Save</Text>
        </Button>
      </View>
    </Sheet>
  );
};
