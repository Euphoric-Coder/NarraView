import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, findNodeHandle, View, Text, Pressable, ActivityIndicator, Animated, ScrollView, Easing, BackHandler, TextInput, Keyboard } from 'react-native';
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

type OverlayState = 'idle' | 'custom-input' | 'loading' | 'success' | 'error';
type NarraViewMode = 'ask' | 'recap' | 'explain_simple' | 'learn';

interface Action {
  id: string;
  label: string;
  mode: NarraViewMode;
  query?: string;
}

const QUICK_ACTIONS: Action[] = [
  { id: 'action-recap', label: 'Previously On', mode: 'recap' },
  { id: 'action-explain', label: 'Explain Simply', mode: 'explain_simple' },
  { id: 'action-learn', label: 'Learn Mode', mode: 'learn' },
  { id: 'action-1', label: 'What happened?', mode: 'ask', query: 'What just happened in this scene?' },
  { id: 'action-2', label: 'Why does it matter?', mode: 'ask', query: 'Why is this moment important to the story?' },
  { id: 'action-3', label: "Who's involved?", mode: 'ask', query: 'Who are the characters involved here?' },
];

const QuestionOptionCard = ({ label, onPress, hasTVPreferredFocus, nextFocusDown }: any) => {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      hasTVPreferredFocus={hasTVPreferredFocus}
      nextFocusDown={nextFocusDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickActionBtn,
        isFocused && styles.quickActionBtnFocused,
        pressed && styles.quickActionBtnPressed
      ]}
    >
      <Text style={[styles.quickActionLabel, isFocused && styles.quickActionLabelFocused]}>
        {label}
      </Text>
    </Pressable>
  );
};

export const NarraViewOverlay = ({ onClose, contentId, currentTimeSeconds, currentScene }: NarraViewOverlayProps) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [overlayState, setOverlayState] = useState<OverlayState>('idle');
  const [customQuestion, setCustomQuestion] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const activeRequestId = useRef<number>(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsEditing(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsEditing(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentResponse, setCurrentResponse] = useState<any>(null);
  const [pendingMode, setPendingMode] = useState<NarraViewMode>('ask');
  const [learnFeedback, setLearnFeedback] = useState<string | null>(null);
  const [isAnswerFocused, setIsAnswerFocused] = useState<boolean>(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const backBtnRef = useRef<any>(null);
  const [backBtnNode, setBackBtnNode] = useState<number | null>(null);
  
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
    if (overlayState === 'custom-input') {
      Keyboard.dismiss();
      setOverlayState('idle');
      return;
    }
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

  const handleCustomSubmit = () => {
    if (customQuestion.trim().length === 0) return;
    Keyboard.dismiss();
    setIsEditing(false);
    handleQuerySelect({ id: 'custom', label: 'Custom', mode: 'ask', query: customQuestion.trim() });
  };

  const handleQuerySelect = async (action: Action) => {
    const isCustom = action.id === 'custom';
    const query = action.query || '';
    
    setCurrentQuestion(isCustom ? query : action.label);
    setPendingMode(action.mode);
    setOverlayState('loading');
    setLearnFeedback(null);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    
    const requestId = Date.now();
    activeRequestId.current = requestId;

    try {
      const response = await askNarraView({ contentId, timestamp: currentTimeSeconds, mode: action.mode, question: query, scene: currentScene });
      if (activeRequestId.current === requestId) {
        // Fallback to the requested mode if backend omitted it
        setCurrentResponse({
          ...response,
          mode: response.mode || action.mode
        });
        setOverlayState('success');
        setCustomQuestion('');
      }
    } catch (error) {
      if (activeRequestId.current === requestId) {
        console.error("NarraView API Error:", error);
        setOverlayState('error');
      }
    }
  };

  const getLoadingText = () => {
    if (pendingMode === 'recap') return "Recapping what you've seen...";
    if (pendingMode === 'explain_simple') return "Simplifying this moment...";
    if (pendingMode === 'learn') return "Building a quick question...";
    return "Understanding this moment...";
  };

  return (
    <Animated.View style={[styles.overlayContainer, { opacity: fadeAnim }]}>
      <TVFocusGuideView style={styles.panel} autoFocus trapFocus={true}>
        
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
              {Math.floor(Math.max(0, currentTimeSeconds) / 60).toString().padStart(2, '0')}:{Math.floor(Math.max(0, currentTimeSeconds) % 60).toString().padStart(2, '0')}
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
                  <Text style={styles.promptText}>Explore this moment</Text>
                  <View style={styles.actionList}>
                    {QUICK_ACTIONS.map((action, index) => (
                      <QuestionOptionCard
                        key={action.id}
                        label={action.label}
                        hasTVPreferredFocus={index === 0}
                        onPress={() => handleQuerySelect(action)}
                      />
                    ))}
                    <View style={{ height: 16 }} />
                    <QuestionOptionCard
                      label="Ask NarraView"
                      onPress={() => {
                        setCustomQuestion('');
                        setOverlayState('custom-input');
                      }}
                      nextFocusDown={backBtnNode || undefined}
                    />
                  </View>
                </View>
              )}

              {overlayState === 'custom-input' && (
                <View style={styles.customInputState}>
                  <Text style={styles.promptText}>Type a question about this moment...</Text>
                  
                  <TextInput
                    style={[styles.textInput, isInputFocused && styles.textInputFocused]}
                    value={customQuestion}
                    onChangeText={setCustomQuestion}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    placeholder="Why is this suspicious?"
                    placeholderTextColor="rgba(255, 255, 255, 0.3)"
                    maxLength={240}
                    onSubmitEditing={handleCustomSubmit}
                    returnKeyType="send"
                    keyboardAppearance="dark"
                  />
                  
                  <View style={styles.customInputActions}>
                    <FocusableButton
                      label="Ask"
                      onPress={handleCustomSubmit}
                      style={[styles.actionBtn, customQuestion.trim().length === 0 && styles.actionBtnDisabled]}
                      hasTVPreferredFocus
                    />
                    <FocusableButton
                      label="Cancel"
                      onPress={() => {
                        Keyboard.dismiss();
                        setOverlayState('idle');
                      }}
                      style={styles.actionBtn}
                      nextFocusDown={backBtnNode || undefined}
                    />
                  </View>
                </View>
              )}

              {overlayState === 'loading' && (
                <View style={styles.loadingState}>
                  <Text style={styles.loadingDots}>• • •</Text>
                  <Text style={styles.loadingText}>{getLoadingText()}</Text>
                </View>
              )}

              {overlayState === 'success' && currentResponse && (
                <View style={styles.successState}>
                  <Text style={styles.youAskedLabel}>
                    {currentResponse.mode === 'ask' ? 'YOU ASKED' : 
                     currentResponse.mode === 'explain_simple' ? 'EXPLAIN SIMPLY' :
                     currentResponse.mode === 'learn' ? 'LEARN MODE' : 'PREVIOUSLY ON'}
                  </Text>
                  <Text style={styles.askedQuestionText}>{currentQuestion}</Text>
                  
                  <View style={styles.answerDivider} />
                  
                  <Pressable 
                    hasTVPreferredFocus={currentResponse.mode !== 'learn' || !!learnFeedback}
                    onFocus={() => setIsAnswerFocused(true)}
                    onBlur={() => setIsAnswerFocused(false)}
                    style={() => [
                      styles.answerBlock,
                      isAnswerFocused && styles.answerBlockFocused
                    ]}
                  >
                    <Text style={styles.answerBrand}>NARRAVIEW</Text>
                    {currentResponse.mode === 'ask' || currentResponse.mode === 'explain_simple' ? (
                      <Text style={styles.answerText}>{currentResponse.answer}</Text>
                    ) : currentResponse.mode === 'recap' ? (
                      <Text style={styles.answerText}>{currentResponse.recap}</Text>
                    ) : currentResponse.mode === 'learn' ? (
                      <View>
                        <Text style={styles.answerText}>{currentResponse.takeaway}</Text>
                        <Text style={[styles.answerText, { fontWeight: 'bold' }]}>Quick Check: {currentResponse.question}</Text>
                        
                        {!learnFeedback ? (
                          <View style={styles.actionList}>
                            {currentResponse.options?.map((opt: any, index: number) => (
                               <QuestionOptionCard
                                 key={opt.id}
                                 label={opt.text}
                                 hasTVPreferredFocus={index === 0}
                                 onPress={() => {
                                   if (opt.id === currentResponse.correctOptionId) {
                                     setLearnFeedback(`✓ Correct\n\n${currentResponse.explanation}`);
                                   } else {
                                     setLearnFeedback(`Not quite\n\n${currentResponse.explanation}`);
                                   }
                                 }}
                               />
                            ))}
                          </View>
                        ) : (
                          <View style={[styles.answerBlock, { backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 16 }]}>
                            <Text style={styles.answerText}>{learnFeedback}</Text>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </Pressable>
                  
                  <View style={styles.followUpList}>
                    <FocusableButton
                      label="Back to actions"
                      onPress={() => setOverlayState('idle')}
                      style={styles.followUpBtn}
                      labelStyle={styles.followUpLabel}
                    />
                  </View>
                </View>
              )}

              {overlayState === 'error' && (
                <View style={styles.errorState}>
                  <Text style={styles.errorText}>Couldn't load that right now.</Text>
                  <View style={styles.errorActions}>
                    <FocusableButton 
                      label="Try Again" 
                      onPress={() => handleQuerySelect({ id: 'retry', label: currentQuestion, mode: pendingMode, query: currentQuestion })} 
                      style={styles.actionBtn}
                      hasTVPreferredFocus 
                    />
                    <FocusableButton 
                      label="Back" 
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
        <TVFocusGuideView style={styles.footer} autoFocus>
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
        </TVFocusGuideView>

      </TVFocusGuideView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  panel: {
    width: '44%',
    minWidth: 480,
    height: '90%',
    marginTop: '5%',
    marginLeft: '6%',
    backgroundColor: 'rgba(12, 12, 15, 0.96)',
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
    paddingHorizontal: 16,
    marginHorizontal: -16,
    paddingVertical: 8,
  },
  quickActionBtn: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 0,
    height: 56, // Compact
    backgroundColor: 'rgba(20, 20, 25, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  quickActionBtnFocused: {
    backgroundColor: 'rgba(40, 40, 48, 0.95)',
    borderColor: 'rgba(245, 184, 0, 0.8)',
    transform: [{ scale: 1.02 }],
    shadowColor: '#F5B800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  quickActionBtnPressed: {
    transform: [{ scale: 0.98 }],
  },
  quickActionLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 20,
    fontWeight: '500',
    textAlign: 'left',
    width: '100%',
  },
  quickActionLabelFocused: {
    color: '#FFFFFF',
    fontWeight: '600',
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
    marginBottom: 16, // reduced margin to fit learn mode elements
  },
  followUpList: {
    gap: 16,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    paddingVertical: 8,
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
  },
  customInputState: {
    paddingTop: 8,
  },
  textInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 22,
    padding: 16,
    marginBottom: 24,
  },
  textInputFocused: {
    borderColor: '#F5B800',
    backgroundColor: 'rgba(245, 184, 0, 0.05)',
  },
  customInputActions: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    paddingVertical: 8,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  }
});
