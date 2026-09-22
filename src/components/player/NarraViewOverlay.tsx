import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Animated, ScrollView, Pressable } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { ContentScene } from '../../types/content';
import { FocusableButton } from '../FocusableButton';
import { spacing } from '../../theme/spacing';
import { askNarraView } from '../../services/narraViewApi';

interface NarraViewOverlayProps {
  contentId: string;
  currentTimeSeconds: number; // For fallback
  contextTimestamp?: number; // Frozen timestamp
  currentScene?: ContentScene;
  onClose: () => void;
}

type OverlayState = 'idle' | 'loading' | 'success' | 'error';

const QUICK_ACTIONS = [
  { id: 'what', label: 'WHAT HAPPENED?', query: 'What just happened?' },
  { id: 'why', label: 'WHY DOES THIS MATTER?', query: 'Why is this important?' },
  { id: 'who', label: 'WHO IS INVOLVED?', query: 'Who is involved in this scene?' },
  { id: 'explain', label: 'EXPLAIN SIMPLY', query: 'Explain this scene simply.' }
];

export const NarraViewOverlay = ({ contentId, currentTimeSeconds, contextTimestamp, currentScene, onClose }: NarraViewOverlayProps) => {
  const [overlayState, setOverlayState] = useState<OverlayState>('idle');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentAnswer, setCurrentAnswer] = useState<string>('');
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  const effectiveTimestamp = contextTimestamp !== undefined ? contextTimestamp : currentTimeSeconds;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleQuerySelect = async (query: string) => {
    if (overlayState === 'loading') return;
    
    console.log('[NarraView Overlay] submitting question:', query);
    setCurrentQuestion(query);
    setOverlayState('loading');
    
    abortControllerRef.current = new AbortController();
    
    try {
      const result = await askNarraView({
        contentId,
        timestamp: effectiveTimestamp,
        question: query,
        scene: currentScene ? {
          startTime: currentScene.startTime,
          endTime: currentScene.endTime,
          label: currentScene.label,
        } : undefined
      }, abortControllerRef.current.signal);
      
      console.log('[NarraView Overlay] received response:', result);
      setCurrentAnswer(result.answer);
      setOverlayState('success');
      
      // Give UI time to render then ensure scroll resets to top
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[NarraView Overlay] request aborted');
      } else {
        console.error('[NarraView Overlay] ERROR', error);
        setOverlayState('error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleBackToQuestions = () => {
    setOverlayState('idle');
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, 50);
  };

  const handleClose = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  return (
    <Animated.View style={[styles.overlayContainer, { opacity: fadeAnim }]}>
      <TVFocusGuideView style={styles.panel} autoFocus>
        
        {/* Fixed Header */}
        <View style={styles.header}>
          <Text style={styles.brandEyebrow}>NARRAVIEW</Text>
          <Text style={styles.sceneTitle} numberOfLines={2}>
            {currentScene ? currentScene.label : 'Understanding Context...'}
          </Text>
        </View>
        
        {/* Scrollable Middle Content */}
        <View style={styles.scrollWrapper}>
          <ScrollView 
            ref={scrollViewRef}
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.focusGuide}>
              
              {overlayState === 'idle' && (
                <View style={styles.idleState}>
                  <Text style={styles.promptText}>Ask about this moment</Text>
                  <View style={styles.actionList}>
                    {QUICK_ACTIONS.map((action) => (
                      <FocusableButton
                        key={action.id}
                        label={action.label}
                        onPress={() => handleQuerySelect(action.query)}
                        style={styles.quickActionBtn}
                        labelStyle={styles.quickActionLabel}
                      />
                    ))}
                  </View>
                </View>
              )}

              {overlayState === 'loading' && (
                <View style={styles.loadingState}>
                  <ActivityIndicator size="large" color="#FFD700" />
                  <Text style={styles.loadingText}>Understanding this moment...</Text>
                </View>
              )}

              {overlayState === 'success' && (
                <View style={styles.successState}>
                  <Text style={styles.youAskedLabel}>YOU ASKED</Text>
                  <Text style={styles.askedQuestionText}>{currentQuestion}</Text>
                  
                  <View style={styles.answerDivider} />
                  
                  <Text style={styles.answerText}>{currentAnswer}</Text>
                  
                  <View style={styles.followUpList}>
                    <FocusableButton
                      label="ASK ANOTHER"
                      onPress={handleBackToQuestions}
                      style={styles.followUpBtn}
                      labelStyle={styles.followUpLabel}
                      hasTVPreferredFocus
                    />
                  </View>
                </View>
              )}

              {overlayState === 'error' && (
                <View style={styles.errorState}>
                  <Text style={styles.errorText}>NarraView couldn't answer right now.</Text>
                  <View style={styles.errorActions}>
                    <FocusableButton 
                      label="RETRY" 
                      onPress={() => handleQuerySelect(currentQuestion)} 
                      style={styles.actionBtn}
                      hasTVPreferredFocus 
                    />
                    <FocusableButton 
                      label="BACK TO QUESTIONS" 
                      onPress={handleBackToQuestions} 
                      style={styles.actionBtn} 
                    />
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
        
        {/* Fixed Footer */}
        <View style={styles.footer}>
          <FocusableButton 
            label="CLOSE NARRAVIEW" 
            onPress={handleClose} 
            style={styles.closeBtn} 
            labelStyle={styles.closeBtnLabel}
          />
        </View>

      </TVFocusGuideView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Dim background slightly
    justifyContent: 'center', // Vertically center the modal
    alignItems: 'flex-start', // Anchor to left
    paddingLeft: spacing.heroInset,
  },
  panel: {
    width: '40%', // approx 38-44%
    minWidth: 420,
    height: '75%', // Use explicit height so it never collapses and is never too short!
    backgroundColor: 'rgba(12, 12, 15, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 36,
    paddingHorizontal: 48,
    paddingBottom: 32,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  
  // Header
  header: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 24,
  },
  brandEyebrow: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 4,
  },
  sceneTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 34,
  },
  
  // Scroll Area
  scrollWrapper: {
    flex: 1,
    minHeight: 0, // Allows ScrollView to shrink properly
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24, // Breathing room at bottom of scroll
  },
  focusGuide: {
  },
  
  // IDLE State
  idleState: {
    paddingTop: 8,
  },
  promptText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 30,
    marginBottom: 24,
  },
  actionList: {
    gap: 16,
  },
  quickActionBtn: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 0,
    height: 72, // Compact TV button
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
  },
  quickActionLabel: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'left',
    width: '100%',
  },
  
  // LOADING State
  loadingState: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 24,
    marginTop: 16,
  },
  
  // SUCCESS State
  successState: {
    paddingTop: 8,
  },
  youAskedLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  askedQuestionText: {
    color: '#E0E0E0',
    fontSize: 30,
    fontStyle: 'italic',
    marginBottom: 24,
  },
  answerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 24,
  },
  answerText: {
    color: '#FFD700', // Premium Amber
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '500',
    marginBottom: 32,
  },
  followUpList: {
    gap: 16,
  },
  followUpBtn: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 0,
    height: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
  },
  followUpLabel: {
    fontSize: 24,
    fontWeight: '600',
  },
  
  // ERROR State
  errorState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 30,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  actionBtn: {
    height: 72,
    paddingHorizontal: 24,
    paddingVertical: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    justifyContent: 'center'
  },
  
  // Footer
  footer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
    alignItems: 'flex-start',
  },
  closeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 20,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  closeBtnLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 22,
  }
});
