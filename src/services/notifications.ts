import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Notification Handler Setup ──
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (_) {}

// ── Android Notification Channel ──
if (Platform.OS === 'android') {
  try {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Buddy Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    }).catch(() => {});
  } catch (_) {}
}

// ── Data Models ──
export type RepeatMode = 'once' | 'daily' | 'weekdays' | 'weekends' | 'weekly';
export type ReminderCategory = 'habit' | 'health' | 'meal' | 'reflection' | 'general';

export interface ReminderItem {
  id: string;
  title: string;
  body: string;
  category: ReminderCategory;
  hour: number; // 0-23
  minute: number; // 0-59
  repeatMode: RepeatMode;
  weekday?: number; // 1 = Sunday, 2 = Monday ... 7 = Saturday
  enabled: boolean;
  createdAt: number;
  osNotificationIds: string[];
}

export interface ScheduledNotificationItem {
  id: string;
  title: string;
  body: string;
  timeLabel?: string;
  hour?: number;
  minute?: number;
  repeatMode?: RepeatMode;
  category?: ReminderCategory;
  enabled?: boolean;
}

const STORAGE_KEY = '@buddy_user_reminders_v2';

// ── Default Presets ──
export const DEFAULT_PRESETS: Omit<ReminderItem, 'id' | 'createdAt' | 'osNotificationIds'>[] = [
  {
    title: '🌅 Morning Goal Briefing',
    body: 'Plan your habits and check your goals for today!',
    category: 'habit',
    hour: 8,
    minute: 0,
    repeatMode: 'daily',
    enabled: true,
  },
  {
    title: '🍲 Lunchtime Meal Log',
    body: 'Remember to log what you ate for lunch today!',
    category: 'meal',
    hour: 13,
    minute: 0,
    repeatMode: 'daily',
    enabled: true,
  },
  {
    title: '✨ Evening Reflection',
    body: 'Take 30 seconds to log your mood, meals & workout today!',
    category: 'reflection',
    hour: 20,
    minute: 30,
    repeatMode: 'daily',
    enabled: true,
  },
  {
    title: '🍏 Pantry Expiry Check',
    body: 'Check expiring items in your kitchen pantry for dinner!',
    category: 'habit',
    hour: 18,
    minute: 0,
    repeatMode: 'weekdays',
    enabled: false,
  },
];

export const PRESET_REMINDERS = [
  {
    type: 'morning',
    label: '🌅 Morning Goal Briefing',
    title: '🌅 Morning Goal Briefing',
    body: 'Plan your habits and check your goals for today!',
    hour: 8,
    minute: 0,
    repeatMode: 'daily' as RepeatMode,
  },
  {
    type: 'lunch',
    label: '🍲 Lunchtime Log',
    title: '🍲 Lunchtime Log',
    body: 'Remember to log what you ate for lunch today!',
    hour: 13,
    minute: 0,
    repeatMode: 'daily' as RepeatMode,
  },
  {
    type: 'evening',
    label: '✨ Evening Reflection',
    title: '✨ Evening Reflection Log',
    body: 'Take 30 seconds to log your mood, meals & workout today!',
    hour: 20,
    minute: 30,
    repeatMode: 'daily' as RepeatMode,
  },
  {
    type: 'expiry',
    label: '🍏 Pantry Expiry Warning',
    title: '🍏 Kitchen Pantry Check',
    body: 'Check expiring items in your kitchen pantry for dinner!',
    hour: 18,
    minute: 0,
    repeatMode: 'weekdays' as RepeatMode,
  },
];

// ── Time & Label Formatting Helpers ──
export function formatTimeDisplay(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

export function getRepeatLabel(repeatMode: RepeatMode, weekday?: number): string {
  switch (repeatMode) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Mon – Fri';
    case 'weekends':
      return 'Sat – Sun';
    case 'weekly': {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[(weekday || 2) - 1] || 'Weekly';
      return `Every ${dayName}`;
    }
    case 'once':
      return 'Once';
    default:
      return 'Daily';
  }
}

export function getCategoryIcon(category: ReminderCategory): string {
  switch (category) {
    case 'habit':
      return 'target';
    case 'health':
      return 'pill';
    case 'meal':
      return 'food-apple-outline';
    case 'reflection':
      return 'sparkles';
    default:
      return 'bell-outline';
  }
}

// ── Permissions ──
export async function getNotificationPermissionStatus() {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return {
      granted: status === 'granted',
      status,
      canAskAgain,
    };
  } catch (_) {
    return { granted: false, status: 'undetermined', canAskAgain: true };
  }
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  let token = null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Buddy Reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      }).catch(() => {});
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ Notification permissions not granted');
      return null;
    }
  } catch (err) {
    console.warn('Notification registration warning:', err);
  }

  return token;
}

// ── OS Notification Scheduling Logic ──
async function scheduleOSNotifications(reminder: Omit<ReminderItem, 'id' | 'createdAt' | 'osNotificationIds'>): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  await registerForPushNotificationsAsync();

  const ids: string[] = [];
  const content = {
    title: reminder.title,
    body: reminder.body || 'Time for your scheduled Buddy check-in!',
    sound: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  };

  try {
    if (reminder.repeatMode === 'daily') {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: reminder.hour,
          minute: reminder.minute,
        },
      });
      ids.push(id);
    } else if (reminder.repeatMode === 'weekdays') {
      // Weekdays: Monday(2) through Friday(6)
      for (let weekday = 2; weekday <= 6; weekday++) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: reminder.hour,
            minute: reminder.minute,
          },
        });
        ids.push(id);
      }
    } else if (reminder.repeatMode === 'weekends') {
      // Weekends: Saturday(7) and Sunday(1)
      for (const weekday of [7, 1]) {
        const id = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: reminder.hour,
            minute: reminder.minute,
          },
        });
        ids.push(id);
      }
    } else if (reminder.repeatMode === 'weekly') {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: reminder.weekday || 2, // default Monday
          hour: reminder.hour,
          minute: reminder.minute,
        },
      });
      ids.push(id);
    } else {
      // Once: calculate seconds until scheduled time today or tomorrow
      const now = new Date();
      const target = new Date();
      target.setHours(reminder.hour, reminder.minute, 0, 0);
      let diffSecs = Math.floor((target.getTime() - now.getTime()) / 1000);
      if (diffSecs <= 0) {
        diffSecs += 86400; // schedule for tomorrow
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          ...content,
          data: { targetTimeMs: Date.now() + diffSecs * 1000 },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(5, diffSecs),
          repeats: false,
        },
      });
      ids.push(id);
    }
  } catch (err) {
    console.warn('Error scheduling OS notifications for reminder:', err);
  }

  return ids;
}

async function cancelOSNotifications(osNotificationIds: string[]): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const id of osNotificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (_) {}
  }
}

// ── CRUD Storage API ──

// Read all reminders
export async function getUserReminders(): Promise<ReminderItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Initialize with default presets on first run
      const initial: ReminderItem[] = [];
      for (const p of DEFAULT_PRESETS) {
        const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const osNotificationIds = p.enabled ? await scheduleOSNotifications(p) : [];
        initial.push({
          ...p,
          id,
          createdAt: Date.now(),
          osNotificationIds,
        });
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error loading user reminders:', err);
    return [];
  }
}

// Create a new reminder
export async function createUserReminder(
  item: Omit<ReminderItem, 'id' | 'createdAt' | 'osNotificationIds'>
): Promise<ReminderItem> {
  const current = await getUserReminders();
  const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  let osNotificationIds: string[] = [];
  if (item.enabled) {
    osNotificationIds = await scheduleOSNotifications(item);
  }

  const newReminder: ReminderItem = {
    ...item,
    id,
    createdAt: Date.now(),
    osNotificationIds,
  };

  const updated = [newReminder, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newReminder;
}

// Update an existing reminder
export async function updateUserReminder(
  id: string,
  updates: Partial<Omit<ReminderItem, 'id' | 'createdAt' | 'osNotificationIds'>>
): Promise<ReminderItem | null> {
  const current = await getUserReminders();
  const index = current.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const existing = current[index];
  // Cancel previous OS notifications
  if (existing.osNotificationIds && existing.osNotificationIds.length > 0) {
    await cancelOSNotifications(existing.osNotificationIds);
  }

  const merged = { ...existing, ...updates };

  let osNotificationIds: string[] = [];
  if (merged.enabled) {
    osNotificationIds = await scheduleOSNotifications(merged);
  }

  const updatedItem: ReminderItem = {
    ...merged,
    osNotificationIds,
  };

  current[index] = updatedItem;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  return updatedItem;
}

// Delete a reminder
export async function deleteUserReminder(id: string): Promise<boolean> {
  const current = await getUserReminders();
  const existing = current.find((r) => r.id === id);
  if (existing && existing.osNotificationIds) {
    await cancelOSNotifications(existing.osNotificationIds);
  }

  const filtered = current.filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// Toggle enabled status
export async function toggleUserReminder(id: string): Promise<boolean> {
  const current = await getUserReminders();
  const item = current.find((r) => r.id === id);
  if (!item) return false;

  const nextEnabled = !item.enabled;
  if (nextEnabled) {
    const osIds = await scheduleOSNotifications(item);
    item.osNotificationIds = osIds;
    item.enabled = true;
  } else {
    if (item.osNotificationIds) {
      await cancelOSNotifications(item.osNotificationIds);
    }
    item.osNotificationIds = [];
    item.enabled = false;
  }

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  return item.enabled;
}

// Clear all user reminders
export async function clearAllUserReminders(): Promise<boolean> {
  try {
    const current = await getUserReminders();
    for (const item of current) {
      if (item.osNotificationIds) {
        await cancelOSNotifications(item.osNotificationIds);
      }
    }
    if (Platform.OS !== 'web') {
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return true;
  } catch (err) {
    console.warn('Error clearing user reminders:', err);
    return false;
  }
}

// ── Backward Compatibility Adapters ──

export async function getAllScheduledReminders(): Promise<ScheduledNotificationItem[]> {
  const reminders = await getUserReminders();
  return reminders.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    timeLabel: `${formatTimeDisplay(r.hour, r.minute)} • ${getRepeatLabel(r.repeatMode, r.weekday)}`,
    hour: r.hour,
    minute: r.minute,
    repeatMode: r.repeatMode,
    category: r.category,
    enabled: r.enabled,
  }));
}

export async function cancelScheduledReminder(id: string): Promise<boolean> {
  return deleteUserReminder(id);
}

export async function cancelAllReminders(): Promise<boolean> {
  return clearAllUserReminders();
}

export async function schedulePresetReminder(presetType: string): Promise<boolean> {
  const preset = PRESET_REMINDERS.find((p) => p.type === presetType);
  if (!preset) return false;

  const current = await getUserReminders();
  const existing = current.find((r) => r.title.includes(preset.title) || r.title.includes(preset.label));
  if (existing) {
    await toggleUserReminder(existing.id);
    return true;
  }

  await createUserReminder({
    title: preset.title,
    body: preset.body,
    category: 'habit',
    hour: preset.hour,
    minute: preset.minute,
    repeatMode: preset.repeatMode || 'daily',
    enabled: true,
  });
  return true;
}

export async function scheduleCustomReminder(
  title: string,
  body: string,
  hour: number,
  minute: number,
  repeatMode: RepeatMode = 'daily'
): Promise<boolean> {
  await createUserReminder({
    title: title || '✨ Buddy Reminder',
    body: body || 'Time for your daily reflection!',
    category: 'general',
    hour,
    minute,
    repeatMode,
    enabled: true,
  });
  return true;
}

export async function scheduleRelativeReminder(title: string, body: string, secondsDelay: number): Promise<boolean> {
  try {
    await registerForPushNotificationsAsync();
    const targetMs = Date.now() + Math.max(1, Math.floor(secondsDelay)) * 1000;
    const targetDate = new Date(targetMs);

    const reminder = await createUserReminder({
      title: title || '✨ Buddy Reminder',
      body: body || 'Quick timer reminder',
      category: 'general',
      hour: targetDate.getHours(),
      minute: targetDate.getMinutes(),
      repeatMode: 'once',
      enabled: true,
    });

    return !!reminder;
  } catch (err) {
    console.error('Error scheduling relative reminder:', err);
    return false;
  }
}

export async function sendInstantLocalNotification(title: string, body: string) {
  try {
    await registerForPushNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('Local notification error:', err);
  }
}
