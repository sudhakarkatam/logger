import React from 'react';
import { ViewStyle } from 'react-native';
import { List } from 'react-native-paper';
import { theme } from '../../../theme';

interface BuddyListItemProps {
  title: string;
  description?: string;
  leftIcon?: string;
  rightNode?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export default function BuddyListItem({
  title,
  description,
  leftIcon,
  rightNode,
  onPress,
  style,
}: BuddyListItemProps) {
  return (
    <List.Item
      title={title}
      description={description}
      onPress={onPress}
      titleStyle={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 15 }}
      descriptionStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}
      left={(props) => (leftIcon ? <List.Icon {...props} icon={leftIcon} color={theme.colors.primary} /> : null)}
      right={() => rightNode || null}
      style={[
        {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.surfaceContainer,
          borderRadius: theme.roundness.md,
          marginVertical: 2,
        },
        style,
      ]}
    />
  );
}
