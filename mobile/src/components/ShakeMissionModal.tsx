import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Vibration,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { md3Colors, md3Typography } from '../theme';
import {
  AlarmItem,
  getShakeTargetCount,
  subscribeAccelerometerShakes,
  subscribePedometerSteps,
} from '../services/alarms';

interface ShakeMissionModalProps {
  visible: boolean;
  alarm: AlarmItem | null;
  onDismissMission: () => void;
}

export default function ShakeMissionModal({
  visible,
  alarm,
  onDismissMission,
}: ShakeMissionModalProps) {
  const [count, setCount] = useState(0);
  const [completed, setCompleted] = useState(false);

  const missionType = alarm?.missionType || 'shake';
  const shakeDifficulty = alarm?.shakeDifficulty || 'medium';
  const targetCount =
    missionType === 'shake'
      ? getShakeTargetCount(shakeDifficulty)
      : alarm?.targetWalkSteps || 20;

  useEffect(() => {
    if (!visible || !alarm) {
      setCount(0);
      setCompleted(false);
      return;
    }

    setCount(0);
    setCompleted(false);

    try {
      Vibration.vibrate([0, 500, 500, 500], true);
    } catch (_) {}

    let unsubscribe: () => void = () => {};

    if (missionType === 'shake') {
      subscribeAccelerometerShakes((currentShakes) => {
        setCount(currentShakes);
        try {
          Vibration.vibrate(80);
        } catch (_) {}

        if (currentShakes >= targetCount) {
          try {
            Vibration.cancel();
          } catch (_) {}
          setCompleted(true);
        }
      }, 1.3).then((unsub) => {
        if (unsub) unsubscribe = unsub;
      }).catch(() => {});
    } else if (missionType === 'walk') {
      subscribePedometerSteps((currentSteps) => {
        setCount(currentSteps);
        try {
          Vibration.vibrate(80);
        } catch (_) {}

        if (currentSteps >= targetCount) {
          try {
            Vibration.cancel();
          } catch (_) {}
          setCompleted(true);
        }
      }).then((unsub) => {
        if (unsub) unsubscribe = unsub;
      }).catch(() => {});
    }

    return () => {
      try {
        Vibration.cancel();
      } catch (_) {}
      if (unsubscribe) unsubscribe();
    };
  }, [visible, alarm]);

  function handleManualIncrement() {
    setCount((prev) => {
      const next = prev + 1;
      try {
        Vibration.vibrate(60);
      } catch (_) {}

      if (next >= targetCount) {
        try {
          Vibration.cancel();
        } catch (_) {}
        setCompleted(true);
      }
      return next;
    });
  }

  if (!alarm) return null;

  const progressRatio = Math.min(1, count / targetCount);
  const strokeDashoffset = 314 * (1 - progressRatio);

  const difficultyColors = {
    easy: '#10B981',
    medium: '#F59E0B',
    hard: '#EF4444',
  };

  const activeColor =
    missionType === 'shake'
      ? difficultyColors[shakeDifficulty] || '#6366F1'
      : '#10B981';

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={styles.alarmLabel}>{alarm.label || '⏰ Alarm Ringing'}</Text>
          <Text style={styles.alarmTime}>{alarm.time}</Text>
        </View>

        {!completed ? (
          <View style={styles.missionBody}>
            <View style={styles.iconCircle}>
              <Text style={{ fontSize: 40 }}>{missionType === 'shake' ? '📳' : '🚶'}</Text>
            </View>

            <Text style={styles.missionTitle}>
              {missionType === 'shake' ? 'Shake Your Phone!' : 'Walk 20 Steps!'}
            </Text>
            <Text style={styles.missionDesc}>
              {missionType === 'shake'
                ? `Shake your phone (or tap simulator button below) ${targetCount} times to turn off the alarm.`
                : 'Walk 20 steps (or tap simulator button below) to wake up your body and stop the alarm.'}
            </Text>

            {/* Circular Progress Meter */}
            <View style={styles.svgContainer}>
              <Svg width={140} height={140} viewBox="0 0 120 120">
                <Circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke={md3Colors.surfaceContainerHighest}
                  strokeWidth="10"
                  fill="none"
                />
                <Circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke={activeColor}
                  strokeWidth="10"
                  strokeDasharray="314"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 60 60)"
                />
              </Svg>
              <View style={styles.svgTextOverlay}>
                <Text style={[styles.progressNumber, { color: activeColor }]}>{count}</Text>
                <Text style={styles.progressTotal}>/ {targetCount}</Text>
              </View>
            </View>

            {/* Tap Simulation Button for Expo Go & Direct Testing */}
            <TouchableOpacity
              style={[styles.simButton, { backgroundColor: `${activeColor}25`, borderColor: activeColor }]}
              onPress={handleManualIncrement}
              activeOpacity={0.7}
            >
              <Text style={[styles.simButtonText, { color: activeColor }]}>
                {missionType === 'shake' ? '📳 Tap to Shake +1' : '🚶 Tap to Step +1'}
              </Text>
            </TouchableOpacity>

            {/* Mission Badge */}
            <View style={[styles.badge, { backgroundColor: `${activeColor}15`, borderColor: `${activeColor}30` }]}>
              <Text style={[styles.badgeText, { color: activeColor }]}>
                {missionType === 'shake'
                  ? `📳 Shake Mission (${shakeDifficulty.toUpperCase()})`
                  : '🚶 Walk Mission (20 Steps)'}
              </Text>
            </View>

            {/* Manual Emergency Bypass Button */}
            <TouchableOpacity style={styles.emergencyBtn} onPress={onDismissMission}>
              <Text style={styles.emergencyBtnText}>Emergency Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Completion Celebratory Screen */
          <View style={styles.completedBody}>
            <View style={styles.successIconBox}>
              <Text style={{ fontSize: 48 }}>🎉</Text>
            </View>

            <Text style={styles.successTitle}>Morning Goal Unlocked!</Text>
            <Text style={styles.successDesc}>
              You completed {count} {missionType === 'shake' ? 'shakes' : 'steps'}! Wake-up timestamp logged to your Second Brain timeline.
            </Text>

            <TouchableOpacity style={styles.finishBtn} onPress={onDismissMission}>
              <Text style={styles.finishBtnText}>Start My Day 🚀</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#161822',
  },
  header: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  alarmLabel: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurfaceVariant,
  },
  alarmTime: {
    fontSize: 48,
    fontWeight: '900',
    color: md3Colors.onBackground,
    marginTop: 4,
    letterSpacing: -1,
  },
  missionBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: md3Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  missionTitle: {
    ...md3Typography.headlineMedium,
    color: md3Colors.onBackground,
    fontWeight: '800',
    marginBottom: 4,
  },
  missionDesc: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  svgContainer: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  svgTextOverlay: {
    position: 'absolute',
    alignItems: 'center',
  },
  progressNumber: {
    fontSize: 32,
    fontWeight: '900',
  },
  progressTotal: {
    fontSize: 12,
    color: md3Colors.outline,
    fontWeight: 'bold',
  },
  simButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  simButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  emergencyBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  emergencyBtnText: {
    color: md3Colors.outline,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  completedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    ...md3Typography.headlineMedium,
    color: '#10B981',
    fontWeight: '800',
    marginBottom: 6,
  },
  successDesc: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  finishBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
