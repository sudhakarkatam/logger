import React from 'react';
import { ViewStyle } from 'react-native';
import { Chip as PaperChip } from 'react-native-paper';
import { theme } from '../../../theme';

interface BuddyChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function BuddyChip({ label, selected = false, onPress, icon, style }: BuddyChipProps) {
  return (
    <PaperChip
      selected={selected}
      onPress={onPress}
      icon={icon}
      mode={selected ? 'flat' : 'outlined'}
      style={[
        {
          borderRadius: theme.roundness.md,
          marginRight: theme.spacing.xs,
          backgroundColor: selected ? theme.colors.secondaryContainer : theme.colors.surfaceContainer,
          borderColor: theme.colors.outlineVariant,
        },
        style,
      ]}
      textStyle={{
        color: selected ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant,
        fontSize: 12,
        fontWeight: selected ? 'bold' : 'normal',
      }}
    >
      {label}
    </PaperChip>
  );
}
