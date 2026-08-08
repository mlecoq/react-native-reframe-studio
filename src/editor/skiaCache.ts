import { Skia, TextAlign } from '@shopify/react-native-skia';
import type { SkParagraph } from '@shopify/react-native-skia';
import type { CaptionStylePreset } from '../captions/styles';
import type { CaptionPhrase } from '../captions/types';
import { fontProvider } from './fonts';

/**
 * Per-runtime cache of laid-out paragraphs. The frame drawer runs on two
 * worklet runtimes (UI thread for the preview, a dedicated thread for the
 * export): paragraphs are built per runtime against the shared
 * `fontProvider`, created once on the JS thread and captured (see fonts.ts).
 *
 * NOTE: every function is defined before its callers — worklet closures are
 * captured at the definition site.
 */

type Cache = {
  paragraphs: Record<string, SkParagraph>;
  keys: string[];
};

const getCache = (): Cache => {
  'worklet';
  const holder = globalThis as { __captionCache?: Cache };
  holder.__captionCache ??= { paragraphs: {}, keys: [] };
  return holder.__captionCache;
};

/**
 * Builds (and caches) the paragraph for one caption state: a phrase with a
 * given spoken-word index, or a single word in 'word' mode. Building runs at
 * most once per spoken word — never per frame.
 */
export const getCaptionParagraph = (
  phrase: CaptionPhrase,
  wordIndex: number,
  preset: CaptionStylePreset,
  accentColor: string,
  fontSize: number,
  layoutWidth: number
): SkParagraph | null => {
  'worklet';
  const cache = getCache();

  const key = `${phrase.start}|${wordIndex}|${preset.id}|${accentColor}|${fontSize.toFixed(1)}|${layoutWidth.toFixed(0)}`;
  const cached = cache.paragraphs[key];
  if (cached) return cached;

  const fontFamilies = [preset.font];
  const shadow = {
    color: Skia.Color('#000000AA'),
    offset: { x: 0, y: fontSize * 0.05 },
    blurRadius: fontSize * 0.15,
  };
  const builder = Skia.ParagraphBuilder.Make(
    { textAlign: TextAlign.Center, maxLines: 3 },
    fontProvider
  );

  if (preset.mode === 'word') {
    const word = phrase.words[wordIndex]?.text ?? '';
    builder.pushStyle({
      fontFamilies,
      fontSize,
      color: Skia.Color('#FFFFFF'),
      shadows: [shadow],
    });
    builder.addText(preset.uppercase ? word.toUpperCase() : word);
  } else {
    for (let i = 0; i < phrase.words.length; i++) {
      const highlighted =
        preset.highlight === 'current' ? i === wordIndex :
        preset.highlight === 'sweep' ? i <= wordIndex : false;
      builder.pushStyle({
        fontFamilies,
        fontSize,
        color: Skia.Color(highlighted ? accentColor : '#FFFFFF'),
        shadows: preset.pill ? [] : [shadow], // the pill already isolates the text
      });
      const text = preset.uppercase
        ? phrase.words[i]!.text.toUpperCase()
        : phrase.words[i]!.text;
      builder.addText(i === 0 ? text : ` ${text}`);
      builder.pop();
    }
  }

  const paragraph = builder.build();
  paragraph.layout(layoutWidth);

  cache.paragraphs[key] = paragraph;
  cache.keys.push(key);
  if (cache.keys.length > 48) {
    const evicted = cache.keys.shift()!;
    cache.paragraphs[evicted]?.dispose();
    delete cache.paragraphs[evicted];
  }
  return paragraph;
};
