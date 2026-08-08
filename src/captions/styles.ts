import type { CaptionStyleId } from './types';

/**
 * Caption style presets. Each preset picks a font, how much of the phrase is
 * shown, and how the currently spoken word is emphasized — the drawing logic
 * lives in drawCaptions.ts and is shared by all presets.
 */
export type CaptionStylePreset = {
  id: CaptionStyleId;
  label: string;
  description: string;
  /** Family name registered in the Skia font provider (see assets.ts). */
  font: 'archivo' | 'poppins';
  /** 'word': only the spoken word, big. 'phrase': the whole phrase. */
  mode: 'word' | 'phrase';
  /** How the spoken word stands out within a phrase. */
  highlight: 'current' | 'sweep' | 'none';
  /** Draw a rounded background behind the text. */
  pill: boolean;
  uppercase: boolean;
};

export const CAPTION_STYLES: CaptionStylePreset[] = [
  {
    id: 'pop',
    label: 'Pop',
    description: 'One word at a time, big and bouncy',
    font: 'archivo',
    mode: 'word',
    highlight: 'none',
    pill: false,
    uppercase: true,
  },
  {
    id: 'karaoke',
    label: 'Karaoke',
    description: 'The accent color sweeps across the phrase',
    font: 'poppins',
    mode: 'phrase',
    highlight: 'sweep',
    pill: false,
    uppercase: false,
  },
  {
    id: 'pill',
    label: 'Pill',
    description: 'Phrase on a rounded box, spoken word colored',
    font: 'poppins',
    mode: 'phrase',
    highlight: 'current',
    pill: true,
    uppercase: false,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Clean subtitle, no highlight',
    font: 'poppins',
    mode: 'phrase',
    highlight: 'none',
    pill: false,
    uppercase: false,
  },
];

export const getStylePreset = (id: CaptionStyleId): CaptionStylePreset => {
  'worklet';
  // (workletized: called from drawCaptions on every frame)
  for (const preset of CAPTION_STYLES) {
    if (preset.id === id) return preset;
  }
  return CAPTION_STYLES[0]!;
};

export const ACCENT_COLORS = ['#2DD4BF', '#FFD166', '#FF6B7A', '#7AB8FF', '#C084FC', '#FFFFFF'];
