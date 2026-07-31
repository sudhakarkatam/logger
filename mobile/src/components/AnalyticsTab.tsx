import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg';
import { md3Colors, md3Typography } from '../theme';
import { getWeekData, WeekData, Entry } from '../services/api';
import { calculateStreak } from '../utils/formatters';
import { CATEGORY_META, Category } from '../utils/constants';
import MarkdownRenderer from './ui/MarkdownRenderer';
import M3Card from './ui/m3/M3Card';
import M3Chip from './ui/m3/M3Chip';
import M3Button from './ui/m3/M3Button';
import StreakBadge from './ui/StreakBadge';

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
  const categoriesCount: Record<string, number> = {};
  filteredEntries.forEach((log) => {
    const cat = log.category || 'other';
    categoriesCount[cat] = (categoriesCount[cat] || 0) + 1;
  });

  const categoryEntries = Object.entries(categoriesCount).sort((a, b) => b[1] - a[1]);
  const mostActiveCat = categoryEntries[0] ? categoryEntries[0][0] : null;

  const exerciseStreak = calculateStreak(entries, 'exercise');
  const waterStreak = calculateStreak(entries, 'water');
  const sleepStreak = calculateStreak(entries, 'sleep', (e) => Number(e.data?.hours || 0) >= 7);

  // Compute Daily Activity Chart Data
  const daysList: { label: string; count: number }[] = [];
  const now = new Date();
  const numDaysToShow = days === 7 ? 7 : 14;

  for (let i = numDaysToShow - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);

    const nextD = new Date(d);
    nextD.setDate(d.getDate() + 1);

    const count = filteredEntries.filter((e) => {
      const et = new Date(e.entry_time || e.created_at);
      return et >= d && et < nextD;
    }).length;

    const label = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' }).split(',')[0];
    daysList.push({ label, count });
  }

  const maxCount = Math.max(...daysList.map((d) => d.count), 1);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAnalyticsData(); }} tintColor={md3Colors.primary} />}
    >
      {/* Material 3 Header & Timeframe Selector */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.heading}>Analytics Dashboard</Text>
          <Text style={styles.subHeading}>{totalEntries} events loaded for timeframe</Text>
        </View>

        <View style={styles.timeframePills}>
          {[7, 30, 90].map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.pill, days === d && styles.pillActive]}
              onPress={() => setDays(d)}
            >
              <Text style={[styles.pillText, days === d && styles.pillTextActive]}>{d}d</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Streak Badges */}
      {(exerciseStreak > 0 || waterStreak > 0 || sleepStreak > 0) && (
        <View style={styles.streaksContainer}>
          <StreakBadge type="exercise" streak={exerciseStreak} />
          <StreakBadge type="water" streak={waterStreak} />
          <StreakBadge type="sleep" streak={sleepStreak} />
        </View>
      )}

      {/* Material 3 Search & Category Chips */}
      <View style={styles.filterSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search keywords or #tags..."
          placeholderTextColor={md3Colors.outline}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }}>
          {['all', 'meal', 'sleep', 'expense', 'exercise', 'mood', 'water', 'work', 'book', 'other'].map((cat) => (
            <M3Chip
              key={cat}
              label={cat.toUpperCase()}
              selected={selectedCategory === cat}
              onPress={() => setSelectedCategory(cat)}
            />
          ))}
        </ScrollView>

        {/* Tag Cloud */}
        {sortedTags.length > 0 && (
          <View style={styles.tagCloud}>
            <Text style={styles.tagCloudLabel}>Tags:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {sortedTags.map((tag) => {
                const isActive = selectedTag === tag;
                return (
                  <M3Chip
                    key={tag}
                    label={`#${tag}`}
                    selected={isActive}
                    onPress={() => setSelectedTag(isActive ? null : tag)}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={md3Colors.primary} style={{ marginVertical: 40 }} />
      ) : (
        <>
          {/* Material 3 AI Coach Digest */}
          <M3Card variant="elevated" style={styles.coachCard}>
            {!digest && !digestLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>📬</Text>
                <Text style={styles.coachTitle}>AI Coach Weekly Digest</Text>
                <Text style={styles.coachSub}>
                  Synthesize habit patterns, caloric intake, sleep quality, and spending trends.
                </Text>
                <M3Button label="✨ Generate AI Digest" onPress={handleGenerateDigest} variant="filled" />
                {digestError ? <Text style={styles.errorText}>⚠️ {digestError}</Text> : null}
              </View>
            ) : digestLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="large" color={md3Colors.tertiary} style={{ marginBottom: 10 }} />
                <Text style={styles.coachTitle}>Analyzing habit patterns...</Text>
                <Text style={styles.coachSub}>Computing correlations & compiling insights</Text>
              </View>
            ) : (
              <View>
                <View style={styles.digestHeader}>
                  <Text style={styles.coachTitle}>📬 AI Coach Insights</Text>
                  <TouchableOpacity onPress={handleGenerateDigest}>
                    <Text style={styles.refreshText}>🔄 Refresh</Text>
                  </TouchableOpacity>
                </View>
                <MarkdownRenderer content={digest || ''} />
              </View>
            )}
          </M3Card>

          {/* Material 3 Metrics Grid */}
          <View style={styles.statsGrid}>
            <M3Card variant="filled" style={styles.statTile}>
              <Text style={styles.statNumber}>{totalEntries}</Text>
              <Text style={styles.statLabel}>Total Events</Text>
            </M3Card>

            <M3Card variant="filled" style={styles.statTile}>
              <Text style={styles.statNumber}>{categoryEntries.length}</Text>
              <Text style={styles.statLabel}>Categories</Text>
            </M3Card>

            <M3Card variant="filled" style={styles.statTile}>
              <Text style={styles.statNumber} numberOfLines={1}>
                {mostActiveCat ? CATEGORY_META[mostActiveCat as Category]?.icon || '📝' : 'None'}
              </Text>
              <Text style={styles.statLabel}>Most Active</Text>
            </M3Card>
          </View>

          {/* Native SVG Activity Trend Chart */}
          <M3Card variant="elevated" style={styles.chartCard}>
            <Text style={styles.cardHeaderTitle}>📈 Activity Frequency Trend</Text>
            <View style={{ alignItems: 'center', marginTop: 10 }}>
              <Svg width={chartWidth} height={chartHeight}>
                {/* Horizontal Baseline */}
                <Line
                  x1="0"
                  y1={chartHeight - 24}
                  x2={chartWidth}
                  y2={chartHeight - 24}
                  stroke={md3Colors.outlineVariant}
                  strokeWidth="1"
                />

                {daysList.map((item, idx) => {
                  const barWidth = Math.max(12, Math.floor((chartWidth - 20) / daysList.length - 8));
                  const gap = (chartWidth - barWidth * daysList.length) / (daysList.length + 1);
                  const x = gap + idx * (barWidth + gap);

                  const maxBarHeight = chartHeight - 50;
                  const barHeight = item.count > 0 ? Math.max(8, (item.count / maxCount) * maxBarHeight) : 4;
                  const y = chartHeight - 24 - barHeight;

                  return (
                    <G key={idx}>
                      {/* Bar Rectangle */}
                      <Rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={6}
                        fill={item.count > 0 ? md3Colors.primary : md3Colors.surfaceContainerHighest}
                      />

                      {/* Count label above bar */}
                      {item.count > 0 && (
                        <SvgText
                          x={x + barWidth / 2}
                          y={y - 4}
                          fill={md3Colors.primary}
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {item.count}
                        </SvgText>
                      )}

                      {/* Day Label below bar */}
                      <SvgText
                        x={x + barWidth / 2}
                        y={chartHeight - 8}
                        fill={md3Colors.outline}
                        fontSize="9"
                        textAnchor="middle"
                      >
                        {item.label}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>
            </View>
          </M3Card>

          {/* Phase 9: AI Financial Advisor & Monthly Budget Caps */}
          <M3Card variant="filled" style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>💰 Financial Budget Caps</Text>
              <View style={[styles.budgetBadge, { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }]}>
                <Text style={{ color: '#10B981', fontSize: 11, fontWeight: 'bold' }}>🟢 On Track</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>Monthly Category Spending Limits & Threshold Warnings</Text>

            <View style={styles.budgetRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.budgetName}>🛒 Groceries & Dining</Text>
                <Text style={styles.budgetAmount}>$240 spent / $300 limit</Text>
              </View>
              <Text style={styles.budgetPercent}>80%</Text>
            </View>

            <View style={styles.budgetTrack}>
              <View style={[styles.budgetProgress, { width: '80%', backgroundColor: '#F59E0B' }]} />
            </View>

            <View style={[styles.budgetRow, { marginTop: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.budgetName}>💳 Shopping & Tech</Text>
                <Text style={styles.budgetAmount}>$120 spent / $250 limit</Text>
              </View>
              <Text style={styles.budgetPercent}>48%</Text>
            </View>

            <View style={styles.budgetTrack}>
              <View style={[styles.budgetProgress, { width: '48%', backgroundColor: '#10B981' }]} />
            </View>
          </M3Card>

          {/* Material 3 Category Breakdown Bars */}
          <M3Card variant="outlined" style={styles.breakdownCard}>
            <Text style={styles.cardHeaderTitle}>📊 Category Breakdown</Text>
            {categoryEntries.length === 0 ? (
              <Text style={styles.emptyText}>No logs match current filter.</Text>
            ) : (
              categoryEntries.map(([cat, count]) => {
                const pct = Math.round((count / totalEntries) * 100);
                const color = CATEGORY_META[cat as Category]?.color || md3Colors.primary;
                return (
                  <View key={cat} style={styles.barRow}>
                    <View style={styles.barLabelRow}>
                      <Text style={styles.barCategoryText}>
                        {CATEGORY_META[cat as Category]?.icon || '📝'} {cat.toUpperCase()}
                      </Text>
                      <Text style={styles.barCountText}>
                        {count} ({pct}%)
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })
            )}
          </M3Card>
        </>
      )}
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
  heading: {
    ...md3Typography.headlineMedium,
    color: md3Colors.onBackground,
  },
  subHeading: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  timeframePills: {
    flexDirection: 'row',
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 16,
    padding: 3,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pillActive: {
    backgroundColor: md3Colors.tertiaryContainer,
  },
  pillText: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
  },
  pillTextActive: {
    color: md3Colors.onTertiaryContainer,
    fontWeight: 'bold',
  },
  streaksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  filterSection: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    color: md3Colors.onSurface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  tagCloud: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  tagCloudLabel: { ...md3Typography.labelSmall, color: md3Colors.outline, marginRight: 6 },
  coachCard: {
    marginBottom: 20,
    backgroundColor: md3Colors.surfaceContainerHighest,
  },
  coachTitle: { ...md3Typography.titleLarge, color: md3Colors.onSurface, marginBottom: 4 },
  coachSub: { ...md3Typography.bodyMedium, color: md3Colors.onSurfaceVariant, textAlign: 'center', marginBottom: 14, maxWidth: 300 },
  errorText: { color: md3Colors.error, fontSize: 12, marginTop: 8 },
  digestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: md3Colors.outlineVariant, paddingBottom: 8 },
  refreshText: { ...md3Typography.labelSmall, color: md3Colors.tertiary },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statTile: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 14,
    marginVertical: 0,
  },
  statNumber: { ...md3Typography.headlineMedium, color: md3Colors.onSurface },
  statLabel: { ...md3Typography.labelSmall, color: md3Colors.onSurfaceVariant, marginTop: 2 },
  chartCard: {
    marginBottom: 20,
    padding: 16,
  },
  breakdownCard: {
    marginBottom: 20,
  },
  cardHeaderTitle: { ...md3Typography.titleMedium, color: md3Colors.onSurface, marginBottom: 14 },
  emptyText: { ...md3Typography.bodyMedium, color: md3Colors.onSurfaceVariant },
  barRow: { marginBottom: 12 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barCategoryText: { ...md3Typography.labelLarge, color: md3Colors.onSurface },
  barCountText: { ...md3Typography.labelSmall, color: md3Colors.onSurfaceVariant },
  barTrack: { height: 8, backgroundColor: md3Colors.surfaceContainer, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  budgetName: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurface,
    fontWeight: 'bold',
  },
  budgetAmount: {
    fontSize: 11,
    color: md3Colors.onSurfaceVariant,
    marginTop: 2,
  },
  budgetPercent: {
    fontSize: 12,
    fontWeight: 'bold',
    color: md3Colors.primary,
  },
  budgetTrack: {
    height: 8,
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 4,
    overflow: 'hidden',
  },
  budgetProgress: {
    height: '100%',
    borderRadius: 4,
  },
});
