import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  Vibration,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';

interface VoiceDictationModalProps {
  visible: boolean;
  onClose: () => void;
  onVoiceTranscribed: (text: string) => void;
}

let ExpoSpeechRecognitionModule: any = null;
try {
  ExpoSpeechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch (_) {}

export default function VoiceDictationModal({
  visible,
  onClose,
  onVoiceTranscribed,
}: VoiceDictationModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const webRecognitionRef = useRef<any>(null);

  useEffect(() => {
    let resultSub: any = null;
    let errorSub: any = null;

    if (visible) {
      setSpokenText('');
      startListening();
    } else {
      stopListening();
    }

    if (ExpoSpeechRecognitionModule?.addListener) {
      try {
        resultSub = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
          if (event?.results?.[0]?.transcript) {
            setSpokenText(event.results[0].transcript);
          }
        });
        errorSub = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
          console.warn('Speech recognition error:', event);
        });
      } catch (_) {}
    }

    return () => {
      stopListening();
      resultSub?.remove?.();
      errorSub?.remove?.();
    };
  }, [visible]);

  async function startListening() {
    setIsRecording(true);
    setSpokenText('');

    try {
      Vibration.vibrate(50);
    } catch (_) {}

    // 1. Try Native Expo Speech Recognition
    if (ExpoSpeechRecognitionModule) {
      try {
        const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (perms?.granted) {
          await ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            maxAlternatives: 1,
          });
          return;
        }
      } catch (err: any) {
        console.warn('Native speech recognition start failed:', err);
      }
    }

    // 2. Try Web Speech API (if running on web or webview)
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let current = '';
          for (let i = 0; i < event.results.length; ++i) {
            current += event.results[i][0].transcript;
          }
          setSpokenText(current);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        webRecognitionRef.current = recognition;
        return;
      } catch (err: any) {
        console.warn('Web Speech API start failed:', err);
      }
    }
  }

  function stopListening() {
    setIsRecording(false);
    if (ExpoSpeechRecognitionModule?.stop) {
      try {
        ExpoSpeechRecognitionModule.stop();
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
    if (textToUse.trim()) {
      onVoiceTranscribed(textToUse);
    }
    onClose();
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.grokCapsuleContainer} onStartShouldSetResponder={() => true}>
          {/* Dotted Waveform Line */}
          <Text style={styles.dottedLine}>••••••••••••••••••••••••••••••••••••••••••••••••</Text>

          {/* Minimalist Spoken Text / Listening Indicator */}
          <TextInput
            style={styles.spokenInput}
            value={spokenText}
            placeholder={isRecording ? 'Listening...' : 'Tap ✓ to insert text'}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            onChangeText={setSpokenText}
            multiline
          />

          {/* Grok Minimalist Toolbar (X Cancel | ✓ Confirm) */}
          <View style={styles.grokToolbar}>
            <TouchableOpacity style={styles.circleBtnDanger} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.circleBtnSuccess, !spokenText.trim() && { opacity: 0.5 }]}
              onPress={() => handleConfirmText(spokenText)}
              disabled={!spokenText.trim()}
            >
              <MaterialCommunityIcons name="check" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    padding: theme.spacing.lg,
  },
  grokCapsuleContainer: {
    backgroundColor: '#1E1E26',
    borderRadius: theme.roundness.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: '#2D2D3A',
  },
  dottedLine: {
    color: theme.colors.outline,
    textAlign: 'center',
    fontSize: 16,
    letterSpacing: 2,
    marginBottom: theme.spacing.sm,
  },
  spokenInput: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    minHeight: 40,
    maxHeight: 90,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  grokToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleBtnDanger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnSuccess: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
