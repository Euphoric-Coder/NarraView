import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');

  if (h > 0) {
    return `${h}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
};

interface TimeDisplayProps {
  timeSeconds: number;
}

export const TimeDisplay = ({ timeSeconds }: TimeDisplayProps) => (
  <Text style={styles.text}>{formatTime(timeSeconds)}</Text>
);

const styles = StyleSheet.create({
  text: {
    color: colors.primaryText,
    fontSize: 24, // Readability from 10 feet
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
    minWidth: 80,
    textAlign: 'center',
  }
});
