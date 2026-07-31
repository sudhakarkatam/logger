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
  Switch,
  SafeAreaView,
  StatusBar,
  Platform,
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
  scheduleCustomReminder,
  sendInstantLocalNotification,
  ScheduledNotificationItem,
} from '../services/notifications';
import M3Card from './ui/m3/M3Card';
import M3Button from './ui/m3/M3Button';

interface NotificationManagerScreenProps {
  onBack: () => void;
}

export default function NotificationManagerScreen({ onBack }: NotificationManagerScreenProps) {
  const [permGranted, setPermGranted] = useState(false);
  const [scheduledList, setScheduledList] = useState<ScheduledNotificationItem[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [customHour, setCustomHour] = useState('20');
  const [customMinute, setCustomMinute] = useState('00');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    loadNotificationData();
  }, []);

  async function loadNotificationData() {
    setLoading(true);
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
    const list = await getAllScheduledReminders();
    setScheduledList(list);
    setLoading(false);
  }

  async function handleRequestPermission() {
    await registerForPushNotificationsAsync();
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
    if (perm.granted) {
      Alert.alert('Permission Granted', 'Push notification permissions are active!');
    } else {
      Alert.alert('Permission Required', 'Please enable notifications for Buddy in your phone system settings.');
    }
  }

  async function handleSchedulePreset(type: string, label: string) {
    const success = await schedulePresetReminder(type);
    if (success) {
      setStatusMessage(`Scheduled [${label}] daily reminder!`);
      setTimeout(() => setStatusMessage(''), 3000);
      loadNotificationData();
    } else {
      Alert.alert('Schedule Error', 'Could not schedule preset reminder.');
    }
  }

  async function handleAddCustomReminder() {
    const hr = parseInt(customHour, 10);
    const min = parseInt(customMinute, 10);

    if (isNaN(hr) || hr < 0 || hr > 23 || isNaN(min) || min < 0 || min > 59) {
      Alert.alert('Invalid Time', 'Please enter a valid hour (0-23) and minute (0-59).');
      return;
    }

    const success = await scheduleCustomReminder(
      customTitle || '✨ Buddy Log Reminder',
      customBody || 'Take 30 seconds to log your reflections today!',
      hr,
      min
    );

    if (success) {
      setStatusMessage(`Scheduled custom alarm for ${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
      setTimeout(() => setStatusMessage(''), 3000);
      setCustomTitle('');
      setCustomBody('');
      loadNotificationData();
    }
  }

  async function handleCancelReminder(id: string, title: string) {
    await cancelScheduledReminder(id);
    setStatusMessage(`Cancelled reminder: ${title}`);
    setTimeout(() => setStatusMessage(''), 3000);
    loadNotificationData();
  }

  async function handleClearAllReminders() {
    Alert.alert('Clear All Alarms', 'Are you sure you want to cancel all scheduled reminders?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          await cancelAllReminders();
          setScheduledList([]);
          setStatusMessage('Cleared all scheduled alarms.');
          setTimeout(() => setStatusMessage(''), 3000);
        },
      },
    ]);
  }

  async function handleTestNotification() {
    await sendInstantLocalNotification(
      '✨ Buddy Push Notification',
      'Native local notifications are 100% active and working!'
    );
  }

  const presetColors: Record<string, string> = {
    morning: '#6366F1',
    lunch: '#10B981',
    evening: '#F59E0B',
    expiry: '#EC4899',
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E202B" />

      {/* Immersive Dark Hero Header */}
      <View style={styles.heroHeader}>
        <View style={styles.topAppBarRow}>
          <Text style={styles.topAppBarTitle}>Notification Control Center</Text>
        </View>

        <View style={styles.heroTitleRow}>
          <View style={styles.heroIconBadge}>
            <Text style={{ fontSize: 22 }}>🔔</Text>
          </View>
          <View>
            <Text style={styles.heroTitle}>Alarms & Reminders</Text>
            <Text style={styles.heroSubtitle}>System Alarms & Proactive AI Triggers</Text>
          </View>
        </View>

        {/* Live Permission Indicator Banner */}
        <View style={[styles.permBanner, { backgroundColor: permGranted ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permBannerTitle, { color: permGranted ? '#10B981' : '#EF4444' }]}>
              {permGranted ? 'Notification Permissions Active ✅' : 'Notification Access Required ⚠️'}
            </Text>
            <Text style={styles.permBannerDesc}>
              {permGranted
                ? 'Buddy is authorized to send daily habit briefings and kitchen warnings.'
                : 'Enable system notifications to receive daily habit alarms.'}
            </Text>
          </View>

          {!permGranted && (
            <TouchableOpacity style={styles.grantBtn} onPress={handleRequestPermission}>
              <Text style={styles.grantBtnText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Scrollable Management Interface */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {statusMessage ? (
          <View style={styles.statusToast}>
            <Text style={styles.statusToastText}>{statusMessage}</Text>
          </View>
        ) : null}

        {/* Visual Preset Alarm Cards */}
        <Text style={styles.sectionHeader}>⚡ Daily Alarm Presets</Text>
        <Text style={styles.sectionSub}>Tap any card below to schedule a recurring daily alarm</Text>

        <View style={styles.presetCardsGrid}>
          {PRESET_REMINDERS.map((p) => {
            const color = presetColors[p.type] || md3Colors.primary;
            return (
              <TouchableOpacity
                key={p.type}
                style={[styles.presetCard, { borderColor: `${color}40` }]}
                onPress={() => handleSchedulePreset(p.type, p.label)}
                activeOpacity={0.85}
              >
                <View style={styles.presetCardTop}>
                  <View style={[styles.presetBadge, { backgroundColor: `${color}25` }]}>
                    <Text style={{ fontSize: 18 }}>{p.label.split(' ')[0]}</Text>
                  </View>
                  <Text style={[styles.presetTimeText, { color }]}>
                    {p.hour.toString().padStart(2, '0')}:{p.minute.toString().padStart(2, '0')}
                  </Text>
                </View>

                <Text style={styles.presetTitleText}>{p.label.substring(2)}</Text>
                <Text style={styles.presetBodyText}>{p.body}</Text>

                <View style={[styles.addPresetBtn, { backgroundColor: `${color}20` }]}>
                  <Text style={[styles.addPresetBtnText, { color }]}>+ Schedule Daily</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Active Scheduled Reminders Queue */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionHeader}>⏰ Active Scheduled Alarms ({scheduledList.length})</Text>
            <Text style={styles.sectionSub}>Currently registered with phone OS</Text>
          </View>

          {scheduledList.length > 0 && (
            <TouchableOpacity onPress={handleClearAllReminders}>
              <Text style={{ color: md3Colors.error, fontSize: 12, fontWeight: 'bold' }}>Clear All 🗑️</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={md3Colors.primary} style={{ marginVertical: 20 }} />
        ) : scheduledList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>🔕</Text>
            <Text style={styles.emptyTitle}>No Active Alarms Scheduled</Text>
            <Text style={styles.emptySub}>Tap a preset above or create a custom alarm below to get started.</Text>
          </View>
        ) : (
          scheduledList.map((item) => (
            <View key={item.id} style={styles.alarmItemRow}>
              <View style={styles.alarmTimeBadge}>
                <Text style={styles.alarmTimeText}>
                  {item.timeLabel ? item.timeLabel : `${item.hour !== undefined ? item.hour.toString().padStart(2, '0') : '--'}:${item.minute !== undefined ? item.minute.toString().padStart(2, '0') : '00'}`}
                </Text>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.alarmTitleText}>{item.title}</Text>
                {item.body ? <Text style={styles.alarmBodyText}>{item.body}</Text> : null}
              </View>

              <TouchableOpacity
                style={styles.cancelAlarmBtn}
                onPress={() => handleCancelReminder(item.id, item.title)}
              >
                <Text style={styles.cancelAlarmBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Custom Alarm Creator Sheet */}
        <M3Card variant="filled" style={styles.creatorCard}>
          <Text style={styles.creatorTitle}>➕ Create Custom Alarm</Text>
          <Text style={styles.creatorSub}>Configure a custom daily reminder with personalized time and text.</Text>

          <Text style={styles.fieldLabel}>Reminder Title:</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Daily Gym & Hydration Check"
            placeholderTextColor={md3Colors.outline}
            value={customTitle}
            onChangeText={setCustomTitle}
          />

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Message Body:</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Take 30 seconds to record your workout"
            placeholderTextColor={md3Colors.outline}
            value={customBody}
            onChangeText={setCustomBody}
          />

          <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Trigger Time (24h format):</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={styles.timeInput}
              placeholder="20"
              placeholderTextColor={md3Colors.outline}
              keyboardType="number-pad"
              maxLength={2}
              value={customHour}
              onChangeText={setCustomHour}
            />
            <Text style={styles.timeColon}>:</Text>
            <TextInput
              style={styles.timeInput}
              placeholder="00"
              placeholderTextColor={md3Colors.outline}
              keyboardType="number-pad"
              maxLength={2}
              value={customMinute}
              onChangeText={setCustomMinute}
            />

            <M3Button label="Add Alarm" onPress={handleAddCustomReminder} variant="filled" style={{ marginLeft: 'auto' }} />
          </View>
        </M3Card>

        {/* Test Notification Trigger */}
        <M3Button label="📲 Send Instant Test Push Notification" onPress={handleTestNotification} variant="outlined" style={{ marginBottom: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  heroHeader: {
    backgroundColor: '#1E202B',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: md3Colors.outlineVariant,
  },
  topAppBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backIconText: {
    color: md3Colors.onBackground,
    fontSize: 18,
    fontWeight: 'bold',
  },
  topAppBarTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.onBackground,
    fontWeight: '800',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  heroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: md3Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...md3Typography.headlineMedium,
    color: md3Colors.onBackground,
    fontWeight: '800',
  },
  heroSubtitle: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  permBannerTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  permBannerDesc: {
    fontSize: 11,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  grantBtn: {
    backgroundColor: md3Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 10,
  },
  grantBtnText: {
    color: md3Colors.onPrimary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  sectionHeader: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '700',
  },
  sectionSub: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 12,
  },
  presetCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  presetCard: {
    width: '48%',
    backgroundColor: md3Colors.surfaceContainerHigh,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 130,
  },
  presetCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  presetBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTimeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  presetTitleText: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '700',
  },
  presetBodyText: {
    fontSize: 10,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 10,
    lineHeight: 14,
  },
  addPresetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  addPresetBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  emptyTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
  },
  emptySub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  alarmItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: md3Colors.surfaceContainerHigh,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  alarmTimeBadge: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 58,
  },
  alarmTimeText: {
    color: md3Colors.primary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  alarmAmPmText: {
    color: md3Colors.outline,
    fontSize: 8,
    fontWeight: 'bold',
  },
  alarmTitleText: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '600',
  },
  alarmBodyText: {
    fontSize: 11,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  cancelAlarmBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  cancelAlarmBtnText: {
    color: md3Colors.error,
    fontSize: 12,
    fontWeight: 'bold',
  },
  creatorCard: {
    marginBottom: 20,
    padding: 16,
  },
  creatorTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '700',
    marginBottom: 4,
  },
  creatorSub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 14,
  },
  fieldLabel: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 4,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    color: md3Colors.onSurface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  timeInput: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    color: md3Colors.onSurface,
    width: 48,
    height: 38,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  timeColon: {
    color: md3Colors.onSurface,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
