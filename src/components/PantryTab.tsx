import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { md3Colors, md3Typography } from '../theme';
import {
  queryPantry,
  queryRecipes,
  deletePantryItem,
  deleteRecipe,
  updatePantryItemQuantity,
  sendMessage,
} from '../services/api';
import { getExpiryBadgeClass, getExpiryLabel } from '../utils/formatters';
import M3Card from './ui/m3/M3Card';
import M3Button from './ui/m3/M3Button';

export default function PantryTab() {
  const [subTab, setSubTab] = useState<'pantry' | 'cookbook'>('pantry');
  const [pantryItems, setPantryItems] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chefLoading, setChefLoading] = useState(false);

  useEffect(() => {
    loadPantryAndCookbook();
  }, []);

  async function loadPantryAndCookbook() {
    try {
      setLoading(true);
      const [pRes, rRes] = await Promise.all([queryPantry(), queryRecipes()]);
      setPantryItems(pRes.data || []);
      setRecipes(rRes.data || []);
    } catch (err: any) {
      console.log('Error loading pantry data:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleQtyChange(id: number, currentQty: number, delta: number) {
    const nextQty = Math.max(0, currentQty + delta);
    try {
      if (nextQty === 0) {
        await deletePantryItem(id);
      } else {
        await updatePantryItemQuantity(id, nextQty);
      }
      loadPantryAndCookbook();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update quantity.');
    }
  }

  async function handleDeletePantry(id: number, name: string) {
    Alert.alert('Delete Pantry Item', `Remove "${name}" from your kitchen inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePantryItem(id);
            loadPantryAndCookbook();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  }

  async function handleDeleteRecipe(id: number, title: string) {
    Alert.alert('Delete Recipe', `Remove "${title}" from your cookbook?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecipe(id);
            loadPantryAndCookbook();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  }

  async function askChefAI() {
    try {
      setChefLoading(true);
      const stockNames = pantryItems.map((i) => i.name).filter(Boolean).join(', ');
      const promptText = stockNames
        ? `What quick recipe can I cook using my available pantry stock: ${stockNames}?`
        : 'Suggest a healthy 15-minute quick recipe for dinner.';

      const res = await sendMessage(promptText, 1, null, [], undefined, 'chef');
      Alert.alert('👨‍🍳 Chef AI Recipe Recommendation', res.acknowledgment);
      loadPantryAndCookbook();
    } catch (err: any) {
      Alert.alert('👨‍🍳 Chef AI', err.message || 'Suggested: 15-min Omelette & Fresh Greens Salad from your stock!');
    } finally {
      setChefLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Subtab Segmented Switcher */}
      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentBtn, subTab === 'pantry' && styles.segmentBtnActive]}
          onPress={() => setSubTab('pantry')}
        >
          <Text style={[styles.segmentText, subTab === 'pantry' && styles.segmentTextActive]}>
            🥦 Stock ({pantryItems.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, subTab === 'cookbook' && styles.segmentBtnActive]}
          onPress={() => setSubTab('cookbook')}
        >
          <Text style={[styles.segmentText, subTab === 'cookbook' && styles.segmentTextActive]}>
            📖 Cookbook ({recipes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chef AI Action Bar */}
      <View style={styles.chefBar}>
        <M3Button
          label={chefLoading ? 'Asking Chef AI...' : '👨‍🍳 Ask Chef AI What to Cook'}
          onPress={askChefAI}
          variant="filled"
          disabled={chefLoading}
          style={{ backgroundColor: md3Colors.tertiaryContainer, height: 44 }}
          labelStyle={{ color: md3Colors.onTertiaryContainer }}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPantryAndCookbook(); }} tintColor={md3Colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={md3Colors.primary} style={{ marginTop: 40 }} />
        ) : subTab === 'pantry' ? (
          /* PANTRY STOCK */
          pantryItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🥦</Text>
              <Text style={styles.emptyTitle}>Pantry Inventory is Empty</Text>
              <Text style={styles.emptySub}>Tell Chef AI in Chat what groceries you bought (e.g. *Bought 1kg rice, 6 eggs*) to auto-stock!</Text>
            </View>
          ) : (
            pantryItems.map((item) => {
              const badgeClass = getExpiryBadgeClass(item.expiry_date);
              const badgeColor =
                badgeClass === 'badge-expired'
                  ? md3Colors.error
                  : badgeClass === 'badge-soon'
                  ? md3Colors.tertiary
                  : md3Colors.catExpense;

              return (
                <M3Card key={item.id} variant="filled" style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <View style={[styles.expiryBadge, { backgroundColor: `${badgeColor}20`, borderColor: `${badgeColor}40` }]}>
                      <Text style={[styles.expiryText, { color: badgeColor }]}>{getExpiryLabel(item.expiry_date)}</Text>
                    </View>
                  </View>

                  {/* Quantity Stepper */}
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => handleQtyChange(item.id, Number(item.quantity || 1), -1)}
                    >
                      <Text style={styles.stepperText}>-</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyText}>
                      {item.quantity} {item.unit || ''}
                    </Text>

                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => handleQtyChange(item.id, Number(item.quantity || 1), 1)}
                    >
                      <Text style={styles.stepperText}>+</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeletePantry(item.id, item.name)}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </TouchableOpacity>
                </M3Card>
              );
            })
          )
        ) : (
          /* COOKBOOK RECIPES */
          recipes.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📖</Text>
              <Text style={styles.emptyTitle}>No Cookbook Recipes</Text>
              <Text style={styles.emptySub}>Tell Chef AI in Chat: *"Save recipe for Egg Toast: 2 eggs, 2 bread slices"* to save!</Text>
            </View>
          ) : (
            recipes.map((recipe) => (
              <M3Card key={recipe.id} variant="filled" style={styles.recipeCard}>
                <View style={styles.recipeHeader}>
                  <Text style={styles.recipeTitle}>{recipe.name}</Text>
                  <TouchableOpacity onPress={() => handleDeleteRecipe(recipe.id, recipe.name)}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>

                {recipe.description ? <Text style={styles.recipeDesc}>{recipe.description}</Text> : null}

                {recipe.ingredients ? (
                  <View style={styles.recipeMetaBox}>
                    <Text style={styles.metaTitle}>🛒 Ingredients:</Text>
                    <Text style={styles.metaContent}>{Array.isArray(recipe.ingredients) ? recipe.ingredients.join(', ') : recipe.ingredients}</Text>
                  </View>
                ) : null}

                {recipe.instructions ? (
                  <View style={styles.recipeMetaBox}>
                    <Text style={styles.metaTitle}>🍳 Instructions:</Text>
                    <Text style={styles.metaContent}>{recipe.instructions}</Text>
                  </View>
                ) : null}
              </M3Card>
            ))
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: md3Colors.surfaceContainer,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
  },
  segmentBtnActive: {
    backgroundColor: md3Colors.primaryContainer,
  },
  segmentText: {
    ...md3Typography.labelLarge,
    color: md3Colors.onSurfaceVariant,
  },
  segmentTextActive: {
    color: md3Colors.onPrimaryContainer,
    fontWeight: 'bold',
  },
  chefBar: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
  },
  itemName: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
  },
  expiryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
  },
  expiryText: {
    ...md3Typography.labelSmall,
    fontWeight: 'bold',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 10,
  },
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepperText: {
    color: md3Colors.onSurface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  qtyText: {
    color: md3Colors.onSurface,
    fontSize: 12,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  deleteBtn: {
    padding: 4,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    ...md3Typography.titleLarge,
    color: md3Colors.onSurface,
    marginBottom: 6,
  },
  emptySub: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
  },
  recipeCard: {
    marginBottom: 10,
    padding: 14,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recipeTitle: {
    ...md3Typography.titleLarge,
    color: md3Colors.onSurface,
  },
  recipeDesc: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 8,
  },
  recipeMetaBox: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  metaTitle: {
    ...md3Typography.labelSmall,
    color: md3Colors.catMeal,
    marginBottom: 2,
  },
  metaContent: {
    ...md3Typography.bodyMedium,
    color: md3Colors.onSurfaceVariant,
  },
});
