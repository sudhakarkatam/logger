import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Safely configure notification handler with modern SDK 57 options
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (_) {
  // Ignored if unsupported on current environment
}

export interface ScheduledNotificationItem {
  id: string;
  title: string;
  body: string;
  hour?: number;
  minute?: number;
}

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
  if (Platform.OS === 'web') {
    console.log('ℹ️ Push notifications are disabled on web preview.');
    return null;
  }
  let token = null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Buddy Reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('⚠️ Failed to get push notification permission');
      return null;
    }

    if (Device.isDevice) {
      try {
        token = (await Notifications.getExpoPushTokenAsync()).data;
        console.log('🔔 Expo Push Token:', token);
      } catch (e) {
        console.log('⚠️ Could not fetch Expo push token:', e);
      }
    }
  } catch (err) {
    console.warn('Notification registration warning:', err);
  }

  return token;
}

// Fetch all currently active scheduled notifications
export async function getAllScheduledReminders(): Promise<ScheduledNotificationItem[]> {
  try {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    return requests.map((req) => {
      const trigger = req.trigger as any;
      return {
        id: req.identifier,
        title: req.content.title || 'Buddy Reminder',
        body: req.content.body || '',
        hour: trigger?.hour,
        minute: trigger?.minute,
      };
    });
  } catch (err) {
    console.warn('Error fetching scheduled notifications:', err);
    return [];
  }
}

// Cancel a specific notification by identifier ID
export async function cancelScheduledReminder(identifier: string): Promise<boolean> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    return true;
  } catch (err) {
    console.warn('Error cancelling notification:', err);
    return false;
  }
}

// Clear all scheduled notifications
export async function cancelAllReminders(): Promise<boolean> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (err) {
    console.warn('Error clearing notifications:', err);
    return false;
  }
}

// Preset Reminders (Morning, Lunch, Evening, Expiry)
export const PRESET_REMINDERS = [
  {
    type: 'morning',
    label: '🌅 Morning Goal Briefing',
    title: '🌅 Morning Goal Briefing',
    body: 'Plan your habits and check your goals for today!',
    hour: 8,
    minute: 0,
  },
  {
    type: 'lunch',
    label: '🍲 Lunchtime Log',
    title: '🍲 Lunchtime Log',
    body: 'Remember to log what you ate for lunch today!',
    hour: 13,
    minute: 0,
  },
  {
    type: 'evening',
    label: '✨ Evening Reflection',
    title: '✨ Evening Reflection Log',
    body: 'Take 30 seconds to log your mood, meals & workout today!',
    hour: 20,
    minute: 30,
  },
  {
    type: 'expiry',
    label: '🍏 Pantry Expiry Warning',
    title: '🍏 Kitchen Pantry Check',
    body: 'Check expiring items in your kitchen pantry for dinner!',
    hour: 18,
    minute: 0,
  },
];

export async function schedulePresetReminder(presetType: string): Promise<boolean> {
  const preset = PRESET_REMINDERS.find((p) => p.type === presetType);
  if (!preset) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: preset.title,
        body: preset.body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: preset.hour,
        minute: preset.minute,
      },
    });

    console.log(`⏰ Preset reminder [${preset.label}] scheduled for ${preset.hour}:${preset.minute.toString().padStart(2, '0')}`);
    return true;
  } catch (err) {
    console.error('Error scheduling preset reminder:', err);
    return false;
  }
}

export async function scheduleCustomReminder(title: string, body: string, hour: number, minute: number): Promise<boolean> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || '✨ Buddy Reminder',
        body: body || 'Time to log your daily reflection!',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });

    console.log(`⏰ Custom reminder scheduled for ${hour}:${minute.toString().padStart(2, '0')}`);
    return true;
  } catch (err) {
    console.error('Error scheduling custom reminder:', err);
    return false;
  }
}

export async function sendInstantLocalNotification(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null, // Send immediately
    });
  } catch (err) {
    console.warn('Local notification error:', err);
  }
}
