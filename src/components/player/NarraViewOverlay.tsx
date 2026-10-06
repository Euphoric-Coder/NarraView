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

const CompactOptionCard = ({ label, onPress, hasTVPreferredFocus }: any) => {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactActionBtn,
        isFocused && styles.quickActionBtnFocused, // reuse amber glow
        pressed && styles.quickActionBtnPressed
      ]}
    >
      <Text style={[styles.compactActionLabel, isFocused && styles.quickActionLabelFocused]}>
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
  const [lastSelectedActionId, setLastSelectedActionId] = useState<string | null>(null);

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
    setLastSelectedActionId(action.id);
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

  const cleanFeedbackText = (text: string) => {
    if (!text) return '';
    let cleaned = text;
    const mechanicalPhrases = [
      'The established fact states that ',
      'The established facts state that ',
      'According to the scene, ',
      'The evidence shows that ',
      'The grounding logic dictates that '
    ];
    for (const phrase of mechanicalPhrases) {
      const regex = new RegExp(`^${phrase}`, 'i');
      cleaned = cleaned.replace(regex, '');
    }
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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
                      <React.Fragment key={action.id}>
                        <QuestionOptionCard
                          label={action.label}
                          hasTVPreferredFocus={lastSelectedActionId ? action.id === lastSelectedActionId : index === 0}
                          onPress={() => handleQuerySelect(action)}
                        />
                      </React.Fragment>
                    ))}
                    <View style={styles.actionDivider} />
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
                  {currentResponse.mode === 'ask' || !currentResponse.mode ? (
                    <View style={styles.modeHeaderBlock}>
                      <Text style={styles.youAskedLabel}>YOU ASKED</Text>
                      <Text style={styles.askedQuestionText}>{currentQuestion}</Text>
                    </View>
                  ) : (
                    <View style={styles.modeHeaderBlock}>
                      <Text style={styles.modeLabel}>
                        {currentResponse.mode === 'recap' ? 'PREVIOUSLY ON' :
                         currentResponse.mode === 'explain_simple' ? 'EXPLAIN SIMPLY' : 'LEARN MODE'}
                      </Text>
                      {currentResponse.mode === 'recap' && <Text style={styles.modeSubtitle}>Recap so far</Text>}
                      {currentResponse.mode === 'explain_simple' && <Text style={styles.modeSubtitle}>In plain language</Text>}
                      {currentResponse.mode === 'learn' && <Text style={styles.modeSubtitle}>Quick comprehension</Text>}
                    </View>
                  )}
                  
                  <View style={styles.answerDivider} />
                  
                  {currentResponse.mode === 'ask' || !currentResponse.mode ? (
                    <Pressable 
                      hasTVPreferredFocus
                      onFocus={() => setIsAnswerFocused(true)}
                      onBlur={() => setIsAnswerFocused(false)}
                      style={() => [
                        styles.answerBlock,
                        isAnswerFocused && styles.answerBlockFocused
                      ]}
                    >
                      <Text style={styles.answerText}>{currentResponse.answer}</Text>
                    </Pressable>
                  ) : currentResponse.mode === 'recap' ? (
                    <View style={styles.modeContentBlock}>
                      <Text style={[styles.answerText, styles.recapText]}>{currentResponse.recap}</Text>
                    </View>
                  ) : currentResponse.mode === 'explain_simple' ? (
                    <View style={styles.modeContentBlock}>
                      <Text style={[styles.answerText, styles.explainText]}>{currentResponse.answer}</Text>
                    </View>
                  ) : currentResponse.mode === 'learn' ? (
                    <View style={styles.modeContentBlock}>
                      <View style={styles.takeawaySection}>
                        <Text style={styles.sectionEyebrow}>TAKEAWAY</Text>
                        <Text style={styles.takeawayText}>{currentResponse.takeaway}</Text>
                      </View>

                      <View style={styles.quizSection}>
                        <Text style={styles.sectionEyebrow}>QUICK CHECK</Text>
                        <Text style={styles.quizQuestion}>{currentResponse.question}</Text>
                        
                        {!learnFeedback ? (
                          <View style={styles.quizOptionsList}>
                            {currentResponse.options?.map((opt: any, index: number) => (
                               <QuestionOptionCard
                                 key={opt.id}
                                 label={opt.text}
                                 hasTVPreferredFocus={index === 0}
                                 onPress={() => {
                                   const polishedExplanation = cleanFeedbackText(currentResponse.explanation);
                                   if (opt.id === currentResponse.correctOptionId) {
                                     setLearnFeedback(`✓ Correct\n\n${polishedExplanation}`);
                                   } else {
                                     setLearnFeedback(`Not quite\n\n${polishedExplanation}`);
                                   }
                                 }}
                               />
                            ))}
                          </View>
                        ) : (
                          <View style={styles.feedbackBlock}>
                            <Text style={[styles.feedbackTitle, learnFeedback.startsWith('✓') ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
                              {learnFeedback.split('\n\n')[0]}
                            </Text>
                            <Text style={styles.feedbackText}>{learnFeedback.split('\n\n')[1]}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ) : null}
                  
                  <View style={styles.followUpList}>
                    <FocusableButton
                      label="Back to actions"
                      onPress={() => setOverlayState('idle')}
                      style={styles.followUpBtn}
                      labelStyle={styles.followUpLabel}
                      hasTVPreferredFocus={currentResponse.mode !== 'learn' || !!learnFeedback}
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
          {overlayState === 'idle' && (
            <View style={styles.footerToolsRow}>
              <CompactOptionCard 
                label="Previously On" 
                onPress={() => handleQuerySelect({ id: 'action-recap', label: 'Previously On', mode: 'recap' })}
                hasTVPreferredFocus={lastSelectedActionId === 'action-recap'}
              />
              <CompactOptionCard 
                label="Explain Simply" 
                onPress={() => handleQuerySelect({ id: 'action-explain', label: 'Explain Simply', mode: 'explain_simple' })}
                hasTVPreferredFocus={lastSelectedActionId === 'action-explain'}
              />
              <CompactOptionCard 
                label="Learn Mode" 
                onPress={() => handleQuerySelect({ id: 'action-learn', label: 'Learn Mode', mode: 'learn' })}
                hasTVPreferredFocus={lastSelectedActionId === 'action-learn'}
              />
            </View>
          )}
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
    paddingBottom: 64, // Ensure bottom content like 'Back to actions' is fully clear
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
    paddingVertical: 12,
    minHeight: 56,
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
  
  footer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 16,
  },
  footerToolsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    width: '100%',
  },
  compactActionBtn: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    minHeight: 48,
    backgroundColor: 'rgba(20, 20, 25, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  compactActionLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
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
  },
  actionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12,
  },
  modeHeaderBlock: {
    marginBottom: 20,
  },
  modeContentBlock: {
    paddingVertical: 0,
  },
  modeLabel: {
    color: '#F5B800',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modeSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    marginTop: 6,
  },
  recapText: {
    marginTop: 8,
  },
  explainText: {
    marginTop: 0,
  },
  takeawaySection: {
    marginBottom: 32,
  },
  sectionEyebrow: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  takeawayText: {
    color: '#E0E0E0',
    fontSize: 20,
    lineHeight: 28,
  },
  quizSection: {
    marginBottom: 16,
  },
  quizQuestion: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 32,
    marginBottom: 20,
  },
  quizOptionsList: {
    gap: 12,
    paddingBottom: 16,
  },
  feedbackBlock: {
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  feedbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  feedbackCorrect: {
    color: '#4ADE80',
  },
  feedbackIncorrect: {
    color: '#E0E0E0',
  },
  feedbackText: {
    color: '#E0E0E0',
    fontSize: 20,
    lineHeight: 28,
  }
});
