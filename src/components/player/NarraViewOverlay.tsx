import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, findNodeHandle, View, Text, Pressable, ActivityIndicator, Animated, ScrollView, Easing, BackHandler, TextInput, Keyboard } from 'react-native';
// @ts-ignore
import { TVFocusGuideView } from 'react-native';
import { FocusableButton } from '../FocusableButton';
import { spacing } from '../../theme/spacing';
import { askNarraView } from '../../services/narraViewApi';
import { AccessibilitySettingsModal } from '../AccessibilitySettingsModal';
import { getCachedAccessibilityProfile } from '../../services/accessibilityApi';

interface NarraViewOverlayProps {
  onClose: () => void;
  contentId: string;
  currentTimeSeconds: number;
  contextTimestamp?: number;
  currentScene?: any;
  runtimeProvider?: "handcrafted" | "intelligence";
  viewerId?: string;
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
  { id: "action-scene", label: "Ask about this scene", mode: "ask", query: "What is happening in this scene right now?" },
  { id: "action-recap", label: "Previously On", mode: "recap", query: "Recap what has happened so far." },
  { id: "action-explain", label: "Explain Simply", mode: "explain_simple", query: "Explain this concept simply." },
  { id: "action-learn", label: "Learn Mode", mode: "learn", query: "Test my understanding of what was revealed." },
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

const CompactOptionCard = React.forwardRef(({
  label,
  onPress,
  hasTVPreferredFocus,
  nextFocusLeft,
  nextFocusRight,
  nextFocusDown,
  nextFocusUp,
}: any, ref: any) => {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={hasTVPreferredFocus}
      nextFocusLeft={nextFocusLeft}
      nextFocusRight={nextFocusRight}
      nextFocusDown={nextFocusDown}
      nextFocusUp={nextFocusUp}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactActionBtn,
        isFocused && styles.quickActionBtnFocused, // reuse amber glow
        pressed && styles.quickActionBtnPressed
      ]}
    >
      <Text
        numberOfLines={2}
        style={[styles.compactActionLabel, isFocused && styles.quickActionLabelFocused]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export const NarraViewOverlay = ({ onClose, contentId, currentTimeSeconds, currentScene, runtimeProvider, viewerId }: NarraViewOverlayProps) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [overlayState, setOverlayState] = useState<OverlayState>('idle');
  const [customQuestion, setCustomQuestion] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const activeRequestId = useRef<string | number>(0);
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
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const recapBtnRef = useRef<any>(null);
  const explainBtnRef = useRef<any>(null);
  const learnBtnRef = useRef<any>(null);
  const settingsBtnRef = useRef<any>(null);
  const backBtnRef = useRef<any>(null);
  const closeBtnRef = useRef<any>(null);

  const [recapNode, setRecapNode] = useState<number | null>(null);
  const [explainNode, setExplainNode] = useState<number | null>(null);
  const [learnNode, setLearnNode] = useState<number | null>(null);
  const [settingsNode, setSettingsNode] = useState<number | null>(null);
  const [backNode, setBackNode] = useState<number | null>(null);
  const [closeNode, setCloseNode] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (recapBtnRef.current) setRecapNode(findNodeHandle(recapBtnRef.current));
      if (explainBtnRef.current) setExplainNode(findNodeHandle(explainBtnRef.current));
      if (learnBtnRef.current) setLearnNode(findNodeHandle(learnBtnRef.current));
      if (settingsBtnRef.current) setSettingsNode(findNodeHandle(settingsBtnRef.current));
      if (backBtnRef.current) setBackNode(findNodeHandle(backBtnRef.current));
      if (closeBtnRef.current) setCloseNode(findNodeHandle(closeBtnRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [overlayState]);
  
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    
    let backHandler: any = null;
    if (BackHandler && typeof BackHandler.addEventListener === 'function') {
      backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBackPress();
        return true;
      });
    }
    return () => backHandler?.remove?.();
  }, []);

  const handleBackPress = () => {
    if (overlayState === 'custom-input') {
      Keyboard.dismiss();
      setOverlayState('idle');
      return;
    }
    if (overlayState === 'loading') {
      activeRequestId.current = 0;
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
    
    const reqIdStr = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    activeRequestId.current = reqIdStr;
    const requestTimestamp = currentTimeSeconds;

    console.log("[NARRAVIEW_REQUEST]", {
      contentId,
      viewerTimestamp: requestTimestamp,
      mode: action.mode,
      question: query,
      requestId: reqIdStr,
      runtimeProvider
    });

    try {
      const response = await askNarraView({
        contentId,
        timestamp: requestTimestamp,
        viewerTimestamp: requestTimestamp,
        mode: action.mode,
        question: query,
        requestId: reqIdStr,
        scene: currentScene,
        viewerId,
        accessibilityProfile: getCachedAccessibilityProfile() || undefined
      });
      
      // Stale request guard: discard response if request became stale
      if (activeRequestId.current !== reqIdStr) {
        console.log('[NarraView Stale Guard] Response discarded:', {
          requestId: reqIdStr,
          requestViewerTimestamp: requestTimestamp,
          currentViewerTimestamp: currentTimeSeconds,
          responseDiscarded: true
        });
        return;
      }

      setCurrentResponse({
        ...response,
        mode: response.mode || action.mode
      });
      setOverlayState('success');
      setCustomQuestion('');
    } catch (error) {
      if (activeRequestId.current === reqIdStr) {
        console.error("NarraView API Error:", error);
        setOverlayState('error');
      }
    }
  };

  const getLoadingText = () => "NarraView is checking what has been revealed so far…";

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
            <Text style={styles.headerTagline}>Answers only from what you've seen</Text>
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
                      nextFocusDown={recapNode || backNode || undefined}
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
                      nextFocusDown={backNode || undefined}
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
                  
                  {/* v0.19 Structured Accessible Response Metadata (Req 32) */}
                  {currentResponse.accessibility && (
                    <View style={styles.accessibilityBadgeRow}>
                      {currentResponse.accessibility.explanationStyle !== 'standard' && (
                        <View style={styles.accessibilityPill}>
                          <Text style={styles.accessibilityPillText}>
                            {currentResponse.accessibility.explanationStyle === 'very_simple' ? 'VERY SIMPLE' : 'SIMPLE MODE'}
                          </Text>
                        </View>
                      )}
                      {currentResponse.accessibility.reducedCognitiveLoadUsed && (
                        <View style={[styles.accessibilityPill, { borderColor: '#818cf8' }]}>
                          <Text style={[styles.accessibilityPillText, { color: '#818cf8' }]}>REDUCED LOAD</Text>
                        </View>
                      )}
                      {currentResponse.accessibility.stepByStepUsed && (
                        <View style={[styles.accessibilityPill, { borderColor: '#34d399' }]}>
                          <Text style={[styles.accessibilityPillText, { color: '#34d399' }]}>STEP-BY-STEP</Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.answerDivider} />

                  {/* v0.19 Jargon Definitions Box (Req 11) */}
                  {currentResponse.accessibility?.jargonDefinitions && currentResponse.accessibility.jargonDefinitions.length > 0 && (
                    <View style={styles.jargonContainer}>
                      <Text style={styles.jargonHeading}>REVEALED TERMS & DEFINITIONS</Text>
                      {currentResponse.accessibility.jargonDefinitions.map((item: any, idx: number) => (
                        <View key={idx} style={styles.jargonRow}>
                          <Text style={styles.jargonTermText}>{item.term}</Text>
                          <Text style={styles.jargonDefText}>— {item.definition}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  {/* SpoilerShield Identity Badge */}
                  <View style={styles.spoilerShieldCard}>
                    <Text style={styles.spoilerShieldIcon}>🛡</Text>
                    <View style={styles.spoilerShieldCol}>
                      <Text style={styles.spoilerShieldTitle}>SpoilerShield</Text>
                      <Text style={styles.spoilerShieldSafeText}>
                        Safe through {Math.floor(Math.max(0, currentTimeSeconds) / 60).toString().padStart(2, '0')}:{Math.floor(Math.max(0, currentTimeSeconds) % 60).toString().padStart(2, '0')}
                      </Text>
                    </View>
                  </View>

                  {currentResponse.mode === 'ask' || !currentResponse.mode ? (
                    (() => {
                      const ans = currentResponse.answer || '';
                      const isRefusal = ans.toLowerCase().includes("isn’t established") ||
                                        ans.toLowerCase().includes("not established") ||
                                        ans.toLowerCase().includes("won't reveal") ||
                                        ans.toLowerCase().includes("wont reveal") ||
                                        currentResponse.safety?.premiseValidated === false;
                      if (isRefusal) {
                        return (
                          <Pressable
                            hasTVPreferredFocus
                            onFocus={() => setIsAnswerFocused(true)}
                            onBlur={() => setIsAnswerFocused(false)}
                            style={() => [
                              styles.answerBlock,
                              styles.refusalBlock,
                              isAnswerFocused && styles.answerBlockFocused
                            ]}
                          >
                            <Text style={styles.refusalPrimaryText}>NarraView won't reveal that yet.</Text>
                            <Text style={styles.refusalSecondaryText}>Keep watching — this becomes clear later.</Text>
                          </Pressable>
                        );
                      }
                      return (
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
                      );
                    })()
                  ) : (currentResponse.mode === 'recap' || currentResponse.mode === 'previously_on') ? (
                    <View style={styles.modeContentBlock}>
                      {currentResponse.summary ? (
                        <Text style={[styles.answerText, styles.recapText, { marginBottom: 14 }]}>
                          {currentResponse.summary}
                        </Text>
                      ) : null}
                      {currentResponse.bullets && currentResponse.bullets.length > 0 ? (
                        <View style={{ marginBottom: 12 }}>
                          {currentResponse.bullets.map((b: string, i: number) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                              <Text style={{ color: '#F5B800', fontSize: 18, fontWeight: 'bold', marginRight: 10, lineHeight: 26 }}>•</Text>
                              <Text style={{ color: '#E0E0E0', fontSize: 20, lineHeight: 28, flex: 1 }}>{b}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (!currentResponse.summary ? (
                        <Text style={[styles.answerText, styles.recapText]}>{currentResponse.recap}</Text>
                      ) : null)}
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
        <View style={styles.footer}>
          {overlayState === 'idle' && (
            <View style={styles.footerToolsRow}>
              <CompactOptionCard 
                ref={recapBtnRef}
                label="Previously On" 
                onPress={() => handleQuerySelect({ id: 'action-recap', label: 'Previously On', mode: 'recap' })}
                nextFocusRight={explainNode || undefined}
                nextFocusDown={backNode || undefined}
              />
              <CompactOptionCard 
                ref={explainBtnRef}
                label="Explain Simply" 
                onPress={() => handleQuerySelect({ id: 'action-explain', label: 'Explain Simply', mode: 'explain_simple' })}
                nextFocusLeft={recapNode || undefined}
                nextFocusRight={learnNode || undefined}
                nextFocusDown={backNode || undefined}
              />
              <CompactOptionCard 
                ref={learnBtnRef}
                label="Learn Mode" 
                onPress={() => handleQuerySelect({ id: 'action-learn', label: 'Learn Mode', mode: 'learn' })}
                nextFocusLeft={explainNode || undefined}
                nextFocusRight={settingsNode || undefined}
                nextFocusDown={closeNode || undefined}
              />
              <CompactOptionCard 
                ref={settingsBtnRef}
                label="⚙ Settings" 
                onPress={() => setShowSettingsModal(true)}
                nextFocusLeft={learnNode || undefined}
                nextFocusDown={closeNode || undefined}
              />
            </View>
          )}
          <View style={styles.footerRow}>
            <FocusableButton 
              ref={backBtnRef}
              label="Back" 
              onPress={handleBackPress} 
              style={styles.footerBtn} 
              labelStyle={styles.footerBtnLabel}
              nextFocusUp={overlayState === 'idle' ? (recapNode || undefined) : undefined}
              nextFocusRight={closeNode || undefined}
            />
            <FocusableButton 
              ref={closeBtnRef}
              label="Close" 
              onPress={handleClose} 
              style={styles.footerBtn} 
              labelStyle={styles.footerBtnLabel}
              nextFocusUp={overlayState === 'idle' ? (settingsNode || undefined) : undefined}
              nextFocusLeft={backNode || undefined}
            />
          </View>
        </View>

        <AccessibilitySettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          viewerId={viewerId || 'narraview-demo-viewer'}
        />
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

  contextAssistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 184, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 0, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  contextAssistCardPressed: {
    backgroundColor: 'rgba(245, 184, 0, 0.18)',
  },
  contextAssistIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  contextAssistTextCol: {
    flex: 1,
  },
  contextAssistTitle: {
    color: '#F5B800',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  contextAssistSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
  },
  accessibilityBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  accessibilityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#F5B800',
    backgroundColor: 'rgba(245, 184, 0, 0.08)',
  },
  accessibilityPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F5B800',
    letterSpacing: 0.5,
  },
  jargonContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  jargonHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  jargonRow: {
    marginBottom: 4,
  },
  jargonTermText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F5B800',
  },
  jargonDefText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 1,
  },
  headerTagline: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  spoilerShieldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 184, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 0, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  spoilerShieldIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  spoilerShieldCol: {
    flex: 1,
  },
  spoilerShieldTitle: {
    color: '#F5B800',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  spoilerShieldSafeText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    marginTop: 1,
  },
  refusalBlock: {
    backgroundColor: 'rgba(245, 184, 0, 0.05)',
    borderLeftWidth: 4,
    borderLeftColor: '#F5B800',
    padding: 18,
    borderRadius: 8,
  },
  refusalPrimaryText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 8,
  },
  refusalSecondaryText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    width: '46%',
    minWidth: 500,
    maxWidth: 580,
    height: '90%',
    marginTop: '5%',
    marginLeft: '6%',
    backgroundColor: 'rgba(12, 12, 15, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 22,
    paddingHorizontal: 24,
    paddingBottom: 24,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
    elevation: 20,
  },
  
  // Header
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 16,
  },
  headerTopRow: {
    marginBottom: 2,
  },
  headerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandEyebrow: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  sceneTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
    flex: 1,
  },
  timestampText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
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
    fontSize: 18,
    marginBottom: 16,
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
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 14,
  },
  footerToolsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    width: '100%',
  },
  compactActionBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    minHeight: 52,
    backgroundColor: 'rgba(20, 20, 25, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  compactActionLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 16,
  },
  footerBtn: {
    backgroundColor: 'transparent',
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  footerBtnLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
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
