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
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { md3Colors, md3Typography } from '../theme';
import {
  AlarmItem,
  MissionType,
  ShakeDifficulty,
  getStoredAlarms,
  saveStoredAlarms,
  getShakeTargetCount,
} from '../services/alarms';
import ShakeMissionModal from './ShakeMissionModal';
import M3Card from './ui/m3/M3Card';
import M3Button from './ui/m3/M3Button';

interface AlarmHubScreenProps {
  onBack: () => void;
}

const DAYS_MAP = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function AlarmHubScreen({ onBack }: AlarmHubScreenProps) {
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State for New / Editing Alarm
  const [hourInput, setHourInput] = useState('07');
  const [minInput, setMinInput] = useState('00');
  const [labelInput, setLabelInput] = useState('');
  const [selectedMission, setSelectedMission] = useState<MissionType>('shake');
  const [selectedDifficulty, setSelectedDifficulty] = useState<ShakeDifficulty>('medium');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Active Mission Test Modal State
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [activeTestAlarm, setActiveTestAlarm] = useState<AlarmItem | null>(null);

  // Countdown Timer State
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    loadAlarms();
  }, []);

  // Timer Interval Hook
  useEffect(() => {
    let interval: any = null;
    if (timerActive && timerSeconds !== null && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => (prev && prev > 1 ? prev - 1 : 0));
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
      setTimerSeconds(null);
      Alert.alert('⏲️ Timer Complete!', 'Your countdown timer has finished!');
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  async function loadAlarms() {
    setLoading(true);
    const list = await getStoredAlarms();
    setAlarms(list);
    setLoading(false);
  }

  async function handleToggleAlarm(id: string) {
    const updated = alarms.map((a) => (a.id === id ? { ...a, isEnabled: !a.isEnabled } : a));
    setAlarms(updated);
    await saveStoredAlarms(updated);
  }

  async function handleDeleteAlarm(id: string) {
    const updated = alarms.filter((a) => a.id !== id);
    setAlarms(updated);
    await saveStoredAlarms(updated);
  }

  async function handleAddAlarm() {
    const hr = parseInt(hourInput, 10);
    const min = parseInt(minInput, 10);

    if (isNaN(hr) || hr < 0 || hr > 23 || isNaN(min) || min < 0 || min > 59) {
      Alert.alert('Invalid Time', 'Please enter a valid hour (0-23) and minute (0-59).');
      return;
    }

    const timeString = `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    const newAlarm: AlarmItem = {
      id: `alarm_${Date.now()}`,
      time: timeString,
      hour: hr,
      minute: min,
      label: labelInput || '⏰ Buddy Alarm',
      isEnabled: true,
      repeatDays: selectedDays,
      missionType: selectedMission,
      shakeDifficulty: selectedDifficulty,
      targetWalkSteps: 20,
    };

    const updated = [...alarms, newAlarm];
    setAlarms(updated);
    await saveStoredAlarms(updated);

    setLabelInput('');
    Alert.alert('Alarm Created', `Scheduled alarm for ${timeString}.`);
  }

  function toggleDay(dayIndex: number) {
    if (selectedDays.includes(dayIndex)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayIndex));
    } else {
      setSelectedDays([...selectedDays, dayIndex].sort());
    }
  }

  function handleStartTimer(minutes: number) {
    setTimerSeconds(minutes * 60);
    setTimerActive(true);
  }

  function handleCancelTimer() {
    setTimerActive(false);
    setTimerSeconds(null);
  }

  function handleTestMission(alarm: AlarmItem) {
    setActiveTestAlarm(alarm);
    setTestModalVisible(true);
  }

  function formatTimerDisplay(totalSec: number) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E202B" />

      {/* Top Header */}
      <View style={styles.heroHeader}>
        <View style={styles.topAppBarRow}>
          <Text style={styles.topAppBarTitle}>System Alarms & Timers</Text>
        </View>

        <View style={styles.heroTitleRow}>
          <View style={styles.heroIconBadge}>
            <Text style={{ fontSize: 22 }}>⏰</Text>
          </View>
          <View>
            <Text style={styles.heroTitle}>Alarms & Missions</Text>
            <Text style={styles.heroSubtitle}>Google Alarm UI, Shake Missions & Timers</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Quick Countdown Timers Bar */}
        <M3Card variant="filled" style={styles.card}>
          <Text style={styles.cardTitle}>⏲️ Quick Preset Timers</Text>
          <Text style={styles.cardSub}>1-tap countdown timers for tea, naps, or deep focus blocks.</Text>

          {timerActive && timerSeconds !== null ? (
            <View style={styles.activeTimerBox}>
              <Text style={styles.activeTimerText}>{formatTimerDisplay(timerSeconds)}</Text>
              <TouchableOpacity style={styles.cancelTimerBtn} onPress={handleCancelTimer}>
                <Text style={styles.cancelTimerText}>Cancel Timer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.presetTimerRow}>
              <TouchableOpacity style={styles.timerChip} onPress={() => handleStartTimer(5)}>
                <Text style={styles.timerChipText}>⏲️ 5m Tea</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timerChip} onPress={() => handleStartTimer(15)}>
                <Text style={styles.timerChipText}>⏲️ 15m Nap</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timerChip} onPress={() => handleStartTimer(25)}>
                <Text style={styles.timerChipText}>⏲️ 25m Focus</Text>
              </TouchableOpacity>
            </View>
          )}
        </M3Card>

        {/* Active Alarms Queue */}
        <Text style={styles.sectionHeader}>⏰ Scheduled Alarms ({alarms.length})</Text>
        <Text style={styles.sectionSub}>Toggle switches, repeat days, and test shake missions</Text>

        {alarms.map((item) => (
          <View key={item.id} style={styles.alarmCard}>
            <View style={styles.alarmTopRow}>
              <View>
                <Text style={styles.alarmTimeDisplay}>{item.time}</Text>
                <Text style={styles.alarmLabelDisplay}>{item.label}</Text>
              </View>

              <Switch
                value={item.isEnabled}
                onValueChange={() => handleToggleAlarm(item.id)}
                trackColor={{ false: '#3A3D4E', true: '#6366F1' }}
                thumbColor={item.isEnabled ? '#FFFFFF' : '#9CA3AF'}
              />
            </View>

            {/* Repeat Day Selector Pills */}
            <View style={styles.daysRow}>
              {DAYS_MAP.map((dayLabel, idx) => {
                const dayNum = idx + 1;
                const isSelected = (item.repeatDays || []).includes(dayNum);
                return (
                  <View
                    key={idx}
                    style={[styles.dayPill, isSelected && styles.dayPillSelected]}
                  >
                    <Text style={[styles.dayPillText, isSelected && styles.dayPillTextSelected]}>
                      {dayLabel}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Mission Type & Test Controls */}
            <View style={styles.alarmBottomRow}>
              <View style={styles.missionTag}>
                <Text style={styles.missionTagText}>
                  {item.missionType === 'shake'
                    ? `📳 Shake (${getShakeTargetCount(item.shakeDifficulty)})`
                    : item.missionType === 'walk'
                    ? '🚶 Walk (20 Steps)'
                    : '⏰ Standard'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.testBtn} onPress={() => handleTestMission(item)}>
                  <Text style={styles.testBtnText}>⚡ Test Mission</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteAlarm(item.id)}>
                  <Text style={styles.deleteBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {/* Add New Alarm Form Sheet */}
        <M3Card variant="outlined" style={styles.card}>
          <Text style={styles.cardTitle}>➕ Create New Alarm</Text>
          <Text style={styles.cardSub}>Configure alarm time, repeat days, and wake-up mission difficulty.</Text>

          <Text style={styles.fieldLabel}>Alarm Time (24h):</Text>
          <View style={styles.timeRow}>
            <TextInput
              style={styles.timeInput}
              placeholder="07"
              placeholderTextColor={md3Colors.outline}
              keyboardType="number-pad"
              maxLength={2}
              value={hourInput}
              onChangeText={setHourInput}
            />
            <Text style={styles.timeColon}>:</Text>
            <TextInput
              style={styles.timeInput}
              placeholder="00"
              placeholderTextColor={md3Colors.outline}
              keyboardType="number-pad"
              maxLength={2}
              value={minInput}
              onChangeText={setMinInput}
            />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Alarm Label:</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Morning Gym & Stretch"
            placeholderTextColor={md3Colors.outline}
            value={labelInput}
            onChangeText={setLabelInput}
          />

          {/* Repeat Days Selector */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Repeat Days:</Text>
          <View style={styles.daysRow}>
            {DAYS_MAP.map((dayLabel, idx) => {
              const dayNum = idx + 1;
              const isSelected = selectedDays.includes(dayNum);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.dayPill, isSelected && styles.dayPillSelected]}
                  onPress={() => toggleDay(dayNum)}
                >
                  <Text style={[styles.dayPillText, isSelected && styles.dayPillTextSelected]}>
                    {dayLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Mission Selector */}
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Wake-Up Mission Type:</Text>
          <View style={styles.missionTypeRow}>
            <TouchableOpacity
              style={[styles.missionTypeChip, selectedMission === 'shake' && styles.missionTypeChipActive]}
              onPress={() => setSelectedMission('shake')}
            >
              <Text style={[styles.missionTypeChipText, selectedMission === 'shake' && styles.missionTypeChipTextActive]}>
                📳 Shake Mission
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.missionTypeChip, selectedMission === 'walk' && styles.missionTypeChipActive]}
              onPress={() => setSelectedMission('walk')}
            >
              <Text style={[styles.missionTypeChipText, selectedMission === 'walk' && styles.missionTypeChipTextActive]}>
                🚶 Walk Mission
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.missionTypeChip, selectedMission === 'standard' && styles.missionTypeChipActive]}
              onPress={() => setSelectedMission('standard')}
            >
              <Text style={[styles.missionTypeChipText, selectedMission === 'standard' && styles.missionTypeChipTextActive]}>
                ⏰ Standard
              </Text>
            </TouchableOpacity>
          </View>

          {/* Shake Difficulty Selector (If Shake Mission Selected) */}
          {selectedMission === 'shake' && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.fieldLabel}>Shake Difficulty Level:</Text>
              <View style={styles.difficultyRow}>
                {(['easy', 'medium', 'hard'] as ShakeDifficulty[]).map((diff) => (
                  <TouchableOpacity
                    key={diff}
                    style={[
                      styles.diffChip,
                      selectedDifficulty === diff && styles.diffChipActive,
                    ]}
                    onPress={() => setSelectedDifficulty(diff)}
                  >
                    <Text
                      style={[
                        styles.diffChipText,
                        selectedDifficulty === diff && styles.diffChipTextActive,
                      ]}
                    >
                      {diff === 'easy' ? '🟢 Easy (15)' : diff === 'medium' ? '🟡 Med (30)' : '🔴 Hard (50)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <M3Button label="+ Save New Alarm" onPress={handleAddAlarm} variant="filled" style={{ marginTop: 16 }} />
        </M3Card>
      </ScrollView>

      {/* Shake / Walk Mission Ringer Modal */}
      <ShakeMissionModal
        visible={testModalVisible}
        alarm={activeTestAlarm}
        onDismissMission={() => {
          setTestModalVisible(false);
          setActiveTestAlarm(null);
        }}
      />
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
  content: {
    padding: 16,
    paddingBottom: 40,
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
    marginBottom: 14,
  },
  presetTimerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timerChip: {
    flex: 1,
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  timerChipText: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurface,
    fontWeight: 'bold',
  },
  activeTimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: md3Colors.surfaceContainerHighest,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: md3Colors.primary,
  },
  activeTimerText: {
    fontSize: 22,
    fontWeight: '900',
    color: md3Colors.primary,
  },
  cancelTimerBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  cancelTimerText: {
    color: md3Colors.error,
    fontSize: 12,
    fontWeight: 'bold',
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
  alarmCard: {
    backgroundColor: md3Colors.surfaceContainerHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  alarmTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  alarmTimeDisplay: {
    fontSize: 28,
    fontWeight: '900',
    color: md3Colors.onSurface,
  },
  alarmLabelDisplay: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  dayPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: md3Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  dayPillSelected: {
    backgroundColor: md3Colors.primary,
    borderColor: md3Colors.primary,
  },
  dayPillText: {
    fontSize: 10,
    color: md3Colors.outline,
    fontWeight: 'bold',
  },
  dayPillTextSelected: {
    color: '#FFFFFF',
  },
  alarmBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  missionTag: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  missionTagText: {
    color: md3Colors.primary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  testBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  testBtnText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: 'bold',
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  deleteBtnText: {
    fontSize: 12,
  },
  fieldLabel: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 6,
    fontWeight: 'bold',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    color: md3Colors.onSurface,
    width: 48,
    height: 38,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  timeColon: {
    color: md3Colors.onSurface,
    fontSize: 18,
    fontWeight: 'bold',
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
  missionTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  missionTypeChip: {
    flex: 1,
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  missionTypeChipActive: {
    backgroundColor: md3Colors.primaryContainer,
    borderColor: md3Colors.primary,
  },
  missionTypeChipText: {
    fontSize: 10,
    color: md3Colors.onSurfaceVariant,
  },
  missionTypeChipTextActive: {
    color: md3Colors.onPrimaryContainer,
    fontWeight: 'bold',
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 6,
  },
  diffChip: {
    flex: 1,
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  diffChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: md3Colors.primary,
  },
  diffChipText: {
    fontSize: 10,
    color: md3Colors.onSurfaceVariant,
  },
  diffChipTextActive: {
    color: md3Colors.primary,
    fontWeight: 'bold',
  },
});
