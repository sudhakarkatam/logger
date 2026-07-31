import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CATEGORY_META, Category } from '../../utils/constants';
import { colors } from '../../theme';

interface CategoryBadgeProps {
  category?: string;
  size?: 'small' | 'medium';
}

export default function CategoryBadge({ category, size = 'small' }: CategoryBadgeProps) {
  if (!category) return null;
  const key = category.toLowerCase() as Category;
  const meta = CATEGORY_META[key] || { icon: '📝', label: category, color: colors.catOther };

  const isSmall = size === 'small';

  return (
    <View style={[styles.badge, { backgroundColor: `${meta.color}20`, borderColor: `${meta.color}40` }]}>
      <Text style={[styles.icon, isSmall && styles.iconSmall]}>{meta.icon}</Text>
      <Text style={[styles.label, { color: meta.color }, isSmall && styles.labelSmall]}>
        {meta.label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  icon: {
    fontSize: 12,
    marginRight: 4,
  },
  iconSmall: {
    fontSize: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontSize: 9,
  },
});
