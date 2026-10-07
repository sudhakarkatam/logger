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
  RefreshControl,
  Platform,
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
import { parseNaturalLanguageReminder } from '../services/alarms';
import { Snackbar } from 'react-native-paper';

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

export default function NotificationHubTab() {
  const { colors } = useAppTheme();
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [permGranted, setPermGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [quickInput, setQuickInput] = useState('');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCategory, setFormCategory] = useState<ReminderCategory>('habit');
  const [formHour12, setFormHour12] = useState('8');
  const [formMinute, setFormMinute] = useState('00');
  const [formPeriod, setFormPeriod] = useState<'AM' | 'PM'>('AM');
  const [formRepeatMode, setFormRepeatMode] = useState<RepeatMode>('daily');
  const [formWeekday, setFormWeekday] = useState(2);

  useEffect(() => {
    loadReminders();
  }, []);

  async function loadReminders() {
    setLoading(true);
    const perm = await getNotificationPermissionStatus();
    setPermGranted(perm.granted);
    if (!perm.granted) {
      await registerForPushNotificationsAsync();
    }
    const list = await getUserReminders();
    setReminders(list);
    setLoading(false);
    setRefreshing(false);
  }

  function openCreateModal(initialTitle: string = '') {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setEditingId(null);
    setFormTitle(initialTitle);
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
    Alert.alert('Delete Reminder', `Are you sure you want to delete "${title}"?`, [
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
    ]);
  }

  async function handleQuickNaturalAdd() {
    if (!quickInput.trim()) return;
    const parsed = parseNaturalLanguageReminder(quickInput.trim());

    if (parsed && parsed.isTimeReminder) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const title = parsed.reminderText || quickInput.trim();
      let hour = parsed.targetHour ?? 20;
      let minute = parsed.targetMinute ?? 0;
      if (parsed.minutesDelay) {
        const targetDate = new Date(Date.now() + parsed.minutesDelay * 60 * 1000);
        hour = targetDate.getHours();
        minute = targetDate.getMinutes();
      }

      await createUserReminder({
        title,
        body: 'Created via quick input',
        category: 'general',
        hour,
        minute,
        repeatMode: parsed.minutesDelay ? 'once' : 'daily',
        enabled: true,
      });
      setStatusMessage(`Scheduled "${title}" for ${formatTimeDisplay(hour, minute)}!`);
      setQuickInput('');
      loadReminders();
    } else {
      openCreateModal(quickInput.trim());
      setQuickInput('');
    }
  }

  async function handleQuickTimer(minutes: number, label: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await scheduleRelativeReminder('✨ Buddy Timer', label, minutes * 60);
    setStatusMessage(`Timer set for ${minutes} mins!`);
    loadReminders();
  }

  async function handleClearAll() {
    Alert.alert('Clear All Reminders', 'Are you sure you want to cancel and delete all reminders?', [
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
    setStatusMessage('Test alert sent!');
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadReminders();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.onBackground }]}>Notifications & Reminders</Text>
          <Text style={[styles.subHeading, { color: colors.onSurfaceVariant }]}>
            On-device schedules • Repeat rules • CRUD
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.testBtn, { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant }]}
          onPress={handleSendTest}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="bell-ring-outline" size={16} color={colors.primary} />
          <Text style={[styles.testBtnText, { color: colors.primary }]}>Test Alert</Text>
        </TouchableOpacity>
      </View>

      {/* Permission Warning */}
      {!permGranted && (
        <View style={[styles.permCard, { backgroundColor: `${colors.error}15`, borderColor: colors.error }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
          <Text style={[styles.permText, { color: colors.error }]}>
            System notifications are disabled. Tap Test Alert or check phone settings to grant permission.
          </Text>
        </View>
      )}

      {/* Quick Add Bar */}
      <View
        style={[
          styles.quickInputCard,
          { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
        ]}
      >
        <TextInput
          style={[styles.quickTextInput, { color: colors.onSurface }]}
          placeholder="Quick add (e.g. 'Call mom at 6pm' or 'Drink water')..."
          placeholderTextColor={colors.outline}
          value={quickInput}
          onChangeText={setQuickInput}
          onSubmitEditing={handleQuickNaturalAdd}
        />
        <TouchableOpacity
          style={[styles.quickAddBtn, { backgroundColor: colors.primary }]}
          onPress={handleQuickNaturalAdd}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />
          <Text style={[styles.quickAddBtnText, { color: colors.onPrimary }]}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Add Full Reminder Button */}
      <TouchableOpacity
        style={[
          styles.fullAddBtn,
          { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
        ]}
        onPress={() => openCreateModal()}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="calendar-plus" size={18} color={colors.primary} />
        <Text style={[styles.fullAddBtnText, { color: colors.primary }]}>
          + Create Custom Repeating Reminder
        </Text>
      </TouchableOpacity>

      {/* Active Scheduled Reminders Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>
          SCHEDULED REMINDERS ({reminders.length})
        </Text>
        {reminders.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
            <Text style={[styles.clearAllText, { color: colors.error }]}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Reminders List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : reminders.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
          ]}
        >
          <MaterialCommunityIcons name="bell-sleep-outline" size={36} color={colors.outline} />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>No Active Reminders</Text>
          <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
            Use quick add above or tap Create Custom Reminder to set up alerts.
          </Text>
        </View>
      ) : (
        <View style={styles.reminderList}>
          {reminders.map((item) => {
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
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
                    <MaterialCommunityIcons name={icon as any} size={20} color={colors.primary} />
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={[styles.reminderTitle, { color: colors.onSurface }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {!!item.body && (
                      <Text style={[styles.reminderBody, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                        {item.body}
                      </Text>
                    )}

                    <View style={styles.metaRow}>
                      <Text style={[styles.timeText, { color: colors.primary }]}>{timeDisplay}</Text>
                      <View
                        style={[
                          styles.repeatPill,
                          {
                            backgroundColor: colors.surfaceContainerHighest,
                            borderColor: colors.outlineVariant,
                          },
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
                        <Text style={[styles.repeatPillText, { color: colors.onSurfaceVariant }]}>
                          {repeatLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* On/Off Switch */}
                  <Switch
                    value={item.enabled}
                    onValueChange={() => handleToggle(item.id)}
                    trackColor={{ false: colors.surfaceContainerHighest, true: `${colors.primary}77` }}
                    thumbColor={item.enabled ? colors.primary : colors.outline}
                  />
                </View>

                {/* Edit & Delete Actions */}
                <View style={[styles.actionsRow, { borderTopColor: colors.outlineVariant }]}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => openEditModal(item)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.onSurfaceVariant} />
                    <Text style={[styles.actionBtnText, { color: colors.onSurfaceVariant }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(item.id, item.title)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={15} color={colors.error} />
                    <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Quick Timers */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>QUICK TIMERS</Text>
      </View>
      <View style={styles.timersRow}>
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

      {/* Create / Edit Modal */}
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

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
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
                placeholder="e.g. Drink Water, Evening Journal..."
                placeholderTextColor={colors.outline}
                value={formTitle}
                onChangeText={setFormTitle}
              />

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
                placeholder="Description or extra details..."
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

              {/* Scheduled Time */}
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

                {/* AM/PM */}
                <View
                  style={[
                    styles.ampmToggle,
                    { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.ampmBtn, formPeriod === 'AM' && { backgroundColor: colors.primary }]}
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
                    style={[styles.ampmBtn, formPeriod === 'PM' && { backgroundColor: colors.primary }]}
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

              {/* Repeat Mode */}
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

              {/* Weekday Selector */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subHeading: {
    fontSize: 12,
    marginTop: 2,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  permText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  quickInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  quickTextInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 8,
  },
  quickAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  fullAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  fullAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 8,
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
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3,
  },
  reminderList: {
    gap: 10,
    marginBottom: 16,
  },
  reminderCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  reminderBody: {
    fontSize: 11,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  repeatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  repeatPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timersRow: {
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

  // Modal
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
    marginBottom: 14,
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
