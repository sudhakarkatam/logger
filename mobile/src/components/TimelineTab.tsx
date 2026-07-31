import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { md3Colors, md3Typography } from '../theme';
import { queryEntries, deleteEntry, Entry } from '../services/api';
import CategoryBadge from './ui/CategoryBadge';
import M3Card from './ui/m3/M3Card';
import M3Chip from './ui/m3/M3Chip';

export default function TimelineTab() {
  const [logs, setLogs] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    fetchTimeline();
  }, [selectedCategory]);

  async function fetchTimeline() {
    try {
      setLoading(true);
      const res = await queryEntries(selectedCategory === 'all' ? undefined : selectedCategory, 100);
      setLogs(res.entries || []);
    } catch (err: any) {
      console.log('Error loading timeline:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleDelete(id: string, text: string) {
    Alert.alert('Delete Log Entry', `Are you sure you want to delete "${text.substring(0, 30)}..."?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEntry(id);
            setLogs((prev) => prev.filter((item) => item.id !== id));
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Could not delete entry.');
          }
        },
      },
    ]);
  }

  const filteredLogs = logs.filter((l) =>
    l.raw_text?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = ['all', 'meal', 'mood', 'exercise', 'sleep', 'expense', 'water', 'work', 'book', 'other'];

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search activity journal by keyword..."
          placeholderTextColor={md3Colors.outline}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filters */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categories.map((cat) => (
            <M3Chip
              key={cat}
              label={cat.toUpperCase()}
              selected={selectedCategory === cat}
              onPress={() => setSelectedCategory(cat)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Logs Stream */}
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={md3Colors.primary} style={{ marginTop: 40 }} />
      ) : filteredLogs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
          <Text style={styles.emptyTitle}>No Activity Logs Found</Text>
          <Text style={styles.emptySub}>Try searching for another keyword or selecting a different category filter.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTimeline(); }} tintColor={md3Colors.primary} />}
          renderItem={({ item }) => (
            <M3Card variant="filled" style={styles.logCard}>
              <View style={styles.cardHeader}>
                <CategoryBadge category={item.category} size="small" />

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={styles.timeText}>
                    {new Date(item.entry_time || item.created_at).toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>

                  <TouchableOpacity onPress={() => handleDelete(item.id, item.raw_text)}>
                    <Text style={{ fontSize: 14 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.rawText}>{item.raw_text}</Text>

              {item.data && Object.keys(item.data).length > 0 && (
                <View style={styles.metaBox}>
                  <Text style={styles.metaText}>
                    {JSON.stringify(item.data).replace(/[{}"']/g, ' ').trim()}
                  </Text>
                </View>
              )}
            </M3Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  filterBar: {
    paddingBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  logCard: {
    marginBottom: 8,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    ...md3Typography.labelSmall,
    color: md3Colors.outline,
  },
  rawText: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurface,
    lineHeight: 20,
    marginTop: 4,
  },
  metaBox: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  metaText: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    ...md3Typography.titleLarge,
    color: md3Colors.onSurface,
    marginBottom: 4,
  },
  emptySub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 260,
  },
});
