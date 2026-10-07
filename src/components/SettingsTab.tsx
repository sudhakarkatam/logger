import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Share,
  Image,
  Platform,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme, theme } from '../theme';
import { getLocalSettings, queryEntries } from '../services/api';
import { getNotificationPermissionStatus } from '../services/notifications';
import { PROVIDER_DISPLAY, Provider, PROVIDER_KEY_MAP } from '../utils/constants';
import BuddyCard from './ui/m3/BuddyCard';
import BuddyButton from './ui/m3/BuddyButton';
import BuddyListItem from './ui/m3/BuddyListItem';
import NotificationManagerScreen from './NotificationManagerScreen';
import ProfileScreen from './ProfileScreen';
import ApiKeySelectScreen from './ApiKeySelectScreen';
import { Snackbar, List, Divider } from 'react-native-paper';

interface SettingsTabProps {
  onOpenNotifManager?: () => void;
  onOpenJournal?: () => void;
  onOpenPantry?: () => void;
}

export default function SettingsTab({
  onOpenNotifManager,
  onOpenJournal,
  onOpenPantry,
}: SettingsTabProps) {
  const { colors, isDark } = useAppTheme();
  const [provider, setProvider] = useState<Provider>('mistral');
  const [model, setModel] = useState('codestral-2508');
  const [exporting, setExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showApiKeyScreen, setShowApiKeyScreen] = useState(false);
  const [showNotifManager, setShowNotifManager] = useState(false);
  const [showProfileScreen, setShowProfileScreen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [permGranted, setPermGranted] = useState(false);

  useEffect(() => {
    loadSettings();
    loadProfileImage();
    checkNotificationPermission();
  }, []);

  // Handle Android mobile hardware back button properly for sub-screens
  useEffect(() => {
    if (!showApiKeyScreen && !showProfileScreen && !showNotifManager) return;

    const onBackPress = () => {
      if (showApiKeyScreen) {
        setShowApiKeyScreen(false);
        loadSettings();
        return true;
      }
      if (showProfileScreen) {
        setShowProfileScreen(false);
        loadProfileImage();
        return true;
      }
      if (showNotifManager) {
        setShowNotifManager(false);
        checkNotificationPermission();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [showApiKeyScreen, showProfileScreen, showNotifManager]);

  async function loadProfileImage() {
    try {
      const savedImg = await AsyncStorage.getItem('@buddy_profile_image');
      if (savedImg) setProfileImage(savedImg);
    } catch (_) {}
  }

  async function checkNotificationPermission() {
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
  }

  async function loadSettings() {
    const local = await getLocalSettings();
    if (local.provider) setProvider(local.provider as Provider);
    if (local.model) setModel(local.model);
  }

  async function handleExportData(format: 'json' | 'csv') {
    try {
      setExporting(true);
      const res = await queryEntries(undefined, 1000);
      const entries = res.entries || [];
      if (format === 'json') {
        const jsonStr = JSON.stringify(entries, null, 2);
        await Share.share({ title: 'Buddy_Export.json', message: jsonStr });
      } else {
        const headers = ['id', 'timestamp', 'category', 'raw_text', 'summary'];
        const csvRows = entries.map((e) =>
          [
            e.id,
            e.created_at,
            e.category,
            `"${(e.raw_text || '').replace(/"/g, '""')}"`,
            `"${(e.summary || '').replace(/"/g, '""')}"`,
          ].join(',')
        );
        const csvContent = [headers.join(','), ...csvRows].join('\n');
        await Share.share({ title: 'Buddy_Export.csv', message: csvContent });
      }
    } catch (err: any) {
      setStatusMessage(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  function handleOpenNotifManager() {
    if (onOpenNotifManager) {
      onOpenNotifManager();
    } else {
      setShowNotifManager(true);
    }
  }

  if (showProfileScreen) {
    return (
      <ProfileScreen
        onBack={() => {
          setShowProfileScreen(false);
          loadProfileImage();
        }}
      />
    );
  }

  if (showNotifManager) {
    return (
      <NotificationManagerScreen
        onBack={() => {
          setShowNotifManager(false);
          checkNotificationPermission();
        }}
      />
    );
  }

  if (showApiKeyScreen) {
    return (
      <ApiKeySelectScreen
        onBack={() => {
          setShowApiKeyScreen(false);
          loadSettings();
        }}
        onSettingsChanged={(newProvider, newModel) => {
          setProvider(newProvider);
          setModel(newModel);
        }}
      />
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Top Header Row with Title & Profile Avatar */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.onBackground }]}>App Settings</Text>
          <Text style={[styles.subHeading, { color: colors.onSurfaceVariant }]}>
            Preferences, AI Engines & Data Backups
          </Text>
        </View>

        <TouchableOpacity onPress={() => setShowProfileScreen(true)} activeOpacity={0.8}>
          <Image
            source={{
              uri:
                profileImage ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            }}
            style={[styles.headerAvatar, { borderColor: colors.primary }]}
          />
        </TouchableOpacity>
      </View>

      {/* Preferences Section: Intelligence & Engine */}
      <List.Section style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
        <List.Subheader style={[styles.subheader, { color: colors.primary }]}>AI ENGINE & API KEYS</List.Subheader>

        <BuddyListItem
          title="All Providers & Model Settings"
          description={`Active: ${PROVIDER_DISPLAY[provider]} (${model}) • Key: ${PROVIDER_KEY_MAP[provider]}`}
          leftIcon="server-network"
          onPress={() => setShowApiKeyScreen(true)}
        />
      </List.Section>

      {/* Preferences Section: Notifications */}
      <List.Section style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
        <List.Subheader style={[styles.subheader, { color: colors.primary }]}>PREFERENCES & NOTIFICATIONS</List.Subheader>

        <BuddyListItem
          title="Notification Control Center"
          description={permGranted ? 'OS Notifications Active' : 'OS Notifications Disabled (Tap to enable)'}
          leftIcon="bell-outline"
          onPress={handleOpenNotifManager}
        />
      </List.Section>

      {/* Preferences Section: Modules & Archives */}
      <List.Section style={[styles.section, { backgroundColor: colors.surfaceContainer }]}>
        <List.Subheader style={[styles.subheader, { color: colors.primary }]}>MODULES & ARCHIVES</List.Subheader>

        {onOpenPantry && (
          <>
            <BuddyListItem
              title="Pantry & Inventory Manager"
              description="Track expiry dates & food items"
              leftIcon="silverware-fork-knife"
              onPress={onOpenPantry}
            />
            <Divider style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
          </>
        )}

        {onOpenJournal && (
          <BuddyListItem
            title="Daily Reflection Journal"
            description="View logs in timeline format"
            leftIcon="book-open-page-variant"
            onPress={onOpenJournal}
          />
        )}
      </List.Section>

      {/* Data Export Card */}
      <BuddyCard variant="elevated" style={[styles.card, { backgroundColor: colors.surfaceContainer }]}>
        <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Data Export & Backup</Text>
        <Text style={[styles.cardSub, { color: colors.onSurfaceVariant }]}>
          Export all your logged activities for personal archives or analytics.
        </Text>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <BuddyButton
            label="Share as JSON"
            onPress={() => handleExportData('json')}
            variant="tonal"
            disabled={exporting}
            style={{ flex: 1 }}
          />
          <BuddyButton
            label="Share as CSV"
            onPress={() => handleExportData('csv')}
            variant="tonal"
            disabled={exporting}
            style={{ flex: 1 }}
          />
        </View>
      </BuddyCard>

      {/* Snackbar Toast */}
      <Snackbar visible={!!statusMessage} onDismiss={() => setStatusMessage('')} duration={3500}>
        {statusMessage}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  heading: {
    ...theme.typography.headline,
    fontWeight: 'bold',
  },
  subHeading: {
    ...theme.typography.label,
    marginTop: 2,
  },
  section: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.roundness.lg,
    overflow: 'hidden',
  },
  subheader: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
  },
  card: {
    marginVertical: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  cardTitle: {
    ...theme.typography.title,
    fontWeight: 'bold',
  },
  cardSub: {
    ...theme.typography.body,
    marginBottom: theme.spacing.sm,
    fontSize: 13,
  },
});
