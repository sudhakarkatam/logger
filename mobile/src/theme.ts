// Material Design 3 (Material You) Theme Tokens
export const md3Colors = {
  // Dark Theme Palette (MD3 Standard)
  primary: '#D0BCFF',
  onPrimary: '#381E72',
  primaryContainer: '#4F378B',
  onPrimaryContainer: '#EADDFF',

  secondary: '#CCC2DC',
  onSecondary: '#332D41',
  secondaryContainer: '#4A4458',
  onSecondaryContainer: '#E8DEF8',

  tertiary: '#EFB8C8',
  onTertiary: '#492532',
  tertiaryContainer: '#633B48',
  onTertiaryContainer: '#FFD8E4',

  error: '#F2B8B5',
  onError: '#601410',
  errorContainer: '#8C1D18',
  onErrorContainer: '#F9DEDC',

  background: '#09090B',
  onBackground: '#F4F4F5',

  surface: '#09090B',
  onSurface: '#F4F4F5',
  surfaceVariant: '#1E1E26',
  onSurfaceVariant: '#A1A1AA',
  surfaceContainer: '#18181E',
  surfaceContainerHigh: '#242430',
  surfaceContainerHighest: '#2D2D3A',

  outline: '#71717A',
  outlineVariant: '#27273A',

  // Category Accent Tokens
  catMeal: '#FFB59D',
  catMood: '#E8DEF8',
  catExercise: '#A8C7FF',
  catSleep: '#D0BCFF',
  catExpense: '#A3EECE',
  catWater: '#A6EEFF',
  catReminder: '#FFE088',
  catWork: '#C2C1FF',
  catBook: '#FFB2D9',
  catOther: '#CAC4D0',
};

export const md3Typography = {
  displayLarge: { fontSize: 32, fontWeight: '800' as const, lineHeight: 40, letterSpacing: -0.25 },
  displayMedium: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  headlineMedium: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  titleLarge: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  titleMedium: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22, letterSpacing: 0.15 },
  labelLarge: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20, letterSpacing: 0.1 },
  bodyLarge: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22, letterSpacing: 0.25 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0.25 },
  labelSmall: { fontSize: 11, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.5 },
};

export const md3Elevation = {
  level0: { elevation: 0 },
  level1: { elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2 },
  level2: { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  level3: { elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6 },
};

export const colors = {
  ...md3Colors,
  bgDark: md3Colors.background,
  cardBg: md3Colors.surfaceContainer,
  cardBorder: md3Colors.outlineVariant,
  cardElevated: md3Colors.surfaceContainerHigh,
  primaryGlow: 'rgba(208, 188, 255, 0.25)',
  accent: md3Colors.tertiary,
  emerald: md3Colors.catExpense,
  amber: md3Colors.catReminder,
  rose: md3Colors.error,
  cyan: md3Colors.catWater,
  textPrimary: md3Colors.onBackground,
  textSecondary: md3Colors.onSurfaceVariant,
  textMuted: md3Colors.outline,
  inputBg: md3Colors.surfaceContainerHighest,
  navBg: md3Colors.surfaceContainer,
  success: md3Colors.catExpense,
  warning: md3Colors.catReminder,
  danger: md3Colors.error,
};

export const typography = {
  title: md3Typography.headlineMedium,
  h2: md3Typography.titleLarge,
  h3: md3Typography.titleMedium,
  body: md3Typography.bodyLarge,
  sub: md3Typography.bodyMedium,
  caption: md3Typography.labelSmall,
};

// Unified Design System Tokens Object
export const theme = {
  colors: md3Colors,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  roundness: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  elevation: md3Elevation,
  typography: md3Typography,
  motion: {
    durationFast: 150,
    durationMedium: 250,
    durationSlow: 350,
    easing: 'cubic-bezier(0.2, 0.0, 0.0, 1.0)',
  },
  touchTarget: {
    minSize: 48,
  },
};
