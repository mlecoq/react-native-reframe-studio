import { File } from 'expo-file-system';

/**
 * JS-side registry of the raw bytes of images (artworks). Decoded images
 * can't hop between worklet runtimes, raw bytes can: each runtime decodes
 * and caches its own SkImages (see skiaCache.ts). Fonts take the other
 * route: a single provider created on the JS thread and captured (fonts.ts).
 */
const images = new Map<string, Uint8Array>();

export const registerImage = (id: string, uri: string) => {
  if (!images.has(id)) images.set(id, new File(uri).bytesSync());
};

export const getAssetBytes = () => ({
  images: Object.fromEntries(images),
});

export type AssetBytes = ReturnType<typeof getAssetBytes>;
