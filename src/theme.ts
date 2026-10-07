import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Material Design 3 Palette Tokens ──
export const md3DarkColors = {
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

  // Category Tokens
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

export const md3LightColors = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',

  secondary: '#625B71',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E8DEF8',
  onSecondaryContainer: '#1D192B',

  tertiary: '#7D5260',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD8E4',
  onTertiaryContainer: '#31111D',

  error: '#B3261E',
  onError: '#FFFFFF',
  errorContainer: '#F9DEDC',
  onErrorContainer: '#410E0B',

  background: '#F8F9FA',
  onBackground: '#1C1B1F',

  surface: '#FFFFFF',
  onSurface: '#1C1B1F',
  surfaceVariant: '#E7E0EC',
  onSurfaceVariant: '#49454F',
  surfaceContainer: '#F1F3F5',
  surfaceContainerHigh: '#E9ECEF',
  surfaceContainerHighest: '#DEE2E6',

  outline: '#79747E',
  outlineVariant: '#E0E0E0',

  // Category Tokens
  catMeal: '#D97706',
  catMood: '#7C3AED',
  catExercise: '#2563EB',
  catSleep: '#7C3AED',
  catExpense: '#059669',
  catWater: '#0284C7',
  catReminder: '#D97706',
  catWork: '#4F46E5',
  catBook: '#DB2777',
  catOther: '#4B5563',
};

// Mutable active color tokens initialized to dark
export const md3Colors = { ...md3DarkColors };

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
  headline: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  title: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20, letterSpacing: 0.1 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 0.25 },
  caption: { fontSize: 11, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.5 },
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

// ── Dynamic Theme Context & Hook ──
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: typeof md3DarkColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  accentColor: string;
  setAccentColor: (color: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'dark',
  isDark: true,
  colors: md3DarkColors,
  setThemeMode: async () => {},
  accentColor: '#6366F1',
  setAccentColor: async () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [accentColor, setAccentColorState] = useState('#6366F1');

  useEffect(() => {
    (async () => {
      try {
        const savedMode = await AsyncStorage.getItem('@buddy_theme_mode');
        if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
          setThemeModeState(savedMode);
        }
        const savedAccent = await AsyncStorage.getItem('@buddy_accent_color');
        if (savedAccent) {
          setAccentColorState(savedAccent);
        }
      } catch (_) {}
    })();
  }, []);

  const isDark = themeMode === 'system' ? systemScheme !== 'light' : themeMode === 'dark';
  const activePalette = isDark ? md3DarkColors : md3LightColors;

  // Keep static exports in-sync
  Object.assign(md3Colors, activePalette);
  Object.assign(theme.colors, activePalette);
  Object.assign(colors, activePalette);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem('@buddy_theme_mode', mode);
    } catch (_) {}
  };

  const setAccentColor = async (color: string) => {
    setAccentColorState(color);
    try {
      await AsyncStorage.setItem('@buddy_accent_color', color);
    } catch (_) {}
  };

  return React.createElement(
    ThemeContext.Provider,
    {
      value: {
        themeMode,
        isDark,
        colors: activePalette,
        setThemeMode,
        accentColor,
        setAccentColor,
      },
    },
    children
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
