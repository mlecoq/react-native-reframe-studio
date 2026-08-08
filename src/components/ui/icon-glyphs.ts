/** Codepoints for the Remix Icon glyphs used in the app (extracted from remixicon/fonts/remixicon.glyph.json). */
export const glyphs = {
  'play-fill': '\uF00A',
  'pause-fill': '\uEFD7',
  'video-line': '\uF282',
  'gallery-line': '\uEDA5',
  'film-line': '\uED21',
  'crop-line': '\uEC02',
  'text': '\uF201',
  'user-follow-line': '\uF261',
  'group-line': '\uEDE3',
  'layout-row-line': '\uEE9D',
  'scissors-cut-line': '\uF0C1',
  'sparkling-line': '\uF36D',
  'user-search-line': '\uF26C',
  'download-2-line': '\uEC54',
  'close-line': '\uEB99',
  'check-line': '\uEB7B',
  'add-line': '\uEA13',
  'error-warning-line': '\uECA1',
  'checkbox-circle-fill': '\uEB80',
  'palette-line': '\uEFC5',
  'font-size': '\uED8D',
} as const;

export type IconName = keyof typeof glyphs;
