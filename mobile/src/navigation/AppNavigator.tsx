import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { md3Colors, md3Typography } from '../theme';
import { TabType, TabConfig } from './types';

interface AppNavigatorProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isDesktop?: boolean;
}

export const NAV_TABS: TabConfig[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'pantry', label: 'Kitchen', icon: '🥦' },
  { id: 'timeline', label: 'Journal', icon: '📅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function AppNavigator({ activeTab, onTabChange, isDesktop = false }: AppNavigatorProps) {
  if (isDesktop) {
    return (
      <View style={styles.desktopNav}>
        {NAV_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.desktopNavItem, isActive && styles.desktopNavItemActive]}
              onPress={() => onTabChange(tab.id)}
            >
              <Text style={styles.desktopNavIcon}>{tab.icon}</Text>
              <Text style={[styles.desktopNavLabel, isActive && styles.desktopNavLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // Material Design 3 Bottom NavigationBar (80dp height, indicator pill)
  return (
    <View style={styles.bottomNav}>
      {NAV_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={styles.navItem}
            onPress={() => onTabChange(tab.id)}
            activeOpacity={0.7}
          >
            {/* M3 Active Indicator Pill */}
            <View style={[styles.indicatorPill, isActive && styles.indicatorPillActive]}>
              <Text style={styles.navIcon}>{tab.icon}</Text>
            </View>
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  desktopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  desktopNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  desktopNavItemActive: {
    backgroundColor: md3Colors.secondaryContainer,
  },
  desktopNavIcon: {
    fontSize: 16,
  },
  desktopNavLabel: {
    ...md3Typography.labelLarge,
    color: md3Colors.onSurfaceVariant,
  },
  desktopNavLabelActive: {
    color: md3Colors.onSecondaryContainer,
    fontWeight: 'bold',
  },
  // Material 3 Bottom Navigation Bar
  bottomNav: {
    height: 76,
    flexDirection: 'row',
    backgroundColor: md3Colors.surfaceContainer,
    borderTopWidth: 1,
    borderTopColor: md3Colors.outlineVariant,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  indicatorPill: {
    width: 56,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  indicatorPillActive: {
    backgroundColor: md3Colors.secondaryContainer,
  },
  navIcon: {
    fontSize: 18,
  },
  navLabel: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 3,
  },
  navLabelActive: {
    color: md3Colors.onSecondaryContainer,
    fontWeight: 'bold',
  },
});
