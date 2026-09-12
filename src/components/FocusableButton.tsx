import React from 'react';
import {Pressable, StyleSheet, Text, ViewStyle} from 'react-native';

export interface FocusableButtonProps {
  label: string;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
  style?: ViewStyle;
}

export const FocusableButton = ({
  label,
  onPress,
  onFocus,
  onBlur,
  hasTVPreferredFocus = false,
  testID,
  style,
}: FocusableButtonProps) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.button,
        isFocused && styles.focused,
        pressed && styles.pressed,
        style,
      ]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#E9EEF2',
    borderColor: '#E9EEF2',
    borderRadius: 4,
    borderWidth: 3,
    justifyContent: 'center',
    minWidth: 360,
    paddingHorizontal: 40,
    paddingVertical: 22,
  },
  focused: {
    backgroundColor: '#FFB000',
    borderColor: '#FFFFFF',
    transform: [{scale: 1.05}],
    shadowColor: '#FFB000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  pressed: {
    backgroundColor: '#D78300',
    borderColor: '#FFB000',
  },
  label: {
    color: '#101417',
    fontSize: 28,
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: 34,
  },
});
