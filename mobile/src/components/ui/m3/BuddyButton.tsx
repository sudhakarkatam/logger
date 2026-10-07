import React from 'react';
import { ViewStyle, TextStyle } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { theme } from '../../../theme';

interface BuddyButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'filled' | 'tonal' | 'outlined' | 'text';
  icon?: string;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  labelStyle?: TextStyle;
}

export default function BuddyButton({
  label,
  onPress,
  variant = 'filled',
  icon,
  disabled = false,
  style,
  labelStyle,
}: BuddyButtonProps) {
  const mode =
    variant === 'filled'
      ? 'contained'
      : variant === 'tonal'
      ? 'contained-tonal'
      : variant === 'outlined'
      ? 'outlined'
      : 'text';

  return (
    <PaperButton
      mode={mode}
      onPress={onPress}
      icon={icon}
      disabled={disabled}
      style={[
        {
          borderRadius: theme.roundness.lg,
          minHeight: theme.touchTarget.minSize,
          justifyContent: 'center',
        },
        style,
      ]}
      labelStyle={[
        {
          fontSize: 14,
          fontWeight: '600',
        },
        labelStyle,
      ]}
    >
      {label}
    </PaperButton>
  );
}
