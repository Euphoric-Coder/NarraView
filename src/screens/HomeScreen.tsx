import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View, Text, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { ContentItem, ContentCategory, RuntimeProvider, ContentCategoryType } from '../types/content';
import { ContentRow } from '../components/ContentRow';
import { HeroBanner } from '../components/HeroBanner';
import { AccessibilitySettingsModal } from '../components/AccessibilitySettingsModal';
import { colors } from '../theme/colors';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { listContentWithRetry } from '../services/contentApi';
import { formatRuntime } from '../utils/formatRuntime';
import { getViewerId } from '../services/viewerIdentity';
import { logRealVegaConfig } from '../config/env';
import { getContinueWatching, getContinueWatchingWithRetry } from '../services/viewerProgressApi';


export const CLOUD_CATEGORY_SECTIONS: Array<{ category: ContentCategoryType; id: string; title: string }> = [
  { category: "documentary", id: "cloud-documentaries", title: "Documentaries" },
  { category: "tutorial", id: "cloud-tutorials", title: "Tutorials" },
  { category: "demo", id: "cloud-demos", title: "Demos" },
  { category: "narrative", id: "cloud-stories", title: "Stories" },
  { category: "educational", id: "cloud-educational", title: "Educational" },
  { category: "other", id: "cloud-other", title: "More to Explore" },
];

export function groupCloudContentByCategory(items: ContentItem[]): ContentCategory[] {
  const categories: ContentCategory[] = [];
  const visibleItems = items.filter(item => item.catalogVisible !== false);

  for (const section of CLOUD_CATEGORY_SECTIONS) {
    const matchingItems = visibleItems.filter(
      item => (item.contentCategory || "other") === section.category
    );
    if (matchingItems.length > 0) {
      categories.push({
        id: section.id,
        title: section.title,
        items: matchingItems,
      });
    }
  }
  return categories;
}

export function assembleHomeCategories(
  continueWatchingItems: ContentItem[] = [],
  cloudItems: ContentItem[] = []
): ContentCategory[] {
  const finalCategories: ContentCategory[] = [];

  // Continue Watching stays on top and independent of category
  if (continueWatchingItems && continueWatchingItems.length > 0) {
    finalCategories.push({
      id: 'continue-watching',
      title: 'Continue Watching',
      items: continueWatchingItems,
    });
  }

  // NarraView Cloud content grouped by category into non-empty rows
  if (cloudItems && cloudItems.length > 0) {
    const cloudCategoryRows = groupCloudContentByCategory(cloudItems);
    finalCategories.push(...cloudCategoryRows);
  }

  return finalCategories;
}


interface HomeScreenProps {
  onSelectItem: (item: ContentItem) => void;
  refreshTrigger?: number;
}

function mapContinueWatchingToContentItem(cw: any): ContentItem {
  const canonicalId = cw.contentId || cw.id;
  const durationSec = typeof cw.durationSeconds === 'number' ? cw.durationSeconds : undefined;
  const progressPct = typeof cw.progressPercent === 'number' ? cw.progressPercent : 0;

  return {
    id: canonicalId,
    contentId: canonicalId,
    title: cw.title,
    description: cw.description || '',
    genre: cw.genre || 'Feature',
    contentType: cw.contentType,
    runtime: cw.runtime || formatRuntime(durationSec),
    durationSeconds: durationSec,
    positionSeconds: cw.positionSeconds,
    progressPercent: progressPct,
    progress: progressPct > 0 ? progressPct / 100 : undefined,
    lastWatchedAt: cw.lastWatchedAt,
    year: new Date().getFullYear(),
    posterColor: '#1A2A3A',
    posterUrl: cw.posterUrl,
    videoSource: cw.videoSource,
    aiReady: cw.aiReady === true,
    runtimeProvider: cw.runtimeProvider,
    mediaPlayable: cw.mediaPlayable !== false,
    catalogVisible: cw.catalogVisible !== false,
  };
}

function mapCloudItemToContentItem(item: any): ContentItem {
  const canonicalContentId = item.contentId || item.id;
  const runtimeProvider: RuntimeProvider | undefined = canonicalContentId === 'signal-lost'
    ? 'handcrafted'
    : (item.runtimeProvider || (item.aiReady ? 'intelligence' : undefined));
  
  const durationSec = typeof item.durationSeconds === 'number' ? item.durationSeconds : undefined;
  const genre = item.contentType
    ? item.contentType.charAt(0).toUpperCase() + item.contentType.slice(1)
    : 'Tutorial';
  const runtime = formatRuntime(durationSec);

  return {
    id: canonicalContentId,
    contentId: canonicalContentId,
    title: item.title,
    description: item.description || '',
    genre,
    contentType: item.contentType,
    contentCategory: item.contentCategory || "other",
    runtime,
    durationSeconds: durationSec,
    year: item.createdAt ? new Date(item.createdAt).getFullYear() : new Date().getFullYear(),
    posterColor: '#1a1a24',
    posterUrl: item.posterUrl,
    videoSource: item.videoUrl,
    aiReady: item.aiReady === true,
    runtimeProvider,
    mediaPlayable: item.mediaPlayable !== false,
    catalogVisible: item.catalogVisible !== false,
  };
}

export const HomeScreen = ({ onSelectItem, refreshTrigger }: HomeScreenProps) => {
  const [categories, setCategories] = useState<ContentCategory[]>([]);
  const [isColdBooting, setIsColdBooting] = useState<boolean>(true);
  const [showAccessibility, setShowAccessibility] = useState<boolean>(false);
  const [viewerId, setViewerId] = useState<string>('narraview-demo-viewer');
  
  const continueWatchingItemsRef = useRef<ContentItem[]>([]);
  const cloudItemsRef = useRef<ContentItem[]>([]);
  const isRefreshingRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(typeof AppState?.currentState === 'string' ? AppState.currentState : 'active');

  const loadContent = useCallback(async (isInitialBoot = false) => {
    if (isRefreshingRef.current) {
      console.log('[HOME_LOAD] Refresh already in-flight, skipping duplicate call');
      return;
    }
    isRefreshingRef.current = true;

    try {
      if (isInitialBoot) {
        console.log('[HOME_BOOT_START]');
        logRealVegaConfig();
        console.log('[APP_BOOT] Starting deterministic cold boot flow');
      }

      // Step 1: Guarantee stable viewer identity is ready before querying viewer data (Req 2)
      const viewerId = await getViewerId();
      setViewerId(viewerId);
      console.log('[HOME_VIEWER_READY]', { viewerId });
      console.log('[VIEWER_ID_READY]', { viewerId });

      // Step 2: Parallel fetch using Promise.allSettled (Req 5, 14)
      console.log('[CONTINUE_FETCH_START]', { viewerId, attempt: 1 });
      const [cloudSettled, continueSettled] = await Promise.allSettled([
        listContentWithRetry(3, [500, 1500, 3000]),
        getContinueWatching(viewerId)
      ]);

      // Process Cloud Catalog (Req 6)
      if (cloudSettled.status === 'fulfilled' && Array.isArray(cloudSettled.value) && cloudSettled.value.length > 0) {
        const publicItems = cloudSettled.value.filter((item: any) => item.catalogVisible !== false);
        cloudItemsRef.current = publicItems.map(mapCloudItemToContentItem);
      } else if (cloudSettled.status === 'rejected') {
        console.warn('[CLOUD_FETCH_FAILED]', { error: cloudSettled.reason });
      }

      // Process Continue Watching (Req 11, 12: do not erase local state on fetch failure)
      if (continueSettled.status === 'fulfilled') {
        const cwData = continueSettled.value;
        console.log('[CONTINUE_FETCH_SUCCESS]', {
          viewerId,
          attempt: 1,
          httpStatus: 200,
          itemCount: cwData.length
        });
        continueWatchingItemsRef.current = cwData.map(mapContinueWatchingToContentItem);
        console.log('[HOME_CONTINUE_STATE_COMMITTED]', { count: continueWatchingItemsRef.current.length });
      } else {
        console.warn('[HOME_CONTINUE_ERROR]', {
          message: continueSettled.reason?.message || String(continueSettled.reason),
          status: 0
        });
        console.warn('[CONTINUE_FETCH_FAILED]', {
          viewerId,
          attempt: 1,
          error: continueSettled.reason
        });
        // Preserves previous continueWatchingItemsRef.current
      }

      // Step 3: Assemble categories
      const finalCategories = assembleHomeCategories(
        continueWatchingItemsRef.current,
        cloudItemsRef.current
      );
      setCategories(finalCategories);

      console.log('[HOME_STATE_READY]', {
        viewerId,
        continueWatchingCount: continueWatchingItemsRef.current.length,
        cloudCount: cloudItemsRef.current.length
      });
    } catch (e) {
      console.error('[HOME_SCREEN_LOAD_ERROR]', e);
    } finally {
      setIsColdBooting(false);
      isRefreshingRef.current = false;
    }
  }, []);

  // Initial boot load (Req 9)
  useEffect(() => {
    loadContent(true);
  }, [loadContent]);

  // AppState refresh: background/inactive -> active (Req 7)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('[APP_STATE]', {
        previous: appStateRef.current,
        next: nextAppState
      });
      const prev = typeof appStateRef.current === 'string' ? appStateRef.current : 'active';
      if ((prev === 'inactive' || prev === 'background') && nextAppState === 'active') {
        console.log('[APP_STATE] Transition to active: refreshing data');
        loadContent(false);
      }
      appStateRef.current = nextAppState;
    };

    let sub: any = null;
    if (AppState && typeof AppState.addEventListener === 'function') {
      sub = AppState.addEventListener('change', handleAppStateChange);
    }
    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    };
  }, [loadContent]);

  // Screen focus / return-to-home refresh (Req 8, 23)
  useEffect(() => {
    if (refreshTrigger) {
      console.log('[HOME_FOCUS_REFRESH] Triggering return-to-home refresh at:', refreshTrigger);
      loadContent(false);
    }
  }, [refreshTrigger, loadContent]);

  const handleSelectItem = (item: ContentItem) => {
    console.log('[HOME_SELECT_ITEM]', {
      contentId: item.contentId,
      title: item.title,
      aiReady: item.aiReady,
      runtimeProvider: item.runtimeProvider,
      mediaPlayable: item.mediaPlayable,
      positionSeconds: item.positionSeconds
    });
    onSelectItem(item);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
      >
        <HeroBanner onExplore={() => {}} onAccessibility={() => setShowAccessibility(true)} />

        {isColdBooting && cloudItemsRef.current.length === 0 && (
          <View style={styles.loadingCloudRow}>
            <Text style={styles.loadingCloudTitle}>NarraView Cloud</Text>
            <View style={styles.loadingCloudContent}>
              <ActivityIndicator size="small" color="#F5B800" />
              <Text style={styles.loadingCloudText}>Loading NarraView...</Text>
            </View>
          </View>
        )}

        <TVFocusGuideView style={styles.rowsContainer} autoFocus>
          {categories.map((category) => (
            <ContentRow
              key={category.id}
              category={category}
              onItemPress={handleSelectItem}
              onSelectItem={handleSelectItem}
            />
          ))}
        </TVFocusGuideView>
      </ScrollView>
      <AccessibilitySettingsModal
        visible={showAccessibility}
        onClose={() => setShowAccessibility(false)}
        viewerId={viewerId}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  rowsContainer: {
    paddingBottom: 40,
  },
  loadingCloudRow: {
    paddingHorizontal: 48,
    marginVertical: 16,
  },
  loadingCloudTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  loadingCloudContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 0, 0.2)',
  },
  loadingCloudText: {
    color: '#F5B800',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
});
