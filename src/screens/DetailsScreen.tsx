import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, BackHandler } from 'react-native';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { ContentItem, RuntimeProvider } from '../types/content';
import { FocusableButton } from '../components/FocusableButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { getContent } from '../services/contentApi';
import { formatRuntime } from '../utils/formatRuntime';
import { getViewerId } from '../services/viewerIdentity';
import { getProgress, resetProgress, ViewerProgressRecord } from '../services/viewerProgressApi';

interface DetailsScreenProps {
  onWatch: (freshItem?: ContentItem, initialPositionSeconds?: number) => void;
  onBack: () => void;
  item: ContentItem;
}

export const DetailsScreen = ({ item, onWatch, onBack }: DetailsScreenProps) => {
  const [contentItem, setContentItem] = useState<ContentItem>(item);
  const [viewerProgress, setViewerProgress] = useState<ViewerProgressRecord | null>(null);
  const [viewerId, setViewerId] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const cid = item.contentId || item.id;

    const loadData = async () => {
      const vid = await getViewerId();
      if (isMounted) setViewerId(vid);

      // Load watch progress for this title
      if (cid && vid) {
        const prog = await getProgress(vid, cid);
        if (isMounted && prog && !prog.notStarted) {
          setViewerProgress(prog);
        }
      }

      // Refresh content metadata
      if (cid) {
        const latest = await getContent(cid);
        if (latest && isMounted) {
          const canonicalContentId = latest.contentId || cid;
          const runtimeProvider: RuntimeProvider | undefined = canonicalContentId === 'signal-lost'
            ? 'handcrafted'
            : (latest.runtimeProvider || (latest.aiReady ? 'intelligence' : undefined));
          
          const durationSec = typeof latest.durationSeconds === 'number' ? latest.durationSeconds : item.durationSeconds;
          const genre = latest.contentType
            ? latest.contentType.charAt(0).toUpperCase() + latest.contentType.slice(1)
            : item.genre;
          const runtime = formatRuntime(durationSec) || item.runtime;

          const updated: ContentItem = {
            ...item,
            id: canonicalContentId,
            contentId: canonicalContentId,
            title: latest.title || item.title,
            description: latest.description || item.description,
            genre,
            contentType: latest.contentType || item.contentType,
            runtime,
            durationSeconds: durationSec,
            videoSource: latest.videoUrl || item.videoSource,
            posterUrl: latest.posterUrl || item.posterUrl,
            aiReady: latest.aiReady === true,
            runtimeProvider,
            mediaPlayable: latest.mediaPlayable !== false,
          };

          setContentItem(updated);
        }
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [item]);

  useEffect(() => {
    const backAction = () => {
      onBack();
      return true;
    };
    let backHandler: any = null;
    if (BackHandler && typeof BackHandler.addEventListener === 'function') {
      backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    }
    return () => backHandler?.remove?.();
  }, [onBack]);

  const hasProgress = viewerProgress && !viewerProgress.notStarted && viewerProgress.positionSeconds > 0;
  const isCompleted = viewerProgress?.isCompleted === true;

  const handlePrimaryPress = () => {
    if (hasProgress && !isCompleted) {
      // Resume from saved position
      onWatch(contentItem, viewerProgress.positionSeconds);
    } else {
      // Watch Now or Play Again from 0
      onWatch(contentItem, 0);
    }
  };

  const handleStartOverPress = async () => {
    const cid = contentItem.contentId || contentItem.id;
    if (viewerId && cid) {
      try {
        await resetProgress(viewerId, cid);
      } catch (e) {
        console.warn('[DETAILS_SCREEN] Failed to reset progress:', e);
      }
    }
    onWatch(contentItem, 0);
  };

  let primaryButtonLabel = 'Watch Now';
  if (isCompleted) {
    primaryButtonLabel = 'Play Again';
  } else if (hasProgress) {
    primaryButtonLabel = `Resume ${formatRuntime(viewerProgress.positionSeconds)}`;
  }

  const progressText = hasProgress && !isCompleted
    ? `${Math.round(viewerProgress.progressPercent)}% watched`
    : (isCompleted ? 'Completed' : undefined);

  const metadataString = [
    contentItem.genre,
    contentItem.runtime,
    contentItem.year,
    progressText
  ].filter(Boolean).join(' • ');

  return (
    <View style={styles.screen}>
      <View style={[styles.backdrop, { backgroundColor: contentItem.posterColor }]}>
        <View style={styles.gradientOverlay} />
        <View style={styles.vignetteOverlay} />
      </View>
      
      <TVFocusGuideView style={styles.content} autoFocus>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{contentItem.title}</Text>
          <Text style={styles.metadata}>
            {metadataString}
          </Text>
          <Text style={styles.description}>{contentItem.description}</Text>
        </View>

        <View style={styles.actions}>
          <FocusableButton
            label={primaryButtonLabel}
            onPress={handlePrimaryPress}
            hasTVPreferredFocus
            style={styles.primaryButton}
          />
          {hasProgress && !isCompleted && (
            <FocusableButton
              label="Start Over"
              onPress={handleStartOverPress}
              style={styles.secondaryButton}
            />
          )}
          <FocusableButton
            label="Ask NarraView"
            onPress={() => {}}
            disabled
            style={styles.secondaryButton}
          />
        </View>
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    opacity: 0.85,
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    opacity: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.heroInset,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  textContainer: {
    maxWidth: 960,
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.display.fontSize,
    fontWeight: typography.display.fontWeight,
    lineHeight: typography.display.lineHeight,
    letterSpacing: typography.display.letterSpacing,
  },
  metadata: {
    color: colors.accent,
    fontSize: typography.metadata.fontSize,
    fontWeight: '700',
    marginTop: spacing.md,
    letterSpacing: typography.metadata.letterSpacing,
    textTransform: typography.metadata.textTransform,
  },
  description: {
    color: colors.secondaryText,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    letterSpacing: typography.body.letterSpacing,
    marginTop: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.xxl,
  },
  primaryButton: {
    marginRight: spacing.md,
  },
  secondaryButton: {
    marginRight: spacing.md,
  },
});
