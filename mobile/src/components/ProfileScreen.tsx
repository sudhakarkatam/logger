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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import BuddyListItem from './ui/m3/BuddyListItem';
import { Surface, List, Divider, Snackbar } from 'react-native-paper';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ProfileScreenProps {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState('Sudhakar Katam');
  const [userEmail, setUserEmail] = useState('sudhakar@buddy.ai');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [selectedAccent, setSelectedAccent] = useState('#6366F1');
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const savedImg = await AsyncStorage.getItem('@buddy_profile_image');
      const savedName = await AsyncStorage.getItem('@buddy_user_name');
      const savedEmail = await AsyncStorage.getItem('@buddy_user_email');
      const savedTheme = await AsyncStorage.getItem('@buddy_theme_mode');
      const savedAccent = await AsyncStorage.getItem('@buddy_accent_color');

      if (savedImg) setProfileImage(savedImg);
      if (savedName) setUserName(savedName);
      if (savedEmail) setUserEmail(savedEmail);
      if (savedTheme) setThemeMode(savedTheme as ThemeMode);
      if (savedAccent) setSelectedAccent(savedAccent);
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
        mediaTypes: ImagePicker.MediaType.Images,
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
    setThemeMode(mode);
    await AsyncStorage.setItem('@buddy_theme_mode', mode);
    const label = mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System Default';
    setToastMsg(`Theme set to ${label}`);
  }

  async function handleSelectAccent(color: string) {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setSelectedAccent(color);
    await AsyncStorage.setItem('@buddy_accent_color', color);
    setToastMsg('Primary accent color updated!');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile & Appearance</Text>
      </View>

      {/* Clean Frameless Profile Avatar Header Section (No background card) */}
      <View style={styles.avatarHeaderContainer}>
        <View style={styles.avatarWrapper}>
          <Image
            source={{
              uri: profileImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
            }}
            style={styles.avatarImage}
          />
          <TouchableOpacity style={styles.editBadge} onPress={pickProfileImage} activeOpacity={0.8}>
            <MaterialCommunityIcons name="camera-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.avatarName}>{userName}</Text>
        <Text style={styles.avatarEmail}>{userEmail}</Text>

        <TouchableOpacity onPress={pickProfileImage} style={styles.changePicBtn}>
          <Text style={styles.changePicText}>Change Profile Picture</Text>
        </TouchableOpacity>
      </View>

      {/* MD3 Theme Preferences Section (Light / Dark / System Default) */}
      <List.Section style={styles.section}>
        <List.Subheader style={styles.subheader}>THEME PREFERENCES</List.Subheader>

        {/* 3-Way Theme Option Cards */}
        <View style={styles.themeOptionsGrid}>
          {/* Light Theme */}
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              themeMode === 'light' && styles.themeOptionCardActive,
            ]}
            onPress={() => handleSelectTheme('light')}
          >
            <MaterialCommunityIcons
              name="weather-sunny"
              size={24}
              color={themeMode === 'light' ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            <Text style={[styles.themeOptionTitle, themeMode === 'light' && styles.themeOptionTitleActive]}>
              Light
            </Text>
            {themeMode === 'light' && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.primary} />
              </View>
            )}
          </TouchableOpacity>

          {/* Dark Theme */}
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              themeMode === 'dark' && styles.themeOptionCardActive,
            ]}
            onPress={() => handleSelectTheme('dark')}
          >
            <MaterialCommunityIcons
              name="weather-night"
              size={24}
              color={themeMode === 'dark' ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            <Text style={[styles.themeOptionTitle, themeMode === 'dark' && styles.themeOptionTitleActive]}>
              Dark
            </Text>
            {themeMode === 'dark' && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.primary} />
              </View>
            )}
          </TouchableOpacity>

          {/* System Default */}
          <TouchableOpacity
            style={[
              styles.themeOptionCard,
              themeMode === 'system' && styles.themeOptionCardActive,
            ]}
            onPress={() => handleSelectTheme('system')}
          >
            <MaterialCommunityIcons
              name="cellphone-cog"
              size={24}
              color={themeMode === 'system' ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            <Text style={[styles.themeOptionTitle, themeMode === 'system' && styles.themeOptionTitleActive]}>
              System
            </Text>
            {themeMode === 'system' && (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check-circle" size={16} color={theme.colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Divider style={styles.divider} />

        {/* Primary Accent Color Palette Picker */}
        <Text style={styles.colorPaletteTitle}>Accent Color Palette</Text>
        <View style={styles.colorPaletteRow}>
          {['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E'].map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorDot,
                { backgroundColor: color },
                selectedAccent === color && styles.colorDotSelected,
              ]}
              onPress={() => handleSelectAccent(color)}
            >
              {selectedAccent === color && (
                <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </List.Section>

      {/* Basic Usage & System Info Section */}
      <List.Section style={styles.section}>
        <List.Subheader style={styles.subheader}>USAGE & APP INFO</List.Subheader>

        <BuddyListItem
          title="App Version"
          description="v2.4.0 (Material Design 3 Edition)"
          leftIcon="information-outline"
        />
        <Divider style={styles.divider} />

        <BuddyListItem
          title="Storage & Offline Sync"
          description="Local Encrypted SQLite Cache"
          leftIcon="database-outline"
        />
      </List.Section>

      {/* MD3 Snackbar Feedback */}
      <Snackbar
        visible={!!toastMsg}
        onDismiss={() => setToastMsg('')}
        duration={3000}
        style={{ backgroundColor: theme.colors.surfaceContainerHighest }}
      >
        <Text style={{ color: theme.colors.onSurface }}>{toastMsg}</Text>
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    color: theme.colors.onBackground,
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
    borderColor: theme.colors.primary,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  avatarName: {
    ...theme.typography.title,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    fontSize: 20,
  },
  avatarEmail: {
    ...theme.typography.body,
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  changePicBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  changePicText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  section: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  subheader: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 1,
    paddingHorizontal: 0,
    marginBottom: theme.spacing.sm,
  },
  themeOptionsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  themeOptionCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderRadius: theme.roundness.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.outlineVariant,
    position: 'relative',
  },
  themeOptionCardActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  themeOptionTitle: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: theme.spacing.xs,
  },
  themeOptionTitleActive: {
    color: theme.colors.onPrimaryContainer,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  divider: {
    marginVertical: theme.spacing.md,
    backgroundColor: theme.colors.outlineVariant,
  },
  colorPaletteTitle: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: theme.spacing.sm,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
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
