import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { md3Colors } from '../theme';

interface GradientCardProps {
  children: React.ReactNode;
  gradient?: string[];
  style?: ViewStyle | ViewStyle[];
}

export default function GradientCard({
  children,
  style,
}: GradientCardProps) {
  return <View style={[styles.card, styles.fallback, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  fallback: {
    backgroundColor: md3Colors.surfaceContainerHigh,
  },
});
