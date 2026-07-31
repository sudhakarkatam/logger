import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { md3Colors, md3Typography } from '../theme';
import { getWeekData, queryEntries, Entry } from '../services/api';
import { getGreeting, calculateStreak } from '../utils/formatters';
import M3Card from './ui/m3/M3Card';
import M3Chip from './ui/m3/M3Chip';
import StreakBadge from './ui/StreakBadge';
import CategoryBadge from './ui/CategoryBadge';

interface HomeScreenProps {
  onNavigateTab: (tab: 'chat' | 'analytics' | 'pantry' | 'timeline' | 'settings') => void;
  onQuickLog: (categoryPrefix: string) => void;
}

export default function HomeScreen({ onNavigateTab, onQuickLog }: HomeScreenProps) {
  const [recentEntries, setRecentEntries] = useState<Entry[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [todayCounts, setTodayCounts] = useState({
    meal: 0,
    exercise: 0,
    mood: 0,
    sleep: 0,
  });

  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  useEffect(() => {
    fetchHomeData();
  }, []);

  async function fetchHomeData() {
    try {
      setLoading(true);
      const res = await queryEntries(undefined, 30);
      const data = res.entries || [];
      setAllEntries(data);
      setRecentEntries(data.slice(0, 8));

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const counts = { meal: 0, exercise: 0, mood: 0, sleep: 0 };
      data.forEach((entry) => {
        const entryDate = new Date(entry.entry_time || entry.created_at);
        if (entryDate >= startOfDay) {
          const cat = (entry.category || '').toLowerCase();
          if (cat in counts) {
            counts[cat as keyof typeof counts] += 1;
          }
        }
      });
      setTodayCounts(counts);

      try {
        const weekInfo = await getWeekData(1, 1, false);
        if (weekInfo.stats) {
          setAiInsight(
            `Logged ${weekInfo.stats.totalEntries} events across ${weekInfo.stats.daysLogged} days. Keep up your daily momentum!`
          );
        }
      } catch (_) {
        setAiInsight('Consistency builds long-term clarity. Tap Quick Actions to record your activities.');
      }
    } catch (err: any) {
      console.log('[Home] Error fetching home data:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const loggedCount = Object.values(todayCounts).filter((c) => c > 0).length;
  const progressPercent = Math.min(100, Math.round((loggedCount / 4) * 100));

  const exerciseStreak = calculateStreak(allEntries, 'exercise');
  const waterStreak = calculateStreak(allEntries, 'water');
  const sleepStreak = calculateStreak(allEntries, 'sleep', (e) => Number(e.data?.hours || 0) >= 7);

  const quickActions = [
    { label: 'Log Meal', prefix: 'log meal: ', icon: '🍲', desc: 'Breakfast, lunch, dinner', color: md3Colors.catMeal },
    { label: 'Log Workout', prefix: 'log exercise: ', icon: '🏃', desc: 'Run, gym, walk', color: md3Colors.catExercise },
    { label: 'Log Mood', prefix: 'log mood: ', icon: '🧠', desc: 'Energy & state', color: md3Colors.catMood },
    { label: 'Log Expense', prefix: 'log expense: ', icon: '💳', desc: 'Daily spendings', color: md3Colors.catExpense },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHomeData(); }} tintColor={md3Colors.primary} />}
    >
      {/* Greeting Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greetingTitle}>{getGreeting()}, Buddy 👋</Text>
          <Text style={styles.greetingSub}>Your Personal AI Command Center</Text>
        </View>

        <TouchableOpacity style={styles.newLogBtn} onPress={() => onNavigateTab('chat')}>
          <Text style={styles.newLogBtnText}>+ New Log</Text>
        </TouchableOpacity>
      </View>

      {/* Streak Badges */}
      {(exerciseStreak > 0 || waterStreak > 0 || sleepStreak > 0) && (
        <View style={styles.streaksRow}>
          <StreakBadge type="exercise" streak={exerciseStreak} />
          <StreakBadge type="water" streak={waterStreak} />
          <StreakBadge type="sleep" streak={sleepStreak} />
        </View>
      )}

      {/* Material 3 Habit Donut Card */}
      <M3Card variant="elevated" style={styles.progressCard}>
        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardHeaderTitle}>Daily Habit Goal</Text>
            <Text style={styles.cardHeaderSub}>
              {loggedCount} of 4 Habits Tracked Today
            </Text>

            <View style={styles.habitChipsRow}>
              <M3Chip label={`🍲 Meal ${todayCounts.meal > 0 ? '✓' : ''}`} selected={todayCounts.meal > 0} onPress={() => onQuickLog('log meal: ')} />
              <M3Chip label={`🏃 Exercise ${todayCounts.exercise > 0 ? '✓' : ''}`} selected={todayCounts.exercise > 0} onPress={() => onQuickLog('log exercise: ')} />
              <M3Chip label={`🧠 Mood ${todayCounts.mood > 0 ? '✓' : ''}`} selected={todayCounts.mood > 0} onPress={() => onQuickLog('log mood: ')} />
            </View>
          </View>

          {/* SVG Donut Ring */}
          <View style={styles.donutContainer}>
            <Svg width={80} height={80} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke={md3Colors.surfaceContainer} strokeWidth="12" fill="none" />
              <Circle
                cx="50"
                cy="50"
                r="40"
                stroke={md3Colors.primary}
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - progressPercent / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </Svg>
            <View style={styles.donutTextOverlay}>
              <Text style={styles.donutPercentText}>{progressPercent}%</Text>
            </View>
          </View>
        </View>
      </M3Card>

      {/* 1-Tap Instant Counter Shortcuts */}
      <Text style={styles.sectionHeader}>⚡ Quick Shortcuts</Text>
      <View style={styles.instantPillsRow}>
        <TouchableOpacity style={styles.instantPill} onPress={() => onQuickLog('log water: 1 glass (250ml)')}>
          <Text style={styles.instantPillText}>💧 +1 Glass Water</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.instantPill} onPress={() => onQuickLog('log coffee: 1 cup espresso')}>
          <Text style={styles.instantPillText}>☕ +1 Cup Coffee</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.instantPill} onPress={() => onQuickLog('log workout: 30 mins cardio')}>
          <Text style={styles.instantPillText}>🏃 30m Workout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  greetingTitle: {
    ...md3Typography.headlineMedium,
    color: md3Colors.onBackground,
  },
  greetingSub: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  newLogBtn: {
    backgroundColor: md3Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  newLogBtnText: {
    ...md3Typography.labelLarge,
    color: md3Colors.onPrimary,
  },
  streaksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  progressCard: {
    marginBottom: 20,
    backgroundColor: md3Colors.surfaceContainerHighest,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderTitle: {
    ...md3Typography.titleLarge,
    color: md3Colors.onSurface,
  },
  cardHeaderSub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
    marginBottom: 12,
  },
  habitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  donutContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  donutTextOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutPercentText: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: 'bold',
  },
  sectionHeader: {
    ...md3Typography.titleLarge,
    color: md3Colors.onBackground,
    marginTop: 12,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickTileCardContainer: {
    width: '48%',
    marginBottom: 12,
  },
  quickTileCard: {
    backgroundColor: md3Colors.surfaceContainerHigh,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  quickTileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quickTileIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileIcon: {
    fontSize: 20,
  },
  quickTileArrow: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  quickTileLabel: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '700',
  },
  quickTileDesc: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  instantPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  instantPill: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  instantPillText: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurface,
    fontWeight: '600',
  },
  aiCard: {
    marginBottom: 20,
    borderColor: md3Colors.outlineVariant,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  aiTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.primary,
  },
  aiLink: {
    ...md3Typography.labelSmall,
    color: md3Colors.secondary,
  },
  aiText: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  seeAllText: {
    ...md3Typography.labelLarge,
    color: md3Colors.primary,
  },
  recentList: {
    paddingRight: 16,
  },
  recentCard: {
    width: 190,
    marginRight: 12,
    minHeight: 100,
    justifyContent: 'space-between',
    marginVertical: 0,
  },
  recentRawText: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurface,
    marginTop: 4,
  },
  recentTime: {
    ...md3Typography.labelSmall,
    color: md3Colors.outline,
    marginTop: 8,
  },
  emptyBox: {
    backgroundColor: md3Colors.surfaceContainer,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyText: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
  },
});
