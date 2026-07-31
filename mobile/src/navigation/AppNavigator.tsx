import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { md3Typography } from '../theme';
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
  { id: 'notifications', label: 'Alerts', icon: '🔔' },
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

  // Ultra-Clean Top App Navigation Dock (Minimalist, 0 clutter, transparent icon backgrounds)
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
            <Text style={[styles.navIcon, isActive ? styles.navIconActive : styles.navIconInactive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.navLabel, isActive ? styles.navLabelActive : styles.navLabelInactive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeLine} />}
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  desktopNavIcon: {
    fontSize: 16,
  },
  desktopNavLabel: {
    ...md3Typography.labelLarge,
    color: '#9CA3AF',
  },
  desktopNavLabelActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  // Ultra-Clean Modern Dock (Top App Style - Zero Clutter)
  bottomNav: {
    height: 64,
    flexDirection: 'row',
    backgroundColor: '#0F0F12',
    borderTopWidth: 1,
    borderTopColor: '#1F1F24',
    paddingHorizontal: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 20,
  },
  navIconActive: {
    opacity: 1,
  },
  navIconInactive: {
    opacity: 0.45,
  },
  navLabel: {
    fontSize: 11,
    marginTop: 3,
  },
  navLabelActive: {
    color: '#6366F1',
    fontWeight: '800',
  },
  navLabelInactive: {
    color: '#71717A',
    fontWeight: '500',
  },
  activeLine: {
    width: 16,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#6366F1',
    marginTop: 3,
  },
});
