import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Pressable, Platform, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons, Ionicons, Octicons, MaterialIcons } from '@expo/vector-icons';
import { TabType } from './types';
import { useAppTheme } from '../theme';

interface AppNavigatorProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isDesktop?: boolean;
}

interface NavItemConfig {
  key: TabType;
  family: 'MaterialCommunityIcons' | 'Ionicons' | 'Octicons' | 'MaterialIcons';
  activeIcon: string;
  inactiveIcon: string;
  label: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    key: 'home',
    family: 'Octicons',
    activeIcon: 'home',
    inactiveIcon: 'home',
    label: 'Home',
  },
  {
    key: 'chat',
    family: 'Ionicons',
    activeIcon: 'chatbubbles',
    inactiveIcon: 'chatbubbles-outline',
    label: 'Chat',
  },
  {
    key: 'analytics',
    family: 'MaterialCommunityIcons',
    activeIcon: 'google-analytics',
    inactiveIcon: 'google-analytics',
    label: 'Analytics',
  },
  {
    key: 'notifications',
    family: 'Ionicons',
    activeIcon: 'notifications',
    inactiveIcon: 'notifications-outline',
    label: 'Reminders',
  },
  {
    key: 'settings',
    family: 'Octicons',
    activeIcon: 'gear',
    inactiveIcon: 'gear',
    label: 'Settings',
  },
];

function NavTabButton({
  item,
  isActive,
  onPress,
  colors,
}: {
  item: NavItemConfig;
  isActive: boolean;
  onPress: () => void;
  colors: any;
}) {
  const activeAnim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(activeAnim, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [isActive]);

  const scale = activeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  });

  const renderNavIcon = () => {
    const iconName = isActive ? item.activeIcon : item.inactiveIcon;
    const iconColor = isActive ? colors.onSecondaryContainer : colors.onSurfaceVariant;
    const size = 24;

    if (item.family === 'MaterialIcons') {
      return <MaterialIcons name={iconName as any} size={size} color={iconColor} style={styles.icon} />;
    }
    if (item.family === 'Ionicons') {
      return <Ionicons name={iconName as any} size={size} color={iconColor} style={styles.icon} />;
    }
    if (item.family === 'Octicons') {
      return <Octicons name={iconName as any} size={size} color={iconColor} style={styles.icon} />;
    }
    return <MaterialCommunityIcons name={iconName as any} size={size} color={iconColor} style={styles.icon} />;
  };

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        onPress();
      }}
      android_ripple={{ color: 'rgba(255, 255, 255, 0.12)', borderless: true, radius: 32 }}
      style={styles.tabButton}
    >
      <View style={styles.iconContainer}>
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              backgroundColor: colors.secondaryContainer,
              opacity: activeAnim,
              transform: [{ scaleX: scale }],
            },
          ]}
        />
        {renderNavIcon()}
      </View>
    </Pressable>
  );
}

export default function AppNavigator({ activeTab, onTabChange }: AppNavigatorProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.barSurface,
        { backgroundColor: colors.surfaceContainer, borderTopColor: colors.outlineVariant },
      ]}
    >
      <View style={styles.navRow}>
        {NAV_ITEMS.map((item) => (
          <NavTabButton
            key={item.key}
            item={item}
            isActive={activeTab === item.key}
            onPress={() => onTabChange(item.key)}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barSurface: {
    borderTopWidth: 1,
    elevation: 3,
  },
  navRow: {
    flexDirection: 'row',
    height: 64,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  iconContainer: {
    width: 56,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    width: 56,
    height: 32,
    borderRadius: 16,
  },
  icon: {
    zIndex: 2,
  },
});
