import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { sendInstantLocalNotification } from './notifications';

export type MissionType = 'standard' | 'shake' | 'walk';
export type ShakeDifficulty = 'easy' | 'medium' | 'hard';

export interface AlarmItem {
  id: string;
  time: string; // "07:00"
  hour: number;
  minute: number;
  label: string;
  isEnabled: boolean;
  repeatDays: number[]; // [1,2,3,4,5] (1 = Mon, 7 = Sun)
  missionType: MissionType;
  shakeDifficulty: ShakeDifficulty; // easy = 15, medium = 30, hard = 50
  targetWalkSteps: number; // e.g. 20
  soundName?: string;
}

const ALARMS_STORAGE_KEY = '@buddy_alarms_list_v1';

export const DEFAULT_ALARMS: AlarmItem[] = [
  {
    id: 'alarm_default_1',
    time: '07:00',
    hour: 7,
    minute: 0,
    label: '🌅 Morning Wake-Up',
    isEnabled: true,
    repeatDays: [1, 2, 3, 4, 5],
    missionType: 'shake',
    shakeDifficulty: 'medium', // 30 shakes
    targetWalkSteps: 20,
  },
  {
    id: 'alarm_default_2',
    time: '20:30',
    hour: 20,
    minute: 30,
    label: '✨ Evening Reflection Log',
    isEnabled: true,
    repeatDays: [1, 2, 3, 4, 5, 6, 7],
    missionType: 'standard',
    shakeDifficulty: 'easy',
    targetWalkSteps: 20,
  },
];

export async function getStoredAlarms(): Promise<AlarmItem[]> {
  try {
    const raw = await AsyncStorage.getItem(ALARMS_STORAGE_KEY);
    if (!raw) {
      await AsyncStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(DEFAULT_ALARMS));
      return DEFAULT_ALARMS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error loading alarms:', err);
    return DEFAULT_ALARMS;
  }
}

export async function saveStoredAlarms(alarms: AlarmItem[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
    await syncAlarmNotifications(alarms);
    return true;
  } catch (err) {
    console.error('Error saving alarms:', err);
    return false;
  }
}

export async function syncAlarmNotifications(alarms: AlarmItem[]) {
  try {
    for (const alarm of alarms) {
      if (alarm.isEnabled) {
        await Notifications.scheduleNotificationAsync({
          identifier: `buddy_alarm_${alarm.id}`,
          content: {
            title: `⏰ ${alarm.label || 'Buddy Alarm'}`,
            body:
              alarm.missionType === 'shake'
                ? `📳 Shake Mission Required (${getShakeTargetCount(alarm.shakeDifficulty)} Shakes)!`
                : alarm.missionType === 'walk'
                ? '🚶 Walk Mission Required (20 Steps)!'
                : 'Time to wake up and start your day!',
            sound: true,
            data: { alarmId: alarm.id, missionType: alarm.missionType },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: alarm.hour,
            minute: alarm.minute,
          },
        });
      } else {
        await Notifications.cancelScheduledNotificationAsync(`buddy_alarm_${alarm.id}`).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Error syncing alarm notifications:', err);
  }
}

export function getShakeTargetCount(difficulty: ShakeDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 15;
    case 'medium':
      return 30;
    case 'hard':
      return 50;
    default:
      return 30;
  }
}

// Subscribe to Accelerometer using isAvailableAsync
export async function subscribeAccelerometerShakes(
  onShake: (count: number) => void,
  threshold: number = 1.3
) {
  let shakeCounter = 0;
  let lastShakeTime = 0;

  try {
    const Sensors = require('expo-sensors');
    if (Sensors && Sensors.Accelerometer) {
      const available = await Sensors.Accelerometer.isAvailableAsync().catch(() => false);
      if (available) {
        Sensors.Accelerometer.setUpdateInterval(100);
        const subscription = Sensors.Accelerometer.addListener(({ x, y, z }: any) => {
          const gForce = Math.sqrt(x * x + y * y + z * z);
          const now = Date.now();

          if (gForce > threshold && now - lastShakeTime > 220) {
            lastShakeTime = now;
            shakeCounter += 1;
            onShake(shakeCounter);
          }
        });

        return () => {
          try {
            subscription?.remove();
          } catch (_) {}
        };
      }
    }
  } catch (err) {
    console.log('ℹ️ Accelerometer sensor error:', err);
  }

  return () => {};
}

// Subscribe to Pedometer step counter using isAvailableAsync
export async function subscribePedometerSteps(onStep: (steps: number) => void) {
  try {
    const Sensors = require('expo-sensors');
    if (Sensors && Sensors.Pedometer) {
      const available = await Sensors.Pedometer.isAvailableAsync().catch(() => false);
      if (available) {
        let startSteps = 0;
        const subscription = Sensors.Pedometer.watchStepCount((result: any) => {
          if (startSteps === 0) startSteps = result.steps;
          const count = Math.max(0, result.steps - startSteps);
          onStep(count);
        });

        return () => {
          try {
            subscription?.remove();
          } catch (_) {}
        };
      }
    }
  } catch (err) {
    console.log('ℹ️ Pedometer sensor error:', err);
  }

  return () => {};
}

// Natural Language Time Parser ("Remind me in 10 mins to...")
export interface ParsedTimeReminder {
  isTimeReminder: boolean;
  minutesDelay?: number;
  targetHour?: number;
  targetMinute?: number;
  reminderText?: string;
}

export function parseNaturalLanguageReminder(text: string): ParsedTimeReminder {
  const lower = text.toLowerCase().trim();

  // 1. Matches relative time: "in 2 mins", "2 min", "remind me in 5 minutes to...", "in 2 min check oven"
  const relativeMatch = lower.match(/(?:remind\s+(?:me\s+)?in\s+|in\s+|^)(\d+)\s*(mins?|minutes?|hours?|hrs?)\s*(to|for|about)?\s*(.*)/i);
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    let reminderText = relativeMatch[4] ? relativeMatch[4].trim() : text;

    // Clean leading prepositions
    reminderText = reminderText.replace(/^(to|for|about)\s+/i, '');
    if (!reminderText) reminderText = text;

    let minutesDelay = num;
    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      minutesDelay = num * 60;
    }

    return {
      isTimeReminder: true,
      minutesDelay,
      reminderText: reminderText.charAt(0).toUpperCase() + reminderText.slice(1),
    };
  }

  // 2. Matches exact time: "at 5pm", "remind me at 17:30 to..."
  const exactMatch = lower.match(/(?:remind\s+(?:me\s+)?at\s+|at\s+)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(to|for|about)?\s*(.*)/i);
  if (exactMatch) {
    let hr = parseInt(exactMatch[1], 10);
    const min = exactMatch[2] ? parseInt(exactMatch[2], 10) : 0;
    const ampm = exactMatch[3];
    let reminderText = exactMatch[5] ? exactMatch[5].trim() : text;

    reminderText = reminderText.replace(/^(to|for|about)\s+/i, '');
    if (!reminderText) reminderText = text;

    if (ampm === 'pm' && hr < 12) hr += 12;
    if (ampm === 'am' && hr === 12) hr = 0;

    return {
      isTimeReminder: true,
      targetHour: hr,
      targetMinute: min,
      reminderText: reminderText.charAt(0).toUpperCase() + reminderText.slice(1),
    };
  }

  return { isTimeReminder: false };
}
