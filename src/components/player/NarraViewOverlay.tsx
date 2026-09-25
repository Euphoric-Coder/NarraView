import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator, Animated, ScrollView, Easing, BackHandler } from 'react-native';
// @ts-ignore
import { TVFocusGuideView } from 'react-native';
import { FocusableButton } from '../FocusableButton';
import { spacing } from '../../theme/spacing';
import { askNarraView } from '../../services/narraViewApi';

interface NarraViewOverlayProps {
  onClose: () => void;
  contentId: string;
  currentTimeSeconds: number;
  contextTimestamp?: number;
  currentScene?: any;
}

type OverlayState = 'idle' | 'loading' | 'success' | 'error';

const QUICK_ACTIONS = [
  { id: 'action-1', label: 'What happened?', query: 'What just happened in this scene?' },
  { id: 'action-2', label: 'Why does it matter?', query: 'Why is this moment important to the story?' },
  { id: 'action-3', label: 'Who\'s involved?', query: 'Who are the characters involved here?' },
  { id: 'action-4', label: 'Explain simply', query: 'Explain this scene simply.' },
  { id: 'action-5', label: 'Context so far', query: 'What do I know about this situation so far?' },
];

export const NarraViewOverlay = ({ onClose, contentId, currentTimeSeconds, currentScene }: NarraViewOverlayProps) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [overlayState, setOverlayState] = useState<OverlayState>('idle');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentAnswer, setCurrentAnswer] = useState<string>('');
  const [isAnswerFocused, setIsAnswerFocused] = useState<boolean>(false);

  
  const scrollViewRef = useRef<ScrollView>(null);
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackPress();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  const handleBackPress = () => {
    if (overlayState === 'success' || overlayState === 'error') {
      setOverlayState('idle');
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const handleQuerySelect = async (question: string) => {
    setCurrentQuestion(question);
    setOverlayState('loading');
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    
    try {
      const response = await askNarraView({ contentId, timestamp: currentTimeSeconds, question, scene: currentScene });
      setCurrentAnswer(response.answer);
      setOverlayState('success');
    } catch (error) {
      console.error("NarraView API Error:", error);
      setOverlayState('error');
    }
  };

  return (
    <Animated.View style={[styles.overlayContainer, { opacity: fadeAnim }]}>
      <TVFocusGuideView style={styles.panel} autoFocus>
        
        {/* Fixed Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <Text style={styles.brandEyebrow}>NARRAVIEW</Text>
          </View>
          <View style={styles.headerBottomRow}>
            <Text style={styles.sceneTitle} numberOfLines={1}>
              {currentScene ? currentScene.label : 'Understanding Context...'}
            </Text>
            <Text style={styles.timestampText}>
              {Math.floor(currentTimeSeconds / 60).toString().padStart(2, '0')}:{(currentTimeSeconds % 60).toString().padStart(2, '0')}
            </Text>
          </View>
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
                    {QUICK_ACTIONS.map((action, index) => (
                      <FocusableButton
                        key={action.id}
                        label={action.label}
                        hasTVPreferredFocus={index === 0}
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
                  <Text style={styles.loadingDots}>• • •</Text>
                  <Text style={styles.loadingText}>Understanding this moment...</Text>
                </View>
              )}

              {overlayState === 'success' && (
                <View style={styles.successState}>
                  <Text style={styles.youAskedLabel}>YOU ASKED</Text>
                  <Text style={styles.askedQuestionText}>{currentQuestion}</Text>
                  
                  <View style={styles.answerDivider} />
                  
                  <Pressable 
                    hasTVPreferredFocus
                    onFocus={() => setIsAnswerFocused(true)}
                    onBlur={() => setIsAnswerFocused(false)}
                    style={() => [
                      styles.answerBlock,
                      isAnswerFocused && styles.answerBlockFocused
                    ]}
                  >
                    <Text style={styles.answerBrand}>NARRAVIEW</Text>
                    <Text style={styles.answerText}>{currentAnswer}</Text>
                  </Pressable>
                  
                  <View style={styles.followUpList}>
                    <FocusableButton
                      label="Ask another"
                      onPress={() => setOverlayState('idle')}
                      style={styles.followUpBtn}
                      labelStyle={styles.followUpLabel}
                    />
                  </View>
                </View>
              )}

              {overlayState === 'error' && (
                <View style={styles.errorState}>
                  <Text style={styles.errorText}>Couldn't answer this moment.</Text>
                  <View style={styles.errorActions}>
                    <FocusableButton 
                      label="Retry" 
                      onPress={() => handleQuerySelect(currentQuestion)} 
                      style={styles.actionBtn}
                      hasTVPreferredFocus 
                    />
                    <FocusableButton 
                      label="Back to questions" 
                      onPress={() => setOverlayState('idle')} 
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
          <View style={styles.footerRow}>
            <FocusableButton 
              label="Back" 
              onPress={handleBackPress} 
              style={styles.footerBtn} 
              labelStyle={styles.footerBtnLabel}
            />
            <FocusableButton 
              label="Close" 
              onPress={handleClose} 
              style={styles.footerBtn} 
              labelStyle={styles.footerBtnLabel}
            />
          </View>
        </View>

      </TVFocusGuideView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Dim background layer
    justifyContent: 'flex-start', // Allow margin positioning
    alignItems: 'flex-start',
  },
  panel: {
    width: '44%', // Increased width for more horizontal reading space
    minWidth: 480,
    height: '90%', // Dramatically increased height for maximum content space
    marginTop: '5%', // Anchored even higher
    marginLeft: '6%', // Slightly closer to left edge
    backgroundColor: 'rgba(12, 12, 15, 0.96)', // Dark translucent
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 24,
    paddingHorizontal: 32,
    paddingBottom: 32,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
    elevation: 20,
  },
  
  // Header
  header: {
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 20,
  },
  headerTopRow: {
    marginBottom: 4,
  },
  headerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandEyebrow: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  sceneTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    flex: 1,
  },
  timestampText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 18,
    fontWeight: '500',
    marginLeft: 16,
  },
  
  // Scroll Area
  scrollWrapper: {
    flex: 1,
    minHeight: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  focusGuide: {
  },
  
  // IDLE State
  idleState: {
    paddingTop: 8,
  },
  promptText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 20,
    marginBottom: 24,
  },
  actionList: {
    gap: 16,
  },
  quickActionBtn: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 0,
    height: 56, // Compact
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  quickActionLabel: {
    fontSize: 20,
    fontWeight: '500',
    textAlign: 'left',
    width: '100%',
  },
  
  // LOADING State
  loadingState: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDots: {
    color: '#F5B800',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginBottom: 24,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 20,
  },
  
  // SUCCESS State
  successState: {
    paddingTop: 8,
  },
  youAskedLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  askedQuestionText: {
    color: '#FFFFFF',
    fontSize: 22,
    marginBottom: 28,
  },
  answerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 28,
  },
  answerBlock: {
    padding: 16,
    marginHorizontal: -16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 16,
  },
  answerBlockFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(245, 184, 0, 0.5)',
  },
  answerBrand: {
    color: '#F5B800',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  answerText: {
    color: '#E0E0E0',
    fontSize: 24,
    lineHeight: 34,
    marginBottom: 32,
  },
  followUpList: {
    gap: 16,
  },
  followUpBtn: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 0,
    height: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
  },
  followUpLabel: {
    fontSize: 20,
    fontWeight: '500',
  },
  
  // ERROR State
  errorState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    color: '#E0E0E0',
    fontSize: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  actionBtn: {
    height: 56,
    paddingHorizontal: 24,
    paddingVertical: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    justifyContent: 'center'
  },
  
  // Footer
  footer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 16,
  },
  footerBtn: {
    backgroundColor: 'transparent',
    height: 48,
    paddingHorizontal: 16,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  footerBtnLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 18,
    fontWeight: '500',
  }
});
