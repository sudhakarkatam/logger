import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StreakBadgeProps {
  type: 'exercise' | 'water' | 'sleep';
  streak: number;
}

export default function StreakBadge({ type, streak }: StreakBadgeProps) {
  if (streak <= 0) return null;

  const meta = {
    exercise: { icon: '🔥', label: 'Exercise', bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.3)', text: '#60A5FA' },
    water:    { icon: '💧', label: 'Water',    bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', text: '#38BDF8' },
    sleep:    { icon: '😴', label: 'Sleep >7h', bg: 'rgba(167, 139, 250, 0.12)', border: 'rgba(167, 139, 250, 0.3)', text: '#A78BFA' },
  }[type];

  return (
    <View style={[styles.pill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
      <Text style={[styles.text, { color: meta.text }]}>
        {meta.icon} {meta.label}: {streak}-day streak!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
