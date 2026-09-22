import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { TimeDisplay } from './TimeDisplay';
import { ProgressBar } from './ProgressBar';
import { FocusableButton } from '../FocusableButton';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface PlayerControlsProps {
  title: string;
  isPlaying: boolean;
  currentTimeSeconds: number;
  durationSeconds: number;
  currentScene?: string;
  onTogglePlayPause: () => void;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onOpenNarraView?: () => void;
  // Debug info
  isBuffering: boolean;
  hasError: boolean;
}

export const PlayerControls = ({
  title,
  isPlaying,
  currentTimeSeconds,
  durationSeconds,
  currentScene,
  onTogglePlayPause,
  onSeekBack,
  onSeekForward,
  onOpenNarraView,
  isBuffering,
  hasError
}: PlayerControlsProps) => {
  return (
    <View style={styles.container}>
      {/* Top Section: Title & Debug */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>{title}</Text>
          {currentScene && <Text style={styles.sceneTitle}>{currentScene}</Text>}
        </View>
        
        {/* Temporary Debug Overlay */}
        <View style={styles.debugBox}>
          <Text style={styles.debugText}>DEBUG</Text>
          <Text style={styles.debugText}>time: {currentTimeSeconds.toFixed(2)}s</Text>
          <Text style={styles.debugText}>duration: {durationSeconds.toFixed(2)}s</Text>
          <Text style={styles.debugText}>playing: {isPlaying.toString()}</Text>
          <Text style={styles.debugText}>buffering: {isBuffering.toString()}</Text>
          {currentScene && <Text style={styles.debugText}>scene: {currentScene}</Text>}
        </View>
      </View>

      {/* Bottom Section: Scrubber & Controls */}
      <View style={styles.bottomBar}>
        <View style={styles.scrubberRow}>
          <TimeDisplay timeSeconds={currentTimeSeconds} />
          <ProgressBar currentTime={currentTimeSeconds} duration={durationSeconds} />
          <TimeDisplay timeSeconds={durationSeconds} />
        </View>

        <TVFocusGuideView style={styles.controlsRow} autoFocus>
          <FocusableButton 
            label="-10s"
            onPress={onSeekBack}
            style={styles.seekButton}
          />
          <FocusableButton 
            label={isPlaying ? '⏸ Pause' : '▶ Play'}
            onPress={onTogglePlayPause}
            hasTVPreferredFocus
            style={styles.playButton}
          />
          <FocusableButton 
            label="+10s"
            onPress={onSeekForward}
            style={styles.seekButton}
          />
          
          {/* Ask NarraView Button */}
          {onOpenNarraView && (
            <FocusableButton 
              label="[ Ask NarraView ]"
              onPress={onOpenNarraView}
              style={styles.narraViewButton}
              labelStyle={styles.narraViewButtonLabel}
            />
          )}
        </TVFocusGuideView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  topBar: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.heroInset,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sceneTitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: typography.body.fontSize,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.tagline.fontSize,
    letterSpacing: typography.tagline.letterSpacing,
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  debugBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.5)',
  },
  debugText: {
    color: '#00ff00',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  bottomBar: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.heroInset,
    alignItems: 'center',
    width: '100%',
  },
  scrubberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.xl,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  playButton: {
    minWidth: 160,
  },
  seekButton: {
    minWidth: 100,
  },
  narraViewButton: {
    minWidth: 200,
    backgroundColor: 'rgba(255, 200, 0, 0.2)', // subtle amber tint
    marginLeft: spacing.xl,
    borderColor: '#FFD700',
    borderWidth: 1,
  },
  narraViewButtonLabel: {
    color: '#FFD700',
    fontWeight: 'bold',
  }
});
