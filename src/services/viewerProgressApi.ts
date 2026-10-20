import { AsyncStorage } from '@amazon-devices/react-native-kepler';
import { API_BASE_URL } from '../config/api';
import { WatchedInterval } from '../types/content';

export interface ViewerProgressRecord {
  viewerId: string;
  contentId: string;
  positionSeconds: number;
  durationSeconds: number;
  returnType?: string;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
  progressPercent: number;
  watchedIntervals: WatchedInterval[];
  lastWatchedAt: string;
  startedAt: string;
  completedAt?: string;
  isCompleted: boolean;
  lastSessionId?: string;
  updatedAt: string;
  version: number;
  notStarted?: boolean;
  returnType?: string;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
  returnContext?: any;
}

export interface ProgressUpdatePayload {
  sessionId?: string;
  positionSeconds: number;
  durationSeconds?: number;
  watchedInterval?: WatchedInterval;
  watchedIntervals?: WatchedInterval[];
  isEnded?: boolean;
}

export interface PlaybackSessionResponse {
  sessionId: string;
  contentId: string;
  resumePositionSeconds: number;
  previousProgress?: ViewerProgressRecord;
  isCompleted: boolean;
  createdAt: string;
  returnType?: string;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
  returnContext?: any;
}

export interface ContinueWatchingItem {
  id: string;
  contentId: string;
  title: string;
  description?: string;
  posterUrl?: string | null;
  runtime?: string;
  genre?: string;
  contentType?: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  lastWatchedAt: string;
  isCompleted: boolean;
  mediaPlayable?: boolean;
  catalogVisible?: boolean;
  aiReady?: boolean;
  runtimeProvider?: string;
  videoSource?: string | null;
}

const LOCAL_PROGRESS_PREFIX = '@narraview_progress_';
const LOCAL_CONTINUE_WATCHING_PREFIX = '@narraview_cw_';

const inMemoryProgressStore = new Map<string, string>();

function getLocalProgressKey(viewerId: string, contentId: string): string {
  return `${LOCAL_PROGRESS_PREFIX}${viewerId}_${contentId}`;
}

function getLocalContinueWatchingKey(viewerId: string): string {
  return `${LOCAL_CONTINUE_WATCHING_PREFIX}${viewerId}`;
}

async function saveLocalProgress(viewerId: string, contentId: string, progress: ViewerProgressRecord): Promise<void> {
  const key = getLocalProgressKey(viewerId, contentId);
  const data = JSON.stringify(progress);
  inMemoryProgressStore.set(key, data);
  try {
    if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
      await AsyncStorage.setItem(key, data);
    }
  } catch (e) {
    console.warn('[VIEWER_PROGRESS_API] Error writing local progress:', e);
  }
}

async function getLocalProgress(viewerId: string, contentId: string): Promise<ViewerProgressRecord | null> {
  const key = getLocalProgressKey(viewerId, contentId);
  try {
    if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
      const data = await AsyncStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    }
  } catch (e) {
    console.warn('[VIEWER_PROGRESS_API] Error reading local progress:', e);
  }

  const mem = inMemoryProgressStore.get(key);
  if (mem) {
    try {
      return JSON.parse(mem);
    } catch (e) {
      console.warn('[VIEWER_PROGRESS_API] Error parsing in-memory progress:', e);
    }
  }
  return null;
}

export async function saveLocalContinueWatching(viewerId: string, items: ContinueWatchingItem[]): Promise<void> {
  const key = getLocalContinueWatchingKey(viewerId);
  const data = JSON.stringify(items);
  inMemoryProgressStore.set(key, data);
  try {
    if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
      await AsyncStorage.setItem(key, data);
    }
  } catch (e) {
    console.warn('[VIEWER_PROGRESS_API] Error writing local continue watching cache:', e);
  }
}

export async function getLocalContinueWatching(viewerId: string): Promise<ContinueWatchingItem[]> {
  const key = getLocalContinueWatchingKey(viewerId);
  try {
    if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
      const data = await AsyncStorage.getItem(key);
      if (data) {
        return JSON.parse(data);
      }
    }
  } catch (e) {
    console.warn('[VIEWER_PROGRESS_API] Error reading local continue watching cache:', e);
  }

  const mem = inMemoryProgressStore.get(key);
  if (mem) {
    try {
      return JSON.parse(mem);
    } catch (e) {
      console.warn('[VIEWER_PROGRESS_API] Error parsing in-memory continue watching:', e);
    }
  }
  return [];
}

async function updateLocalContinueWatchingCache(viewerId: string, progress: ViewerProgressRecord): Promise<void> {
  const localList = await getLocalContinueWatching(viewerId);
  if (progress.isCompleted) {
    const filtered = localList.filter(item => item.contentId !== progress.contentId);
    await saveLocalContinueWatching(viewerId, filtered);
    return;
  }

  if (progress.positionSeconds <= 0) {
    const filtered = localList.filter(item => item.contentId !== progress.contentId);
    await saveLocalContinueWatching(viewerId, filtered);
    return;
  }

  const existingIdx = localList.findIndex(item => item.contentId === progress.contentId);
  if (existingIdx >= 0) {
    localList[existingIdx] = {
      ...localList[existingIdx],
      positionSeconds: progress.positionSeconds,
      progressPercent: progress.progressPercent,
      lastWatchedAt: progress.lastWatchedAt,
      isCompleted: progress.isCompleted
    };
  } else {
    localList.unshift({
      id: progress.contentId,
      contentId: progress.contentId,
      title: progress.contentId,
      positionSeconds: progress.positionSeconds,
      durationSeconds: progress.durationSeconds,
      progressPercent: progress.progressPercent,
      lastWatchedAt: progress.lastWatchedAt,
      isCompleted: progress.isCompleted
    });
  }

  await saveLocalContinueWatching(viewerId, localList);
}

/**
 * Starts or initializes a viewing session for a title.
 */
export async function startPlaybackSession(
  viewerId: string,
  contentId: string,
  positionSeconds: number = 0
): Promise<PlaybackSessionResponse> {
  const endpoint = `${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/sessions`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId, positionSeconds })
    });

    if (res.ok) {
      const data: PlaybackSessionResponse = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('[VIEWER_PROGRESS_API] Failed to start playback session over network:', err);
  }

  // Offline fallback
  const local = await getLocalProgress(viewerId, contentId);
  const fallbackSessionId = 'sess_local_' + Date.now();
  return {
    sessionId: fallbackSessionId,
    contentId,
    resumePositionSeconds: local && !local.isCompleted ? local.positionSeconds : 0,
    previousProgress: local || undefined,
    isCompleted: local?.isCompleted || false,
    createdAt: new Date().toISOString()
  };
}

/**
 * Persists playback progress for a title.
 */
export async function updateProgress(
  viewerId: string,
  contentId: string,
  payload: ProgressUpdatePayload
): Promise<ViewerProgressRecord> {
  const now = new Date().toISOString();
  const endpoint = `${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/progress/${encodeURIComponent(contentId)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        clientUpdatedAt: now
      })
    });

    if (res.ok) {
      const remoteData: ViewerProgressRecord = await res.json();
      await saveLocalProgress(viewerId, contentId, remoteData);
      await updateLocalContinueWatchingCache(viewerId, remoteData);
      return remoteData;
    }
  } catch (err) {
    console.warn('[VIEWER_PROGRESS_API] Network write failed, buffering progress locally:', err);
  }

  // Network failed: update local buffer
  const local = await getLocalProgress(viewerId, contentId);
  const duration = payload.durationSeconds || local?.durationSeconds || 0;
  const position = Math.max(0, payload.positionSeconds);
  const isEnded = payload.isEnded === true;
  const isCompleted = isEnded || (duration > 0 && ((position / duration) >= 0.9 || (duration > 30 && duration - position <= 30)));
  const progressPercent = duration > 0 ? Math.round(Math.min(100, (position / duration) * 100) * 10) / 10 : 0;

  const bufferedItem: ViewerProgressRecord = {
    viewerId,
    contentId,
    positionSeconds: isEnded && duration > 0 ? duration : position,
    durationSeconds: duration,
    progressPercent: isEnded ? 100 : progressPercent,
    watchedIntervals: local?.watchedIntervals || [],
    lastWatchedAt: now,
    startedAt: local?.startedAt || now,
    completedAt: isCompleted ? (local?.completedAt || now) : undefined,
    isCompleted,
    lastSessionId: payload.sessionId || local?.lastSessionId,
    updatedAt: now,
    version: (local?.version || 0) + 1
  };

  await saveLocalProgress(viewerId, contentId, bufferedItem);
  await updateLocalContinueWatchingCache(viewerId, bufferedItem);
  return bufferedItem;
}

/**
 * Fetches watch state for a specific content title.
 * Reconciles local and remote progress using newest updatedAt.
 */
export async function getProgress(
  viewerId: string,
  contentId: string
): Promise<ViewerProgressRecord> {
  const local = await getLocalProgress(viewerId, contentId);
  const endpoint = `${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/progress/${encodeURIComponent(contentId)}`;

  try {
    const res = await fetch(endpoint);
    if (res.ok) {
      const remote: ViewerProgressRecord = await res.json();
      if (!remote.notStarted) {
        // Conflict resolution: compare updatedAt
        if (local && local.updatedAt && remote.updatedAt) {
          if (new Date(local.updatedAt) > new Date(remote.updatedAt)) {
            updateProgress(viewerId, contentId, {
              sessionId: local.lastSessionId,
              positionSeconds: local.positionSeconds,
              durationSeconds: local.durationSeconds,
              watchedIntervals: local.watchedIntervals,
              isEnded: local.isCompleted
            }).catch(() => {});
            return local;
          }
        }
        await saveLocalProgress(viewerId, contentId, remote);
        await updateLocalContinueWatchingCache(viewerId, remote);
        return remote;
      }
    }
  } catch (err) {
    console.warn('[VIEWER_PROGRESS_API] Failed to fetch remote progress, falling back to local:', err);
  }

  if (local) {
    return local;
  }

  return {
    viewerId,
    contentId,
    positionSeconds: 0,
    durationSeconds: 0,
    progressPercent: 0,
    watchedIntervals: [],
    lastWatchedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    isCompleted: false,
    updatedAt: new Date().toISOString(),
    version: 0,
    notStarted: true
  };
}

/**
 * Fetches active Continue Watching titles for the viewer with bounded network retry.
 * Handles virtual device boot network delays by retrying up to maxRetries times with backoff delays.
 */
export async function getContinueWatchingWithRetry(
  viewerId: string,
  maxRetries: number = 3,
  delays: number[] = [750, 1500, 3000]
): Promise<ContinueWatchingItem[]> {
  const localCached = await getLocalContinueWatching(viewerId);
  const endpoint = `${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/continue-watching`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log('[HOME_CONTINUE_REQUEST]', {
      url: endpoint,
      viewerId,
      attempt
    });

    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const remoteData: ContinueWatchingItem[] = await res.json();
        if (Array.isArray(remoteData)) {
          console.log('[HOME_CONTINUE_RESPONSE]', {
            status: res.status,
            count: remoteData.length,
            attempt
          });

          // Reconciliation: newer updatedAt / lastWatchedAt wins
          const map = new Map<string, ContinueWatchingItem>();
          for (const item of remoteData) {
            map.set(item.contentId, item);
          }

          for (const localItem of localCached) {
            const remote = map.get(localItem.contentId);
            if (remote) {
              const localTime = new Date(localItem.lastWatchedAt || 0).getTime();
              const remoteTime = new Date(remote.lastWatchedAt || 0).getTime();
              if (localTime > remoteTime) {
                map.set(localItem.contentId, {
                  ...remote,
                  positionSeconds: localItem.positionSeconds,
                  progressPercent: localItem.progressPercent,
                  lastWatchedAt: localItem.lastWatchedAt
                });
              }
            } else if (!localItem.isCompleted && localItem.positionSeconds > 0) {
              map.set(localItem.contentId, localItem);
            }
          }

          const reconciled = Array.from(map.values());
          await saveLocalContinueWatching(viewerId, reconciled);
          return reconciled;
        }
      } else {
        console.warn('[HOME_CONTINUE_ERROR]', {
          message: `HTTP ${res.status}`,
          status: res.status,
          attempt
        });
      }
    } catch (err: any) {
      console.warn('[HOME_CONTINUE_ERROR]', {
        message: err?.message || String(err),
        status: 0,
        attempt
      });
    }

    if (attempt < maxRetries) {
      const delay = delays[attempt - 1] || 1000;
      console.log(`[HOME_CONTINUE_RETRY] Retrying continue-watching in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Network retries exhausted: Fall back to local storage if available, NEVER erase valid progress
  if (localCached.length > 0) {
    console.log('[VIEWER_PROGRESS_API] All network retries failed, using locally cached fallback:', localCached.length, 'items');
    return localCached;
  }

  return [];
}

/**
 * Fetches active Continue Watching titles for the viewer.
 * Reconciles local and remote progress. If remote fetch fails, returns valid locally cached progress.
 */
export async function getContinueWatching(viewerId: string): Promise<ContinueWatchingItem[]> {
  return getContinueWatchingWithRetry(viewerId);
}

/**
 * Fetches watch history for the viewer.
 */
export async function getWatchHistory(viewerId: string): Promise<any[]> {
  const endpoint = `${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/history`;
  try {
    const res = await fetch(endpoint);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.warn('[VIEWER_PROGRESS_API] Failed to fetch watch history:', err);
  }
  return [];
}

/**
 * Resets progress for a title (e.g. Start Over).
 */
export async function resetProgress(viewerId: string, contentId: string): Promise<ViewerProgressRecord> {
  const endpoint = `${API_BASE_URL}/viewer/${encodeURIComponent(viewerId)}/progress/${encodeURIComponent(contentId)}/reset`;
  try {
    const res = await fetch(endpoint, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      await saveLocalProgress(viewerId, contentId, data);
      await updateLocalContinueWatchingCache(viewerId, data);
      return data;
    }
  } catch (err) {
    console.warn('[VIEWER_PROGRESS_API] Failed to reset progress over network:', err);
  }

  const local = await getLocalProgress(viewerId, contentId);
  const now = new Date().toISOString();
  const resetLocal: ViewerProgressRecord = {
    viewerId,
    contentId,
    positionSeconds: 0,
    durationSeconds: local?.durationSeconds || 0,
    progressPercent: 0,
    watchedIntervals: local?.watchedIntervals || [],
    lastWatchedAt: now,
    startedAt: local?.startedAt || now,
    isCompleted: false,
    updatedAt: now,
    version: (local?.version || 0) + 1
  };
  await saveLocalProgress(viewerId, contentId, resetLocal);
  await updateLocalContinueWatchingCache(viewerId, resetLocal);
  return resetLocal;
}

export function clearLocalProgressMemory(): void {
  inMemoryProgressStore.clear();
}
