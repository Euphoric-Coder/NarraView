import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { FocusableButton } from './FocusableButton';

interface HeroBannerProps {
  onExplore: () => void;
  onAccessibility?: () => void;
}

export const HeroBanner = ({ onExplore, onAccessibility }: HeroBannerProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.backdrop}>
        {/* Placeholder for backdrop image */}
        <View style={styles.gradientOverlay} />
      </View>

      <View style={styles.content}>
        <Text style={styles.appTitle}>NarraView</Text>
        <Text style={styles.appTagline}>Understand what you watch.</Text>
        <Text style={styles.description}>AI-native contextual viewing for Fire TV.</Text>
        <Text style={styles.valueCopy}>Playback-aware intelligence that understands what you've seen — without ruining what comes next.</Text>
        
        <View style={styles.actions}>
          <FocusableButton 
            label="Explore Collection" 
            onPress={onExplore}
            style={styles.button}
          />
          {onAccessibility && (
            <FocusableButton 
              label="⚙ Explanation Preferences" 
              onPress={onAccessibility}
              style={[styles.button, styles.settingsButton]}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 540,
    width: '100%',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#16222A', // Deep cinematic blue/grey hero placeholder
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Simulate a bottom-to-top gradient fade into background
    backgroundColor: colors.background,
    opacity: 0.8, 
  },
  content: {
    paddingHorizontal: spacing.heroInset,
    paddingBottom: spacing.md, paddingTop: spacing.xxl,
    zIndex: 2,
  },
  appTitle: {
    color: colors.primaryText,
    fontSize: typography.hero.fontSize,
    fontWeight: typography.hero.fontWeight,
    lineHeight: typography.hero.lineHeight,
    letterSpacing: typography.hero.letterSpacing,
  },
  appTagline: {
    color: colors.accent,
    fontSize: typography.tagline.fontSize,
    lineHeight: typography.tagline.lineHeight,
    letterSpacing: typography.tagline.letterSpacing,
    textTransform: typography.tagline.textTransform,
    marginTop: spacing.sm,
  },
  description: {
    color: colors.secondaryText,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    letterSpacing: typography.body.letterSpacing,
    marginTop: spacing.md,
  },
  valueCopy: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  actions: {
    marginTop: spacing.xl,
    flexDirection: 'row',
  },
  button: {
    minWidth: 260,
  },
  settingsButton: {
    marginLeft: 16,
    minWidth: 260,
  }
});
