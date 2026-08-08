import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { parseTranscript } from '../../captions/parse';
import type { SourceVideo, Transcript } from '../../captions/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

/**
 * Paste a transcript for the current video. Accepts an SRT, a Whisper
 * verbose_json (word timestamps), or plain text spread over the duration.
 */
export const TranscriptSheet = ({
  visible,
  onClose,
  video,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  video: SourceVideo | null;
  onSubmit: (transcript: Transcript) => void;
}) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) setError(null);
  }, [visible]);

  const submit = () => {
    if (!video) return;
    try {
      onSubmit(parseTranscript(input, video.duration));
      setInput('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse the transcript');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Transcript">
      <Text className="mb-3 text-sm text-muted">
        Paste an SRT, a Whisper JSON (word timestamps), or plain text — plain
        text is spread evenly over the video.
      </Text>
      <Input
        value={input}
        onChangeText={setInput}
        placeholder={'1\n00:00:00,000 --> 00:00:02,500\nCaptions that pop…'}
        multiline
        className="mb-3 h-40"
        textAlignVertical="top"
        autoCorrect={false}
      />
      {error && <Text className="mb-3 text-sm text-danger">{error}</Text>}
      <View className="gap-2">
        <Button onPress={submit} disabled={input.trim().length === 0}>
          <Text>Use this transcript</Text>
        </Button>
      </View>
    </Sheet>
  );
};
