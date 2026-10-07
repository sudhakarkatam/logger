import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { md3Colors, md3Typography } from '../../../theme';

interface M3FABProps {
  icon: string;
  label?: string;
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
}

export default function M3FAB({ icon, label, onPress, style }: M3FABProps) {
  return (
    <TouchableOpacity style={[styles.fab, label ? styles.extendedFab : styles.standardFab, style]} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.icon}>{icon}</Text>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    backgroundColor: md3Colors.primaryContainer,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  standardFab: {
    width: 56,
    height: 56,
  },
  extendedFab: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 8,
  },
  icon: {
    fontSize: 22,
  },
  label: {
    ...md3Typography.labelLarge,
    color: md3Colors.onPrimaryContainer,
    fontWeight: 'bold',
  },
});
