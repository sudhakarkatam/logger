import React from 'react';
import { Chip as PaperChip } from 'react-native-paper';
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
    <PaperChip
      compact={isSmall}
      mode="flat"
      style={{
        backgroundColor: `${meta.color}20`,
        borderColor: `${meta.color}40`,
        borderWidth: 1,
        borderRadius: 8,
        alignSelf: 'flex-start',
      }}
      textStyle={{
        color: meta.color,
        fontSize: isSmall ? 10 : 12,
        fontWeight: 'bold',
      }}
    >
      {meta.icon} {meta.label.toUpperCase()}
    </PaperChip>
  );
}
