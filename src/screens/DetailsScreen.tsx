import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, BackHandler, ActivityIndicator, ScrollView } from "react-native";
import { TVFocusGuideView } from "@amazon-devices/react-native-kepler";
import { ContentItem, RuntimeProvider } from "../types/content";
import { FocusableButton } from "../components/FocusableButton";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing } from "../theme/spacing";
import { getContent } from "../services/contentApi";
import { formatRuntime } from "../utils/formatRuntime";
import { getViewerId } from "../services/viewerIdentity";
import { getProgress, resetProgress, ViewerProgressRecord } from "../services/viewerProgressApi";
import { askNarraView, AskNarraViewResponse } from "../services/narraViewApi";

interface DetailsScreenProps {
  onWatch: (freshItem?: ContentItem, initialPositionSeconds?: number) => void;
  onBack: () => void;
  item: ContentItem;
}

export const DetailsScreen = ({ item, onWatch, onBack }: DetailsScreenProps) => {
  const [contentItem, setContentItem] = useState<ContentItem>(item);
  const [viewerProgress, setViewerProgress] = useState<ViewerProgressRecord | null>(null);
  const [viewerId, setViewerId] = useState<string>("");

  // Pre-resume Previously On state
  const [isRecapModalVisible, setIsRecapModalVisible] = useState<boolean>(false);
  const [isRecapLoading, setIsRecapLoading] = useState<boolean>(false);
  const [recapData, setRecapData] = useState<AskNarraViewResponse | null>(null);
  const [recapError, setRecapError] = useState<string | null>(null);

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
          const runtimeProvider: RuntimeProvider | undefined = canonicalContentId === "signal-lost"
            ? "handcrafted"
            : (latest.runtimeProvider || (latest.aiReady ? "intelligence" : undefined));
          
          const durationSec = typeof latest.durationSeconds === "number" ? latest.durationSeconds : item.durationSeconds;
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
            contentCategory: latest.contentCategory || item.contentCategory || "other",
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
      if (isRecapModalVisible) {
        setIsRecapModalVisible(false);
        return true;
      }
      onBack();
      return true;
    };
    let backHandler: any = null;
    if (BackHandler && typeof BackHandler.addEventListener === "function") {
      backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    }
    return () => backHandler?.remove?.();
  }, [onBack, isRecapModalVisible]);

  const hasProgress = viewerProgress && !viewerProgress.notStarted && viewerProgress.positionSeconds > 0;
  const isCompleted = viewerProgress?.isCompleted === true;
  const shouldOfferRecap = Boolean(viewerProgress?.shouldOfferRecap);

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
        console.warn("[DETAILS_SCREEN] Failed to reset progress:", e);
      }
    }
    onWatch(contentItem, 0);
  };

  const handlePreviouslyOnPress = async () => {
    const cid = contentItem.contentId || contentItem.id;
    const resumePos = viewerProgress?.positionSeconds || 0;
    setIsRecapModalVisible(true);
    setIsRecapLoading(true);
    setRecapError(null);

    console.log("[DETAILS_PREVIOUSLY_ON_REQUEST]", {
      viewerId,
      contentId: cid,
      resumePositionSeconds: resumePos,
      timeAwaySeconds: viewerProgress?.timeAwaySeconds,
      returnType: viewerProgress?.returnType
    });

    try {
      const res = await askNarraView({
        contentId: cid,
        timestamp: resumePos,
        viewerTimestamp: resumePos,
        mode: "previously_on",
        viewerId,
        watchedIntervals: viewerProgress?.watchedIntervals,
        resumeContext: {
          resumePositionSeconds: resumePos,
          watchedIntervals: viewerProgress?.watchedIntervals,
          lastWatchedAt: viewerProgress?.lastWatchedAt,
          timeAwaySeconds: viewerProgress?.timeAwaySeconds,
          returnType: viewerProgress?.returnType
        }
      });
      setRecapData(res);
    } catch (err: any) {
      console.error("[DETAILS_PREVIOUSLY_ON_ERROR]", err);
      setRecapError("Unable to load Previously On at this time.");
    } finally {
      setIsRecapLoading(false);
    }
  };

  let primaryButtonLabel = "Watch Now";
  if (isCompleted) {
    primaryButtonLabel = "Play Again";
  } else if (hasProgress) {
    primaryButtonLabel = `Resume ${formatRuntime(viewerProgress.positionSeconds)}`;
  }

  const progressText = hasProgress && !isCompleted
    ? `${Math.round(viewerProgress.progressPercent)}% watched`
    : (isCompleted ? "Completed" : undefined);

  const returnBadgeText = shouldOfferRecap && viewerProgress?.returnType === "LONG_RETURN"
    ? "Welcome Back"
    : undefined;

  const categoryLabelMap: Record<string, string> = {
    documentary: "Documentary",
    tutorial: "Tutorial",
    demo: "Demo",
    narrative: "Story",
    educational: "Educational",
    other: "Feature"
  };
  const categoryDisplay = contentItem.contentCategory && categoryLabelMap[contentItem.contentCategory]
    ? categoryLabelMap[contentItem.contentCategory]
    : contentItem.genre;

  const metadataString = [
    categoryDisplay,
    contentItem.runtime,
    contentItem.year,
    progressText,
    returnBadgeText
  ].filter(Boolean).join(" • ");

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

          {/* NarraView Value Preview */}
          <View style={styles.valuePreviewCard}>
            <Text style={styles.valuePreviewTitle}>✨ NarraView Intelligence</Text>
            <View style={styles.valuePreviewRow}>
              <Text style={styles.valuePreviewItem}>• Ask about what you've seen</Text>
              <Text style={styles.valuePreviewItem}>• Spoiler-safe answers</Text>
              <Text style={styles.valuePreviewItem}>• Personalized recap</Text>
              <Text style={styles.valuePreviewItem}>• Adaptive explanations</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <FocusableButton
            label={primaryButtonLabel}
            onPress={handlePrimaryPress}
            hasTVPreferredFocus={!isRecapModalVisible}
            style={styles.primaryButton}
          />
          {hasProgress && !isCompleted && (
            <FocusableButton
              label="Previously On"
              onPress={handlePreviouslyOnPress}
              style={[
                styles.secondaryButton,
                shouldOfferRecap && styles.recapSuggestedButton
              ]}
            />
          )}
          {hasProgress && !isCompleted && (
            <FocusableButton
              label="Start Over"
              onPress={handleStartOverPress}
              style={styles.secondaryButton}
            />
          )}
        </View>
      </TVFocusGuideView>

      {/* Pre-resume Previously On Modal */}
      {isRecapModalVisible && (
        <View style={styles.modalBackdrop}>
          <TVFocusGuideView style={styles.modalCard} autoFocus trapFocus={true}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Text style={styles.modalEyebrow}>PREVIOUSLY ON</Text>
                <Text style={styles.modalTitle}>{contentItem.title}</Text>
                <Text style={styles.modalSubtitle}>Here's what matters before you continue.</Text>
              </View>
              {viewerProgress?.positionSeconds ? (
                <View style={styles.positionBadge}>
                  <Text style={styles.positionBadgeText}>
                    Resuming at {formatRuntime(viewerProgress.positionSeconds)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalBody}>
              {isRecapLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.loadingText}>Generating your personalized refresher...</Text>
                  <Text style={styles.loadingSubtext}>Restoring context from your watched scenes</Text>
                </View>
              ) : recapError ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{recapError}</Text>
                </View>
              ) : recapData ? (
                <ScrollView style={styles.recapScrollView} contentContainerStyle={styles.recapScrollContent}>
                  {recapData.summary ? (
                    <Text style={styles.recapSummary}>{recapData.summary}</Text>
                  ) : null}

                  {recapData.bullets && recapData.bullets.length > 0 ? (
                    <View style={styles.bulletsList}>
                      {recapData.bullets.map((bullet, idx) => (
                        <View key={idx} style={styles.bulletRow}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.bulletText}>{bullet}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {recapData.keyConcepts && recapData.keyConcepts.length > 0 ? (
                    <View style={styles.chipsSection}>
                      <Text style={styles.chipsSectionLabel}>KEY CONCEPTS:</Text>
                      <View style={styles.chipsRow}>
                        {recapData.keyConcepts.map((concept, idx) => (
                          <View key={idx} style={styles.chip}>
                            <Text style={styles.chipText}>{concept}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}
            </View>

            <View style={styles.modalActions}>
              <FocusableButton
                label={`Resume ${formatRuntime(viewerProgress?.positionSeconds || 0)}`}
                onPress={() => {
                  setIsRecapModalVisible(false);
                  onWatch(contentItem, viewerProgress?.positionSeconds || 0);
                }}
                hasTVPreferredFocus
                style={styles.modalPrimaryBtn}
              />
              <FocusableButton
                label="Back"
                onPress={() => setIsRecapModalVisible(false)}
                style={styles.modalSecondaryBtn}
              />
            </View>
          </TVFocusGuideView>
        </View>
      )}
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
    backgroundColor: "#000000",
    opacity: 0.3,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.heroInset,
    justifyContent: "center",
    paddingVertical: 36,
  },
  textContainer: {
    maxWidth: 920,
  },
  title: {
    color: colors.primaryText,
    fontSize: 48,
    fontWeight: "700",
    lineHeight: 56,
    letterSpacing: -0.5,
  },
  metadata: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  description: {
    color: colors.secondaryText,
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: 0.3,
    marginTop: 14,
    maxWidth: 860,
  },
  valuePreviewCard: {
    marginTop: 18,
    backgroundColor: "rgba(245, 184, 0, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(245, 184, 0, 0.2)",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: 860,
    alignSelf: "flex-start",
  },
  valuePreviewTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  valuePreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  valuePreviewItem: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    marginTop: 28,
  },
  primaryButton: {
    marginRight: spacing.md,
  },
  secondaryButton: {
    marginRight: spacing.md,
  },
  recapSuggestedButton: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },

  // Pre-resume Modal Styles
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  modalCard: {
    width: "75%",
    maxWidth: 920,
    height: "82%",
    backgroundColor: "rgba(14, 16, 22, 0.98)",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255, 176, 0, 0.4)",
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 24,
    display: "flex",
    flexDirection: "column",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  modalHeaderLeft: {
    flex: 1,
    marginRight: 16,
  },
  modalEyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  modalTitle: {
    color: colors.primaryText,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 14,
    marginTop: 4,
  },
  positionBadge: {
    backgroundColor: "rgba(255, 176, 0, 0.15)",
    borderColor: "rgba(255, 176, 0, 0.4)",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  positionBadgeText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  loadingText: {
    color: colors.primaryText,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  loadingSubtext: {
    color: colors.mutedText,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  errorText: {
    color: colors.secondaryText,
    fontSize: 16,
    textAlign: "center",
  },
  recapScrollView: {
    flex: 1,
  },
  recapScrollContent: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  recapSummary: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  bulletsList: {
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  bulletDot: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 10,
    lineHeight: 22,
  },
  bulletText: {
    color: colors.primaryText,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  chipsSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    marginBottom: 8,
  },
  chipsSectionLabel: {
    color: colors.mutedText,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  chipText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontWeight: "500",
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingTop: 18,
  },
  modalPrimaryBtn: {
    marginRight: spacing.md,
    minWidth: 200,
  },
  modalSecondaryBtn: {
    minWidth: 120,
  },
});
