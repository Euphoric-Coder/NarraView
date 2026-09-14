import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
}

export const ProgressBar = ({ currentTime, duration }: ProgressBarProps) => {
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progressPercent}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
    marginHorizontal: 24,
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent, // Amber gold
  },
});
