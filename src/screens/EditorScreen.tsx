import { useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_SETTINGS as DEFAULT_CAPTIONS } from '../captions/types';
import type { Transcript } from '../captions/types';
import { SegmentPicker } from '../components/SegmentPicker';
import { ExportSheet } from '../components/sheets/ExportSheet';
import { FootageSheet } from '../components/sheets/FootageSheet';
import { ModeSheet } from '../components/sheets/ModeSheet';
import { StyleSheet } from '../components/sheets/StyleSheet';
import { TranscriptSheet } from '../components/sheets/TranscriptSheet';
import { Button } from '../components/ui/button';
import { Icon, type IconName } from '../components/ui/icon';
import { Text } from '../components/ui/text';
import { VideoPreview } from '../components/VideoPreview';
import { analyzeSegment } from '../editor/analyzeVideo';
import { tryDecodeEnvelope } from '../editor/audio';
import type { AudioEnvelope } from '../editor/audio';
import { loadSample, SAMPLE_SEGMENT } from '../editor/assets';
import { buildPaths } from '../editor/camera';
import { buildFaceTracks } from '../editor/faceTracks';
import type { Project, ReframeMode, Segment, Settings, SourceVideo } from '../editor/types';
import { useExport } from '../editor/useExport';

type SheetId = 'footage' | 'mode' | 'style' | 'transcript' | 'export' | null;

type Stage =
  | { name: 'empty' }
  | { name: 'picking'; video: SourceVideo }
  | { name: 'analyzing'; video: SourceVideo; progress: number }
  | { name: 'ready'; project: Project }
  | { name: 'error'; message: string };

const DEFAULT_SETTINGS: Settings = {
  mode: 'follow',
  captions: { ...DEFAULT_CAPTIONS, accentColor: '#F97316' },
  showCaptions: true,
};

export const EditorScreen = () => {
  const [stage, setStage] = useState<Stage>({ name: 'empty' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sheet, setSheet] = useState<SheetId>(null);
  /**
   * The picking stage's ears — decoded in the background while the user
   * looks at the filmstrip, null until ready (or forever on long sources).
   */
  const [pickerEnvelope, setPickerEnvelope] = useState<AudioEnvelope | null>(null);
  const pickingUri = stage.name === 'picking' ? stage.video : null;
  useEffect(() => {
    setPickerEnvelope(null);
    if (!pickingUri) return;
    let cancelled = false;
    tryDecodeEnvelope(pickingUri).then((envelope) => {
      if (!cancelled) setPickerEnvelope(envelope);
    });
    return () => {
      cancelled = true;
    };
  }, [pickingUri]);

  const project = stage.name === 'ready' ? stage.project : null;

  const useSample = async () => {
    try {
      const { video, faces, transcript } = await loadSample();
      setStage({
        name: 'ready',
        project: {
          video,
          segment: SAMPLE_SEGMENT,
          tracks: buildFaceTracks(faces),
          transcript,
        },
      });
    } catch (e) {
      setStage({ name: 'error', message: e instanceof Error ? e.message : 'Could not load the sample' });
    }
  };

  const analyze = async (video: SourceVideo, segment: Segment) => {
    setStage({ name: 'analyzing', video, progress: 0 });
    try {
      const faces = await analyzeSegment(video, segment, (progress) =>
        setStage({ name: 'analyzing', video, progress })
      );
      setStage({
        name: 'ready',
        project: { video, segment, tracks: buildFaceTracks(faces), transcript: [] },
      });
    } catch (e) {
      setStage({ name: 'error', message: e instanceof Error ? e.message : 'Face analysis failed' });
    }
  };

  /**
   * The camera paths: rebuilt only when the framing mode or the analysis
   * changes — never per frame. The drawer just interpolates them.
   */
  const paths = useMemo(() => {
    if (!project) return [];
    return buildPaths(
      settings.mode,
      project.tracks,
      project.segment.duration,
      project.video.width / project.video.height,
      project.transcript
    );
  }, [project, settings.mode]);

  const exporter = useExport(project, paths, settings);

  // A transcript pasted for the source is shifted onto the segment's clock.
  const applyTranscript = (transcript: Transcript) => {
    if (!project) return;
    const offset = project.segment.start;
    const shifted: Transcript = transcript.map((phrase) => ({
      start: phrase.start - offset,
      end: phrase.end - offset,
      words: phrase.words.map((word) => ({
        ...word,
        start: word.start - offset,
        end: word.end - offset,
      })),
    }));
    setStage({ name: 'ready', project: { ...project, transcript: shifted } });
  };

  const window = useWindowDimensions();
  const previewSize = useMemo(() => {
    const height = Math.min(window.height * 0.56, ((window.width - 40) * 16) / 9);
    return { width: Math.round((height * 9) / 16), height: Math.round(height) };
  }, [window.width, window.height]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-5 py-2">
        <Text className="text-xl">
          Reframe <Text className="text-xl text-accent">Studio</Text>
        </Text>
        <Button size="sm" onPress={() => setSheet('export')} disabled={!project}>
          <Icon name="download-2-line" size={16} color="#2A1206" />
          <Text>Export</Text>
        </Button>
      </View>

      {stage.name === 'picking' ? (
        <SegmentPicker
          video={stage.video}
          envelope={pickerEnvelope}
          onConfirm={(segment) => analyze(stage.video, segment)}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          {project ? (
            <VideoPreview
              project={project}
              paths={paths}
              settings={settings}
              onMoveCaptions={(y) =>
                setSettings((s) => ({ ...s, captions: { ...s.captions, y } }))
              }
              size={previewSize}
            />
          ) : (
            <View
              className="items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-border px-8"
              style={previewSize}
            >
              {stage.name === 'analyzing' ? (
                <>
                  <Icon name="user-search-line" size={40} color="#F97316" />
                  <Text className="text-center text-sm text-muted">
                    Finding the speakers on your device…
                  </Text>
                  <View className="h-2 w-48 overflow-hidden rounded-full bg-surface-2">
                    <View
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(stage.progress * 100)}%` }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Icon name="crop-line" size={40} color="#8A94A6" />
                  <Text className="text-center text-sm text-muted">
                    {stage.name === 'error'
                      ? stage.message
                      : 'Turn a landscape interview into a\nvertical short that follows the speaker'}
                  </Text>
                  <Button onPress={() => setSheet('footage')}>
                    <Icon name="add-line" size={18} color="#2A1206" />
                    <Text>Choose a video</Text>
                  </Button>
                </>
              )}
            </View>
          )}
        </View>
      )}

      <View className="flex-row items-center justify-around border-t border-border bg-surface px-2 pb-1 pt-3">
        <ToolButton icon="video-line" label="Video" onPress={() => setSheet('footage')} />
        <ToolButton
          icon="crop-line"
          label="Framing"
          disabled={!project}
          onPress={() => setSheet('mode')}
        />
        <ToolButton
          icon="text"
          label="Captions"
          disabled={!project}
          onPress={() => setSheet(project?.transcript.length ? 'style' : 'transcript')}
        />
      </View>

      <FootageSheet
        visible={sheet === 'footage'}
        onClose={() => setSheet(null)}
        onSelectSample={useSample}
        onSelectVideo={(video) => setStage({ name: 'picking', video })}
      />
      <ModeSheet
        visible={sheet === 'mode'}
        onClose={() => setSheet(null)}
        mode={settings.mode}
        trackCount={project?.tracks.length ?? 0}
        onChange={(mode: ReframeMode) => setSettings((s) => ({ ...s, mode }))}
      />
      <StyleSheet
        visible={sheet === 'style'}
        onClose={() => setSheet(null)}
        settings={settings.captions}
        onChange={(patch) =>
          setSettings((s) => ({ ...s, captions: { ...s.captions, ...patch } }))
        }
      />
      <TranscriptSheet
        visible={sheet === 'transcript'}
        onClose={() => setSheet(null)}
        video={project?.video ?? null}
        onSubmit={applyTranscript}
      />
      <ExportSheet visible={sheet === 'export'} onClose={() => setSheet(null)} exporter={exporter} />
    </SafeAreaView>
  );
};

const ToolButton = ({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    className={`min-w-16 items-center gap-1 px-2 active:opacity-70 ${disabled ? 'opacity-40' : ''}`}
  >
    <Icon name={icon} size={22} />
    <Text className="text-xs text-muted">{label}</Text>
  </Pressable>
);
