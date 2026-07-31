import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification handler for both foreground and background alerts
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (_) {}

// Ensure Android high-priority notification channel is active immediately
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

export interface ScheduledNotificationItem {
  id: string;
  title: string;
  body: string;
  timeLabel?: string;
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

// Fetch all currently active scheduled notifications
export async function getAllScheduledReminders(): Promise<ScheduledNotificationItem[]> {
  try {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    const now = Date.now();

    return requests.map((req) => {
      const trigger = req.trigger as any;
      const data = req.content.data as any;
      let timeLabel = 'Active Reminder';

      if (data?.targetTimeMs) {
        const targetMs = Number(data.targetTimeMs);
        const targetDate = new Date(targetMs);
        const remainingSecs = Math.max(0, Math.floor((targetMs - now) / 1000));
        const remainingMins = Math.ceil(remainingSecs / 60);
        const formattedTime = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        timeLabel = `${formattedTime} (${remainingMins > 0 ? `in ${remainingMins} mins` : 'due now'})`;
      } else if (trigger) {
        if (trigger.seconds !== undefined || trigger.type === Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL) {
          const secs = trigger.seconds || 0;
          if (secs > 0) {
            const targetDate = new Date(now + secs * 1000);
            const formattedTime = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeLabel = `${formattedTime} (in ${Math.max(1, Math.ceil(secs / 60))} mins)`;
          } else {
            timeLabel = 'Countdown Timer';
          }
        } else if (trigger.hour !== undefined && trigger.minute !== undefined) {
          const hr = trigger.hour.toString().padStart(2, '0');
          const min = trigger.minute.toString().padStart(2, '0');
          timeLabel = `${hr}:${min} Daily`;
        }
      }

      return {
        id: req.identifier,
        title: req.content.title || 'Buddy Reminder',
        body: req.content.body || '',
        timeLabel,
        hour: trigger?.hour,
        minute: trigger?.minute,
      };
    });
  } catch (err) {
    console.warn('Error fetching scheduled notifications:', err);
    return [];
  }
}

export async function cancelScheduledReminder(identifier: string): Promise<boolean> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    return true;
  } catch (err) {
    console.warn('Error cancelling notification:', err);
    return false;
  }
}

export async function cancelAllReminders(): Promise<boolean> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (err) {
    console.warn('Error clearing notifications:', err);
    return false;
  }
}

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
    await registerForPushNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: preset.title,
        body: preset.body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
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
    await registerForPushNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || '✨ Buddy Reminder',
        body: body || 'Time to log your daily reflection!',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
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

export async function scheduleRelativeReminder(title: string, body: string, secondsDelay: number): Promise<boolean> {
  try {
    await registerForPushNotificationsAsync();
    const targetMs = Date.now() + Math.max(1, Math.floor(secondsDelay)) * 1000;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || '✨ Buddy Reminder',
        body: body || 'Time to log your daily reflection!',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { targetTimeMs: targetMs },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.floor(secondsDelay)),
        repeats: false,
      },
    });

    console.log(`⏰ Relative countdown reminder scheduled for ${secondsDelay} seconds (Target: ${new Date(targetMs).toLocaleTimeString()})`);
    return true;
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
      trigger: null, // Instant trigger
    });
  } catch (err) {
    console.warn('Local notification error:', err);
  }
}
