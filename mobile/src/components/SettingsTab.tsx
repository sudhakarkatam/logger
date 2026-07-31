import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { md3Colors, md3Typography } from '../theme';
import { getLocalSettings, saveLocalSettings, testConnection, queryEntries } from '../services/api';
import {
  getNotificationPermissionStatus,
  sendInstantLocalNotification,
} from '../services/notifications';
import { PROVIDER_DISPLAY, Provider, QUICK_MODELS, PROVIDER_HINTS } from '../utils/constants';
import M3Card from './ui/m3/M3Card';
import M3Button from './ui/m3/M3Button';
import M3Chip from './ui/m3/M3Chip';
import NotificationManagerScreen from './NotificationManagerScreen';

interface SettingsTabProps {
  onOpenNotifManager?: () => void;
}

export default function SettingsTab({ onOpenNotifManager }: SettingsTabProps) {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Fallback Internal Screen Toggle
  const [showNotifManager, setShowNotifManager] = useState(false);

  // Notification State
  const [permGranted, setPermGranted] = useState(false);

  useEffect(() => {
    loadSettings();
    checkNotificationPermission();
  }, []);

  async function loadSettings() {
    const s = await getLocalSettings();
    setProvider(s.provider as Provider);
    setModel(s.model);
  }

  async function checkNotificationPermission() {
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
  }

  function handleOpenNotifManager() {
    if (onOpenNotifManager) {
      onOpenNotifManager();
    } else {
      setShowNotifManager(true);
    }
  }

  async function handleSaveSettings(newProvider: Provider, newModel: string) {
    setProvider(newProvider);
    setModel(newModel);
    await saveLocalSettings({ provider: newProvider, model: newModel });
    setStatusMessage(`Saved settings: ${PROVIDER_DISPLAY[newProvider]} (${newModel})`);
    setTimeout(() => setStatusMessage(''), 3000);
  }

  async function handleTestConnection() {
    setTesting(true);
    setStatusMessage('⏳ Testing connection to AI Edge Function...');
    try {
      const res = await testConnection(provider, model);
      if (res.success) {
        setStatusMessage(`✅ Connection Successful! Model responded.`);
        Alert.alert('Connection Success', `Successfully communicated with ${PROVIDER_DISPLAY[provider]} engine!`);
      } else {
        setStatusMessage(`❌ Connection Failed: ${res.error || 'Unknown error'}`);
        Alert.alert('Connection Failed', res.error || 'Unable to connect to AI provider.');
      }
    } catch (err: any) {
      setStatusMessage(`❌ Connection Error: ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleExportData(format: 'json' | 'csv') {
    try {
      setExporting(true);
      const res = await queryEntries(undefined, 5000);
      const entries = res.entries || [];

      if (entries.length === 0) {
        Alert.alert('No Data', 'No logged entries found to export.');
        return;
      }

      let fileContent = '';
      if (format === 'json') {
        fileContent = JSON.stringify(entries, null, 2);
      } else {
        const headers = ['id', 'entry_time', 'category', 'raw_text', 'tags', 'data'];
        const csvRows = [headers.join(',')];
        entries.forEach((e) => {
          const values = [
            e.id,
            e.entry_time,
            e.category,
            `"${(e.raw_text || '').replace(/"/g, '""')}"`,
            `"${(e.tags || []).join(',')}"`,
            `"${JSON.stringify(e.data || {}).replace(/"/g, '""')}"`,
          ];
          csvRows.push(values.join(','));
        });
        fileContent = csvRows.join('\n');
      }

      await Share.share({
        title: `Buddy_Export_${Date.now()}.${format}`,
        message: fileContent,
      });
    } catch (err: any) {
      Alert.alert('Export Error', err.message || 'Could not export data.');
    } finally {
      setExporting(false);
    }
  }

  // If Dedicated Notification Manager Screen is Active internally
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
      <Text style={styles.heading}>⚙️ App Settings</Text>
      <Text style={styles.subHeading}>Material 3 AI Engines, Alarms & Exports</Text>

      {statusMessage ? (
        <View style={styles.statusToast}>
          <Text style={styles.statusToastText}>{statusMessage}</Text>
        </View>
      ) : null}

      {/* Dedicated Notification Management Launcher Card */}
      <M3Card variant="elevated" style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>🔔 Notification Management</Text>
          <View style={[styles.permBadge, { backgroundColor: permGranted ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }]}>
            <Text style={{ color: permGranted ? '#10B981' : '#EF4444', fontSize: 11, fontWeight: 'bold' }}>
              {permGranted ? 'Active ✅' : 'Disabled ⚠️'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardSub}>
          Full Control Center for daily goal briefings, preset alarms, custom reminders, and system permission triggers.
        </Text>

        <M3Button
          label="⚙️ Open Notification Control Center →"
          onPress={handleOpenNotifManager}
          variant="filled"
        />
      </M3Card>

      {/* AI LLM Provider Section */}
      <M3Card variant="filled" style={styles.card}>
        <Text style={styles.cardTitle}>🤖 AI LLM Provider & Model</Text>
        <Text style={styles.cardSub}>Select your preferred AI model engine for natural language parsing.</Text>

        <View style={styles.providerGrid}>
          {(['gemini', 'groq', 'openrouter', 'openai', 'anthropic'] as Provider[]).map((p) => (
            <M3Chip
              key={p}
              label={PROVIDER_DISPLAY[p]}
              selected={provider === p}
              onPress={() => {
                const defaultModel = QUICK_MODELS[p]?.[0]?.id || p;
                handleSaveSettings(p, defaultModel);
              }}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Active Model Selection:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(QUICK_MODELS[provider] || []).map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.modelChip, model === m.id && styles.modelChipActive]}
              onPress={() => handleSaveSettings(provider, m.id)}
            >
              <Text style={[styles.modelChipText, model === m.id && styles.modelChipTextActive]}>{m.label}</Text>
              {m.free && <Text style={styles.freeBadgeText}>FREE</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.hintText}>{PROVIDER_HINTS[provider]}</Text>

        <M3Button
          label={testing ? 'Testing Connection...' : '⚡ Test AI Connection'}
          onPress={handleTestConnection}
          variant="tonal"
          disabled={testing}
        />
      </M3Card>

      {/* Data Export & Backup Section */}
      <M3Card variant="outlined" style={styles.card}>
        <Text style={styles.cardTitle}>💾 Data Export & Share</Text>
        <Text style={styles.cardSub}>Export all your logged activities for personal archives or analytics.</Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <M3Button label="📄 Share as JSON" onPress={() => handleExportData('json')} variant="tonal" disabled={exporting} style={{ flex: 1 }} />
          <M3Button label="📊 Share as CSV" onPress={() => handleExportData('csv')} variant="tonal" disabled={exporting} style={{ flex: 1 }} />
        </View>
      </M3Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  heading: {
    ...md3Typography.headlineMedium,
    color: md3Colors.onBackground,
  },
  subHeading: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 16,
  },
  statusToast: {
    backgroundColor: md3Colors.secondaryContainer,
    padding: 10,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  statusToastText: {
    color: md3Colors.onSecondaryContainer,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '700',
  },
  cardSub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 14,
  },
  permBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  fieldLabel: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 6,
    fontWeight: 'bold',
  },
  modelChip: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  modelChipActive: {
    backgroundColor: md3Colors.secondaryContainer,
    borderColor: md3Colors.primary,
  },
  modelChipText: {
    color: md3Colors.onSurfaceVariant,
    fontSize: 12,
  },
  modelChipTextActive: {
    color: md3Colors.onSecondaryContainer,
    fontWeight: 'bold',
  },
  freeBadgeText: {
    color: md3Colors.catExpense,
    fontSize: 9,
    fontWeight: 'bold',
  },
  hintText: {
    ...md3Typography.labelSmall,
    color: md3Colors.outline,
    fontStyle: 'italic',
    marginBottom: 14,
  },
});
