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
  RefreshControl,
} from 'react-native';
import { md3Colors, md3Typography } from '../theme';
import {
  getNotificationPermissionStatus,
  registerForPushNotificationsAsync,
  getAllScheduledReminders,
  cancelScheduledReminder,
  cancelAllReminders,
  PRESET_REMINDERS,
  schedulePresetReminder,
  scheduleRelativeReminder,
  scheduleCustomReminder,
  ScheduledNotificationItem,
} from '../services/notifications';
import { parseNaturalLanguageReminder } from '../services/alarms';
import M3Card from './ui/m3/M3Card';
import M3Button from './ui/m3/M3Button';
import VoiceDictationModal from './VoiceDictationModal';

interface NotificationHubTabProps {
  onOpenAlarmHub?: () => void;
}

export default function NotificationHubTab({ onOpenAlarmHub }: NotificationHubTabProps) {
  const [scheduledList, setScheduledList] = useState<ScheduledNotificationItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  useEffect(() => {
    loadReminders();
  }, []);

  async function loadReminders() {
    setLoading(true);
    const perm = await getNotificationPermissionStatus();
    if (!perm.granted) {
      await registerForPushNotificationsAsync();
    }
    const list = await getAllScheduledReminders();
    setScheduledList(list);
    setLoading(false);
    setRefreshing(false);
  }

  async function handleScheduleFromInput(textToSchedule?: string) {
    const text = textToSchedule || inputText;
    if (!text.trim()) return;

    const parsed = parseNaturalLanguageReminder(text);
    if (parsed.isTimeReminder && parsed.minutesDelay) {
      const seconds = parsed.minutesDelay * 60;
      await scheduleRelativeReminder('✨ Buddy Reminder', parsed.reminderText || 'Voice Reminder', seconds);
      setStatusMessage(`✅ Scheduled local reminder in ${parsed.minutesDelay} mins!`);
    } else if (parsed.isTimeReminder && parsed.targetHour !== undefined && parsed.targetMinute !== undefined) {
      await scheduleCustomReminder('✨ Buddy Reminder', parsed.reminderText || 'Scheduled Reminder', parsed.targetHour, parsed.targetMinute);
      setStatusMessage(`✅ Scheduled daily reminder for ${parsed.targetHour}:${parsed.targetMinute.toString().padStart(2, '0')}`);
    } else {
      // Check if text contains any standalone number e.g. "2 check tea"
      const numberMatch = text.match(/(\d+)/);
      const delayMins = numberMatch ? parseInt(numberMatch[1], 10) : 5;
      await scheduleRelativeReminder('✨ Buddy Reminder', text, delayMins * 60);
      setStatusMessage(`✅ Scheduled ${delayMins}-minute local reminder for: "${text}"`);
    }

    setInputText('');
    loadReminders();
    setTimeout(() => setStatusMessage(''), 4000);
  }

  async function handleTogglePreset(presetType: string) {
    await schedulePresetReminder(presetType);
    setStatusMessage(`✅ Preset reminder enabled!`);
    loadReminders();
    setTimeout(() => setStatusMessage(''), 3000);
  }

  async function handleDeleteReminder(id: string) {
    await cancelScheduledReminder(id);
    setScheduledList((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleClearAll() {
    Alert.alert('Clear All Reminders', 'Are you sure you want to cancel all scheduled notifications?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          await cancelAllReminders();
          setScheduledList([]);
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReminders(); }} tintColor={md3Colors.primary} />}
    >
      <Text style={styles.heading}>🔔 Notifications & Local Alarms</Text>
      <Text style={styles.subHeading}>100% On-Device Local Scheduling • No Cloud Server Required</Text>

      {statusMessage ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{statusMessage}</Text>
        </View>
      ) : null}

      {/* Dedicated Reminder Input Box & Mic Capsule */}
      <M3Card variant="elevated" style={styles.card}>
        <Text style={styles.cardTitle}>⏰ Quick Voice & Text Reminder Box</Text>
        <Text style={styles.cardSub}>Type or speak relative time e.g. "Remind me in 10 mins to check oven"</Text>

        <View style={styles.inputCapsule}>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Remind me in 15 mins to drink water..."
            placeholderTextColor={md3Colors.outline}
            value={inputText}
            onChangeText={setInputText}
          />

          <TouchableOpacity
            style={styles.micBtn}
            onPress={() => setShowVoiceModal(true)}
          >
            <Text style={{ fontSize: 16 }}>🎙️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={() => handleScheduleFromInput()}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendBtnIcon}>↑</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sampleChipsRow}>
          <TouchableOpacity
            style={styles.sampleChip}
            onPress={() => setInputText('Remind me in 10 mins to check the oven')}
          >
            <Text style={styles.sampleChipText}>⏱️ in 10 mins</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sampleChip}
            onPress={() => setInputText('Remind me in 30 mins to drink water')}
          >
            <Text style={styles.sampleChipText}>💧 in 30 mins</Text>
          </TouchableOpacity>
        </View>
      </M3Card>

      {/* Google Clock Alarms Launcher Button */}
      {onOpenAlarmHub && (
        <M3Card variant="filled" style={styles.card}>
          <Text style={styles.cardTitle}>⏰ Google Alarms & Shake Missions</Text>
          <Text style={styles.cardSub}>Google Clock-style switches, 30-shake wake-up missions & timers</Text>
          <M3Button label="⏰ Open Google Alarm Hub →" onPress={onOpenAlarmHub} variant="filled" />
        </M3Card>
      )}

      {/* 1-Tap Daily Presets */}
      <M3Card variant="outlined" style={styles.card}>
        <Text style={styles.cardTitle}>⚡ 1-Tap Daily Presets</Text>
        <Text style={styles.cardSub}>Enable daily scheduled OS reminders with one tap</Text>
        <View style={styles.presetGrid}>
          {PRESET_REMINDERS.map((item) => (
            <TouchableOpacity
              key={item.type}
              style={styles.presetChip}
              onPress={() => handleTogglePreset(item.type)}
            >
              <Text style={styles.presetTitle}>{item.label}</Text>
              <Text style={styles.presetTime}>
                {item.hour.toString().padStart(2, '0')}:{item.minute.toString().padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </M3Card>

      {/* Active Scheduled Reminders */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.cardTitle}>📅 Active Scheduled Local Alarms ({scheduledList.length})</Text>
        {scheduledList.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator color={md3Colors.primary} style={{ marginVertical: 20 }} />
      ) : scheduledList.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No active local alarms right now. Use the box above to schedule one!</Text>
        </View>
      ) : (
        scheduledList.map((item) => (
          <M3Card key={item.id} variant="filled" style={styles.listItem}>
            <View style={styles.listItemRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  {item.timeLabel ? (
                    <View style={styles.timeBadge}>
                      <Text style={styles.timeBadgeText}>{item.timeLabel}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.itemBody}>{item.body}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteReminder(item.id)}>
                <Text style={{ fontSize: 18 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </M3Card>
        ))
      )}

      {/* Voice Speech Dictation Modal */}
      <VoiceDictationModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onVoiceTranscribed={(text) => handleScheduleFromInput(text)}
      />
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
  toast: {
    backgroundColor: md3Colors.secondaryContainer,
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  toastText: {
    color: md3Colors.onSecondaryContainer,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  cardTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '700',
  },
  cardSub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 12,
  },
  inputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  textInput: {
    flex: 1,
    color: md3Colors.onSurface,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: md3Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  sendBtn: {
    backgroundColor: md3Colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnIcon: { color: md3Colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  sampleChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  sampleChip: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  sampleChipText: {
    color: md3Colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '600',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  presetTitle: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurface,
    fontWeight: 'bold',
  },
  presetTime: {
    fontSize: 10,
    color: md3Colors.primary,
    marginTop: 2,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  clearText: {
    color: md3Colors.error,
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyBox: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: md3Colors.outline,
    fontSize: 12,
    textAlign: 'center',
  },
  listItem: {
    marginBottom: 8,
    padding: 12,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    color: md3Colors.onSurface,
    fontSize: 13,
    fontWeight: 'bold',
  },
  itemBody: {
    color: md3Colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 2,
  },
  timeBadge: {
    backgroundColor: md3Colors.secondaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timeBadgeText: {
    color: md3Colors.onSecondaryContainer,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
