import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { md3Colors, md3Typography } from '../theme';
import { sendMessage, uploadMedia, deleteEntry, queryEntries, getLocalSettings, saveLocalSettings } from '../services/api';
import { CATEGORY_CHIPS, DEFAULT_PRESETS, QUICK_MODELS, PROVIDER_DISPLAY, Provider } from '../utils/constants';
import MarkdownRenderer from './ui/MarkdownRenderer';
import CategoryBadge from './ui/CategoryBadge';
import M3Chip from './ui/m3/M3Chip';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  category?: string;
  image?: string;
  timestamp: string;
  entry?: any;
  interactiveCard?: any;
}

interface ChatTabProps {
  onLogAdded: () => void;
  initialText?: string;
}

export default function ChatTab({ onLogAdded, initialText }: ChatTabProps) {
  const [inputText, setInputText] = useState(initialText || '');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMode, setChatMode] = useState<'normal' | 'chef' | 'lifegpt'>('normal');
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showCategoryDrawer, setShowCategoryDrawer] = useState(false);

  // Draft Context & Undo Toast
  const [draftContext, setDraftContext] = useState<any | null>(null);
  const [lastLoggedEntry, setLastLoggedEntry] = useState<any | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: '👋 **Welcome to your AI Second Brain.**\nType what you did today (e.g. *Ate 2 chapathi for lunch*, *Spent 150 on groceries*, *5k run in 25m*), or tap **+** below for Material 3 log templates.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  useEffect(() => {
    loadSavedSettings();
  }, []);

  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
    }
  }, [initialText]);

  async function loadSavedSettings() {
    const s = await getLocalSettings();
    setProvider(s.provider as Provider);
    setModel(s.model);
  }

  async function handleQuickModelSwitch(newProvider: Provider, newModel: string) {
    setProvider(newProvider);
    setModel(newModel);
    await saveLocalSettings({ provider: newProvider, model: newModel });
    setShowModelPicker(false);
  }

  async function handleSend(textOverride?: string, cardDraftContext: any = null) {
    const textToSend = textOverride !== undefined ? textOverride : inputText;
    if ((!textToSend.trim() && !selectedImage) || loading) return;

    let publicImageUrl: string | undefined = undefined;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend || (selectedImage ? '📷 Sent a photo' : ''),
      image: selectedImage || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (textOverride === undefined) setInputText('');
    const localImg = selectedImage;
    setSelectedImage(null);
    setShowCategoryDrawer(false);
    setLoading(true);

    try {
      if (localImg) {
        try {
          publicImageUrl = await uploadMedia(localImg);
        } catch (uploadErr) {
          console.error('Image upload failed:', uploadErr);
        }
      }

      const historyPayload = messages.slice(-8).map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const mode = chatMode === 'chef' ? 'chef' : chatMode === 'lifegpt' ? 'lifegpt' : 'general';
      const response = await sendMessage(
        textToSend || '📷 Sent a photo',
        1,
        cardDraftContext || draftContext,
        historyPayload,
        publicImageUrl,
        mode
      );

      if (response.needs_clarification) {
        setDraftContext(response.draftContext);
      } else {
        setDraftContext(null);
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: response.acknowledgment,
        category: response.entry ? response.entry.category : undefined,
        entry: response.entry || undefined,
        interactiveCard: response.interactiveCard || null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);

      if (response.entry) {
        setLastLoggedEntry(response.entry);
        setShowUndoToast(true);
        setTimeout(() => setShowUndoToast(false), 7000);
      }

      onLogAdded();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: `⚠️ **Connection issue**: ${err.message || 'Please check network or settings.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo() {
    if (!lastLoggedEntry) return;
    try {
      await deleteEntry(lastLoggedEntry.id);
      setMessages((prev) => prev.slice(0, -2));
      setLastLoggedEntry(null);
      setShowUndoToast(false);
      onLogAdded();
    } catch (err: any) {
      Alert.alert('Undo Failed', err.message || 'Could not delete entry.');
    }
  }

  async function pickImageFromCamera() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Camera access is required to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: (ImagePicker.MediaTypeOptions?.Images || 'images') as any,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('Camera picker error:', err);
    }
  }

  async function pickImageFromGallery() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Gallery access is required to choose photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: (ImagePicker.MediaTypeOptions?.Images || 'images') as any,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets[0]?.uri) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('Gallery picker error:', err);
    }
  }

  useEffect(() => {
    if (typeof Keyboard === 'undefined' || !Keyboard?.addListener) return;

    try {
      const showSub = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        () => {
          setTimeout(() => {
            if (messages && messages.length > 0) {
              try {
                flatListRef.current?.scrollToEnd({ animated: true });
              } catch (_) {}
            }
          }, 100);
        }
      );
      return () => showSub?.remove();
    } catch (_) {}
  }, [messages]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      {/* Top Controls: Mode Switcher + LLM Selector */}
      <View style={styles.topControlBar}>
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, chatMode === 'normal' && styles.modeTabActive]}
            onPress={() => setChatMode('normal')}
          >
            <Text style={[styles.modeTabText, chatMode === 'normal' && styles.modeTabTextActive]}>💬 General</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, chatMode === 'chef' && styles.modeTabChefActive]}
            onPress={() => setChatMode('chef')}
          >
            <Text style={[styles.modeTabText, chatMode === 'chef' && styles.modeTabTextChefActive]}>👨‍🍳 Chef AI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, chatMode === 'lifegpt' && styles.modeTabLifeActive]}
            onPress={() => setChatMode('lifegpt')}
          >
            <Text style={[styles.modeTabText, chatMode === 'lifegpt' && styles.modeTabTextLifeActive]}>🧠 Coach</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.modelPickerBtn} onPress={() => setShowModelPicker(true)}>
          <Text style={styles.modelPickerBtnText}>✨ {model.split('/').pop()} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* Messages Stream */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={() => {
          if (messages && messages.length > 0) {
            try {
              flatListRef.current?.scrollToEnd({ animated: true });
            } catch (_) {}
          }
        }}
        renderItem={({ item }) => (
          <View style={[styles.msgRow, item.sender === 'user' ? styles.msgRowUser : styles.msgRowAi]}>
            <View style={[styles.msgBubble, item.sender === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
              {item.image && <Image source={{ uri: item.image }} style={styles.msgImage} resizeMode="cover" />}

              {item.category && item.sender === 'ai' && (
                <View style={{ marginBottom: 6 }}>
                  <CategoryBadge category={item.category} size="small" />
                </View>
              )}

              <MarkdownRenderer content={item.text} textStyle={item.sender === 'user' ? styles.userText : styles.aiText} />

              <Text style={[styles.msgTime, item.sender === 'user' && { color: md3Colors.onPrimary }]}>
                {item.timestamp}
              </Text>

              {/* Interactive Card */}
              {item.interactiveCard && (
                <View style={styles.interactiveCard}>
                  <Text style={styles.cardHeaderTitle}>⚠️ Duplicate Entry Detected</Text>
                  <Text style={styles.cardMsg}>{item.interactiveCard.message}</Text>

                  <View style={styles.cardOptions}>
                    {item.interactiveCard.options.map((opt: any, idx: number) => (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.cardOptBtn,
                          opt.style === 'primary' && styles.cardOptPrimary,
                          opt.style === 'danger' && styles.cardOptDanger,
                        ]}
                        onPress={() => handleSend(opt.textValue, { action: opt.actionValue, date: item.interactiveCard?.date })}
                      >
                        <Text style={styles.cardOptText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      />

      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color={md3Colors.primary} />
          <Text style={styles.loadingMsg}>Material 3 AI Assistant is working...</Text>
        </View>
      )}

      {/* Undo Toast */}
      {showUndoToast && lastLoggedEntry && (
        <View style={styles.undoToast}>
          <Text style={styles.undoText}>
            Logged <Text style={{ fontWeight: 'bold', color: '#FFF' }}>{lastLoggedEntry.category}</Text>
          </Text>
          <TouchableOpacity style={styles.undoBtn} onPress={handleUndo}>
            <Text style={styles.undoBtnText}>↩ Undo Log</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Collapsible M3 Category Drawer */}
      {showCategoryDrawer && (
        <View style={styles.drawerContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {CATEGORY_CHIPS.map((c) => {
              const isSelected = selectedCategory === c.category;
              return (
                <M3Chip
                  key={c.category}
                  label={c.label}
                  selected={isSelected}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedCategory(null);
                    } else {
                      setSelectedCategory(c.category);
                      setInputText(c.prefix);
                    }
                  }}
                />
              );
            })}
          </ScrollView>

          {selectedCategory && DEFAULT_PRESETS[selectedCategory] && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, marginTop: 8 }}>
              {DEFAULT_PRESETS[selectedCategory].map((preset, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.presetChip}
                  onPress={() => {
                    const prefix = CATEGORY_CHIPS.find((c) => c.category === selectedCategory)?.prefix || '';
                    handleSend(`${prefix}${preset}`);
                  }}
                >
                  <Text style={styles.presetChipText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Attached Image Preview */}
      {selectedImage && (
        <View style={styles.imagePreviewRow}>
          <Image source={{ uri: selectedImage }} style={styles.previewThumb} />
          <Text style={{ color: md3Colors.onSurfaceVariant, fontSize: 12, marginLeft: 8 }}>Photo attached</Text>
          <TouchableOpacity style={styles.closePreview} onPress={() => setSelectedImage(null)}>
            <Text style={{ color: '#fff', fontSize: 11 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Floating M3 Prompt Capsule */}
      <View style={styles.inputDock}>
        <View style={styles.inputCapsule}>
          <TouchableOpacity
            style={[styles.actionToggleBtn, showCategoryDrawer && styles.actionToggleBtnActive]}
            onPress={() => setShowCategoryDrawer(!showCategoryDrawer)}
          >
            <Text style={styles.actionToggleIcon}>{showCategoryDrawer ? '✕' : '+'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaBtn} onPress={pickImageFromCamera}>
            <Text style={{ fontSize: 18 }}>📷</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.mediaBtn} onPress={pickImageFromGallery}>
            <Text style={{ fontSize: 18 }}>🖼️</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder={
              chatMode === 'chef'
                ? "Ask Chef: what to cook..."
                : chatMode === 'lifegpt'
                ? "Ask Coach: How was my week?..."
                : "Ask AI or log meal, expense, workout..."
            }
            placeholderTextColor={md3Colors.outline}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxHeight={120}
          />

          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() && !selectedImage) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={(!inputText.trim() && !selectedImage) || loading}
          >
            <Text style={styles.sendBtnIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Model Selection Modal */}
      <Modal visible={showModelPicker} transparent animationType="fade" onRequestClose={() => setShowModelPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowModelPicker(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>✨ Select AI Model Engine</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {(['gemini', 'groq', 'openrouter', 'openai', 'anthropic'] as Provider[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.providerChip, provider === p && styles.providerChipActive]}
                  onPress={() => setProvider(p)}
                >
                  <Text style={[styles.providerChipText, provider === p && styles.providerChipTextActive]}>
                    {PROVIDER_DISPLAY[p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView style={{ maxHeight: 300 }}>
              {(QUICK_MODELS[provider] || []).map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modelItem, model === m.id && styles.modelItemActive]}
                  onPress={() => handleQuickModelSwitch(provider, m.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modelItemText, model === m.id && styles.modelItemTextActive]}>{m.label}</Text>
                    <Text style={styles.modelIdSub}>{m.id}</Text>
                  </View>
                  {m.free && <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>FREE</Text></View>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowModelPicker(false)}>
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: md3Colors.background,
  },
  topControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: md3Colors.surfaceContainer,
    borderBottomWidth: 1,
    borderBottomColor: md3Colors.outlineVariant,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 20,
    padding: 3,
  },
  modeTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  modeTabActive: { backgroundColor: md3Colors.primaryContainer },
  modeTabChefActive: { backgroundColor: md3Colors.catMeal },
  modeTabLifeActive: { backgroundColor: md3Colors.catMood },
  modeTabText: { color: md3Colors.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
  modeTabTextActive: { color: md3Colors.onPrimaryContainer, fontWeight: 'bold' },
  modeTabTextChefActive: { color: '#000000', fontWeight: 'bold' },
  modeTabTextLifeActive: { color: '#000000', fontWeight: 'bold' },
  modelPickerBtn: {
    backgroundColor: md3Colors.secondaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  modelPickerBtnText: { color: md3Colors.onSecondaryContainer, fontSize: 11, fontWeight: '700' },
  messagesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  msgRow: {
    marginVertical: 6,
    flexDirection: 'row',
  },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAi: { justifyContent: 'flex-start' },
  msgBubble: {
    maxWidth: '88%',
    padding: 14,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: md3Colors.primaryContainer,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: md3Colors.surfaceContainerHigh,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  userText: { color: md3Colors.onPrimaryContainer, fontSize: 14, lineHeight: 21 },
  aiText: { color: md3Colors.onSurface, fontSize: 14, lineHeight: 21 },
  msgTime: {
    fontSize: 10,
    color: md3Colors.outline,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  msgImage: {
    width: 220,
    height: 140,
    borderRadius: 12,
    marginBottom: 8,
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  loadingMsg: { color: md3Colors.onSurfaceVariant, fontSize: 12 },
  undoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  undoText: { color: md3Colors.onSurfaceVariant, fontSize: 13 },
  undoBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: md3Colors.error,
  },
  undoBtnText: { color: md3Colors.error, fontSize: 12, fontWeight: 'bold' },
  drawerContainer: {
    backgroundColor: md3Colors.surfaceContainer,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: md3Colors.outlineVariant,
  },
  presetChip: {
    backgroundColor: md3Colors.secondaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  presetChipText: { color: md3Colors.onSecondaryContainer, fontSize: 11, fontWeight: '600' },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: md3Colors.surfaceContainer,
  },
  previewThumb: { width: 36, height: 36, borderRadius: 6 },
  closePreview: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.2)', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inputDock: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: md3Colors.background,
  },
  inputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  actionToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: md3Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  actionToggleBtnActive: {
    backgroundColor: md3Colors.primaryContainer,
  },
  actionToggleIcon: {
    color: md3Colors.onSurface,
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  mediaBtn: { padding: 6 },
  textInput: {
    flex: 1,
    color: md3Colors.onSurface,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  sendBtn: {
    backgroundColor: md3Colors.primary,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnIcon: { color: md3Colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  interactiveCard: {
    marginTop: 10,
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
  },
  cardHeaderTitle: { color: md3Colors.catReminder, fontWeight: 'bold', fontSize: 12, marginBottom: 4 },
  cardMsg: { color: md3Colors.onSurfaceVariant, fontSize: 12, marginBottom: 8 },
  cardOptions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardOptBtn: {
    backgroundColor: md3Colors.surfaceContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  cardOptPrimary: { backgroundColor: md3Colors.primary },
  cardOptDanger: { backgroundColor: md3Colors.error },
  cardOptText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: md3Colors.surfaceContainer,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: md3Colors.outlineVariant,
  },
  modalTitle: { color: md3Colors.onSurface, fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  providerChip: {
    backgroundColor: md3Colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  providerChipActive: { backgroundColor: md3Colors.primary },
  providerChipText: { color: md3Colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  providerChipTextActive: { color: md3Colors.onPrimary, fontWeight: 'bold' },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modelItemActive: { backgroundColor: md3Colors.surfaceContainerHighest },
  modelItemText: { color: md3Colors.onSurface, fontSize: 14, fontWeight: '600' },
  modelItemTextActive: { color: md3Colors.primary, fontWeight: 'bold' },
  modelIdSub: { color: md3Colors.outline, fontSize: 11, marginTop: 2 },
  freeBadge: { backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  freeBadgeText: { color: md3Colors.catExpense, fontSize: 10, fontWeight: 'bold' },
  modalCloseBtn: {
    backgroundColor: md3Colors.primary,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseText: { color: md3Colors.onPrimary, fontWeight: 'bold', fontSize: 14 },
});
