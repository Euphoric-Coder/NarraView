import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Modal, 
  Pressable, 
  ScrollView, 
  ActivityIndicator,
  BackHandler 
} from 'react-native';
// @ts-ignore
import { TVFocusGuideView } from 'react-native';
import { FocusableButton } from './FocusableButton';
import { 
  ViewerAccessibilityProfile, 
  ExplanationStyle, 
  Verbosity, 
  fetchAccessibilityProfile, 
  updateAccessibilityProfile,
  getCachedAccessibilityProfile,
  DEFAULT_ACCESSIBILITY_PROFILE 
} from '../services/accessibilityApi';

interface AccessibilitySettingsModalProps {
  visible: boolean;
  onClose: () => void;
  viewerId: string;
  onProfileUpdated?: (profile: ViewerAccessibilityProfile) => void;
}

interface FocusOptionButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

const FocusOptionButton = ({ label, selected, onPress, hasTVPreferredFocus }: FocusOptionButtonProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionBtn,
        selected && styles.optionBtnSelected,
        isFocused && styles.optionBtnFocused,
        pressed && styles.optionBtnPressed
      ]}
    >
      <Text style={[
        styles.optionBtnText,
        selected && styles.optionBtnTextSelected,
        isFocused && styles.optionBtnTextFocused
      ]}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
};

export const AccessibilitySettingsModal: React.FC<AccessibilitySettingsModalProps> = ({
  visible,
  onClose,
  viewerId,
  onProfileUpdated
}) => {
  const initialCached = getCachedAccessibilityProfile();
  const [profile, setProfile] = useState<ViewerAccessibilityProfile>(
    initialCached || {
      viewerId,
      ...DEFAULT_ACCESSIBILITY_PROFILE,
      updatedAt: new Date().toISOString()
    }
  );
  const [loading, setLoading] = useState<boolean>(!initialCached);
  const [saving, setSaving] = useState<boolean>(false);

  // Hardware Back button support for Fire TV / Vega remote
  useEffect(() => {
    let backHandler: any = null;
    if (visible && BackHandler && typeof BackHandler.addEventListener === 'function') {
      backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
    }
    return () => {
      backHandler?.remove?.();
    };
  }, [visible, onClose]);

  // Load profile on modal open
  useEffect(() => {
    let isMounted = true;
    if (visible && viewerId) {
      const cached = getCachedAccessibilityProfile();
      if (cached) {
        setProfile(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }

      fetchAccessibilityProfile(viewerId).then(p => {
        if (isMounted) {
          setProfile(p);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[ACCESSIBILITY_MODAL] Load failed:', err);
        if (isMounted) setLoading(false);
      });
    }
    return () => { isMounted = false; };
  }, [visible, viewerId]);

  const handleUpdate = async (updates: Partial<ViewerAccessibilityProfile>) => {
    const updated = { ...profile, ...updates };
    setProfile(updated);
    setSaving(true);
    try {
      const persisted = await updateAccessibilityProfile(viewerId, updates);
      setProfile(persisted);
      if (onProfileUpdated) {
        onProfileUpdated(persisted);
      }
    } catch (e) {
      console.warn('[ACCESSIBILITY_MODAL] Update error:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TVFocusGuideView style={styles.card} autoFocus trapFocus={true}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Explanation Preferences</Text>
              <Text style={styles.subtitle}>
                Customize how NarraView explains content to suit your preference
              </Text>
            </View>
            <FocusableButton
              label="✕ Close"
              onPress={onClose}
              style={styles.closeBtn}
              labelStyle={styles.closeBtnText}
            />
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#F5B800" />
              <Text style={styles.loadingText}>Loading Preferences...</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.content} 
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              {/* 1. Explanation Style */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Explanation Style</Text>
                <Text style={styles.sectionDescription}>
                  Controls language simplicity while preserving factual truth.
                </Text>
                <View style={styles.optionsRow}>
                  <FocusOptionButton
                    label="Standard"
                    selected={profile.explanationStyle === 'standard'}
                    onPress={() => handleUpdate({ explanationStyle: 'standard' })}
                    hasTVPreferredFocus
                  />
                  <FocusOptionButton
                    label="Simple"
                    selected={profile.explanationStyle === 'simple'}
                    onPress={() => handleUpdate({ explanationStyle: 'simple' })}
                  />
                  <FocusOptionButton
                    label="Very Simple"
                    selected={profile.explanationStyle === 'very_simple'}
                    onPress={() => handleUpdate({ explanationStyle: 'very_simple' })}
                  />
                </View>
              </View>

              {/* 2. Answer Length */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Answer Length</Text>
                <Text style={styles.sectionDescription}>
                  Target depth and response word count.
                </Text>
                <View style={styles.optionsRow}>
                  <FocusOptionButton
                    label="Brief (~30-50w)"
                    selected={profile.verbosity === 'brief'}
                    onPress={() => handleUpdate({ verbosity: 'brief' })}
                  />
                  <FocusOptionButton
                    label="Normal (~60-120w)"
                    selected={profile.verbosity === 'normal'}
                    onPress={() => handleUpdate({ verbosity: 'normal' })}
                  />
                  <FocusOptionButton
                    label="Detailed (~150-220w)"
                    selected={profile.verbosity === 'detailed'}
                    onPress={() => handleUpdate({ verbosity: 'detailed' })}
                  />
                </View>
              </View>

              {/* 3. Toggles */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Context Assistance</Text>

                {/* Entity Reminders */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Entity & Person Reminders</Text>
                    <Text style={styles.toggleDesc}>
                      Memory-aware reminders of who characters, actors, and roles are.
                    </Text>
                  </View>
                  <View style={styles.toggleBtns}>
                    <FocusOptionButton
                      label="On"
                      selected={profile.entityReminders === true}
                      onPress={() => handleUpdate({ entityReminders: true })}
                    />
                    <FocusOptionButton
                      label="Off"
                      selected={profile.entityReminders === false}
                      onPress={() => handleUpdate({ entityReminders: false })}
                    />
                  </View>
                </View>

                {/* Concept Reminders */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Concept Reminders</Text>
                    <Text style={styles.toggleDesc}>
                      Refresher phrasing for previously encountered tools & concepts.
                    </Text>
                  </View>
                  <View style={styles.toggleBtns}>
                    <FocusOptionButton
                      label="On"
                      selected={profile.conceptReminders === true}
                      onPress={() => handleUpdate({ conceptReminders: true })}
                    />
                    <FocusOptionButton
                      label="Off"
                      selected={profile.conceptReminders === false}
                      onPress={() => handleUpdate({ conceptReminders: false })}
                    />
                  </View>
                </View>

                {/* Step-by-Step */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Step-by-Step Explanations</Text>
                    <Text style={styles.toggleDesc}>
                      Structures complex workflows into numbered sequential steps.
                    </Text>
                  </View>
                  <View style={styles.toggleBtns}>
                    <FocusOptionButton
                      label="On"
                      selected={profile.stepByStep === true}
                      onPress={() => handleUpdate({ stepByStep: true })}
                    />
                    <FocusOptionButton
                      label="Off"
                      selected={profile.stepByStep === false}
                      onPress={() => handleUpdate({ stepByStep: false })}
                    />
                  </View>
                </View>

                {/* Reduced Cognitive Load */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Reduced Cognitive Load</Text>
                    <Text style={styles.toggleDesc}>
                      Short sentences, 1 idea per point, zero clutter or tangents.
                    </Text>
                  </View>
                  <View style={styles.toggleBtns}>
                    <FocusOptionButton
                      label="On"
                      selected={profile.reducedCognitiveLoad === true}
                      onPress={() => handleUpdate({ reducedCognitiveLoad: true })}
                    />
                    <FocusOptionButton
                      label="Off"
                      selected={profile.reducedCognitiveLoad === false}
                      onPress={() => handleUpdate({ reducedCognitiveLoad: false })}
                    />
                  </View>
                </View>

                {/* Jargon Support */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <Text style={styles.toggleTitle}>Jargon Help</Text>
                    <Text style={styles.toggleDesc}>
                      Includes brief definitions for technical terms present in evidence.
                    </Text>
                  </View>
                  <View style={styles.toggleBtns}>
                    <FocusOptionButton
                      label="On"
                      selected={profile.jargonSupport === true}
                      onPress={() => handleUpdate({ jargonSupport: true })}
                    />
                    <FocusOptionButton
                      label="Off"
                      selected={profile.jargonSupport === false}
                      onPress={() => handleUpdate({ jargonSupport: false })}
                    />
                  </View>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerNote}>
                Preferences persist per viewer across all sessions.
              </Text>
              {saving && <Text style={styles.savingText}>Saving...</Text>}
            </View>
            <FocusableButton
              label="Done"
              onPress={onClose}
              style={styles.doneBtn}
              labelStyle={styles.doneBtnText}
            />
          </View>
        </TVFocusGuideView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '88%',
    maxWidth: 860,
    height: '84%', // Definite height so ScrollView flex: 1 expands!
    backgroundColor: '#12131A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 14,
    marginBottom: 14,
  },
  headerTextCol: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F5B800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 4,
  },
  closeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#F5B800',
    fontSize: 14,
    marginTop: 12,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 3,
  },
  sectionDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBtnSelected: {
    backgroundColor: 'rgba(245, 184, 0, 0.16)',
    borderColor: '#F5B800',
  },
  optionBtnFocused: {
    borderColor: '#F5B800',
    backgroundColor: 'rgba(245, 184, 0, 0.28)',
    shadowColor: '#F5B800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  optionBtnPressed: {
    transform: [{ scale: 0.98 }],
  },
  optionBtnText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  optionBtnTextSelected: {
    color: '#F5B800',
    fontWeight: '700',
  },
  optionBtnTextFocused: {
    color: '#ffffff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  toggleDesc: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 2,
  },
  toggleBtns: {
    flexDirection: 'row',
    width: 140,
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerLeft: {
    flex: 1,
  },
  footerNote: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  savingText: {
    fontSize: 11,
    color: '#F5B800',
    fontWeight: '600',
    marginTop: 2,
  },
  doneBtn: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5B800',
  },
  doneBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});
