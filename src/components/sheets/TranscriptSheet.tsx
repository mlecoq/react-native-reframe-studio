import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { parseTranscript } from '../../captions/parse';
import { downloadModel, isModelReady, transcribeSegment } from '../../captions/transcribe';
import type { Transcript } from '../../captions/types';
import type { Segment, SourceVideo } from '../../editor/types';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Input } from '../ui/input';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

type AutoState =
  | { name: 'idle' }
  | { name: 'downloading'; progress: number }
  | { name: 'transcribing'; progress: number };

/**
 * Captions for the current segment, two ways: generate them right here with
 * Whisper running on the device (the model is fetched once, ~75MB), or
 * paste an SRT / Whisper verbose_json / plain text.
 */
export const TranscriptSheet = ({
  visible,
  onClose,
  video,
  segment,
  onSubmit,
  onAutoTranscript,
}: {
  visible: boolean;
  onClose: () => void;
  video: SourceVideo | null;
  segment: Segment | null;
  /** Pasted transcripts follow the source clock — the caller shifts them. */
  onSubmit: (transcript: Transcript) => void;
  /** Whisper's output is already segment-relative — applied as-is. */
  onAutoTranscript: (transcript: Transcript) => void;
}) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState<AutoState>({ name: 'idle' });
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

  const autoCaption = async () => {
    if (!video || !segment) return;
    setError(null);
    try {
      if (!isModelReady()) {
        setAuto({ name: 'downloading', progress: 0 });
        await downloadModel((progress) => setAuto({ name: 'downloading', progress }));
      }
      setAuto({ name: 'transcribing', progress: 0 });
      const transcript = await transcribeSegment(video, segment, (progress) =>
        setAuto({ name: 'transcribing', progress })
      );
      if (transcript.length === 0) {
        throw new Error('No speech found in this segment.');
      }
      onAutoTranscript(transcript);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed');
    } finally {
      setAuto({ name: 'idle' });
    }
  };

  const busy = auto.name !== 'idle';

  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose} title="Captions">
      {busy ? (
        <View className="mb-4 rounded-2xl border border-border bg-surface-2 p-4">
          <View className="mb-2 h-2 overflow-hidden rounded-full bg-surface">
            <View
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.round(auto.progress * 100)}%` }}
            />
          </View>
          <Text className="text-center text-sm text-muted">
            {auto.name === 'downloading'
              ? `Downloading the model (once)… ${Math.round(auto.progress * 100)}%`
              : `Listening on your device… ${Math.round(auto.progress * 100)}%`}
          </Text>
        </View>
      ) : (
        <>
          <Button onPress={autoCaption} disabled={!video || !segment}>
            <Icon name="sparkling-line" size={18} color="#2A1206" />
            <Text>Auto-caption this segment</Text>
          </Button>
          <Text className="mb-4 mt-2 text-xs text-muted">
            Whisper runs on your device — nothing is uploaded.
            {isModelReady() ? '' : ' First use downloads the model (~75 MB).'}
          </Text>

          <Text className="mb-3 text-sm text-muted">
            Or paste an SRT, a Whisper JSON (word timestamps), or plain text —
            plain text is spread evenly over the video.
          </Text>
          <Input
            value={input}
            onChangeText={setInput}
            placeholder={'1\n00:00:00,000 --> 00:00:02,500\nCaptions that pop…'}
            multiline
            className="mb-3 h-32"
            textAlignVertical="top"
            autoCorrect={false}
          />
          <View className="gap-2">
            <Button
              variant="secondary"
              onPress={submit}
              disabled={input.trim().length === 0}
            >
              <Text>Use this transcript</Text>
            </Button>
          </View>
        </>
      )}
      {error && <Text className="mt-3 text-sm text-danger">{error}</Text>}
    </Sheet>
  );
};
