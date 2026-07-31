import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  BackHandler,
  Keyboard,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/components/HomeScreen';
import ChatTab from './src/components/ChatTab';
import AnalyticsTab from './src/components/AnalyticsTab';
import PantryTab from './src/components/PantryTab';
import TimelineTab from './src/components/TimelineTab';
import SettingsTab from './src/components/SettingsTab';
import NotificationManagerScreen from './src/components/NotificationManagerScreen';
import AlarmHubScreen from './src/components/AlarmHubScreen';
import NotificationHubTab from './src/components/NotificationHubTab';
import AppNavigator from './src/navigation/AppNavigator';
import { TabType } from './src/navigation/types';
import { md3Colors, md3Typography } from './src/theme';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [logTrigger, setLogTrigger] = useState(0);
  const [initialChatPrefix, setInitialChatPrefix] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isNotifManagerOpen, setIsNotifManagerOpen] = useState(false);
  const [isAlarmHubOpen, setIsAlarmHubOpen] = useState(false);

  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const isFullScreenView = isNotifManagerOpen || isAlarmHubOpen;

  // Safely track Software Keyboard visibility to hide Bottom Navigation Bar when typing
  useEffect(() => {
    if (typeof Keyboard === 'undefined' || !Keyboard?.addListener) return;

    try {
      const showSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        () => setIsKeyboardVisible(true)
      );
      const hideSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setIsKeyboardVisible(false)
      );
      return () => {
        showSub?.remove();
        hideSub?.remove();
      };
    } catch (_) {}
  }, []);

  // Standard Mobile Android Back Navigation Handler
  useEffect(() => {
    const onBackPress = () => {
      if (isAlarmHubOpen) {
        setIsAlarmHubOpen(false);
        return true;
      }
      if (isNotifManagerOpen) {
        setIsNotifManagerOpen(false);
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true; // Prevent default app exit, navigate back to Home
      }
      return false; // On Home screen, default behavior (exit app)
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [activeTab, isNotifManagerOpen, isAlarmHubOpen]);

  function handleQuickLogFromHome(prefix: string) {
    setInitialChatPrefix(prefix);
    setActiveTab('chat');
  }

  function handleTabChange(tab: TabType) {
    if (tab === 'chat') setInitialChatPrefix(null);
    setActiveTab(tab);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={isFullScreenView ? ['right', 'left', 'bottom'] : ['top', 'right', 'left', 'bottom']}>
        <StatusBar barStyle="light-content" translucent={true} backgroundColor="transparent" />

        {/* Material 3 Top App Bar (Rendered ONLY on Home Page) */}
        {activeTab === 'home' && !isFullScreenView && (
          <View style={styles.topAppBar}>
            <View style={styles.headerInner}>
              <TouchableOpacity onPress={() => setActiveTab('home')} style={styles.brandRow} activeOpacity={0.8}>
                <View>
                  <Text style={styles.headerTitle}>Buddy</Text>
                  <Text style={styles.headerSubtitle}>AI Personal Assistant</Text>
                </View>
              </TouchableOpacity>

              {/* Desktop Navigation */}
              {isDesktop && (
                <AppNavigator
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                  isDesktop={true}
                />
              )}

              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Cloud Synced</Text>
              </View>
            </View>
          </View>
        )}

        {/* Body Viewport */}
        <View style={styles.bodyWrapper}>
          <View style={styles.bodyContent}>
            {isAlarmHubOpen ? (
              <AlarmHubScreen onBack={() => setIsAlarmHubOpen(false)} />
            ) : isNotifManagerOpen ? (
              <NotificationManagerScreen onBack={() => setIsNotifManagerOpen(false)} />
            ) : (
              <>
                {activeTab === 'home' && (
                  <HomeScreen
                    onNavigateTab={(tab) => setActiveTab(tab)}
                    onQuickLog={handleQuickLogFromHome}
                  />
                )}
                {activeTab === 'chat' && (
                  <ChatTab
                    onLogAdded={() => setLogTrigger((prev) => prev + 1)}
                    initialText={initialChatPrefix || undefined}
                  />
                )}
                {activeTab === 'analytics' && <AnalyticsTab key={logTrigger} />}
                {activeTab === 'notifications' && (
                  <NotificationHubTab onOpenAlarmHub={() => setIsAlarmHubOpen(true)} />
                )}
                {activeTab === 'pantry' && <PantryTab />}
                {activeTab === 'timeline' && <TimelineTab key={logTrigger} />}
                {activeTab === 'settings' && (
                  <SettingsTab
                    onOpenNotifManager={() => setIsNotifManagerOpen(true)}
                    onOpenAlarmHub={() => setIsAlarmHubOpen(true)}
                    onOpenJournal={() => setActiveTab('timeline')}
                    onOpenPantry={() => setActiveTab('pantry')}
                  />
                )}
              </>
            )}
          </View>
        </View>

        {/* Mobile Material 3 Bottom Navigation Bar (Hidden when keyboard or full screen is open) */}
        {!isDesktop && !isKeyboardVisible && !isFullScreenView && (
          <AppNavigator
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isDesktop={false}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  topAppBar: {
    backgroundColor: md3Colors.surfaceContainer,
    borderBottomWidth: 1,
    borderBottomColor: md3Colors.outlineVariant,
    paddingVertical: 12,
  },
  headerInner: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...md3Typography.titleLarge,
    color: md3Colors.onBackground,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: md3Colors.catExpense,
    marginRight: 6,
  },
  statusText: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    fontWeight: 'bold',
  },
  bodyWrapper: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  bodyContent: {
    flex: 1,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
});
