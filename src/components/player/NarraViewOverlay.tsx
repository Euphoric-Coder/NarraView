import React, { useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { ContentScene } from '../../types/content';
import { FocusableButton } from '../FocusableButton';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { askNarraView } from '../../services/narraViewApi';

interface NarraViewOverlayProps {
  contentId: string;
  currentTimeSeconds: number;
  currentScene?: ContentScene;
  onClose: () => void;
}

const mockQueries = [
  'What just happened?',
  'Explain this scene',
  'Who is here?',
];

export const NarraViewOverlay = ({ contentId, currentTimeSeconds, currentScene, onClose }: NarraViewOverlayProps) => {
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleQuerySelect = async (query: string) => {
    console.log('[NarraView Overlay] submitting question:', query);
    setIsLoading(true);
    setHasError(false);
    
    try {
      const result = await askNarraView({
        contentId,
        timestamp: currentTimeSeconds,
        question: query,
        scene: currentScene ? {
          startTime: currentScene.startTime,
          endTime: currentScene.endTime,
          label: currentScene.label,
        } : undefined
      });
      
      console.log('[NarraView Overlay] received response:', result);
      setResponse(result.answer);
    } catch (error) {
      console.error('[NarraView Overlay] ERROR', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryAgain = () => {
    setHasError(false);
    setResponse(null);
  };

  return (
    <View style={styles.overlayContainer}>
      <TVFocusGuideView style={styles.panel} autoFocus>
        <Text style={styles.brandTitle}>✦ NarraView</Text>
        
        {!isLoading && !hasError && !response && (
          <>
            <View style={styles.sceneInfoBox}>
              <Text style={styles.labelHeader}>CURRENT SCENE</Text>
              {currentScene ? (
                <>
                  <Text style={styles.sceneTitle}>{currentScene.label}</Text>
                </>
              ) : (
                <Text style={styles.noSceneText}>
                  Scene context is not available for this title yet.
                </Text>
              )}
            </View>

            <View style={styles.queryList}>
              {mockQueries.map((query, index) => (
                <FocusableButton
                  key={index}
                  label={query}
                  onPress={() => handleQuerySelect(query)}
                  style={styles.queryButton}
                  labelStyle={styles.queryButtonLabel}
                />
              ))}
            </View>
          </>
        )}

        {isLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Thinking about this scene...</Text>
          </View>
        )}

        {hasError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>NarraView couldn't answer right now.</Text>
            <View style={styles.errorActions}>
              <FocusableButton label="[ Try Again ]" onPress={handleTryAgain} style={styles.actionButton} />
              <FocusableButton label="[ Close ]" onPress={onClose} style={styles.actionButton} />
            </View>
          </View>
        )}

        {response && !isLoading && !hasError && (
          <View style={styles.responseBox}>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>🛡 SpoilerShield Coming soon</Text>
        </View>
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: spacing.heroInset,
  },
  panel: {
    width: 420,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: spacing.xxl,
  },
  brandTitle: {
    color: colors.primaryText,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.xl,
    letterSpacing: 1,
  },
  sceneInfoBox: {
    marginBottom: spacing.xxl,
  },
  labelHeader: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  sceneTitle: {
    color: colors.primaryText,
    fontSize: 20,
    fontWeight: '600',
  },
  noSceneText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontStyle: 'italic',
  },
  queryList: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  queryButton: {
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  queryButtonLabel: {
    fontSize: 16,
    textAlign: 'left',
  },
  responseBox: {
    marginBottom: spacing.xxl,
    padding: spacing.lg,
    backgroundColor: 'rgba(255, 200, 0, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.3)',
  },
  responseText: {
    color: '#FFD700', // Amber/gold accent
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginTop: spacing.lg,
  },
  errorBox: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.primaryText,
    fontSize: 18,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
  }
});
