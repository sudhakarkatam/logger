import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Modal,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme';
import { getLocalSettings, saveLocalSettings, testConnection, queryEntries } from '../services/api';
import {
  getNotificationPermissionStatus,
} from '../services/notifications';
import { PROVIDER_DISPLAY, Provider, QUICK_MODELS, PROVIDER_HINTS } from '../utils/constants';
import BuddyCard from './ui/m3/BuddyCard';
import BuddyButton from './ui/m3/BuddyButton';
import BuddyListItem from './ui/m3/BuddyListItem';
import NotificationManagerScreen from './NotificationManagerScreen';
import ProfileScreen from './ProfileScreen';
import { Snackbar, List, Divider } from 'react-native-paper';

interface SettingsTabProps {
  onOpenNotifManager?: () => void;
  onOpenAlarmHub?: () => void;
  onOpenJournal?: () => void;
  onOpenPantry?: () => void;
}

export default function SettingsTab({ onOpenNotifManager, onOpenAlarmHub, onOpenJournal, onOpenPantry }: SettingsTabProps) {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showLlmModal, setShowLlmModal] = useState(false);
  const [showNotifManager, setShowNotifManager] = useState(false);
  const [showProfileScreen, setShowProfileScreen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [permGranted, setPermGranted] = useState(false);

  useEffect(() => {
    loadSettings();
    loadProfileImage();
    checkNotificationPermission();
  }, []);

  async function loadProfileImage() {
    try {
      const savedImg = await AsyncStorage.getItem('@buddy_profile_image');
      if (savedImg) setProfileImage(savedImg);
    } catch (_) {}
  }

  async function checkNotificationPermission() {
    const granted = await getNotificationPermissionStatus();
    setPermGranted(granted);
  }

  async function loadSettings() {
    const local = await getLocalSettings();
    if (local.provider) setProvider(local.provider as Provider);
    if (local.model) setModel(local.model);
  }

  async function handleSelectProvider(newProvider: Provider) {
    setProvider(newProvider);
    const defaults = QUICK_MODELS[newProvider];
    const defaultModel = defaults && defaults.length > 0 ? defaults[0].id : '';
    setModel(defaultModel);
    await saveLocalSettings({ provider: newProvider, model: defaultModel });
    setStatusMessage(`Switched AI Provider to ${PROVIDER_DISPLAY[newProvider]}`);
  }

  async function handleSelectModel(newModel: string) {
    setModel(newModel);
    await saveLocalSettings({ provider, model: newModel });
    setStatusMessage(`Model updated to ${newModel.split('/').pop()}`);
  }

  async function handleTestAi() {
    setTesting(true);
    setStatusMessage('');
    const res = await testConnection();
    setTesting(false);
    setStatusMessage(res.message);
  }

  async function handleExportData(format: 'json' | 'csv') {
    try {
      setExporting(true);
      const entries = await queryEntries(undefined, 1000);
      if (format === 'json') {
        const jsonStr = JSON.stringify(entries, null, 2);
        await Share.share({ title: 'Buddy_Export.json', message: jsonStr });
      } else {
        const headers = ['id', 'timestamp', 'category', 'raw_text', 'summary'];
        const csvRows = entries.map((e) =>
          [e.id, e.created_at, e.category, `"${(e.raw_text || '').replace(/"/g, '""')}"`, `"${(e.summary || '').replace(/"/g, '""')}"`].join(',')
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Header Row with Title & Profile Avatar */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>App Settings</Text>
          <Text style={styles.subHeading}>Preferences, AI Engines & Data Backups</Text>
        </View>

        <TouchableOpacity onPress={() => setShowProfileScreen(true)} activeOpacity={0.8}>
          <Image
            source={{
              uri: profileImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            }}
            style={styles.headerAvatar}
          />
        </TouchableOpacity>
      </View>

      {/* Pixel Settings Preferences Section: Notifications & Alarms */}
      <List.Section style={styles.section}>
        <List.Subheader style={styles.subheader}>PREFERENCES & ALARMS</List.Subheader>

        <BuddyListItem
          title="Notification Control Center"
          description={permGranted ? "OS Notifications Enabled" : "OS Notifications Disabled"}
          leftIcon="bell-outline"
          onPress={handleOpenNotifManager}
        />
        <Divider style={styles.divider} />

        <BuddyListItem
          title="Google Clock Alarms & Shake Missions"
          description="Repeat days, shake missions & timers"
          leftIcon="alarm"
          onPress={onOpenAlarmHub}
        />
      </List.Section>

      {/* Preferences Section: Intelligence & Engine */}
      <List.Section style={styles.section}>
        <List.Subheader style={styles.subheader}>AI ENGINE & INTELLIGENCE</List.Subheader>

        <BuddyListItem
          title="AI Engine & LLM Models"
          description={`Current: ${PROVIDER_DISPLAY[provider]} (${model.split('/').pop()})`}
          leftIcon="robot"
          onPress={() => setShowLlmModal(true)}
        />
        <Divider style={styles.divider} />

        <BuddyListItem
          title="Test AI Connectivity"
          description="Send ping query to active LLM engine"
          leftIcon="lightning-bolt-outline"
          onPress={handleTestAi}
          rightNode={testing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        />
      </List.Section>

      {/* Preferences Section: Modules & Archives */}
      <List.Section style={styles.section}>
        <List.Subheader style={styles.subheader}>MODULES & ARCHIVES</List.Subheader>

        {onOpenPantry && (
          <>
            <BuddyListItem
              title="Pantry & Inventory Manager"
              description="Track expiry dates & food items"
              leftIcon="silverware-fork-knife"
              onPress={onOpenPantry}
            />
            <Divider style={styles.divider} />
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
      <BuddyCard variant="elevated" style={styles.card}>
        <Text style={styles.cardTitle}>Data Export & Backup</Text>
        <Text style={styles.cardSub}>Export all your logged activities for personal archives or analytics.</Text>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <BuddyButton label="Share as JSON" onPress={() => handleExportData('json')} variant="tonal" disabled={exporting} style={{ flex: 1 }} />
          <BuddyButton label="Share as CSV" onPress={() => handleExportData('csv')} variant="tonal" disabled={exporting} style={{ flex: 1 }} />
        </View>
      </BuddyCard>

      {/* LLM Engine Picker Bottom Sheet Modal */}
      <Modal visible={showLlmModal} transparent animationType="slide" onRequestClose={() => setShowLlmModal(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowLlmModal(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Select AI Model Engine</Text>

            <Text style={styles.fieldLabel}>Select Provider:</Text>
            <View style={styles.providerGrid}>
              {(['gemini', 'groq', 'deepseek', 'ollama'] as Provider[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.modelChip, provider === p && styles.modelChipActive]}
                  onPress={() => handleSelectProvider(p)}
                >
                  <Text style={[styles.modelChipText, provider === p && styles.modelChipTextActive]}>
                    {PROVIDER_DISPLAY[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Select Model:</Text>
            <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={{ gap: 6 }}>
              {(QUICK_MODELS[provider] || []).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modelChip, model === m.id && styles.modelChipActive]}
                  onPress={() => handleSelectModel(m.id)}
                >
                  <Text style={[styles.modelChipText, model === m.id && styles.modelChipTextActive]}>
                    {m.label}
                  </Text>
                  {m.free && <Text style={styles.freeBadgeText}>FREE</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <BuddyButton label="Close" onPress={() => setShowLlmModal(false)} variant="outlined" style={{ marginTop: theme.spacing.md }} />
          </View>
        </TouchableOpacity>
      </Modal>

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
    backgroundColor: theme.colors.background,
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
    borderColor: theme.colors.primary,
  },
  heading: {
    ...theme.typography.headline,
    color: theme.colors.onBackground,
    fontWeight: 'bold',
  },
  subHeading: {
    ...theme.typography.label,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  section: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.lg,
    overflow: 'hidden',
  },
  subheader: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  divider: {
    backgroundColor: theme.colors.outlineVariant,
    height: 1,
  },
  card: {
    marginVertical: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  cardTitle: {
    ...theme.typography.title,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
  },
  cardSub: {
    ...theme.typography.body,
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.sm,
    fontSize: 13,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surfaceContainer,
    borderTopLeftRadius: theme.roundness.xl,
    borderTopRightRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
  },
  sheetTitle: {
    ...theme.typography.title,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    ...theme.typography.label,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 6,
    fontWeight: 'bold',
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  modelChip: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.roundness.md,
    marginRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  modelChipActive: {
    backgroundColor: theme.colors.secondaryContainer,
    borderColor: theme.colors.primary,
  },
  modelChipText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  modelChipTextActive: {
    color: theme.colors.onSecondaryContainer,
    fontWeight: 'bold',
  },
  freeBadgeText: {
    color: theme.colors.catExpense,
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
