import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface ProgressBarProps {
  progress: number; // 0 to 1
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: '#333',
    width: '100%',
    borderRadius: 2,
    marginTop: 8,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
});
