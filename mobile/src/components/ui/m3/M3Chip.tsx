import React from 'react';
import { ViewStyle } from 'react-native';
import { Chip as PaperChip } from 'react-native-paper';
import { md3Colors } from '../../../theme';

interface M3ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: string;
  style?: ViewStyle | ViewStyle[];
}

export default function M3Chip({ label, selected = false, onPress, style }: M3ChipProps) {
  return (
    <PaperChip
      selected={selected}
      onPress={onPress}
      mode={selected ? 'flat' : 'outlined'}
      style={[
        {
          marginRight: 6,
          marginVertical: 4,
          borderRadius: 8,
          backgroundColor: selected ? md3Colors.secondaryContainer : md3Colors.surfaceContainerHigh,
        },
        style,
      ]}
      selectedColor={md3Colors.onSecondaryContainer}
      textStyle={{
        fontSize: 12,
        fontWeight: selected ? 'bold' : 'normal',
        color: selected ? md3Colors.onSecondaryContainer : md3Colors.onSurfaceVariant,
      }}
    >
      {label}
    </PaperChip>
  );
}
