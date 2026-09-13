import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { ContentItem } from '../types/content';
import { FocusableButton } from '../components/FocusableButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

interface DetailsScreenProps {
  item: ContentItem;
}

export const DetailsScreen = ({ item }: DetailsScreenProps) => {
  const [statusMessage, setStatusMessage] = useState('');

  return (
    <View style={styles.screen}>
      <View style={[styles.backdrop, { backgroundColor: item.posterColor }]}>
        <View style={styles.gradientOverlay} />
        <View style={styles.vignetteOverlay} />
      </View>
      
      <TVFocusGuideView style={styles.content} autoFocus>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.metadata}>
            {item.genre} • {item.runtime} • {item.year}
          </Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>

        <View style={styles.actions}>
          <FocusableButton
            label="Watch Now"
            onPress={() => setStatusMessage('Video playback arrives in NarraView v0.3.')}
            hasTVPreferredFocus
            style={styles.primaryButton}
          />
          <FocusableButton
            label="Ask NarraView"
            onPress={() => {}}
            disabled
            style={styles.secondaryButton}
          />
        </View>

        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    opacity: 0.85,
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    opacity: 0.3, // Adds cinematic vignette
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.heroInset,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  textContainer: {
    maxWidth: 960, // Limit width for TV readability
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.display.fontSize,
    fontWeight: typography.display.fontWeight,
    lineHeight: typography.display.lineHeight,
    letterSpacing: typography.display.letterSpacing,
  },
  metadata: {
    color: colors.accent,
    fontSize: typography.metadata.fontSize,
    fontWeight: '700',
    marginTop: spacing.md,
    letterSpacing: typography.metadata.letterSpacing,
    textTransform: typography.metadata.textTransform,
  },
  description: {
    color: colors.secondaryText,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    letterSpacing: typography.body.letterSpacing,
    marginTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.xxl,
  },
  primaryButton: {
    marginRight: spacing.md,
  },
  secondaryButton: {
    marginRight: spacing.md,
  },
  statusMessage: {
    color: colors.accentSecondary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
});
