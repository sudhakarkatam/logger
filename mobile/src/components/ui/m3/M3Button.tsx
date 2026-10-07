import React from 'react';
import { ViewStyle, TextStyle } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';
import { md3Colors } from '../../../theme';

interface M3ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'filled' | 'tonal' | 'outlined' | 'text';
  icon?: string;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  labelStyle?: TextStyle;
}

export default function M3Button({
  label,
  onPress,
  variant = 'filled',
  disabled = false,
  style,
  labelStyle,
}: M3ButtonProps) {
  // Map custom variant string to Paper mode
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
      disabled={disabled}
      style={[{ borderRadius: 20 }, style]}
      labelStyle={[{ fontWeight: 'bold' }, labelStyle]}
      buttonColor={variant === 'filled' ? md3Colors.primary : undefined}
    >
      {label}
    </PaperButton>
  );
}
