import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { updateProgress, WatchedInterval } from '../services/viewerProgressApi';

interface UsePlaybackProgressProps {
  viewerId: string;
  contentId: string;
  durationSeconds: number;
  currentTimeSeconds: number;
  isPlaying: boolean;
  sessionId?: string;
}

const THROTTLE_CADENCE_MS = 12000; // 12s write cadence (between 10-15s)

export function usePlaybackProgress({
  viewerId,
  contentId,
  durationSeconds,
  currentTimeSeconds,
  isPlaying,
  sessionId
}: UsePlaybackProgressProps) {
  const lastFlushedTimeRef = useRef<number>(0);
  const intervalStartRef = useRef<number>(currentTimeSeconds);
  const lastWriteTimestampRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const currentTimeRef = useRef<number>(currentTimeSeconds);
  const durationRef = useRef<number>(durationSeconds);
  const viewerIdRef = useRef<string>(viewerId);

  isPlayingRef.current = isPlaying;
  currentTimeRef.current = currentTimeSeconds;
  durationRef.current = durationSeconds;
  viewerIdRef.current = viewerId;

  /**
   * Immediately flushes the latest watched interval and position to backend.
   */
  const flushProgress = useCallback(async (isEnded: boolean = false) => {
    const vid = viewerIdRef.current || viewerId;
    if (!vid || vid.trim().length === 0) {
      console.log('[USE_PLAYBACK_PROGRESS] Skipping flush: viewerId not ready yet');
      return;
    }

    const curTime = currentTimeRef.current;
    const dur = durationRef.current;
    const intStart = intervalStartRef.current;

    let watchedInterval: WatchedInterval | undefined = undefined;
    if (curTime > intStart && (curTime - intStart) >= 0.5) {
      watchedInterval = {
        start: Math.round(intStart * 10) / 10,
        end: Math.round(curTime * 10) / 10
      };
    }

    // Reset interval start to current position
    intervalStartRef.current = curTime;
    lastFlushedTimeRef.current = curTime;
    lastWriteTimestampRef.current = Date.now();

    try {
      await updateProgress(vid, contentId, {
        sessionId,
        positionSeconds: isEnded && dur > 0 ? dur : curTime,
        durationSeconds: dur,
        watchedInterval,
        isEnded
      });
    } catch (e) {
      console.warn('[USE_PLAYBACK_PROGRESS] Flush error:', e);
    }
  }, [viewerId, contentId, sessionId]);

  // Periodic cadence while playing
  useEffect(() => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const curTime = currentTimeRef.current;
        // Only flush if position actually advanced meaningfully
        if (Math.abs(curTime - lastFlushedTimeRef.current) >= 1.0) {
          flushProgress(false);
        }
      }, THROTTLE_CADENCE_MS);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, flushProgress]);

  // Seek handler: flush previous interval before seek, reset intervalStart to new time
  const handleSeek = useCallback((newTime: number) => {
    flushProgress(false).finally(() => {
      intervalStartRef.current = newTime;
      currentTimeRef.current = newTime;
    });
  }, [flushProgress]);

  // Video ended handler
  const handleEnd = useCallback(() => {
    flushProgress(true);
  }, [flushProgress]);

  // AppState listener for background flush
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        flushProgress(false);
      }
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
  }, [flushProgress]);

  // Cleanup on unmount (exit flush)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      // Trigger final write on exit
      flushProgress(false);
    };
  }, [flushProgress]);

  return {
    flushProgress,
    handleSeek,
    handleEnd
  };
}
