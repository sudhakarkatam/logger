import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  StatusBar,
  Platform,
  BackHandler,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import {
  AlarmItem,
  MissionType,
  ShakeDifficulty,
  getStoredAlarms,
  saveStoredAlarms,
  getShakeTargetCount,
} from '../services/alarms';
import ShakeMissionModal from './ShakeMissionModal';
import { Surface, Portal, Modal as PaperModal, Button as PaperButton, Divider } from 'react-native-paper';

interface AlarmHubScreenProps {
  onBack: () => void;
}

const DAYS_KEYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const ALARM_SOUND_TONES = [
  'Basic Ringtone 1 (Bell Sound)',
  'Shoorveer III (Motivational)',
  'Gentle Morning Chimes',
  'Energizing Synth Pulse',
];

const QUICK_ALARM_TIMES = [
  { label: '06:00', hour: 6, minute: 0 },
  { label: '07:00', hour: 7, minute: 0 },
  { label: '08:00', hour: 8, minute: 0 },
  { label: '21:00', hour: 21, minute: 0 },
];

export default function AlarmHubScreen({ onBack }: AlarmHubScreenProps) {
  const insets = useSafeAreaInsets();
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Screen Mode: 'list' | 'editor'
  const [screenMode, setScreenMode] = useState<'list' | 'editor'>('list');

  // Form State for New / Editing Alarm
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [labelInput, setLabelInput] = useState('');
  const [selectedMission, setSelectedMission] = useState<MissionType>('shake');
  const [selectedDifficulty, setSelectedDifficulty] = useState<ShakeDifficulty>('medium');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedSoundTone, setSelectedSoundTone] = useState(ALARM_SOUND_TONES[0]);
  const [customSoundUri, setCustomSoundUri] = useState<string | undefined>(undefined);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showExitConfirmDialog, setShowExitConfirmDialog] = useState(false);
  const [showInlineTimePicker, setShowInlineTimePicker] = useState(false);

  // Active Mission Test Modal State
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [activeTestAlarm, setActiveTestAlarm] = useState<AlarmItem | null>(null);

  useEffect(() => {
    loadAlarms();
  }, []);

  useEffect(() => {
    if (screenMode === 'editor') {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setScreenMode('list');
        return true;
      });
      return () => subscription.remove();
    }
  }, [screenMode]);

  async function loadAlarms() {
    setLoading(true);
    const list = await getStoredAlarms();
    setAlarms(list);
    setLoading(false);
  }

  function getAlarmDate(nextHour: number = hour, nextMinute: number = minute) {
    const date = new Date();
    date.setHours(nextHour, nextMinute, 0, 0);
    return date;
  }

  function applyPickedTime(date: Date) {
    setHour(date.getHours());
    setMinute(date.getMinutes());
  }

  function formatAlarmTime(nextHour: number = hour, nextMinute: number = minute) {
    return getAlarmDate(nextHour, nextMinute).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function adjustAlarmMinutes(delta: number) {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    const next = new Date(getAlarmDate().getTime() + delta * 60 * 1000);
    applyPickedTime(next);
  }

  function handleTimePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowInlineTimePicker(false);
    }

    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }

    applyPickedTime(selectedDate);
  }

  function handleOpenTimePicker() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const value = getAlarmDate();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: true,
        display: 'spinner',
        onChange: handleTimePickerChange,
      });
      return;
    }

    setShowInlineTimePicker((prev) => !prev);
  }

  async function handleToggleAlarm(id: string) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const updated = alarms.map((a) => (a.id === id ? { ...a, isEnabled: !a.isEnabled } : a));
    setAlarms(updated);
    await saveStoredAlarms(updated);
  }

  async function handleDeleteAlarm(id: string) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    Alert.alert('Delete Alarm', 'Are you sure you want to delete this alarm?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = alarms.filter((a) => a.id !== id);
          setAlarms(updated);
          await saveStoredAlarms(updated);
        },
      },
    ]);
  }

  function handleOpenCreateEditor() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setEditingAlarmId(null);
    setHour(7);
    setMinute(0);
    setLabelInput('Wake-Up Call');
    setSelectedMission('shake');
    setSelectedDifficulty('medium');
    setSelectedDays([1, 2, 3, 4, 5]);
    setSoundEnabled(true);
    setSelectedSoundTone(ALARM_SOUND_TONES[0]);
    setCustomSoundUri(undefined);
    setVibrationEnabled(true);
    setShowInlineTimePicker(false);
    setScreenMode('editor');
  }

  function handleOpenEditEditor(alarm: AlarmItem) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setEditingAlarmId(alarm.id);
    setHour(alarm.hour);
    setMinute(alarm.minute);
    setLabelInput(alarm.label);
    setSelectedMission(alarm.missionType);
    setSelectedDifficulty(alarm.shakeDifficulty);
    setSelectedDays(alarm.repeatDays || [1, 2, 3, 4, 5]);
    setSoundEnabled(true);
    setSelectedSoundTone(alarm.soundName || ALARM_SOUND_TONES[0]);
    setCustomSoundUri(alarm.customSoundUri);
    setVibrationEnabled(true);
    setShowInlineTimePicker(false);
    setScreenMode('editor');
  }

  function handleBackFromEditor() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setScreenMode('list');
  }

  function handleConfirmExitEditor() {
    setShowExitConfirmDialog(false);
    setScreenMode('list');
  }

  async function handleSaveAlarm() {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    if (editingAlarmId) {
      const updated = alarms.map((a) =>
        a.id === editingAlarmId
          ? {
              ...a,
              time: timeString,
              hour,
              minute,
              label: labelInput.trim() || 'Wake-Up Call',
              repeatDays: selectedDays,
              missionType: selectedMission,
              shakeDifficulty: selectedDifficulty,
              soundName: selectedSoundTone,
              customSoundUri,
            }
          : a
      );
      setAlarms(updated);
      await saveStoredAlarms(updated);
    } else {
      const newAlarm: AlarmItem = {
        id: `alarm_${Date.now()}`,
        time: timeString,
        hour,
        minute,
        label: labelInput.trim() || 'Wake-Up Call',
        isEnabled: true,
        repeatDays: selectedDays,
        missionType: selectedMission,
        shakeDifficulty: selectedDifficulty,
        targetWalkSteps: 20,
        soundName: selectedSoundTone,
        customSoundUri,
      };
      const updated = [...alarms, newAlarm];
      setAlarms(updated);
      await saveStoredAlarms(updated);
    }

    setScreenMode('list');
  }

  // Feature: Pick Custom Audio Song File from Device Files
  async function pickCustomAudioFile() {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      let DocumentPicker: any;
      try {
        DocumentPicker = require('expo-document-picker');
      } catch (_) {}

      if (DocumentPicker && DocumentPicker.getDocumentAsync) {
        const res = await DocumentPicker.getDocumentAsync({
          type: 'audio/*',
          copyToCacheDirectory: true,
        });

        if (!res.canceled && res.assets && res.assets.length > 0) {
          const selected = res.assets[0];
          setSelectedSoundTone(`🎵 Custom: ${selected.name}`);
          setCustomSoundUri(selected.uri);
          Alert.alert('Custom Song Selected', `Set "${selected.name}" as your alarm sound.`);
        }
      } else {
        // Fallback to ImagePicker media library
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          quality: 1,
        });

        if (!res.canceled && res.assets && res.assets.length > 0) {
          const uri = res.assets[0].uri;
          const fileName = uri.split('/').pop() || 'Custom Audio';
          setSelectedSoundTone(`🎵 Custom: ${fileName}`);
          setCustomSoundUri(uri);
          Alert.alert('Custom Media Selected', `Set "${fileName}" as your alarm sound.`);
        }
      }
    } catch (err: any) {
      Alert.alert('File Picker', 'Could not select audio file from device files.');
    }
  }

  function toggleDay(dayIndex: number) {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    if (selectedDays.includes(dayIndex)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayIndex));
    } else {
      setSelectedDays([...selectedDays, dayIndex].sort());
    }
  }

  function handleTestMission(alarm: AlarmItem) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setActiveTestAlarm(alarm);
    setTestModalVisible(true);
  }

  // Calculate Sleep Duration from 10:30 PM bedtime to alarm time
  function calculateSleepTime() {
    let sleepHours = hour - 22;
    let sleepMins = minute - 30;
    if (sleepMins < 0) {
      sleepMins += 60;
      sleepHours -= 1;
    }
    if (sleepHours < 0) {
      sleepHours += 24;
    }
    return `${sleepHours} hours ${sleepMins} minutes`;
  }

  // Render Days Summary Header for Alarm Item
  function renderDaysSummary(days: number[]) {
    if (!days || days.length === 0) return 'Once';
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'Weekdays';
    if (days.length === 2 && days.includes(6) && days.includes(7)) return 'Weekends';
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      {/* Mode 1: Main Alarms List Screen */}
      {screenMode === 'list' ? (
        <View style={styles.mainWrapper}>
          {/* Top Bar Header */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Wake-Up Calls & Alarms</Text>
            <TouchableOpacity style={styles.addHeaderBtn} onPress={handleOpenCreateEditor}>
              <MaterialCommunityIcons name="plus" size={26} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
            {/* Upcoming Alarm Banner */}
            <Surface style={styles.nextAlarmBanner} elevation={1}>
              <View style={styles.nextAlarmIconBadge}>
                <MaterialCommunityIcons name="bell-ring-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextAlarmTitle}>Next Wake-Up Alarm</Text>
                <Text style={styles.nextAlarmSub}>
                  {alarms.find((a) => a.isEnabled)
                    ? `Scheduled for ${alarms.find((a) => a.isEnabled)?.time}`
                    : 'No active alarms set'}
                </Text>
              </View>
            </Surface>

            {/* Alarms Cards List */}
            <Text style={styles.sectionTitle}>My Scheduled Alarms ({alarms.length})</Text>

            {alarms.map((item) => {
              const summaryText = renderDaysSummary(item.repeatDays);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => handleOpenEditEditor(item)}
                >
                  <Surface style={styles.alarmItemCard} elevation={2}>
                    {/* Top Row: Repeat Summary / Days Indicator */}
                    <View style={styles.alarmCardTopRow}>
                      <Text style={styles.daysSummaryText}>
                        {summaryText ? summaryText : ''}
                      </Text>
                      {/* 7 Days Indicators (Saturday Blue, Sunday Red) */}
                      <View style={styles.miniDaysRow}>
                        {DAYS_KEYS.map((dayLabel, idx) => {
                          const dayNum = idx + 1;
                          const isSelected = (item.repeatDays || []).includes(dayNum);
                          const isSat = dayNum === 6;
                          const isSun = dayNum === 7;
                          return (
                            <Text
                              key={idx}
                              style={[
                                styles.miniDayChar,
                                isSelected && styles.miniDayCharActive,
                                isSelected && isSat && { color: '#3B82F6' },
                                isSelected && isSun && { color: '#EF4444' },
                              ]}
                            >
                              {dayLabel}
                            </Text>
                          );
                        })}
                      </View>

                      {/* Toggle Switch */}
                      <Switch
                        value={item.isEnabled}
                        onValueChange={() => handleToggleAlarm(item.id)}
                        trackColor={{ false: theme.colors.outlineVariant, true: theme.colors.primary }}
                        thumbColor={item.isEnabled ? theme.colors.onPrimary : theme.colors.surface}
                      />
                    </View>

                    {/* Middle Row: Big Time & Mission Badge */}
                    <View style={styles.alarmCardMidRow}>
                      {/* Mission Badge Icon */}
                      <View style={styles.missionIconCircle}>
                        <MaterialCommunityIcons
                          name={item.missionType === 'shake' ? 'cellphone-wireless' : 'gesture-tap'}
                          size={22}
                          color={theme.colors.primary}
                        />
                      </View>

                      {/* Big Digital Time Display */}
                      <Text style={styles.bigTimeText}>{item.time}</Text>
                    </View>

                    {/* Label Chip & Actions */}
                    <View style={styles.labelChipRow}>
                      <View style={styles.labelChip}>
                        <MaterialCommunityIcons name="alarm" size={14} color={theme.colors.primary} />
                        <Text style={styles.labelChipText}>{item.label || 'Wake-Up Call'}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleTestMission(item)}>
                          <MaterialCommunityIcons name="lightning-bolt-outline" size={16} color={theme.colors.primary} />
                          <Text style={[styles.cardActionText, { color: theme.colors.primary }]}>Test</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleDeleteAlarm(item.id)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Surface>
                </TouchableOpacity>
              );
            })}

            {alarms.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="alarm-off" size={48} color={theme.colors.onSurfaceVariant} />
                <Text style={styles.emptyTitle}>No Alarms Created Yet</Text>
                <Text style={styles.emptySub}>Tap the + button to create a new Wake-Up Call alarm with Shake Missions.</Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Floating FAB */}
          <TouchableOpacity style={styles.fabBtn} onPress={handleOpenCreateEditor} activeOpacity={0.85}>
            <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
            <Text style={styles.fabText}>Set Wake-Up Call</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Mode 2: Set Wake-Up Call / Alarm Settings Editor Screen */
        <View style={styles.mainWrapper}>
          {/* Top Bar Header - Back Arrow returns cleanly to Alarms List */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={handleBackFromEditor}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>{editingAlarmId ? 'Edit Wake-Up Call' : 'Set Wake-Up Call'}</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
            {/* Smooth Vertical Time Wheel Picker Capsule */}
            <Surface style={styles.editorCard} elevation={2}>
              <Text style={styles.cardHeaderLabel}>ALARM TIME & SLEEP TIME</Text>

              <TouchableOpacity
                style={styles.timeCapsule}
                onPress={handleOpenTimePicker}
                activeOpacity={0.85}
              >
                <View>
                  <Text style={styles.timeCapsuleLabel}>Alarm time</Text>
                  <Text style={styles.timeCapsuleValue}>{formatAlarmTime()}</Text>
                </View>
                <MaterialCommunityIcons
                  name={showInlineTimePicker ? 'chevron-up' : 'clock-time-four-outline'}
                  size={24}
                  color={theme.colors.primary}
                />
              </TouchableOpacity>

              <View style={styles.timeAdjustRow}>
                <TouchableOpacity style={styles.timeAdjustChip} onPress={() => adjustAlarmMinutes(-15)}>
                  <Text style={styles.timeAdjustText}>-15 min</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.timeAdjustChip} onPress={() => adjustAlarmMinutes(15)}>
                  <Text style={styles.timeAdjustText}>+15 min</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.timeAdjustChip}
                  onPress={() => {
                    if (Platform.OS !== 'web') {
                      Haptics.selectionAsync().catch(() => {});
                    }
                    applyPickedTime(new Date());
                  }}
                >
                  <Text style={styles.timeAdjustText}>Now</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickTimesRow}
              >
                {QUICK_ALARM_TIMES.map((quickTime) => {
                  const isSelected = hour === quickTime.hour && minute === quickTime.minute;
                  return (
                    <TouchableOpacity
                      key={quickTime.label}
                      style={[styles.quickTimeChip, isSelected && styles.quickTimeChipActive]}
                      onPress={() => {
                        if (Platform.OS !== 'web') {
                          Haptics.selectionAsync().catch(() => {});
                        }
                        setHour(quickTime.hour);
                        setMinute(quickTime.minute);
                      }}
                    >
                      <Text
                        style={[styles.quickTimeChipText, isSelected && styles.quickTimeChipTextActive]}
                      >
                        {quickTime.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {Platform.OS !== 'android' && showInlineTimePicker && (
                <View style={styles.inlinePickerCard}>
                  <DateTimePicker
                    value={getAlarmDate()}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    is24Hour
                    onChange={handleTimePickerChange}
                    style={styles.inlinePicker}
                  />
                </View>
              )}

              {/* Sleep Duration Pill */}
              <View style={styles.sleepTimePill}>
                <MaterialCommunityIcons name="bed-clock" size={18} color="#10B981" />
                <Text style={styles.sleepTimeText}>Sleep Time: {calculateSleepTime()}</Text>
              </View>

              {/* Alarm Label Input */}
              <TextInput
                style={styles.labelTextInput}
                placeholder="Alarm Label (e.g. Wake-Up Call)..."
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={labelInput}
                onChangeText={setLabelInput}
              />
            </Surface>

            {/* Repeat Days Card */}
            <Surface style={styles.editorCard} elevation={2}>
              <Text style={styles.cardHeaderLabel}>REPEAT DAYS</Text>

              <View style={styles.repeatDaysRow}>
                {DAYS_KEYS.map((dayChar, idx) => {
                  const dayNum = idx + 1;
                  const isSelected = selectedDays.includes(dayNum);
                  const isSat = dayNum === 6;
                  const isSun = dayNum === 7;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.repeatDayBtn, isSelected && styles.repeatDayBtnSelected]}
                      onPress={() => toggleDay(dayNum)}
                    >
                      <View
                        style={[
                          styles.dotIndicator,
                          isSelected && { backgroundColor: isSat ? '#3B82F6' : isSun ? '#EF4444' : '#FFFFFF' },
                        ]}
                      />
                      <Text
                        style={[
                          styles.repeatDayChar,
                          isSelected && styles.repeatDayCharSelected,
                          isSat && { color: isSelected ? '#3B82F6' : '#3B82F6' },
                          isSun && { color: isSelected ? '#EF4444' : '#EF4444' },
                        ]}
                      >
                        {dayChar}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Surface>

            {/* Mission Selector Card */}
            <Surface style={styles.editorCard} elevation={2}>
              <Text style={styles.cardHeaderLabel}>WAKE-UP MISSION</Text>

              <View style={styles.missionOptionsGrid}>
                {/* Shake Mission */}
                <TouchableOpacity
                  style={[
                    styles.missionTile,
                    selectedMission === 'shake' && styles.missionTileActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                    setSelectedMission('shake');
                  }}
                >
                  <MaterialCommunityIcons
                    name="cellphone-wireless"
                    size={26}
                    color={selectedMission === 'shake' ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <Text style={[styles.missionTileTitle, selectedMission === 'shake' && styles.missionTileTitleActive]}>
                    Shake Phone
                  </Text>
                </TouchableOpacity>

                {/* Touch Mission */}
                <TouchableOpacity
                  style={[
                    styles.missionTile,
                    selectedMission === 'standard' && styles.missionTileActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                    setSelectedMission('standard');
                  }}
                >
                  <MaterialCommunityIcons
                    name="gesture-tap"
                    size={26}
                    color={selectedMission === 'standard' ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <Text style={[styles.missionTileTitle, selectedMission === 'standard' && styles.missionTileTitleActive]}>
                    One Touch
                  </Text>
                </TouchableOpacity>

                {/* Walk Mission */}
                <TouchableOpacity
                  style={[
                    styles.missionTile,
                    selectedMission === 'walk' && styles.missionTileActive,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                    setSelectedMission('walk');
                  }}
                >
                  <MaterialCommunityIcons
                    name="walk"
                    size={26}
                    color={selectedMission === 'walk' ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <Text style={[styles.missionTileTitle, selectedMission === 'walk' && styles.missionTileTitleActive]}>
                    Walk 20 Steps
                  </Text>
                </TouchableOpacity>
              </View>
            </Surface>

            {/* Difficulty Selector Card */}
            {selectedMission === 'shake' && (
              <Surface style={styles.editorCard} elevation={2}>
                <Text style={styles.cardHeaderLabel}>SHAKE DIFFICULTY</Text>

                <View style={styles.diffRow}>
                  {/* Level 1 */}
                  <TouchableOpacity
                    style={[
                      styles.diffCard,
                      selectedDifficulty === 'easy' && styles.diffCardActive,
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                      setSelectedDifficulty('easy');
                    }}
                  >
                    <Text style={styles.diffIcon}>💧</Text>
                    <Text style={styles.diffTitle}>Level 1</Text>
                    <Text style={styles.diffSub}>15 Shakes</Text>
                  </TouchableOpacity>

                  {/* Level 2 */}
                  <TouchableOpacity
                    style={[
                      styles.diffCard,
                      selectedDifficulty === 'medium' && styles.diffCardActive,
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                      setSelectedDifficulty('medium');
                    }}
                  >
                    <Text style={styles.diffIcon}>🔥🔥</Text>
                    <Text style={styles.diffTitle}>Level 2</Text>
                    <Text style={styles.diffSub}>30 Shakes</Text>
                  </TouchableOpacity>

                  {/* Level 3 */}
                  <TouchableOpacity
                    style={[
                      styles.diffCard,
                      selectedDifficulty === 'hard' && styles.diffCardActive,
                    ]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                      setSelectedDifficulty('hard');
                    }}
                  >
                    <Text style={styles.diffIcon}>🔥🔥🔥</Text>
                    <Text style={styles.diffTitle}>Level 3</Text>
                    <Text style={styles.diffSub}>50 Shakes</Text>
                  </TouchableOpacity>
                </View>
              </Surface>
            )}

            {/* Alarm Sound & Custom Files Audio Card */}
            <Surface style={styles.editorCard} elevation={2}>
              <Text style={styles.cardHeaderLabel}>ALARM SOUND & SONGS FROM FILES</Text>

              {/* Sound Toggle */}
              <View style={styles.settingRow}>
                <Text style={styles.settingTitle}>Alarm Sound</Text>
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  trackColor={{ false: theme.colors.outlineVariant, true: '#10B981' }}
                  thumbColor={soundEnabled ? '#FFFFFF' : theme.colors.surface}
                />
              </View>

              {soundEnabled && (
                <View>
                  {/* Preset Ringtone Selector */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tonesScrollRow}>
                    {ALARM_SOUND_TONES.map((tone) => (
                      <TouchableOpacity
                        key={tone}
                        style={[styles.toneChip, selectedSoundTone === tone && styles.toneChipActive]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                          setSelectedSoundTone(tone);
                          setCustomSoundUri(undefined);
                        }}
                      >
                        <Text style={[styles.toneChipText, selectedSoundTone === tone && styles.toneChipTextActive]}>
                          {tone}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Pick Custom Audio Song File Button */}
                  <TouchableOpacity
                    style={styles.pickFileBtn}
                    onPress={pickCustomAudioFile}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="folder-music-outline" size={20} color={theme.colors.primary} />
                    <Text style={styles.pickFileBtnText}>
                      {customSoundUri ? 'Change Custom Song' : 'Select Custom Song / Audio File'}
                    </Text>
                  </TouchableOpacity>

                  {customSoundUri && (
                    <View style={styles.customSongBadge}>
                      <MaterialCommunityIcons name="music-note" size={16} color="#10B981" />
                      <Text style={styles.customSongText} numberOfLines={1}>{selectedSoundTone}</Text>
                    </View>
                  )}
                </View>
              )}

              <Divider style={styles.cardDivider} />

              {/* Vibration Toggle */}
              <View style={styles.settingRow}>
                <Text style={styles.settingTitle}>Vibration</Text>
                <Switch
                  value={vibrationEnabled}
                  onValueChange={setVibrationEnabled}
                  trackColor={{ false: theme.colors.outlineVariant, true: '#10B981' }}
                  thumbColor={vibrationEnabled ? '#FFFFFF' : theme.colors.surface}
                />
              </View>
            </Surface>
          </ScrollView>

          {/* Full-Width Floating Cyan/Teal Save Button */}
          <View style={styles.bottomSaveContainer}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAlarm} activeOpacity={0.85}>
              <Text style={styles.saveBtnText}>Save Alarm</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Exit Confirmation Dialog */}
      <Portal>
        <PaperModal
          visible={showExitConfirmDialog}
          onDismiss={() => setShowExitConfirmDialog(false)}
        >
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>Unsaved Changes</Text>
            <Text style={styles.dialogMsg}>
              Your content will not be saved. Are you sure you want to exit?
            </Text>
            <View style={styles.dialogActions}>
              <PaperButton
                mode="outlined"
                onPress={() => setShowExitConfirmDialog(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </PaperButton>
              <PaperButton
                mode="contained"
                buttonColor="#EF4444"
                textColor="#FFFFFF"
                onPress={handleConfirmExitEditor}
                style={{ flex: 1 }}
              >
                Leave
              </PaperButton>
            </View>
          </View>
        </PaperModal>
      </Portal>

      {/* Shake Mission Execution Test Modal */}
      {activeTestAlarm && (
        <ShakeMissionModal
          visible={testModalVisible}
          alarm={activeTestAlarm}
          onDismissMission={() => setTestModalVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  mainWrapper: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainer,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
  },
  backBtn: {
    padding: theme.spacing.xs,
  },
  topBarTitle: {
    ...theme.typography.headlineMedium,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    fontSize: 18,
  },
  addHeaderBtn: {
    padding: theme.spacing.xs,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 100,
  },
  nextAlarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  nextAlarmIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextAlarmTitle: {
    color: theme.colors.onSurface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  nextAlarmSub: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    color: theme.colors.onBackground,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: theme.spacing.md,
  },
  // Alarm Card Item Styles
  alarmItemCard: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  alarmCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  daysSummaryText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
  },
  miniDaysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  miniDayChar: {
    color: theme.colors.outline,
    fontSize: 12,
    fontWeight: 'bold',
  },
  miniDayCharActive: {
    color: theme.colors.onSurface,
  },
  alarmCardMidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginVertical: theme.spacing.xs,
  },
  missionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigTimeText: {
    color: theme.colors.onSurface,
    fontSize: 38,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  labelChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.roundness.md,
    gap: 6,
  },
  labelChipText: {
    color: theme.colors.onSurface,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cardActionText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    color: theme.colors.onSurface,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: theme.spacing.md,
  },
  emptySub: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  fabBtn: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: '#10B981',
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    elevation: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Editor Card Styles
  editorCard: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  cardHeaderLabel: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: theme.spacing.md,
  },
  timeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderRadius: theme.roundness.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  timeCapsuleLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  timeCapsuleValue: {
    color: theme.colors.onSurface,
    fontSize: 34,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  timeAdjustRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  timeAdjustChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerHighest,
    borderRadius: theme.roundness.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  timeAdjustText: {
    color: theme.colors.onSurface,
    fontSize: 13,
    fontWeight: '700',
  },
  quickTimesRow: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  quickTimeChip: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.roundness.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  quickTimeChipActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  quickTimeChipText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '700',
  },
  quickTimeChipTextActive: {
    color: theme.colors.onPrimaryContainer,
  },
  inlinePickerCard: {
    marginTop: theme.spacing.md,
    borderRadius: theme.roundness.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
  },
  inlinePicker: {
    alignSelf: 'stretch',
  },
  sleepTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.roundness.md,
    gap: theme.spacing.xs,
    marginVertical: theme.spacing.md,
  },
  sleepTimeText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: 'bold',
  },
  labelTextInput: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    color: theme.colors.onSurface,
    fontSize: 15,
    borderRadius: theme.roundness.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  repeatDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  repeatDayBtn: {
    alignItems: 'center',
    padding: 8,
  },
  repeatDayBtnSelected: {},
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  repeatDayChar: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 16,
    fontWeight: 'bold',
  },
  repeatDayCharSelected: {
    color: theme.colors.onSurface,
  },
  missionOptionsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  missionTile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerHighest,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.outlineVariant,
  },
  missionTileActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  missionTileTitle: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  missionTileTitleActive: {
    color: theme.colors.onPrimaryContainer,
  },
  diffRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  diffCard: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerHighest,
    padding: theme.spacing.md,
    borderRadius: theme.roundness.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.outlineVariant,
  },
  diffCardActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  diffIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  diffTitle: {
    color: theme.colors.onSurface,
    fontSize: 13,
    fontWeight: 'bold',
  },
  diffSub: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  settingTitle: {
    color: theme.colors.onSurface,
    fontSize: 15,
    fontWeight: 'bold',
  },
  tonesScrollRow: {
    gap: 8,
    marginVertical: theme.spacing.sm,
  },
  toneChip: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.roundness.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  toneChipActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  toneChipText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
  },
  toneChipTextActive: {
    color: theme.colors.onPrimaryContainer,
    fontWeight: 'bold',
  },
  pickFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingVertical: 12,
    borderRadius: theme.roundness.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    gap: 8,
    marginTop: 4,
  },
  pickFileBtnText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  customSongBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.roundness.md,
    gap: 6,
    marginTop: 8,
  },
  customSongText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: 'bold',
    flex: 1,
  },
  cardDivider: {
    marginVertical: theme.spacing.md,
    backgroundColor: theme.colors.outlineVariant,
  },
  bottomSaveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
  },
  saveBtn: {
    backgroundColor: '#10B981',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dialogBox: {
    backgroundColor: theme.colors.surfaceContainer,
    marginHorizontal: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderRadius: theme.roundness.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  dialogTitle: {
    color: theme.colors.onSurface,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: theme.spacing.xs,
  },
  dialogMsg: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
    marginBottom: theme.spacing.lg,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
});
