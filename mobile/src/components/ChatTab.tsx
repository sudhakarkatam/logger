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
  Keyboard,
  StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { md3Colors, md3Typography, theme } from '../theme';
import { sendMessage, uploadMedia, deleteEntry, queryEntries, getLocalSettings, saveLocalSettings } from '../services/api';
import { CATEGORY_CHIPS, DEFAULT_PRESETS, QUICK_MODELS, PROVIDER_DISPLAY, Provider } from '../utils/constants';
import { parseNaturalLanguageReminder } from '../services/alarms';
import { scheduleCustomReminder, scheduleRelativeReminder } from '../services/notifications';
import MarkdownRenderer from './ui/MarkdownRenderer';
import CategoryBadge from './ui/CategoryBadge';
import M3Chip from './ui/m3/M3Chip';
import VoiceDictationModal from './VoiceDictationModal';
import { getGreeting } from '../utils/formatters';
import { Portal, Dialog, Button as PaperButton, Modal as PaperModal, Surface, IconButton, Chip as PaperChip, Snackbar } from 'react-native-paper';

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
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState(initialText || '');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMode, setChatMode] = useState<'normal' | 'chef' | 'lifegpt'>('normal');
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showCategoryDrawer, setShowCategoryDrawer] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  // Draft Context & Undo Toast
  const [draftContext, setDraftContext] = useState<any | null>(null);
  const [lastLoggedEntry, setLastLoggedEntry] = useState<any | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);

  // Quick Log Modal State
  const [quickLogModalConfig, setQuickLogModalConfig] = useState<{
    visible: boolean;
    type: 'work' | 'exercise' | 'coffee' | 'water';
    title: string;
    unit: string;
    icon: string;
    defaultValue: string;
    presets: string[];
  }>({
    visible: false,
    type: 'work',
    title: 'Work Hours',
    unit: 'hours',
    icon: 'briefcase-outline',
    defaultValue: '8',
    presets: ['2', '4', '6', '8'],
  });
  const [quickLogInputValue, setQuickLogInputValue] = useState('8');

  function openQuickLogModal(
    type: 'work' | 'exercise' | 'coffee' | 'water',
    title: string,
    unit: string,
    icon: string,
    defaultValue: string,
    presets: string[]
  ) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setQuickLogModalConfig({
      visible: true,
      type,
      title,
      unit,
      icon,
      defaultValue,
      presets,
    });
    setQuickLogInputValue(defaultValue);
  }

  function handleConfirmQuickLog() {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const { type, unit } = quickLogModalConfig;
    const val = quickLogInputValue.trim() || '1';
    setQuickLogModalConfig((prev) => ({ ...prev, visible: false }));
    handleSend(`log ${type}: ${val} ${unit}`);
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const flatListRef = useRef<FlatList>(null);

  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadUserAvatar();
  }, []);

  async function loadUserAvatar() {
    try {
      const savedImg = await AsyncStorage.getItem('@buddy_profile_image');
      if (savedImg) setUserAvatar(savedImg);
    } catch (_) {}
  }

  async function loadSettings() {
    try {
      const s = await getLocalSettings();
      if (s.provider) setProvider(s.provider);
      if (s.model) setModel(s.model);
    } catch (_) {}
  }

  async function handleSelectModel(newProvider: Provider, newModel: string) {
    setProvider(newProvider);
    setModel(newModel);
    await saveLocalSettings({ provider: newProvider, model: newModel });
    setShowModelPicker(false);
  }

  async function handleSend(textOverride?: string, cardDraftContext: any = null) {
    const textToSend = textOverride !== undefined ? textOverride : inputText;
    if ((!textToSend.trim() && !selectedImage) || loading) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}

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

      const historyPayload = messages.slice(-8).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      // Check if input text is a natural language relative time reminder ("Remind me in 10 mins...")
      const timeParsed = parseNaturalLanguageReminder(textToSend);
      if (timeParsed.isTimeReminder) {
        if (timeParsed.minutesDelay) {
          const secondsDelay = timeParsed.minutesDelay * 60;
          const targetTime = new Date(Date.now() + secondsDelay * 1000);
          await scheduleRelativeReminder('✨ Buddy Reminder', timeParsed.reminderText || 'Time reminder', secondsDelay);

          const formattedTargetTime = targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: `⏰ **Reminder Scheduled for ${formattedTargetTime}!** (in ${timeParsed.minutesDelay} mins): *"${timeParsed.reminderText}"*.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setLoading(false);
          onLogAdded();
          return;
        }
      }

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
        onLogAdded();
        setTimeout(() => setShowUndoToast(false), 7000);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `⚠️ **Connection Issue**: ${err.message || 'Unable to communicate with AI server.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
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

  return (
    <KeyboardAvoidingView
      style={styles.grokContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}
    >
      {/* Grok Header Bar: Centered Mode Switcher Tabs (Ask | Coach | Chef) */}
      <View style={styles.grokHeader}>
        <View style={styles.grokTabSwitcher}>
          <TouchableOpacity
            style={[styles.grokTab, chatMode === 'normal' && styles.grokTabActive]}
            onPress={() => setChatMode('normal')}
          >
            <Text style={[styles.grokTabText, chatMode === 'normal' && styles.grokTabTextActive]}>Ask</Text>
            {chatMode === 'normal' && <View style={styles.grokTabIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.grokTab, chatMode === 'lifegpt' && styles.grokTabActive]}
            onPress={() => setChatMode('lifegpt')}
          >
            <Text style={[styles.grokTabText, chatMode === 'lifegpt' && styles.grokTabTextActive]}>Coach</Text>
            {chatMode === 'lifegpt' && <View style={styles.grokTabIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.grokTab, chatMode === 'chef' && styles.grokTabActive]}
            onPress={() => setChatMode('chef')}
          >
            <Text style={[styles.grokTabText, chatMode === 'chef' && styles.grokTabTextActive]}>Chef</Text>
            {chatMode === 'chef' && <View style={styles.grokTabIndicator} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages Stream */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.proactiveHeroContainer}>
            {/* Greeting Header */}
            <View style={styles.proactiveHeader}>
              <Text style={styles.proactiveGreetingTitle}>{getGreeting()} 👋</Text>
              <Text style={styles.proactiveGreetingSub}>Quick Log Activities or Start a Conversation</Text>
            </View>

            {/* 2x2 Material 3 Ultra-Compact Micro-Chips Grid */}
            <View style={styles.quickGrid}>
              {/* Work Card */}
              <Surface style={styles.quickTile} elevation={1}>
                <TouchableOpacity
                  style={styles.quickTileInner}
                  onPress={() => openQuickLogModal('work', 'Log Work Hours', 'hours', 'briefcase-outline', '8', ['2', '4', '6', '8'])}
                >
                  <MaterialCommunityIcons name="briefcase-outline" size={18} color="#6366F1" />
                  <Text style={styles.quickTileTitle}>Work</Text>
                </TouchableOpacity>
              </Surface>

              {/* Exercise Card */}
              <Surface style={styles.quickTile} elevation={1}>
                <TouchableOpacity
                  style={styles.quickTileInner}
                  onPress={() => openQuickLogModal('exercise', 'Log Exercise', 'minutes', 'run-fast', '30', ['15', '30', '45', '60'])}
                >
                  <MaterialCommunityIcons name="run-fast" size={18} color="#F59E0B" />
                  <Text style={styles.quickTileTitle}>Exercise</Text>
                </TouchableOpacity>
              </Surface>

              {/* Coffee Card */}
              <Surface style={styles.quickTile} elevation={1}>
                <TouchableOpacity
                  style={styles.quickTileInner}
                  onPress={() => openQuickLogModal('coffee', 'Log Coffee', 'cups', 'coffee-outline', '1', ['1', '2', '3'])}
                >
                  <MaterialCommunityIcons name="coffee-outline" size={18} color="#D97706" />
                  <Text style={styles.quickTileTitle}>Coffee</Text>
                </TouchableOpacity>
              </Surface>

              {/* Water Card */}
              <Surface style={styles.quickTile} elevation={1}>
                <TouchableOpacity
                  style={styles.quickTileInner}
                  onPress={() => openQuickLogModal('water', 'Log Water', 'glasses', 'water-outline', '2', ['1', '2', '4', '6'])}
                >
                  <MaterialCommunityIcons name="water-outline" size={18} color="#3B82F6" />
                  <Text style={styles.quickTileTitle}>Water</Text>
                </TouchableOpacity>
              </Surface>
            </View>
          </View>
        }
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

              <Text style={[styles.msgTime, item.sender === 'user' && { color: 'rgba(255,255,255,0.6)' }]}>
                {item.timestamp}
              </Text>

              {/* Interactive Duplicate Card */}
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

            {/* Alive User Avatar Beside Sent Message */}
            {item.sender === 'user' && (
              <View style={styles.userMsgAvatarWrapper}>
                <Image
                  source={{
                    uri: userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
                  }}
                  style={styles.userMsgAvatar}
                />
              </View>
            )}
          </View>
        )}
      />

      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#818CF8" />
          <Text style={styles.loadingMsg}>Grok AI is processing your request...</Text>
        </View>
      )}

      {/* Material 3 Snackbar Undo Toast */}
      <Portal>
        <Snackbar
          visible={showUndoToast}
          onDismiss={() => setShowUndoToast(false)}
          duration={7000}
          action={{
            label: 'UNDO',
            onPress: handleUndo,
            textColor: '#818CF8',
          }}
          style={{
            backgroundColor: theme.colors.surfaceContainerHighest,
            borderRadius: theme.roundness.md,
            marginBottom: 80,
          }}
        >
          <Text style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
            Logged {lastLoggedEntry?.category || 'entry'}
          </Text>
        </Snackbar>
      </Portal>

      {/* Collapsible Category Drawer */}
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
          <Text style={{ color: '#A1A1AA', fontSize: 12, marginLeft: 8 }}>Photo attached</Text>
          <TouchableOpacity style={styles.closePreview} onPress={() => setSelectedImage(null)}>
            <Text style={{ color: '#FFF', fontSize: 11 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Grok Quick Action Horizontal Carousel (Pills above Input Capsule - shown only on chat start) */}
      {messages.length === 0 && (
        <View style={styles.grokPillsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grokPillsScroll}>
            <TouchableOpacity
              style={styles.grokActionPill}
              onPress={() => {
                setChatMode('lifegpt');
                handleSend('Give me a high-level summary of my daily habits and productivity!');
              }}
            >
              <MaterialCommunityIcons name="compass-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.grokActionPillText}>Try SuperGrok</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.grokActionPill}
              onPress={() => {
                setChatMode('chef');
                handleSend('What quick healthy recipe can I make in 15 minutes?');
              }}
            >
              <MaterialCommunityIcons name="chef-hat" size={16} color={theme.colors.primary} />
              <Text style={styles.grokActionPillText}>Chef AI Mode</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.grokActionPill} onPress={pickImageFromCamera}>
              <MaterialCommunityIcons name="camera-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.grokActionPillText}>Scan Meal Photo</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Material 3 Single-Surface Gemini/ChatGPT Style Executive Message Composer Dock */}
      <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <Surface style={styles.composerSurface} elevation={2}>
          {/* Left Controls: Plus Category Drawer + Camera */}
          <View style={styles.leftControlsRow}>
            <TouchableOpacity
              style={styles.composerIconBtn}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowCategoryDrawer(!showCategoryDrawer);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={showCategoryDrawer ? "close" : "plus"}
                size={22}
                color={showCategoryDrawer ? theme.colors.primary : theme.colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.composerIconBtn}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                pickImageFromCamera();
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="camera-outline" size={22} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Center Flexible Multiline TextInput */}
          <TextInput
            style={styles.composerInput}
            placeholder={
              chatMode === 'chef'
                ? 'Ask Chef AI for recipes...'
                : chatMode === 'lifegpt'
                ? 'Ask SuperGrok for analysis...'
                : 'Message Buddy...'
            }
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxHeight={110}
          />

          {/* Right Controls: Mic Dictation + Send Button */}
          <View style={styles.rightControlsRow}>
            {!inputText.trim() && !selectedImage && (
              <TouchableOpacity
                style={styles.composerIconBtn}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setShowVoiceModal(true);
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="microphone-outline" size={22} color={theme.colors.onSurfaceVariant} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.sendBtnCircle,
                (inputText.trim() || selectedImage) && styles.sendBtnCircleActive,
              ]}
              onPress={() => handleSend()}
              disabled={loading || (!inputText.trim() && !selectedImage)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="arrow-up"
                size={20}
                color={(inputText.trim() || selectedImage) ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          </View>
        </Surface>
      </View>

      {/* Model Engine Selector Modal */}
      <Portal>
        <PaperModal visible={showModelPicker} onDismiss={() => setShowModelPicker(false)}>
          <View style={styles.modelModalBox}>
            <Text style={styles.modelModalTitle}>🤖 Select Grok AI Engine</Text>
            {QUICK_MODELS[provider]?.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.modelOptionRow, model === m.id && styles.modelOptionSelected]}
                onPress={() => handleSelectModel(provider, m.id)}
              >
                <Text style={[styles.modelOptionText, model === m.id && styles.modelOptionTextActive]}>
                  {m.label}
                </Text>
                {m.free && <Text style={styles.freeBadge}>FREE</Text>}
              </TouchableOpacity>
            ))}
            <PaperButton onPress={() => setShowModelPicker(false)} style={{ marginTop: 12 }}>
              Close
            </PaperButton>
          </View>
        </PaperModal>

        {/* MD3 Quick Log Value Input Modal */}
        <PaperModal
          visible={quickLogModalConfig.visible}
          onDismiss={() => setQuickLogModalConfig((prev) => ({ ...prev, visible: false }))}
        >
          <View style={styles.quickModalBox}>
            {/* Modal Header */}
            <View style={styles.quickModalHeader}>
              <MaterialCommunityIcons name={quickLogModalConfig.icon as any} size={28} color={theme.colors.primary} />
              <Text style={styles.quickModalTitle}>{quickLogModalConfig.title}</Text>
            </View>

            {/* Quantity Input */}
            <Text style={styles.quickInputLabel}>Quantity ({quickLogModalConfig.unit}):</Text>
            <TextInput
              style={styles.quickNumberInput}
              keyboardType="numeric"
              value={quickLogInputValue}
              onChangeText={setQuickLogInputValue}
              placeholder={`Enter ${quickLogModalConfig.unit}...`}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoFocus
            />

            {/* Quick Preset Buttons */}
            <View style={styles.quickPresetRow}>
              {quickLogModalConfig.presets.map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.quickPresetBtn,
                    quickLogInputValue === val && styles.quickPresetBtnActive,
                  ]}
                  onPress={() => setQuickLogInputValue(val)}
                >
                  <Text style={[styles.quickPresetText, quickLogInputValue === val && styles.quickPresetTextActive]}>
                    +{val} {quickLogModalConfig.unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Buttons */}
            <View style={styles.quickModalActions}>
              <PaperButton
                mode="outlined"
                onPress={() => setQuickLogModalConfig((prev) => ({ ...prev, visible: false }))}
                style={{ flex: 1 }}
              >
                Cancel
              </PaperButton>

              <PaperButton
                mode="contained"
                buttonColor={theme.colors.primary}
                textColor={theme.colors.onPrimary}
                onPress={handleConfirmQuickLog}
                style={{ flex: 1 }}
              >
                Save & Log
              </PaperButton>
            </View>
          </View>
        </PaperModal>
      </Portal>

      {/* Voice Dictation Modal */}
      <VoiceDictationModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onVoiceTranscribed={(text) => {
          setInputText((prev) => (prev ? `${prev} ${text}` : text));
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grokContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  grokHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
  },
  iconBtn: {
    padding: theme.spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grokTabSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xl,
  },
  grokTab: {
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grokTabActive: {},
  grokTabText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 16,
    fontWeight: '600',
  },
  grokTabTextActive: {
    color: theme.colors.onSurface,
    fontWeight: 'bold',
  },
  grokTabIndicator: {
    width: 20,
    height: 3,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    marginTop: 4,
  },
  messagesContainer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  proactiveHeroContainer: {
    paddingVertical: theme.spacing.md,
  },
  proactiveHeader: {
    marginBottom: theme.spacing.lg,
  },
  proactiveGreetingTitle: {
    ...theme.typography.headline,
    color: theme.colors.onBackground,
    fontWeight: 'bold',
  },
  proactiveGreetingSub: {
    ...theme.typography.label,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  proactiveCardsList: {
    gap: theme.spacing.sm,
  },
  proactiveCard: {
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  proactiveCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  proactiveIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proactiveCardTitle: {
    color: theme.colors.onSurface,
    fontSize: 15,
    fontWeight: 'bold',
  },
  proactiveCardSub: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  msgRow: {
    marginVertical: theme.spacing.xs,
    flexDirection: 'row',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAi: {
    justifyContent: 'flex-start',
  },
  msgBubble: {
    maxWidth: '85%',
    borderRadius: theme.roundness.lg,
    padding: theme.spacing.md,
  },
  bubbleUser: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderBottomRightRadius: theme.roundness.xs,
  },
  bubbleAi: {
    backgroundColor: theme.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderBottomLeftRadius: theme.roundness.xs,
  },
  userText: {
    color: theme.colors.onSurface,
    fontSize: 15,
    lineHeight: 22,
  },
  aiText: {
    color: theme.colors.onSurface,
    fontSize: 15,
    lineHeight: 22,
  },
  msgTime: {
    fontSize: 10,
    color: theme.colors.outline,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  msgImage: {
    width: 200,
    height: 140,
    borderRadius: theme.roundness.md,
    marginBottom: theme.spacing.xs,
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  loadingMsg: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  undoToast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1B4B',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.roundness.md,
    borderWidth: 1,
    borderColor: '#4338CA',
    marginBottom: theme.spacing.xs,
  },
  undoText: {
    color: '#C7D2FE',
    fontSize: 13,
  },
  undoBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.roundness.xs,
  },
  undoBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  drawerContainer: {
    backgroundColor: theme.colors.surfaceContainer,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
  },
  presetChip: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.roundness.full,
    marginRight: theme.spacing.xs,
  },
  presetChipText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
  },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainer,
    padding: theme.spacing.xs,
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.roundness.md,
    marginBottom: theme.spacing.xs,
  },
  previewThumb: {
    width: 40,
    height: 40,
    borderRadius: theme.roundness.xs,
  },
  closePreview: {
    marginLeft: 'auto',
    backgroundColor: theme.colors.surfaceContainerHighest,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grokPillsContainer: {
    paddingVertical: theme.spacing.xs,
  },
  grokPillsScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  grokActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingHorizontal: theme.spacing.md,
    height: 36,
    borderRadius: theme.roundness.full,
    gap: theme.spacing.xs,
  },
  grokActionPillText: {
    color: theme.colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  // Material 3 Executive Message Composer Dock Styles
  composerContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  composerSurface: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
    minHeight: 52,
  },
  leftControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 4,
  },
  rightControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 4,
  },
  composerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 110,
    textAlignVertical: 'center',
  },
  sendBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnCircleActive: {
    backgroundColor: theme.colors.primary,
  },
  grokPlusText: {
    color: '#E4E4E7',
    fontSize: 18,
    fontWeight: 'bold',
  },
  grokEnginePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242430',
    borderWidth: 1,
    borderColor: '#323242',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  grokEnginePillIcon: {
    fontSize: 12,
  },
  grokEnginePillText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '600',
  },
  grokSpeakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#272734',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 4,
  },
  grokSpeakBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  grokSpeakText: {
    color: '#A1A1AA',
    fontSize: 13,
    fontWeight: 'bold',
  },
  grokSpeakTextActive: {
    color: '#000000',
  },
  interactiveCard: {
    marginTop: 10,
    backgroundColor: '#1E1B4B',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4338CA',
  },
  cardHeaderTitle: {
    color: '#F87171',
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 4,
  },
  cardMsg: {
    color: '#E0E7FF',
    fontSize: 12,
    marginBottom: 8,
  },
  cardOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardOptBtn: {
    backgroundColor: '#3730A3',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardOptPrimary: {
    backgroundColor: '#4F46E5',
  },
  cardOptDanger: {
    backgroundColor: '#DC2626',
  },
  cardOptText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modelModalBox: {
    backgroundColor: '#18181B',
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  modelModalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modelOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#27272A',
  },
  modelOptionSelected: {
    backgroundColor: '#3730A3',
  },
  modelOptionText: {
    color: '#E4E4E7',
    fontSize: 14,
  },
  modelOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  freeBadge: {
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  quickTile: {
    width: '48%',
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.roundness.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  quickTileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    height: 40,
    gap: theme.spacing.xs,
  },
  quickTileTitle: {
    color: theme.colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  // MD3 Quick Log Value Modal Styles
  quickModalBox: {
    backgroundColor: theme.colors.surfaceContainer,
    marginHorizontal: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderRadius: theme.roundness.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  quickModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  quickModalTitle: {
    color: theme.colors.onSurface,
    fontSize: 18,
    fontWeight: 'bold',
  },
  quickInputLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  quickNumberInput: {
    backgroundColor: theme.colors.surfaceContainerHighest,
    color: theme.colors.onSurface,
    fontSize: 20,
    fontWeight: 'bold',
    borderRadius: theme.roundness.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  quickPresetRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  quickPresetBtn: {
    flex: 1,
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.roundness.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  quickPresetBtnActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  quickPresetText: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    fontWeight: 'bold',
  },
  quickPresetTextActive: {
    color: theme.colors.onPrimaryContainer,
  },
  quickModalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  userMsgAvatarWrapper: {
    marginLeft: theme.spacing.xs,
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  userMsgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
});
