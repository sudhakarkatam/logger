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
import NotificationHubTab from './src/components/NotificationHubTab';
import AppNavigator from './src/navigation/AppNavigator';
import { TabType } from './src/navigation/types';
import { AppThemeProvider, useAppTheme, md3Typography } from './src/theme';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

function MainAppContent() {
  const { isDark, colors } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [logTrigger, setLogTrigger] = useState(0);
  const [initialChatPrefix, setInitialChatPrefix] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isNotifManagerOpen, setIsNotifManagerOpen] = useState(false);

  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const isFullScreenView = isNotifManagerOpen;

  // Safely track Software Keyboard visibility
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
      if (isNotifManagerOpen) {
        setIsNotifManagerOpen(false);
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [activeTab, isNotifManagerOpen]);

  function handleQuickLogFromHome(prefix: string) {
    setInitialChatPrefix(prefix);
    setActiveTab('chat');
  }

  function handleTabChange(tab: TabType) {
    if (tab === 'chat') setInitialChatPrefix(null);
    setActiveTab(tab);
  }

  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme;
  const paperTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      surface: colors.surfaceContainer,
      background: colors.background,
      secondaryContainer: colors.secondaryContainer,
      onSecondaryContainer: colors.onSecondaryContainer,
    },
  };

  return (
    <PaperProvider theme={paperTheme}>
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: colors.background }]}
        edges={['top', 'right', 'left', 'bottom']}
      >
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          translucent={true}
          backgroundColor={colors.background}
        />

        {/* Material 3 Top App Bar (Rendered ONLY on Home Page) */}
        {activeTab === 'home' && !isFullScreenView && (
          <View
            style={[
              styles.topAppBar,
              { backgroundColor: colors.surfaceContainer, borderBottomColor: colors.outlineVariant },
            ]}
          >
            <View style={styles.headerInner}>
              <TouchableOpacity onPress={() => setActiveTab('home')} style={styles.brandRow} activeOpacity={0.8}>
                <View>
                  <Text style={[styles.headerTitle, { color: colors.onBackground }]}>Buddy</Text>
                  <Text style={[styles.headerSubtitle, { color: colors.onSurfaceVariant }]}>AI Personal Assistant</Text>
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

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: colors.catExpense }]} />
                <Text style={[styles.statusText, { color: colors.onSurfaceVariant }]}>Cloud Synced</Text>
              </View>
            </View>
          </View>
        )}

        {/* Body Viewport */}
        <View style={[styles.bodyWrapper, { backgroundColor: colors.background }]}>
          <View style={styles.bodyContent}>
            {isNotifManagerOpen ? (
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
                {activeTab === 'notifications' && <NotificationHubTab />}
                {activeTab === 'pantry' && <PantryTab />}
                {activeTab === 'timeline' && <TimelineTab key={logTrigger} />}
                {activeTab === 'settings' && (
                  <SettingsTab
                    onOpenNotifManager={() => setIsNotifManagerOpen(true)}
                    onOpenJournal={() => setActiveTab('timeline')}
                    onOpenPantry={() => setActiveTab('pantry')}
                  />
                )}
              </>
            )}
          </View>
        </View>

        {/* Mobile Material 3 Bottom Navigation Bar */}
        {!isDesktop && !isKeyboardVisible && !isFullScreenView && (
          <AppNavigator
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isDesktop={false}
          />
        )}
      </SafeAreaView>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <MainAppContent />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topAppBar: {
    borderBottomWidth: 1,
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
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    ...md3Typography.labelSmall,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    ...md3Typography.labelSmall,
    fontWeight: 'bold',
  },
  bodyWrapper: {
    flex: 1,
  },
  bodyContent: {
    flex: 1,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
});
