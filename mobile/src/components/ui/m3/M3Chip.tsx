import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { md3Colors, md3Typography } from '../../../theme';

interface M3ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function M3Chip({ label, selected = false, onPress, icon, style }: M3ChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected ? styles.selectedChip : styles.unselectedChip,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, selected ? styles.selectedLabel : styles.unselectedLabel]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    gap: 6,
  },
  unselectedChip: {
    backgroundColor: md3Colors.surfaceContainerHigh,
    borderColor: md3Colors.outlineVariant,
  },
  selectedChip: {
    backgroundColor: md3Colors.secondaryContainer,
    borderColor: md3Colors.primary,
  },
  label: {
    ...md3Typography.labelSmall,
    fontSize: 12,
  },
  unselectedLabel: {
    color: md3Colors.onSurfaceVariant,
  },
  selectedLabel: {
    color: md3Colors.onSecondaryContainer,
    fontWeight: 'bold',
  },
  icon: {
    fontSize: 14,
  },
});
