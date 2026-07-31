import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { md3Colors, md3Typography } from '../../../theme';

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
  icon,
  disabled = false,
  style,
  labelStyle,
}: M3ButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        variant === 'filled' && styles.filled,
        variant === 'tonal' && styles.tonal,
        variant === 'outlined' && styles.outlined,
        variant === 'text' && styles.text,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text
        style={[
          styles.label,
          variant === 'filled' && styles.filledLabel,
          variant === 'tonal' && styles.tonalLabel,
          variant === 'outlined' && styles.outlinedLabel,
          variant === 'text' && styles.textLabel,
          disabled && styles.disabledLabel,
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  filled: {
    backgroundColor: md3Colors.primary,
  },
  tonal: {
    backgroundColor: md3Colors.secondaryContainer,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: md3Colors.outline,
  },
  text: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
  },
  disabled: {
    opacity: 0.38,
  },
  label: {
    ...md3Typography.labelLarge,
  },
  filledLabel: {
    color: md3Colors.onPrimary,
  },
  tonalLabel: {
    color: md3Colors.onSecondaryContainer,
  },
  outlinedLabel: {
    color: md3Colors.primary,
  },
  textLabel: {
    color: md3Colors.primary,
  },
  disabledLabel: {
    color: md3Colors.onSurface,
  },
  icon: {
    fontSize: 16,
  },
});
