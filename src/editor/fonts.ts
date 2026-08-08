import { Skia } from '@shopify/react-native-skia';
import type { SkTypefaceFontProvider } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';

/**
 * The Skia font provider used to build text paragraphs.
 *
 * It is created ONCE on the JS thread at module scope and captured by the
 * drawing worklets — Skia host objects can be captured across worklet
 * runtimes (this is the pattern Azzapp ships in production). Fonts are
 * registered on the JS thread as they load.
 */
export const fontProvider: SkTypefaceFontProvider = Skia.TypefaceFontProvider.Make();

export const registerFontFile = (family: string, uri: string) => {
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(
    Skia.Data.fromBytes(new File(uri).bytesSync())
  );
  if (typeface) fontProvider.registerFont(typeface, family);
};
