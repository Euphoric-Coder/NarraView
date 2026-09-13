import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ContentItem } from '../types/content';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { shadows } from '../theme/shadows';
import { ProgressBar } from './ProgressBar';

interface ContentCardProps {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
  hasTVPreferredFocus?: boolean;
}

export const ContentCard = ({ item, onPress, hasTVPreferredFocus }: ContentCardProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.cardContainer,
        isFocused && styles.focusedCardContainer,
        pressed && styles.pressedCard,
      ]}
    >
      <View style={[
        styles.posterWrapper,
        isFocused ? shadows.cardFocused : shadows.cardDefault
      ]}>
        <View style={[styles.poster, { backgroundColor: item.posterColor }, isFocused && styles.focusedPoster]}>
          <View style={styles.glassOverlay} />
        </View>
      </View>

      <View style={styles.metadata}>
        <Text style={[styles.title, isFocused && styles.focusedText]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.progress !== undefined ? (
          <ProgressBar progress={item.progress} />
        ) : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {item.genre} • {item.runtime}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    width: 320, // Larger premium feel
    marginRight: spacing.xl,
    padding: spacing.xs, // Room for shadow
    backgroundColor: 'transparent',
  },
  focusedCardContainer: {
    transform: [{ scale: 1.08 }],
    zIndex: 10,
  },
  pressedCard: {
    transform: [{ scale: 1.04 }],
  },
  posterWrapper: {
    // shadow is applied here via theme
  },
  poster: {
    width: 304,
    height: 171, // True 16:9
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  focusedPoster: {
    borderColor: '#FFFFFF', // High contrast border
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
  },
  metadata: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    letterSpacing: typography.body.letterSpacing,
  },
  focusedText: {
    color: colors.primaryText,
    textShadowColor: colors.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: typography.metadata.fontSize,
    letterSpacing: typography.metadata.letterSpacing,
    textTransform: typography.metadata.textTransform,
    marginTop: spacing.xs,
  },
});
