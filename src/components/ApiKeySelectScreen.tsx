import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  BackHandler,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme, useAppTheme } from '../theme';
import { getLocalSettings, saveLocalSettings, testConnection } from '../services/api';
import {
  Provider,
  PROVIDER_DISPLAY,
  PROVIDER_KEY_MAP,
  QUICK_MODELS,
  PROVIDER_HINTS,
} from '../utils/constants';
import { Snackbar } from 'react-native-paper';

interface ApiKeySelectScreenProps {
  onBack: () => void;
  onSettingsChanged?: (provider: Provider, model: string) => void;
}

interface ProviderMeta {
  name: string;
  desc: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accent: string;
  bgTint: string;
  recommended?: boolean;
}

const PROVIDER_METAS: Record<Provider, ProviderMeta> = {
  mistral: {
    name: 'Mistral AI',
    desc: 'High-speed reasoning & code execution with Codestral. Default engine.',
    icon: 'fire',
    accent: '#FF7000',
    bgTint: 'rgba(255, 112, 0, 0.15)',
    recommended: true,
  },
  gemini: {
    name: 'Google Gemini',
    desc: 'Multimodal vision, rapid tool calling & vast context window.',
    icon: 'star-four-points',
    accent: '#A78BFA',
    bgTint: 'rgba(167, 139, 250, 0.15)',
  },
  groq: {
    name: 'Groq Cloud',
    desc: 'Ultra-low latency LPU inference with Llama 3.3 models.',
    icon: 'lightning-bolt',
    accent: '#F87171',
    bgTint: 'rgba(248, 113, 113, 0.15)',
  },
  openai: {
    name: 'OpenAI',
    desc: 'Industry standard reasoning and synthesis with GPT-4o.',
    icon: 'circle-slice-8',
    accent: '#34D399',
    bgTint: 'rgba(52, 211, 153, 0.15)',
  },
  anthropic: {
    name: 'Anthropic',
    desc: 'Thoughtful, articulate prose & deep analysis with Claude 3.5.',
    icon: 'brain',
    accent: '#FB923C',
    bgTint: 'rgba(251, 146, 60, 0.15)',
  },
  openrouter: {
    name: 'OpenRouter',
    desc: 'Unified gateway to free & open-source AI community models.',
    icon: 'earth',
    accent: '#38BDF8',
    bgTint: 'rgba(56, 189, 248, 0.15)',
  },
};

export default function ApiKeySelectScreen({ onBack, onSettingsChanged }: ApiKeySelectScreenProps) {
  const { colors, isDark } = useAppTheme();
  const [provider, setProvider] = useState<Provider>('mistral');
  const [model, setModel] = useState<string>('codestral-2508');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      onBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [onBack]);

  async function loadSettings() {
    try {
      const local = await getLocalSettings();
      if (local.provider) setProvider(local.provider as Provider);
      if (local.model) setModel(local.model);
    } catch (_) {}
  }

  function triggerHaptic(type: 'light' | 'medium' | 'success') {
    if (Platform.OS !== 'web') {
      try {
        if (type === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else if (type === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        else if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
    }
  }

  async function handleSelectProvider(p: Provider) {
    triggerHaptic('medium');
    setProvider(p);
    const defaults = QUICK_MODELS[p];
    const defaultModel = defaults && defaults.length > 0 ? defaults[0].id : '';
    setModel(defaultModel);
    setTestResult(null);

    await saveLocalSettings({ provider: p, model: defaultModel });
    if (onSettingsChanged) onSettingsChanged(p, defaultModel);

    setToastMsg(`Default engine set to ${PROVIDER_DISPLAY[p]} (${defaultModel})`);
  }

  async function handleSelectModel(newModel: string) {
    triggerHaptic('light');
    setModel(newModel);
    setTestResult(null);

    await saveLocalSettings({ provider, model: newModel });
    if (onSettingsChanged) onSettingsChanged(provider, newModel);

    setToastMsg(`Model changed to ${newModel.split('/').pop()}`);
  }

  async function handleTestAi() {
    triggerHaptic('medium');
    setTesting(true);
    setTestResult(null);

    const startTime = Date.now();
    try {
      const res = await testConnection(provider, model);
      const latencyMs = Date.now() - startTime;
      setTesting(false);

      if (res.success) {
        triggerHaptic('success');
        setTestResult({ success: true, latencyMs });
        setToastMsg(`Connected successfully to ${PROVIDER_DISPLAY[provider]} (${latencyMs}ms)`);
      } else {
        setTestResult({
          success: false,
          error: res.error || 'Connection test returned an error',
        });
      }
    } catch (err: any) {
      setTesting(false);
      setTestResult({
        success: false,
        error: err.message || 'Network or authorization error',
      });
    }
  }

  const activeMeta = PROVIDER_METAS[provider] || PROVIDER_METAS.mistral;
  const activeSecret = PROVIDER_KEY_MAP[provider] || `${provider.toUpperCase()}_API_KEY`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surfaceContainer} />

      {/* Top App Bar with Back Navigation */}
      <View style={[styles.topBar, { backgroundColor: colors.surfaceContainer, borderBottomColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            triggerHaptic('light');
            onBack();
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.topBarTitleWrapper}>
          <Text style={[styles.topBarTitle, { color: colors.onSurface }]}>AI Engine & API Keys</Text>
          <Text style={[styles.topBarSubtitle, { color: colors.onSurfaceVariant }]}>Supabase Edge Secrets • Zero Typing</Text>
        </View>

        <View style={[styles.activeStatusPill, { borderColor: `${activeMeta.accent}60` }]}>
          <View style={[styles.activeStatusDot, { backgroundColor: activeMeta.accent }]} />
          <Text style={[styles.activeStatusText, { color: activeMeta.accent }]}>
            {activeMeta.name.split(' ')[0]}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Active Engine Hero Card */}
        <View style={[styles.heroCard, { borderColor: `${activeMeta.accent}55` }]}>
          <View style={styles.heroHeaderRow}>
            <View style={[styles.heroIconBox, { backgroundColor: activeMeta.bgTint }]}>
              <MaterialCommunityIcons name={activeMeta.icon} size={28} color={activeMeta.accent} />
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.heroProviderName}>{activeMeta.name}</Text>
                <View style={styles.activePillBadge}>
                  <Text style={styles.activePillBadgeText}>CURRENT DEFAULT</Text>
                </View>
              </View>

              <Text style={styles.heroModelName}>{model}</Text>

              <View style={styles.heroSecretRow}>
                <MaterialCommunityIcons name="key-variant" size={13} color={theme.colors.primary} />
                <Text style={styles.heroSecretText}>{activeSecret}</Text>
                <Text style={styles.heroSecretSub}>• Read via Supabase</Text>
              </View>
            </View>
          </View>

          {/* Test Ping Action & Results */}
          <View style={styles.heroActionDivider} />

          <View style={styles.heroActionRow}>
            <TouchableOpacity
              style={[styles.testPingBtn, { backgroundColor: activeMeta.bgTint, borderColor: activeMeta.accent }]}
              onPress={handleTestAi}
              disabled={testing}
              activeOpacity={0.8}
            >
              {testing ? (
                <>
                  <ActivityIndicator size="small" color={activeMeta.accent} />
                  <Text style={[styles.testPingBtnText, { color: activeMeta.accent, marginLeft: 6 }]}>
                    Testing Connection...
                  </Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="lightning-bolt" size={16} color={activeMeta.accent} />
                  <Text style={[styles.testPingBtnText, { color: activeMeta.accent }]}>
                    Test Engine Ping
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <Text style={styles.testPingHint}>
                Pings Supabase Edge Function to verify {activeSecret} authorization.
              </Text>
            </View>
          </View>

          {/* Live Ping Feedback Result Banner */}
          {testResult && (
            <View
              style={[
                styles.testFeedbackBanner,
                testResult.success ? styles.testFeedbackSuccess : styles.testFeedbackError,
              ]}
            >
              <MaterialCommunityIcons
                name={testResult.success ? 'check-circle' : 'alert-circle'}
                size={18}
                color={testResult.success ? '#10B981' : '#EF4444'}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.testFeedbackTitle,
                    { color: testResult.success ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {testResult.success
                    ? `Connected Successfully • ${testResult.latencyMs}ms Latency`
                    : 'Connection Failed'}
                </Text>
                <Text style={styles.testFeedbackBody}>
                  {testResult.success
                    ? `${activeMeta.name} is verified and fully operational for chat & voice parsing.`
                    : `${testResult.error || 'Unknown error'}. Ensure '${activeSecret}' is set in your Supabase project secrets.`}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Security & Cloud Secret Notice */}
        <View style={styles.securityBox}>
          <View style={styles.securityBoxIcon}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityBoxTitle}>Encrypted Server-Side Architecture</Text>
            <Text style={styles.securityBoxText}>
              API keys are never typed into or stored on your device. They live securely in your Supabase backend secrets. Tapping any provider below immediately switches the active backend engine.
            </Text>
          </View>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>SELECT AI PROVIDER</Text>
          <Text style={styles.sectionSubtitle}>Tap card to activate & select model</Text>
        </View>

        {/* Provider Cards List */}
        <View style={styles.providerList}>
          {(['mistral', 'gemini', 'groq', 'openai', 'anthropic', 'openrouter'] as Provider[]).map((p) => {
            const isSelected = provider === p;
            const meta = PROVIDER_METAS[p];
            const secretKey = PROVIDER_KEY_MAP[p];
            const modelsList = QUICK_MODELS[p] || [];

            return (
              <View
                key={p}
                style={[
                  styles.providerCard,
                  isSelected && styles.providerCardActive,
                  isSelected && { borderColor: meta.accent },
                ]}
              >
                {/* Main Card Clickable Header */}
                <TouchableOpacity
                  style={styles.providerCardTouch}
                  onPress={() => handleSelectProvider(p)}
                  activeOpacity={0.8}
                >
                  {/* Provider Brand Avatar */}
                  <View style={[styles.providerAvatarBox, { backgroundColor: meta.bgTint }]}>
                    <MaterialCommunityIcons name={meta.icon} size={24} color={meta.accent} />
                  </View>

                  {/* Provider Details */}
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <View style={styles.providerTitleRow}>
                      <Text style={styles.providerTitleText}>{meta.name}</Text>
                      {meta.recommended && (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                        </View>
                      )}
                      {isSelected && (
                        <View style={[styles.activeDotBadge, { backgroundColor: meta.accent }]}>
                          <Text style={styles.activeDotBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.providerDescText}>{meta.desc}</Text>

                    {/* Supabase Secret Badge */}
                    <View style={styles.secretBadgePill}>
                      <MaterialCommunityIcons name="lock-outline" size={11} color={theme.colors.onSurfaceVariant} />
                      <Text style={styles.secretBadgePillText}>{secretKey}</Text>
                    </View>
                  </View>

                  {/* Radio Selection Bubble */}
                  <View
                    style={[
                      styles.radioBubble,
                      isSelected && { borderColor: meta.accent, backgroundColor: meta.accent },
                    ]}
                  >
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={14} color="#000" />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Expanded Model Selector Tray (When Active) */}
                {isSelected && (
                  <View style={styles.modelTrayWrap}>
                    <View style={styles.modelTrayDivider} />
                    <View style={styles.modelTrayHeaderRow}>
                      <Text style={styles.modelTrayTitle}>
                        Available Models for {meta.name}:
                      </Text>
                      <Text style={styles.modelTrayCount}>
                        {modelsList.length} models
                      </Text>
                    </View>

                    <View style={styles.modelGrid}>
                      {modelsList.map((m) => {
                        const isModelActive = model === m.id;
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[
                              styles.modelChip,
                              isModelActive && styles.modelChipActive,
                              isModelActive && { borderColor: meta.accent, backgroundColor: meta.bgTint },
                            ]}
                            onPress={() => handleSelectModel(m.id)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.modelChipLabel,
                                  isModelActive && { color: meta.accent, fontWeight: '700' },
                                ]}
                                numberOfLines={1}
                              >
                                {m.label}
                              </Text>
                              <Text style={styles.modelChipId} numberOfLines={1}>
                                {m.id}
                              </Text>
                            </View>

                            <View style={styles.modelChipRight}>
                              {m.free && (
                                <View style={styles.freeBadge}>
                                  <Text style={styles.freeBadgeText}>FREE</Text>
                                </View>
                              )}
                              {isModelActive ? (
                                <MaterialCommunityIcons
                                  name="check-circle"
                                  size={16}
                                  color={meta.accent}
                                  style={{ marginLeft: 6 }}
                                />
                              ) : (
                                <MaterialCommunityIcons
                                  name="circle-outline"
                                  size={16}
                                  color={theme.colors.outlineVariant}
                                  style={{ marginLeft: 6 }}
                                />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Supabase CLI Setup Reference Guide */}
        <View style={styles.cliHelpCard}>
          <Text style={styles.cliHelpTitle}>🛠️ Setting Keys in Supabase CLI or Dashboard</Text>
          <Text style={styles.cliHelpText}>
            To configure or rotate any API key in your Supabase backend, open your Supabase Dashboard &gt; Project Settings &gt; Edge Functions &gt; Secrets, or execute:
          </Text>
          <View style={styles.cliCodeSnippet}>
            <Text style={styles.cliCodeText}>
              supabase secrets set {activeSecret}=your_key_here
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surfaceContainer, borderTopColor: colors.outlineVariant }]}>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => {
            triggerHaptic('success');
            onBack();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.doneBtnText}>Confirm & Return to Settings</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={theme.colors.onPrimary} />
        </TouchableOpacity>
      </View>

      {/* Snackbar Toast */}
      <Snackbar
        visible={!!toastMsg}
        onDismiss={() => setToastMsg('')}
        duration={3000}
        style={styles.snackbar}
      >
        <Text style={styles.snackbarText}>{toastMsg}</Text>
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1016',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 16,
    paddingBottom: 14,
    backgroundColor: '#161722',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  topBarTitle: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topBarSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 1,
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
  },
  activeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // ── Hero Active Card ──
  heroCard: {
    backgroundColor: '#1A1C28',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconBox: {
    width: 52,
    height: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroProviderName: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
  },
  activePillBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  heroModelName: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  heroSecretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroSecretText: {
    color: '#93C5FD',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
  },
  heroSecretSub: {
    color: '#6B7280',
    fontSize: 11,
  },
  heroActionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 14,
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  testPingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  testPingBtnText: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
  },
  testPingHint: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 15,
  },
  testFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  testFeedbackSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  testFeedbackError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  testFeedbackTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  testFeedbackBody: {
    color: '#D1D5DB',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },

  // ── Security Info Box ──
  securityBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    marginBottom: 20,
    gap: 10,
  },
  securityBoxIcon: {
    marginTop: 1,
  },
  securityBoxTitle: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '700',
  },
  securityBoxText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  // ── Section Header ──
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 1,
  },

  // ── Provider Cards ──
  providerList: {
    gap: 12,
  },
  providerCard: {
    backgroundColor: '#161824',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    overflow: 'hidden',
  },
  providerCardActive: {
    backgroundColor: '#1C1E2E',
  },
  providerCardTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  providerAvatarBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  providerTitleText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  recommendedBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },
  activeDotBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeDotBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },
  providerDescText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  secretBadgePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    marginTop: 6,
  },
  secretBadgePillText: {
    color: '#CBD5E1',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  radioBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  // ── Expanded Model Selection Tray ──
  modelTrayWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  modelTrayDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    marginBottom: 12,
  },
  modelTrayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modelTrayTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  modelTrayCount: {
    color: '#64748B',
    fontSize: 11,
  },
  modelGrid: {
    gap: 8,
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#12131D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modelChipActive: {
    borderWidth: 1.5,
  },
  modelChipLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  modelChipId: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  modelChipRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freeBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  freeBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },

  // ── CLI / Supabase Guidance ──
  cliHelpCard: {
    backgroundColor: '#161824',
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cliHelpTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  cliHelpText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  cliCodeSnippet: {
    backgroundColor: '#0F1017',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cliCodeText: {
    color: '#60A5FA',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },

  // ── Bottom Action Bar ──
  bottomBar: {
    padding: 16,
    backgroundColor: '#161722',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  doneBtnText: {
    color: theme.colors.onPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  snackbar: {
    backgroundColor: '#27293D',
    borderRadius: 10,
    marginBottom: 80,
  },
  snackbarText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
