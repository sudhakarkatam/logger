import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { md3Colors } from '../../../theme';

interface M3CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'elevated' | 'filled' | 'outlined';
}

export default function M3Card({ children, style, variant = 'filled' }: M3CardProps) {
  return (
    <View
      style={[
        styles.base,
        variant === 'filled' && styles.filled,
        variant === 'elevated' && styles.elevated,
        variant === 'outlined' && styles.outlined,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
  },
  filled: {
    backgroundColor: md3Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  elevated: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  outlined: {
    backgroundColor: md3Colors.surface,
    borderWidth: 1,
    borderColor: md3Colors.outline,
  },
});
