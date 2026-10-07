import React from 'react';
import { ViewStyle } from 'react-native';
import { Card as PaperCard } from 'react-native-paper';
import { md3Colors } from '../../../theme';

interface M3CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'elevated' | 'filled' | 'outlined';
}

export default function M3Card({ children, style, variant = 'filled' }: M3CardProps) {
  const mode = variant === 'elevated' ? 'elevated' : variant === 'outlined' ? 'outlined' : 'contained';

  return (
    <PaperCard
      mode={mode}
      style={[
        {
          borderRadius: 16,
          padding: 14,
          marginVertical: 6,
          backgroundColor: variant === 'filled' ? md3Colors.surfaceContainerHigh : undefined,
        },
        style,
      ]}
    >
      {children}
    </PaperCard>
  );
}
