import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

interface FocusableButtonProps {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const FocusableButton = ({ label, onPress, style, hasTVPreferredFocus, disabled }: FocusableButtonProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <Pressable
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isFocused && styles.focusedButton,
        pressed && styles.pressedButton,
        disabled && styles.disabledButton,
        style,
      ]}
    >
      <Text style={[
        styles.label, 
        isFocused && styles.focusedLabel,
        disabled && styles.disabledLabel
      ]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.surfaceHighlight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 32, // Pill shape
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedButton: {
    backgroundColor: colors.accent,
    borderColor: '#FFFFFF', // High contrast border for TV focus
    transform: [{ scale: 1.05 }],
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  pressedButton: {
    transform: [{ scale: 0.98 }],
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    opacity: 0.5,
  },
  label: {
    color: colors.primaryText,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    letterSpacing: typography.body.letterSpacing,
  },
  focusedLabel: {
    color: colors.background, // Invert text on focus for premium feel
  },
  disabledLabel: {
    color: colors.mutedText,
  },
});
