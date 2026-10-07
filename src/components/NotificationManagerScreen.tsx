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
  Platform,
  BackHandler,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../theme';
import {
  getNotificationPermissionStatus,
  registerForPushNotificationsAsync,
  getUserReminders,
  createUserReminder,
  updateUserReminder,
  deleteUserReminder,
  toggleUserReminder,
  clearAllUserReminders,
  scheduleRelativeReminder,
  sendInstantLocalNotification,
  formatTimeDisplay,
  getRepeatLabel,
  getCategoryIcon,
  ReminderItem,
  RepeatMode,
  ReminderCategory,
} from '../services/notifications';
import { Snackbar } from 'react-native-paper';

interface NotificationManagerScreenProps {
  onBack: () => void;
}

const CATEGORY_OPTIONS: { id: ReminderCategory; label: string; icon: string }[] = [
  { id: 'habit', label: 'Habit', icon: 'target' },
  { id: 'health', label: 'Health', icon: 'pill' },
  { id: 'meal', label: 'Meal', icon: 'food-apple-outline' },
  { id: 'reflection', label: 'Reflection', icon: 'sparkles' },
  { id: 'general', label: 'General', icon: 'bell-outline' },
];

const REPEAT_OPTIONS: { id: RepeatMode; label: string; icon: string }[] = [
  { id: 'daily', label: 'Daily', icon: 'calendar-sync' },
  { id: 'weekdays', label: 'Mon – Fri', icon: 'briefcase-outline' },
  { id: 'weekends', label: 'Sat – Sun', icon: 'beach' },
  { id: 'weekly', label: 'Weekly', icon: 'calendar-week' },
  { id: 'once', label: 'Once', icon: 'timer-outline' },
];

const WEEKDAY_NAMES = [
  { day: 1, label: 'Sun' },
  { day: 2, label: 'Mon' },
  { day: 3, label: 'Tue' },
  { day: 4, label: 'Wed' },
  { day: 5, label: 'Thu' },
  { day: 6, label: 'Fri' },
  { day: 7, label: 'Sat' },
];

const QUICK_PRESETS = [
  { title: '💧 Drink 500ml Water', body: 'Hydration check-in', category: 'health' as ReminderCategory, hour: 11, minute: 0, repeat: 'daily' as RepeatMode },
  { title: '💊 Evening Vitamins', body: 'Take supplements', category: 'health' as ReminderCategory, hour: 21, minute: 0, repeat: 'daily' as RepeatMode },
  { title: '🏃 Stand & Stretch', body: '5 min movement break', category: 'habit' as ReminderCategory, hour: 15, minute: 30, repeat: 'weekdays' as RepeatMode },
];

export default function NotificationManagerScreen({ onBack }: NotificationManagerScreenProps) {
  const { colors, isDark } = useAppTheme();
  const [permGranted, setPermGranted] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'daily' | 'weekdays' | 'once'>('all');

  // Modal State (Create / Edit)
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCategory, setFormCategory] = useState<ReminderCategory>('habit');
  const [formHour12, setFormHour12] = useState('8');
  const [formMinute, setFormMinute] = useState('00');
  const [formPeriod, setFormPeriod] = useState<'AM' | 'PM'>('AM');
  const [formRepeatMode, setFormRepeatMode] = useState<RepeatMode>('daily');
  const [formWeekday, setFormWeekday] = useState(2); // Monday default

  useEffect(() => {
    loadReminders();
  }, []);

  // Hardware back navigation handler
  useEffect(() => {
    const onBackPress = () => {
      if (modalVisible) {
        setModalVisible(false);
        return true;
      }
      onBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [onBack, modalVisible]);

  async function loadReminders() {
    setLoading(true);
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
    const list = await getUserReminders();
    setReminders(list);
    setLoading(false);
  }

  async function handleRequestPermission() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await registerForPushNotificationsAsync();
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
    if (perm.granted) {
      setStatusMessage('Notifications enabled successfully!');
    } else {
      Alert.alert(
        'Permission Required',
        'Please allow notifications in your device system settings to receive reminders.'
      );
    }
  }

  function openCreateModal() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditingId(null);
    setFormTitle('');
    setFormBody('');
    setFormCategory('habit');
    setFormHour12('8');
    setFormMinute('00');
    setFormPeriod('AM');
    setFormRepeatMode('daily');
    setFormWeekday(2);
    setModalVisible(true);
  }

  function openEditModal(item: ReminderItem) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormBody(item.body || '');
    setFormCategory(item.category || 'general');

    const period = item.hour >= 12 ? 'PM' : 'AM';
    const h12 = item.hour % 12 === 0 ? 12 : item.hour % 12;
    setFormHour12(h12.toString());
    setFormMinute(item.minute.toString().padStart(2, '0'));
    setFormPeriod(period);
    setFormRepeatMode(item.repeatMode || 'daily');
    setFormWeekday(item.weekday || 2);
    setModalVisible(true);
  }

  async function handleSaveReminder() {
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('Title Required', 'Please enter a name for the reminder.');
      return;
    }

    const hrNum = parseInt(formHour12, 10);
    const minNum = parseInt(formMinute, 10);

    if (isNaN(hrNum) || hrNum < 1 || hrNum > 12) {
      Alert.alert('Invalid Hour', 'Please enter an hour between 1 and 12.');
      return;
    }
    if (isNaN(minNum) || minNum < 0 || minNum > 59) {
      Alert.alert('Invalid Minute', 'Please enter minutes between 00 and 59.');
      return;
    }

    // Convert to 24-hour format
    let hour24 = hrNum;
    if (formPeriod === 'AM') {
      hour24 = hrNum === 12 ? 0 : hrNum;
    } else {
      hour24 = hrNum === 12 ? 12 : hrNum + 12;
    }

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (editingId) {
      await updateUserReminder(editingId, {
        title: trimmedTitle,
        body: formBody.trim(),
        category: formCategory,
        hour: hour24,
        minute: minNum,
        repeatMode: formRepeatMode,
        weekday: formRepeatMode === 'weekly' ? formWeekday : undefined,
      });
      setStatusMessage('Reminder updated!');
    } else {
      await createUserReminder({
        title: trimmedTitle,
        body: formBody.trim(),
        category: formCategory,
        hour: hour24,
        minute: minNum,
        repeatMode: formRepeatMode,
        weekday: formRepeatMode === 'weekly' ? formWeekday : undefined,
        enabled: true,
      });
      setStatusMessage('Reminder created!');
    }

    setModalVisible(false);
    loadReminders();
  }

  async function handleToggle(id: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const newState = await toggleUserReminder(id);
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: newState } : r))
    );
    setStatusMessage(newState ? 'Reminder activated' : 'Reminder paused');
  }

  async function handleDelete(id: string, title: string) {
    Alert.alert(
      'Delete Reminder',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            await deleteUserReminder(id);
            setReminders((prev) => prev.filter((r) => r.id !== id));
            setStatusMessage('Reminder deleted');
          },
        },
      ]
    );
  }

  async function handleQuickTimer(minutes: number, label: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await scheduleRelativeReminder('✨ Buddy Timer', label, minutes * 60);
    setStatusMessage(`Timer set for ${minutes} mins!`);
    loadReminders();
  }

  async function handleAddPreset(preset: typeof QUICK_PRESETS[0]) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await createUserReminder({
      title: preset.title,
      body: preset.body,
      category: preset.category,
      hour: preset.hour,
      minute: preset.minute,
      repeatMode: preset.repeat,
      enabled: true,
    });
    setStatusMessage(`Added "${preset.title}"!`);
    loadReminders();
  }

  async function handleClearAll() {
    Alert.alert('Clear All Reminders', 'Are you sure you want to cancel and remove all scheduled reminders?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          await clearAllUserReminders();
          setReminders([]);
          setStatusMessage('All reminders cleared');
        },
      },
    ]);
  }

  async function handleSendTest() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await sendInstantLocalNotification(
      '✨ Buddy Test Alert',
      'System notification delivery is working properly!'
    );
    setStatusMessage('Test notification sent!');
  }

  // Filter reminders
  const filteredReminders = reminders.filter((r) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'daily') return r.repeatMode === 'daily';
    if (filterMode === 'weekdays') return r.repeatMode === 'weekdays';
    if (filterMode === 'once') return r.repeatMode === 'once';
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Material 3 App Bar with Back Navigation */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surfaceContainer,
            borderBottomColor: colors.outlineVariant,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onBack();
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.topBarTitleWrapper}>
          <Text style={[styles.topBarTitle, { color: colors.onSurface }]} numberOfLines={1}>
            Reminders & Alerts
          </Text>
          <Text style={[styles.topBarSubtitle, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
            Custom schedules • Repeating habits
          </Text>
        </View>

        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={[
              styles.testPingBtn,
              { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
            ]}
            onPress={handleSendTest}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="bell-ring-outline" size={16} color={colors.primary} />
            <Text style={[styles.testPingText, { color: colors.primary }]}>Test</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission Notice (only if disabled) */}
        {!permGranted && (
          <View
            style={[
              styles.permCard,
              { backgroundColor: `${colors.error}15`, borderColor: `${colors.error}40` },
            ]}
          >
            <View style={styles.permIconBox}>
              <MaterialCommunityIcons name="bell-off-outline" size={22} color={colors.error} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.permTitle, { color: colors.error }]}>Notifications Disabled</Text>
              <Text style={[styles.permSubtitle, { color: colors.onSurfaceVariant }]}>
                Enable notifications to receive habit alerts and reminders.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.enableBtn, { backgroundColor: colors.error }]}
              onPress={handleRequestPermission}
            >
              <Text style={[styles.enableBtnText, { color: colors.onError }]}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Header: Create Button & Filter Chips */}
        <View style={styles.actionHeaderRow}>
          <TouchableOpacity
            style={[styles.addReminderBtn, { backgroundColor: colors.primary }]}
            onPress={openCreateModal}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
            <Text style={[styles.addReminderBtnText, { color: colors.onPrimary }]}>Add Reminder</Text>
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(['all', 'daily', 'weekdays', 'once'] as const).map((mode) => {
              const active = filterMode === mode;
              const count =
                mode === 'all'
                  ? reminders.length
                  : reminders.filter((r) => r.repeatMode === mode).length;

              return (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.filterChip,
                    active
                      ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                      : { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
                  ]}
                  onPress={() => setFilterMode(mode)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                    ]}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Reminders List */}
        <View style={styles.sectionHeaderRowBetween}>
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>
            SCHEDULED REMINDERS ({filteredReminders.length})
          </Text>
          {reminders.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
              <Text style={[styles.clearAllText, { color: colors.error }]}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : filteredReminders.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
            ]}
          >
            <MaterialCommunityIcons name="bell-sleep-outline" size={40} color={colors.outline} />
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>No Reminders Found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
              Tap "Add Reminder" to schedule a recurring habit or one-time alert.
            </Text>
          </View>
        ) : (
          <View style={styles.reminderListContainer}>
            {filteredReminders.map((item) => {
              const icon = getCategoryIcon(item.category || 'general');
              const repeatLabel = getRepeatLabel(item.repeatMode, item.weekday);
              const timeDisplay = formatTimeDisplay(item.hour, item.minute);

              return (
                <View
                  key={item.id}
                  style={[
                    styles.reminderCard,
                    {
                      backgroundColor: colors.surfaceContainer,
                      borderColor: colors.outlineVariant,
                      opacity: item.enabled ? 1 : 0.65,
                    },
                  ]}
                >
                  <View style={styles.reminderCardTop}>
                    <View
                      style={[
                        styles.reminderIconBox,
                        { backgroundColor: `${colors.primary}15` },
                      ]}
                    >
                      <MaterialCommunityIcons name={icon as any} size={20} color={colors.primary} />
                    </View>

                    <View style={styles.reminderInfo}>
                      <Text style={[styles.reminderTitle, { color: colors.onSurface }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {!!item.body && (
                        <Text style={[styles.reminderBody, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                          {item.body}
                        </Text>
                      )}

                      <View style={styles.reminderMetaRow}>
                        <Text style={[styles.reminderTimeText, { color: colors.primary }]}>
                          {timeDisplay}
                        </Text>
                        <View
                          style={[
                            styles.repeatBadge,
                            { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={
                              item.repeatMode === 'daily'
                                ? 'calendar-sync'
                                : item.repeatMode === 'weekdays'
                                ? 'briefcase-outline'
                                : item.repeatMode === 'once'
                                ? 'timer-outline'
                                : 'calendar-week'
                            }
                            size={12}
                            color={colors.onSurfaceVariant}
                          />
                          <Text style={[styles.repeatBadgeText, { color: colors.onSurfaceVariant }]}>
                            {repeatLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Status Toggle Switch */}
                    <Switch
                      value={item.enabled}
                      onValueChange={() => handleToggle(item.id)}
                      trackColor={{ false: colors.surfaceContainerHighest, true: `${colors.primary}77` }}
                      thumbColor={item.enabled ? colors.primary : colors.outline}
                    />
                  </View>

                  {/* Card Bottom Actions */}
                  <View style={[styles.cardActionsRow, { borderTopColor: colors.outlineVariant }]}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openEditModal(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.onSurfaceVariant} />
                      <Text style={[styles.cardActionText, { color: colors.onSurfaceVariant }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => handleDelete(item.id, item.title)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={colors.error} />
                      <Text style={[styles.cardActionText, { color: colors.error }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Quick Suggestion Presets */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>QUICK HABIT PRESETS</Text>
        </View>
        <View
          style={[
            styles.presetGroupCard,
            { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
          ]}
        >
          {QUICK_PRESETS.map((p, idx) => (
            <View key={p.title}>
              {idx > 0 && <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />}
              <View style={styles.presetRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.presetTitle, { color: colors.onSurface }]}>{p.title}</Text>
                  <Text style={[styles.presetSub, { color: colors.onSurfaceVariant }]}>
                    {formatTimeDisplay(p.hour, p.minute)} • {getRepeatLabel(p.repeat)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.presetAddBtn,
                    { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                  ]}
                  onPress={() => handleAddPreset(p)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="plus" size={14} color={colors.primary} />
                  <Text style={[styles.presetAddBtnText, { color: colors.primary }]}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* One-Tap Relative Timers */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>QUICK COUNTDOWN TIMERS</Text>
        </View>
        <View style={styles.timerPillsRow}>
          {[
            { mins: 15, label: '15m Focus' },
            { mins: 30, label: '30m Break' },
            { mins: 60, label: '1h Task' },
            { mins: 120, label: '2h Check' },
          ].map((t) => (
            <TouchableOpacity
              key={t.mins}
              style={[
                styles.timerPill,
                { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
              ]}
              onPress={() => handleQuickTimer(t.mins, t.label)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="timer-sand" size={14} color={colors.primary} />
              <Text style={[styles.timerPillText, { color: colors.onSurface }]}>+{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Create / Edit Reminder Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                {editingId ? 'Edit Reminder' : 'New Reminder'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseBtn}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* Title Input */}
              <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant }]}>TITLE</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceContainerHighest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  },
                ]}
                placeholder="e.g. Drink Water, Gym Workout..."
                placeholderTextColor={colors.outline}
                value={formTitle}
                onChangeText={setFormTitle}
              />

              {/* Note / Body Input */}
              <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant, marginTop: 12 }]}>
                OPTIONAL NOTE
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceContainerHighest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  },
                ]}
                placeholder="Short description or reminder details..."
                placeholderTextColor={colors.outline}
                value={formBody}
                onChangeText={setFormBody}
              />

              {/* Category Picker */}
              <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant, marginTop: 14 }]}>
                CATEGORY
              </Text>
              <View style={styles.chipGridRow}>
                {CATEGORY_OPTIONS.map((cat) => {
                  const isSel = formCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.selectChip,
                        isSel
                          ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                          : { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                      ]}
                      onPress={() => setFormCategory(cat.id)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name={cat.icon as any}
                        size={14}
                        color={isSel ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                      />
                      <Text
                        style={[
                          styles.selectChipText,
                          { color: isSel ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Time Picker (Hour : Minute + AM/PM) */}
              <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant, marginTop: 14 }]}>
                SCHEDULED TIME
              </Text>
              <View style={styles.timePickerContainer}>
                <View style={styles.timeInputBox}>
                  <TextInput
                    style={[
                      styles.timeDigitInput,
                      {
                        backgroundColor: colors.surfaceContainerHighest,
                        borderColor: colors.outlineVariant,
                        color: colors.onSurface,
                      },
                    ]}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={formHour12}
                    onChangeText={setFormHour12}
                  />
                  <Text style={[styles.timeColon, { color: colors.onSurface }]}>:</Text>
                  <TextInput
                    style={[
                      styles.timeDigitInput,
                      {
                        backgroundColor: colors.surfaceContainerHighest,
                        borderColor: colors.outlineVariant,
                        color: colors.onSurface,
                      },
                    ]}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={formMinute}
                    onChangeText={setFormMinute}
                  />
                </View>

                {/* AM / PM Toggle */}
                <View
                  style={[
                    styles.ampmToggle,
                    { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.ampmBtn,
                      formPeriod === 'AM' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setFormPeriod('AM')}
                  >
                    <Text
                      style={[
                        styles.ampmText,
                        { color: formPeriod === 'AM' ? colors.onPrimary : colors.onSurfaceVariant },
                      ]}
                    >
                      AM
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.ampmBtn,
                      formPeriod === 'PM' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setFormPeriod('PM')}
                  >
                    <Text
                      style={[
                        styles.ampmText,
                        { color: formPeriod === 'PM' ? colors.onPrimary : colors.onSurfaceVariant },
                      ]}
                    >
                      PM
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Quick Time Preset Buttons */}
              <View style={styles.quickTimeRow}>
                {[
                  { label: '08:00 AM', h: '8', m: '00', p: 'AM' as const },
                  { label: '01:00 PM', h: '1', m: '00', p: 'PM' as const },
                  { label: '06:00 PM', h: '6', m: '00', p: 'PM' as const },
                  { label: '08:30 PM', h: '8', m: '30', p: 'PM' as const },
                ].map((qt) => (
                  <TouchableOpacity
                    key={qt.label}
                    style={[
                      styles.quickTimeChip,
                      { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                    ]}
                    onPress={() => {
                      setFormHour12(qt.h);
                      setFormMinute(qt.m);
                      setFormPeriod(qt.p);
                    }}
                  >
                    <Text style={[styles.quickTimeText, { color: colors.primary }]}>{qt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Repeat Options */}
              <Text style={[styles.modalLabel, { color: colors.onSurfaceVariant, marginTop: 14 }]}>
                REPEAT SCHEDULE
              </Text>
              <View style={styles.chipGridRow}>
                {REPEAT_OPTIONS.map((opt) => {
                  const isSel = formRepeatMode === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.selectChip,
                        isSel
                          ? { backgroundColor: colors.primaryContainer, borderColor: colors.primary }
                          : { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                      ]}
                      onPress={() => setFormRepeatMode(opt.id)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name={opt.icon as any}
                        size={14}
                        color={isSel ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                      />
                      <Text
                        style={[
                          styles.selectChipText,
                          { color: isSel ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Weekday Selector (when Weekly is selected) */}
              {formRepeatMode === 'weekly' && (
                <View style={styles.weekdayPickerRow}>
                  {WEEKDAY_NAMES.map((wd) => {
                    const isSel = formWeekday === wd.day;
                    return (
                      <TouchableOpacity
                        key={wd.day}
                        style={[
                          styles.weekdayCircle,
                          isSel
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                        ]}
                        onPress={() => setFormWeekday(wd.day)}
                      >
                        <Text
                          style={[
                            styles.weekdayCircleText,
                            { color: isSel ? colors.onPrimary : colors.onSurfaceVariant },
                          ]}
                        >
                          {wd.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* Modal Bottom Action Buttons */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[
                  styles.modalCancelBtn,
                  { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                ]}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelBtnText, { color: colors.onSurfaceVariant }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveReminder}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalSaveBtnText, { color: colors.onPrimary }]}>
                  {editingId ? 'Update Reminder' : 'Save Reminder'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Snackbar Toast */}
      <Snackbar
        visible={!!statusMessage}
        onDismiss={() => setStatusMessage('')}
        duration={3000}
        style={{ backgroundColor: colors.surfaceContainerHighest }}
      >
        <Text style={{ color: colors.onSurface }}>{statusMessage}</Text>
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleWrapper: {
    flex: 1,
    marginHorizontal: 8,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topBarSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testPingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  testPingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  permIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  permSubtitle: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  enableBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  enableBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionHeaderRow: {
    marginBottom: 16,
    gap: 12,
  },
  addReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  addReminderBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    marginBottom: 8,
    marginTop: 18,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  reminderListContainer: {
    gap: 10,
    marginBottom: 16,
  },
  reminderCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  reminderCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  reminderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  reminderBody: {
    fontSize: 12,
    marginTop: 2,
  },
  reminderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  reminderTimeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  presetGroupCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  presetTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  presetSub: {
    fontSize: 12,
    marginTop: 2,
  },
  presetAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
  },
  timerPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  timerPillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  chipGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeDigitInput: {
    width: 60,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  timeColon: {
    fontSize: 24,
    fontWeight: '800',
  },
  ampmToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
  },
  ampmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
  },
  ampmText: {
    fontSize: 13,
    fontWeight: '800',
  },
  quickTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickTimeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickTimeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weekdayPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  weekdayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekdayCircleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
