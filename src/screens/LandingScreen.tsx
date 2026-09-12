import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {FocusableButton} from '../components/FocusableButton';
import {colors} from '../theme/colors';
import {spacing} from '../theme/spacing';
import {typography} from '../theme/typography';

export const LandingScreen = () => {
  const [statusMessage, setStatusMessage] = useState('');

  return (
    <View style={styles.screen}>
      <TVFocusGuideView style={styles.content} autoFocus>
        <Text style={styles.title}>NarraView</Text>
        <Text style={styles.tagline}>Understand what you watch.</Text>
        <Text style={styles.secondaryLine}>
          AI-native contextual viewing for Fire TV
        </Text>
        <FocusableButton
          label="Enter NarraView"
          onPress={() => setStatusMessage('NarraView is ready.')}
          hasTVPreferredFocus
          testID="enter-narraview-button"
          style={styles.button}
        />
        {statusMessage ? (
          <Text style={styles.statusMessage} testID="ready-message">
            {statusMessage}
          </Text>
        ) : null}
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.tvSafeHorizontal,
    paddingVertical: spacing.tvSafeVertical,
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.display.fontSize,
    fontWeight: typography.display.fontWeight,
    lineHeight: typography.display.lineHeight,
  },
  tagline: {
    color: colors.secondaryText,
    fontSize: typography.tagline.fontSize,
    lineHeight: typography.tagline.lineHeight,
    marginTop: spacing.medium,
  },
  secondaryLine: {
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.small,
  },
  button: {
    marginTop: spacing.large,
  },
  statusMessage: {
    color: colors.accent,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.medium,
  },
});
