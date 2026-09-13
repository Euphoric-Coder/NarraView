import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { FocusableButton } from '../components/FocusableButton';

interface LandingScreenProps {
  onEnter: () => void;
}

export const LandingScreen = ({ onEnter }: LandingScreenProps) => {
  return (
    <View style={styles.screen}>
      <TVFocusGuideView style={styles.container} autoFocus>
        <Text style={styles.title}>NarraView</Text>
        <Text style={styles.tagline}>Understand what you watch.</Text>
        
        <FocusableButton
          label="Enter NarraView"
          onPress={onEnter}
          hasTVPreferredFocus
          style={{ marginTop: spacing.xl }}
        />
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.hero.fontSize,
    fontWeight: typography.hero.fontWeight,
    lineHeight: typography.hero.lineHeight,
  },
  tagline: {
    color: colors.secondaryText,
    fontSize: typography.tagline.fontSize,
    lineHeight: typography.tagline.lineHeight,
    marginTop: spacing.sm,
  },
});
