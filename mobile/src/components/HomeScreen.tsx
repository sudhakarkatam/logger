import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { queryEntries, Entry } from '../services/api';
import { getGreeting, calculateStreak } from '../utils/formatters';
import BuddyCard from './ui/m3/BuddyCard';
import BuddyChip from './ui/m3/BuddyChip';
import BuddyButton from './ui/m3/BuddyButton';
import StreakBadge from './ui/StreakBadge';

interface HomeScreenProps {
  onNavigateTab: (tab: 'chat' | 'analytics' | 'pantry' | 'timeline' | 'settings') => void;
  onQuickLog: (categoryPrefix: string) => void;
}

export default function HomeScreen({ onNavigateTab, onQuickLog }: HomeScreenProps) {
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayCounts, setTodayCounts] = useState({
    meal: 0,
    exercise: 0,
    mood: 0,
    sleep: 0,
  });

  const { width } = useWindowDimensions();

  useEffect(() => {
    fetchHomeData();
  }, []);

  async function fetchHomeData() {
    try {
      setLoading(true);
      const res = await queryEntries(undefined, 30);
      const entriesList = Array.isArray(res) ? res : [];
      setAllEntries(entriesList);

      const todayStr = new Date().toISOString().split('T')[0];
      const todayLogs = entriesList.filter((e) => e.created_at && e.created_at.startsWith(todayStr));

      setTodayCounts({
        meal: todayLogs.filter((e) => e.category === 'meal').length,
        exercise: todayLogs.filter((e) => e.category === 'exercise').length,
        mood: todayLogs.filter((e) => e.category === 'mood').length,
        sleep: todayLogs.filter((e) => e.category === 'sleep').length,
      });
    } catch (err: any) {
      console.log('Error loading home data:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const exerciseStreak = calculateStreak(allEntries, 'exercise');
  const waterStreak = calculateStreak(allEntries, 'water');
  const sleepStreak = calculateStreak(allEntries, 'sleep');

  const loggedCount = (todayCounts.meal > 0 ? 1 : 0) + (todayCounts.exercise > 0 ? 1 : 0) + (todayCounts.mood > 0 ? 1 : 0) + (todayCounts.sleep > 0 ? 1 : 0);
  const progressPercent = Math.round((loggedCount / 4) * 100);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchHomeData();
          }}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Greeting Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greetingTitle}>{getGreeting()} 👋</Text>
          <Text style={styles.greetingSub}>Your Personal AI Command Center</Text>
        </View>

        <BuddyButton label="+ New Log" onPress={() => onNavigateTab('chat')} variant="filled" icon="plus" />
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
      <BuddyCard variant="elevated" style={styles.progressCard}>
        <View style={styles.progressRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardHeaderTitle}>Daily Habit Goal</Text>
            <Text style={styles.cardHeaderSub}>
              {loggedCount} of 4 Habits Tracked Today
            </Text>

            <View style={styles.habitChipsRow}>
              <BuddyChip label={`Meal ${todayCounts.meal > 0 ? '✓' : ''}`} selected={todayCounts.meal > 0} onPress={() => onQuickLog('log meal: ')} icon="food-apple" />
              <BuddyChip label={`Exercise ${todayCounts.exercise > 0 ? '✓' : ''}`} selected={todayCounts.exercise > 0} onPress={() => onQuickLog('log exercise: ')} icon="run-fast" />
              <BuddyChip label={`Mood ${todayCounts.mood > 0 ? '✓' : ''}`} selected={todayCounts.mood > 0} onPress={() => onQuickLog('log mood: ')} icon="brain" />
            </View>
          </View>

          {/* SVG Donut Ring */}
          <View style={styles.donutContainer}>
            <Svg width={80} height={80} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke={theme.colors.surfaceContainerHighest} strokeWidth="12" fill="none" />
              <Circle
                cx="50"
                cy="50"
                r="40"
                stroke={theme.colors.primary}
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
      </BuddyCard>

      {/* 1-Tap Instant Counter Shortcuts */}
      <Text style={styles.sectionHeader}>Quick Shortcuts</Text>
      <View style={styles.instantPillsRow}>
        <TouchableOpacity style={styles.instantPill} onPress={() => onQuickLog('log water: 1 glass (250ml)')}>
          <MaterialCommunityIcons name="water-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.instantPillText}>+1 Glass Water</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.instantPill} onPress={() => onQuickLog('log coffee: 1 cup espresso')}>
          <MaterialCommunityIcons name="coffee-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.instantPillText}>+1 Cup Coffee</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.instantPill} onPress={() => onQuickLog('log workout: 30 mins cardio')}>
          <MaterialCommunityIcons name="run-fast" size={20} color={theme.colors.primary} />
          <Text style={styles.instantPillText}>30m Workout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  greetingTitle: {
    ...theme.typography.headline,
    color: theme.colors.onBackground,
    fontWeight: 'bold',
  },
  greetingSub: {
    ...theme.typography.label,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  streaksRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  progressCard: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderTitle: {
    ...theme.typography.title,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
  },
  cardHeaderSub: {
    ...theme.typography.body,
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  habitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  donutContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.md,
  },
  donutTextOverlay: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutPercentText: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionHeader: {
    ...theme.typography.title,
    color: theme.colors.onSurface,
    fontWeight: 'bold',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  instantPillsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  instantPill: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.roundness.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  instantPillText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: 'bold',
  },
});
