import React from 'react';
import { ViewStyle } from 'react-native';
import { Card as PaperCard } from 'react-native-paper';
import { theme } from '../../../theme';

interface BuddyCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'elevated' | 'filled' | 'outlined';
  onPress?: () => void;
}

export default function BuddyCard({ children, style, variant = 'filled', onPress }: BuddyCardProps) {
  const mode = variant === 'elevated' ? 'elevated' : variant === 'outlined' ? 'outlined' : 'contained';

  return (
    <PaperCard
      mode={mode}
      onPress={onPress}
      style={[
        {
          borderRadius: theme.roundness.lg,
          padding: theme.spacing.md,
          marginVertical: theme.spacing.xs,
          backgroundColor: variant === 'filled' ? theme.colors.surfaceContainer : undefined,
        },
        style,
      ]}
    >
      {children}
    </PaperCard>
  );
}
