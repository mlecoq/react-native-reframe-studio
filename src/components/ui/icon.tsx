import { Text } from 'react-native';
import { glyphs, type IconName } from './icon-glyphs';

export type { IconName };

/**
 * Remix Icon glyph rendered through the icon font — no SVG dependency
 * needed. Add names to icon-glyphs.ts to use more of the set.
 */
export const Icon = ({
  name,
  size = 22,
  color = '#F3F6FA',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) => (
  <Text
    style={{ fontFamily: 'remixicon', fontSize: size, color, lineHeight: size * 1.05 }}
    allowFontScaling={false}
  >
    {glyphs[name]}
  </Text>
);
