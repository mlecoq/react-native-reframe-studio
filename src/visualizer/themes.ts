/** Color themes shared by every scene. */
export type Theme = {
  id: string;
  label: string;
  /** Accent colors, from primary to soft. */
  colors: [string, string, string];
  /** Background gradient, top to bottom. */
  background: [string, string];
};

export const THEMES: Theme[] = [
  {
    id: 'lagoon',
    label: 'Lagoon',
    colors: ['#2DD4BF', '#7AB8FF', '#CCFBF1'],
    background: ['#040A16', '#0A2430'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    colors: ['#FF6B7A', '#FFD166', '#FFB199'],
    background: ['#140720', '#3A1030'],
  },
  {
    id: 'orchid',
    label: 'Orchid',
    colors: ['#C084FC', '#7AB8FF', '#F0ABFC'],
    background: ['#0B0618', '#241040'],
  },
];

export const getTheme = (id: string): Theme => {
  'worklet';
  for (const theme of THEMES) {
    if (theme.id === id) return theme;
  }
  return THEMES[0]!;
};
