import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { getWeekData, WeekData, Entry } from '../services/api';
import { calculateStreak } from '../utils/formatters';
import { CATEGORY_META, Category } from '../utils/constants';
import MarkdownRenderer from './ui/MarkdownRenderer';
import StreakBadge from './ui/StreakBadge';
import BuddyButton from './ui/m3/BuddyButton';
import BuddyChip from './ui/m3/BuddyChip';
import BuddyCard from './ui/m3/BuddyCard';
import { Surface, SegmentedButtons, Searchbar } from 'react-native-paper';

export default function AnalyticsTab() {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // AI Digest
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState('');

  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width - 64, 500);
  const chartHeight = 160;

  useEffect(() => {
    fetchAnalyticsData();
  }, [days]);

  async function fetchAnalyticsData() {
    try {
      setLoading(true);
      const data = await getWeekData(1, days, false);
      setWeekData(data);
      setDigest(null);
      setDigestError('');
    } catch (err: any) {
      console.log('Error fetching analytics:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleGenerateDigest() {
    try {
      setDigestLoading(true);
      setDigestError('');
      const data = await getWeekData(1, days, true);
      if (data.weeklyDigest) {
        setDigest(data.weeklyDigest);
      } else {
        setDigestError('No digest could be compiled. Make sure you have active logs in this period.');
      }
    } catch (err: any) {
      setDigestError(err.message || 'Failed to generate weekly digest');
    } finally {
      setDigestLoading(false);
    }
  }

  const entries: Entry[] = weekData?.entries || [];

  const allTagsMap: Record<string, number> = {};
  entries.forEach((e) => {
    (e.tags || []).forEach((t) => {
      allTagsMap[t] = (allTagsMap[t] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(allTagsMap)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const filteredEntries = entries.filter((e) => {
    if (selectedCategory !== 'all' && e.category !== selectedCategory) return false;
    if (selectedTag && !(e.tags || []).includes(selectedTag)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = e.raw_text?.toLowerCase().includes(q);
      const matchCat = e.category?.toLowerCase().includes(q);
      const matchTags = (e.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchText && !matchCat && !matchTags) return false;
    }
    return true;
  });

  const totalEntries = filteredEntries.length;
  const exerciseStreak = calculateStreak(entries, 'exercise');
  const waterStreak = calculateStreak(entries, 'water');
  const sleepStreak = calculateStreak(entries, 'sleep');

  const catCounts: Record<string, number> = {};
  filteredEntries.forEach((e) => {
    const c = e.category || 'other';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  const categoryEntries = Object.entries(catCounts);
  const mostActiveCat = categoryEntries.sort((a, b) => b[1] - a[1])[0]?.[0];

  const dateCounts: Record<string, number> = {};
  filteredEntries.forEach((e) => {
    const d = e.created_at ? e.created_at.split('T')[0] : 'Unknown';
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  const chartData = Object.entries(dateCounts).slice(-7);
  const maxVal = Math.max(...chartData.map(([, c]) => c), 1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchAnalyticsData();
          }}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Header Title */}
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Analytics Dashboard</Text>
        <Text style={styles.subHeading}>{totalEntries} events loaded for timeframe</Text>
      </View>

      {/* MD3 Segmented Buttons Timeframe Selector */}
      <SegmentedButtons
        value={days.toString()}
        onValueChange={(val) => setDays(parseInt(val, 10))}
        buttons={[
          { value: '7', label: '7 Days' },
          { value: '30', label: '30 Days' },
          { value: '90', label: '90 Days' },
        ]}
        style={styles.segmentedBtn}
      />

      {/* Streak Badges */}
      {(exerciseStreak > 0 || waterStreak > 0 || sleepStreak > 0) && (
        <View style={styles.streaksContainer}>
          <StreakBadge type="exercise" streak={exerciseStreak} />
          <StreakBadge type="water" streak={waterStreak} />
          <StreakBadge type="sleep" streak={sleepStreak} />
        </View>
      )}

      {/* MD3 Searchbar */}
      <Searchbar
        placeholder="Search keywords or #tags..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
        inputStyle={{ color: theme.colors.onSurface, fontSize: 14 }}
      />

      {/* MD3 Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: theme.spacing.xs }}>
        {['all', 'meal', 'sleep', 'expense', 'exercise', 'mood', 'water', 'work', 'book', 'other'].map((cat) => (
          <BuddyChip
            key={cat}
            label={cat.toUpperCase()}
            selected={selectedCategory === cat}
            onPress={() => setSelectedCategory(cat)}
          />
        ))}
      </ScrollView>

      {/* Tag Cloud */}
      {sortedTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: theme.spacing.sm }}>
          {sortedTags.map((tag) => {
            const isActive = selectedTag === tag;
            return (
              <BuddyChip
                key={tag}
                label={`#${tag}`}
                selected={isActive}
                onPress={() => setSelectedTag(isActive ? null : tag)}
              />
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: 40 }} />
      ) : (
        <>
          {/* MD3 Surface AI Digest */}
          <Surface style={styles.coachCard} elevation={2}>
            {!digest && !digestLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
                <MaterialCommunityIcons name="email-fast-outline" size={32} color={theme.colors.primary} style={{ marginBottom: theme.spacing.xs }} />
                <Text style={styles.coachTitle}>AI Coach Weekly Digest</Text>
                <Text style={styles.coachSub}>
                  Synthesize habit patterns, caloric intake, sleep quality, and spending trends.
                </Text>
                <BuddyButton
                  label="Generate AI Digest"
                  onPress={handleGenerateDigest}
                  variant="filled"
                  icon="creation"
                />
                {digestError ? <Text style={styles.errorText}>⚠️ {digestError}</Text> : null}
              </View>
            ) : digestLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: theme.spacing.lg }}>
                <ActivityIndicator size="large" color={theme.colors.tertiary} style={{ marginBottom: theme.spacing.sm }} />
                <Text style={styles.coachTitle}>Analyzing habit patterns...</Text>
                <Text style={styles.coachSub}>Computing correlations & compiling insights</Text>
              </View>
            ) : (
              <View>
                <View style={styles.digestHeader}>
                  <Text style={styles.coachTitle}>AI Coach Insights</Text>
                  <TouchableOpacity onPress={handleGenerateDigest} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="refresh" size={16} color="#818CF8" />
                    <Text style={styles.refreshText}>Refresh</Text>
                  </TouchableOpacity>
                </View>
                <MarkdownRenderer content={digest || ''} />
              </View>
            )}
          </Surface>

          {/* MD3 Metrics Grid Surface Tiles */}
          <View style={styles.statsGrid}>
            <Surface style={styles.statTile} elevation={1}>
              <Text style={styles.statNumber}>{totalEntries}</Text>
              <Text style={styles.statLabel}>Total Events</Text>
            </Surface>

            <Surface style={styles.statTile} elevation={1}>
              <Text style={styles.statNumber}>{categoryEntries.length}</Text>
              <Text style={styles.statLabel}>Categories</Text>
            </Surface>

            <Surface style={styles.statTile} elevation={1}>
              <Text style={styles.statNumber} numberOfLines={1}>
                {mostActiveCat ? CATEGORY_META[mostActiveCat as Category]?.icon || '📝' : 'None'}
              </Text>
              <Text style={styles.statLabel}>Most Active</Text>
            </Surface>
          </View>

          {/* Native SVG Activity Trend Chart */}
          <Surface style={styles.chartCard} elevation={2}>
            <Text style={styles.cardHeaderTitle}>Activity Frequency Trend</Text>
            <View style={{ alignItems: 'center', marginTop: theme.spacing.md }}>
              <Svg width={chartWidth} height={chartHeight}>
                <Line
                  x1="0"
                  y1={chartHeight - 30}
                  x2={chartWidth}
                  y2={chartHeight - 30}
                  stroke={theme.colors.outlineVariant}
                  strokeWidth="1"
                />

                {chartData.map(([date, count], index) => {
                  const barWidth = Math.min(36, (chartWidth - 40) / chartData.length - 8);
                  const barHeight = ((count / maxVal) * (chartHeight - 50));
                  const x = 20 + index * ((chartWidth - 40) / chartData.length) + (chartWidth / chartData.length - barWidth) / 2;
                  const y = chartHeight - 30 - barHeight;

                  return (
                    <React.Fragment key={date}>
                      <Rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={Math.max(barHeight, 6)}
                        rx={8}
                        ry={8}
                        fill="#818CF8"
                      />
                      <SvgText
                        x={x + barWidth / 2}
                        y={y - 6}
                        fill={theme.colors.onSurfaceVariant}
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {count}
                      </SvgText>
                      <SvgText
                        x={x + barWidth / 2}
                        y={chartHeight - 12}
                        fill={theme.colors.outline}
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {date.split('-').slice(1).join('/')}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </View>
          </Surface>
        </>
      )}
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
    marginBottom: theme.spacing.md,
  },
  heading: {
    ...theme.typography.headline,
    color: theme.colors.onBackground,
    fontWeight: 'bold',
  },
  subHeading: {
    ...theme.typography.label,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  segmentedBtn: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainer,
  },
  streaksContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  searchbar: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    marginBottom: theme.spacing.xs,
  },
  coachCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    marginVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  coachTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  coachSub: {
    color: '#C7D2FE',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  digestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  refreshText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.sm,
  },
  statTile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainer,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.roundness.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  statNumber: {
    color: theme.colors.onSurface,
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    marginVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  cardHeaderTitle: {
    color: theme.colors.onSurface,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
