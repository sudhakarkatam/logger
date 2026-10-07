import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  BackHandler,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, ThemeMode, theme } from '../theme';
import BuddyListItem from './ui/m3/BuddyListItem';
import { Surface, List, Divider, Snackbar } from 'react-native-paper';
import { getLocalSettings } from '../services/api';
import { PROVIDER_DISPLAY } from '../utils/constants';

interface ProfileScreenProps {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { themeMode, setThemeMode, isDark, colors, accentColor, setAccentColor } = useAppTheme();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState('Sudhakar Katam');
  const [userEmail, setUserEmail] = useState('sudhakar@buddy.ai');
  const [toastMsg, setToastMsg] = useState('');
  const [activeEngine, setActiveEngine] = useState('Mistral AI (codestral-2508)');

  useEffect(() => {
    loadProfile();
  }, []);

  // Hardware back navigation handler
  useEffect(() => {
    const onBackPress = () => {
      onBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [onBack]);

  async function loadProfile() {
    try {
      const savedImg = await AsyncStorage.getItem('@buddy_profile_image');
      const savedName = await AsyncStorage.getItem('@buddy_user_name');
      const savedEmail = await AsyncStorage.getItem('@buddy_user_email');

      if (savedImg) setProfileImage(savedImg);
      if (savedName) setUserName(savedName);
      if (savedEmail) setUserEmail(savedEmail);

      const local = await getLocalSettings();
      const p = local.provider ? ((PROVIDER_DISPLAY as any)[local.provider] || local.provider) : 'Mistral AI';
      const m = local.model || 'codestral-2508';
      setActiveEngine(`${p} (${m})`);
    } catch (err: any) {
      console.warn('Error loading profile:', err);
    }
  }

  async function pickProfileImage() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const uri = res.assets[0].uri;
        setProfileImage(uri);
        await AsyncStorage.setItem('@buddy_profile_image', uri);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        setToastMsg('Profile picture updated successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error', 'Could not pick image from gallery');
    }
  }

  async function handleSelectTheme(mode: ThemeMode) {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    await setThemeMode(mode);
    const label = mode === 'light' ? 'Light Theme' : mode === 'dark' ? 'Dark Theme' : 'System Default';
    setToastMsg(`Switched to ${label}`);
  }

  async function handleSelectAccent(color: string) {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    await setAccentColor(color);
    setToastMsg('Primary accent color updated!');
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Top App Bar with Back Arrow */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            onBack();
          }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.onSurface }]}>Profile & Appearance</Text>
      </View>

      {/* Clean Frameless Profile Avatar Header Section */}
      <View style={styles.avatarHeaderContainer}>
        <View style={styles.avatarWrapper}>
          <Image
            source={{
              uri: profileImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
            }}
            style={[styles.avatarImage, { borderColor: colors.primary }]}
          />
          <TouchableOpacity
            style={[styles.editBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}
            onPress={pickProfileImage}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="camera-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.avatarName, { color: colors.onSurface }]}>{userName}</Text>
        <Text style={[styles.avatarEmail, { color: colors.onSurfaceVariant }]}>{userEmail}</Text>

        <TouchableOpacity onPress={pickProfileImage} style={styles.changePicBtn}>
          <Text style={[styles.changePicText, { color: colors.primary }]}>Change Profile Picture</Text>
        </TouchableOpacity>
      </View>

      {/* MD3 Theme Preferences Section (Light / Dark / System Default) */}
      <List.Section style={[styles.section, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}>
        <List.Subheader style={[styles.subheader, { color: colors.primary }]}>THEME PREFERENCES</List.Subheader>

        {/* 3-Way Theme Option Cards */}
        <View style={styles.themeOptionsGrid}>
          {/* Light Theme */}
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
              themeMode === 'light' && [styles.themeOptionCardActive, { borderColor: colors.primary, backgroundColor: `${colors.primary}15` }],
            ]}
            onPress={() => handleSelectTheme('light')}
          >
            <MaterialCommunityIcons
              name="weather-sunny"
              size={24}
              color={themeMode === 'light' ? colors.primary : colors.onSurfaceVariant}
            />
            <Text style={[styles.themeOptionTitle, { color: themeMode === 'light' ? colors.primary : colors.onSurfaceVariant }]}>
              Light
            </Text>
            {themeMode === 'light' && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>

          {/* Dark Theme */}
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
              themeMode === 'dark' && [styles.themeOptionCardActive, { borderColor: colors.primary, backgroundColor: `${colors.primary}15` }],
            ]}
            onPress={() => handleSelectTheme('dark')}
          >
            <MaterialCommunityIcons
              name="weather-night"
              size={24}
              color={themeMode === 'dark' ? colors.primary : colors.onSurfaceVariant}
            />
            <Text style={[styles.themeOptionTitle, { color: themeMode === 'dark' ? colors.primary : colors.onSurfaceVariant }]}>
              Dark
            </Text>
            {themeMode === 'dark' && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>

          {/* System Default */}
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
              themeMode === 'system' && [styles.themeOptionCardActive, { borderColor: colors.primary, backgroundColor: `${colors.primary}15` }],
            ]}
            onPress={() => handleSelectTheme('system')}
          >
            <MaterialCommunityIcons
              name="cellphone-cog"
              size={24}
              color={themeMode === 'system' ? colors.primary : colors.onSurfaceVariant}
            />
            <Text style={[styles.themeOptionTitle, { color: themeMode === 'system' ? colors.primary : colors.onSurfaceVariant }]}>
              System
            </Text>
            {themeMode === 'system' && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check-circle" size={16} color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Divider style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        {/* Primary Accent Color Palette Picker */}
        <Text style={[styles.colorPaletteTitle, { color: colors.onSurface }]}>Accent Color Palette</Text>
        <View style={styles.colorPaletteRow}>
          {['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E'].map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorDot,
                { backgroundColor: color },
                accentColor === color && styles.colorDotSelected,
              ]}
              onPress={() => handleSelectAccent(color)}
            >
              {accentColor === color && (
                <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </List.Section>

      {/* Accurate Usage & System Info Section */}
      <List.Section style={[styles.section, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}>
        <List.Subheader style={[styles.subheader, { color: colors.primary }]}>USAGE & APP INFO</List.Subheader>

        <BuddyListItem
          title="App Version"
          description="v1.0.0 (Production Release)"
          leftIcon="information-outline"
        />
        <Divider style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        <BuddyListItem
          title="Active AI Engine"
          description={activeEngine}
          leftIcon="robot-outline"
        />
        <Divider style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        <BuddyListItem
          title="Backend & Storage"
          description="Supabase Cloud (PostgreSQL & Edge Functions)"
          leftIcon="cloud-check-outline"
        />
        <Divider style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        <BuddyListItem
          title="API Key Security"
          description="Server-Side Encrypted via Supabase Secrets"
          leftIcon="shield-lock-outline"
        />
        <Divider style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

        <BuddyListItem
          title="Framework"
          description="Expo React Native • Material Design 3"
          leftIcon="application-outline"
        />
      </List.Section>

      {/* MD3 Snackbar Feedback */}
      <Snackbar
        visible={!!toastMsg}
        onDismiss={() => setToastMsg('')}
        duration={3000}
        style={{ backgroundColor: colors.surfaceContainerHighest }}
      >
        <Text style={{ color: colors.onSurface }}>{toastMsg}</Text>
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  backBtn: {
    padding: theme.spacing.xs,
  },
  topBarTitle: {
    ...theme.typography.headline,
    fontWeight: 'bold',
  },
  avatarHeaderContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: theme.spacing.md,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarName: {
    ...theme.typography.title,
    fontWeight: 'bold',
    fontSize: 20,
  },
  avatarEmail: {
    ...theme.typography.body,
    fontSize: 13,
    marginTop: 2,
  },
  changePicBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  changePicText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  section: {
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  subheader: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  themeOptionsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  themeOptionCard: {
    flex: 1,
    borderRadius: theme.roundness.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    position: 'relative',
  },
  themeOptionCardActive: {
    borderWidth: 2,
  },
  themeOptionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 6,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  divider: {
    height: 1,
    marginVertical: theme.spacing.sm,
  },
  colorPaletteTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
});
