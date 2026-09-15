import React, { useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { ContentScene } from '../../types/content';
import { FocusableButton } from '../FocusableButton';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface NarraViewOverlayProps {
  currentScene?: ContentScene;
  onClose: () => void;
}

const mockQueries = [
  'What just happened?',
  'Explain this scene',
  'Who is here?',
];

export const NarraViewOverlay = ({ currentScene, onClose }: NarraViewOverlayProps) => {
  const [mockResponse, setMockResponse] = useState<string | null>(null);

  const handleQuerySelect = (query: string) => {
    setMockResponse('NarraView AI responses arrive in Phase 2.');
  };

  return (
    <View style={styles.overlayContainer}>
      <TVFocusGuideView style={styles.panel} autoFocus>
        <Text style={styles.brandTitle}>✦ NarraView</Text>
        
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

        {!mockResponse ? (
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
        ) : (
          <View style={styles.responseBox}>
            <Text style={styles.responseText}>{mockResponse}</Text>
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
