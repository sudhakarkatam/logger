import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  Vibration,
} from 'react-native';
import { md3Colors, md3Typography } from '../theme';

interface VoiceDictationModalProps {
  visible: boolean;
  onClose: () => void;
  onVoiceTranscribed: (text: string) => void;
}

const VOICE_PRESETS = [
  { label: '⏰ Remind me in 10 mins to check the oven', text: 'Remind me in 10 mins to check the oven' },
  { label: '⏰ Remind me at 5 PM to call Sarah', text: 'Remind me at 5 PM to call Sarah' },
  { label: '🍲 Ate 2 chapathi and chicken curry for lunch', text: 'Ate 2 chapathi and chicken curry for lunch' },
  { label: '💳 Spent 250 on groceries at supermarket', text: 'Spent 250 on groceries at supermarket' },
  { label: '🏃 Ran 5km in 25 minutes at morning park', text: 'Ran 5km in 25 minutes at morning park' },
];

// Helper to probe native module existence without throwing uncaught native errors
function isNativeModuleRegistered(moduleName: string): boolean {
  try {
    const { NativeModules } = require('react-native');
    if (NativeModules && NativeModules[moduleName]) return true;
    const { requireNativeModule } = require('expo-modules-core');
    if (requireNativeModule) {
      try {
        return !!requireNativeModule(moduleName);
      } catch (_) {
        return false;
      }
    }
  } catch (_) {}
  return false;
}

function getExpoSpeechRecognitionModule() {
  try {
    if (isNativeModuleRegistered('ExpoSpeechRecognition')) {
      const mod = require('expo-speech-recognition');
      return mod.ExpoSpeechRecognitionModule || null;
    }
  } catch (_) {}
  return null;
}

function getNativeVoiceModule() {
  try {
    if (isNativeModuleRegistered('Voice') || isNativeModuleRegistered('RCTVoice')) {
      const VoiceModule = require('@react-native-voice/voice');
      return VoiceModule.default || VoiceModule;
    }
  } catch (_) {}
  return null;
}

export default function VoiceDictationModal({
  visible,
  onClose,
  onVoiceTranscribed,
}: VoiceDictationModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [statusMessage, setStatusMessage] = useState('Tap Mic to start speaking');
  const webRecognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) {
      stopListening();
      setSpokenText('');
      return;
    }

    setSpokenText('');
    setupListeners();

    return () => {
      stopListening();
    };
  }, [visible]);

  function setupListeners() {
    // 1. Check Expo Official expo-speech-recognition
    const ExpoSpeech = getExpoSpeechRecognitionModule();
    if (ExpoSpeech) {
      try {
        if (typeof ExpoSpeech.requestPermissionsAsync === 'function') {
          ExpoSpeech.requestPermissionsAsync().catch(() => {});
        }
      } catch (_) {}
    }

    // 2. Check Legacy @react-native-voice/voice
    const Voice = getNativeVoiceModule();
    if (Voice) {
      try {
        Voice.onSpeechStart = () => {
          setIsRecording(true);
          setStatusMessage('🎙️ Listening... Speak now!');
        };
        Voice.onSpeechResults = (e: any) => {
          if (e.value && e.value[0]) {
            setSpokenText(e.value[0]);
          }
        };
        Voice.onSpeechPartialResults = (e: any) => {
          if (e.value && e.value[0]) {
            setSpokenText(e.value[0]);
          }
        };
        Voice.onSpeechError = (e: any) => {
          console.log('Voice error:', e);
          setIsRecording(false);
        };
        Voice.onSpeechEnd = () => {
          setIsRecording(false);
          setStatusMessage('Recording finished');
        };
      } catch (_) {}
    }
  }

  async function startListening() {
    setIsRecording(true);
    setStatusMessage('🎙️ Listening... Speak now!');
    try {
      Vibration.vibrate(50);
    } catch (_) {}

    // A. Expo Official expo-speech-recognition
    const ExpoSpeech = getExpoSpeechRecognitionModule();
    if (ExpoSpeech && typeof ExpoSpeech.start === 'function') {
      try {
        await ExpoSpeech.start({ lang: 'en-US', interimResults: true }).catch(() => {});
        return;
      } catch (_) {}
    }

    // B. Native @react-native-voice/voice
    const Voice = getNativeVoiceModule();
    if (Voice && typeof Voice.start === 'function') {
      try {
        await Voice.stop().catch(() => {});
        await Voice.start('en-US');
        return;
      } catch (_) {}
    }

    // C. Web Speech API (Chrome / Webview)
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let current = '';
          for (let i = 0; i < event.results.length; i++) {
            current += event.results[i][0].transcript;
          }
          setSpokenText(current);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        webRecognitionRef.current = recognition;
      } catch (e) {
        console.warn('Web Speech API error:', e);
      }
    }
  }

  async function stopListening() {
    setIsRecording(false);
    setStatusMessage('Tap Mic to start speaking');

    const ExpoSpeech = getExpoSpeechRecognitionModule();
    if (ExpoSpeech && typeof ExpoSpeech.stop === 'function') {
      try {
        await ExpoSpeech.stop().catch(() => {});
      } catch (_) {}
    }

    const Voice = getNativeVoiceModule();
    if (Voice && typeof Voice.stop === 'function') {
      try {
        await Voice.stop().catch(() => {});
      } catch (_) {}
    }

    if (webRecognitionRef.current) {
      try {
        webRecognitionRef.current.stop();
      } catch (_) {}
      webRecognitionRef.current = null;
    }
  }

  function handleConfirmText(textToUse: string) {
    stopListening();
    onVoiceTranscribed(textToUse);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.topRow}>
            <Text style={styles.sheetTitle}>🎙️ Voice Speech Dictation</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={{ color: md3Colors.outline, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Active Recording Box */}
          <View style={styles.listeningContainer}>
            <TouchableOpacity
              style={[styles.micCircle, isRecording && styles.micCircleActive]}
              onPress={isRecording ? stopListening : startListening}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 36 }}>{isRecording ? '🔴' : '🎙️'}</Text>
            </TouchableOpacity>

            <Text style={styles.listeningStatus}>{statusMessage}</Text>

            {/* Editable Live Spoken Text Input */}
            <TextInput
              style={styles.spokenTextInput}
              placeholder="Speak into microphone or type custom text..."
              placeholderTextColor={md3Colors.outline}
              value={spokenText}
              onChangeText={setSpokenText}
              multiline
            />

            {spokenText.trim().length > 0 && (
              <TouchableOpacity
                style={styles.useTextBtn}
                onPress={() => handleConfirmText(spokenText)}
              >
                <Text style={styles.useTextBtnText}>✓ Insert Transcribed Text into Input Box</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Preset Samples */}
          <Text style={styles.presetHeading}>Or Tap a Voice Sample Preset:</Text>
          <View style={styles.presetList}>
            {VOICE_PRESETS.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.presetChip}
                onPress={() => handleConfirmText(item.text)}
                activeOpacity={0.8}
              >
                <Text style={styles.presetText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: md3Colors.surfaceContainer,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: md3Colors.outlineVariant,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    ...md3Typography.titleMedium,
    color: md3Colors.onSurface,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  listeningContainer: {
    alignItems: 'center',
    backgroundColor: md3Colors.surfaceContainerHighest,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  micCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: md3Colors.primary,
  },
  micCircleActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: md3Colors.error,
  },
  listeningStatus: {
    ...md3Typography.labelSmall,
    color: md3Colors.primary,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  spokenTextInput: {
    width: '100%',
    backgroundColor: md3Colors.surfaceContainer,
    color: md3Colors.onSurface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 50,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
    textAlignVertical: 'top',
  },
  useTextBtn: {
    marginTop: 10,
    backgroundColor: md3Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  useTextBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  presetHeading: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurfaceVariant,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  presetList: {
    gap: 6,
    marginBottom: 10,
  },
  presetChip: {
    backgroundColor: md3Colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: md3Colors.outlineVariant,
  },
  presetText: {
    ...md3Typography.labelSmall,
    color: md3Colors.onSurface,
  },
});
