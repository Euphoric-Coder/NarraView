import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, BackHandler, Text, ActivityIndicator, TVEventHandler as RNTVEventHandler } from 'react-native';

import { ContentItem, RuntimeProvider } from '../types/content';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { PlayerControls } from '../components/player/PlayerControls';
import { NarraViewOverlay } from '../components/player/NarraViewOverlay';
import { usePlaybackState } from '../player/usePlaybackState';
import { FocusableButton } from '../components/FocusableButton';
import { getCurrentScene } from '../utils/getCurrentScene';
import { getContent } from '../services/contentApi';
import { getViewerId } from '../services/viewerIdentity';
import { startPlaybackSession } from '../services/viewerProgressApi';
import { usePlaybackProgress } from '../hooks/usePlaybackProgress';

interface PlayerScreenProps {
  item: ContentItem;
  onExit: () => void;
  initialPositionSeconds?: number;
}

export const PlayerScreen = ({ item, onExit, initialPositionSeconds }: PlayerScreenProps) => {
  const [playerItem, setPlayerItem] = useState<ContentItem>(item);
  const videoRef = useRef<any>(null);
  const videoPlayerInstanceRef = useRef<any>(null);
  const [isNarraViewOpen, setIsNarraViewOpen] = useState(false);
  const isNarraViewOpenRef = useRef(false);
  const handleCloseNarraViewRef = useRef<() => void>(() => {});
  isNarraViewOpenRef.current = isNarraViewOpen;
  const wasPlayingBeforeNarraViewRef = useRef(false);
  const [frozenTimestamp, setFrozenTimestamp] = useState(0);

  const [viewerId, setViewerId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const hasAppliedResumeRef = useRef<boolean>(false);
  const hasExitedRef = useRef<boolean>(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canonicalContentId = playerItem.contentId || playerItem.id;
  const isAiReady = playerItem.aiReady === true || canonicalContentId === 'signal-lost';

  // Keep instance ref updated so unmount cleanup can access player even after ref detachment
  useEffect(() => {
    if (videoRef.current) {
      videoPlayerInstanceRef.current = videoRef.current;
    }
  });

  const {
    isPlaying,
    currentTimeSeconds,
    durationSeconds,
    isControlsVisible,
    isBuffering,
    hasError,
    errorMessage,
    setCurrentTimeSeconds,
    setDurationSeconds,
    setIsBuffering,
    setHasError,
    setErrorMessage,
    setIsPlaying,
    showControls,
    clearHideControlsTimer
  } = usePlaybackState();

  const currentScene = getCurrentScene(playerItem.scenes, currentTimeSeconds);
  const currentSceneLabel = currentScene?.label;

  const source = playerItem.videoSource?.trim();

  // Progress hook with throttled cadence and event-driven flushes
  const { flushProgress, handleSeek, handleEnd } = usePlaybackProgress({
    viewerId,
    contentId: canonicalContentId,
    durationSeconds,
    currentTimeSeconds,
    isPlaying,
    sessionId
  });

  // Centralized idempotent exit function (Requirements 15, 16, 19, 21, 22)
  const exitPlayer = useCallback((fromUnmount = false) => {
    if (hasExitedRef.current) {
      console.log('[PLAYER_EXIT] Teardown already executed (idempotent guard)');
      return;
    }
    hasExitedRef.current = true;
    console.log('[PLAYER_EXIT] Executing exitPlayer teardown sequence, fromUnmount:', fromUnmount);

    const player = videoRef.current || videoPlayerInstanceRef.current;

    // 1. Flush progress (latest position persisted before teardown)
    try {
      flushProgress(false);
    } catch (e) {
      console.warn('[PLAYER_EXIT] flushProgress exception:', e);
    }

    // 2. Pause media immediately (stops video and audio output)
    try {
      setIsPlaying(false);
      player?.pause?.();
    } catch (e) {
      console.warn('[PLAYER_EXIT] video pause exception:', e);
    }

    // 3. Stop / release / destroy media player
    try {
      player?.stop?.();
    } catch (e) {
      console.warn('[PLAYER_EXIT] video stop exception:', e);
    }

    // 4. Cancel timers
    try {
      clearHideControlsTimer();
    } catch (e) { /* ignore */ }

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    // 5. Navigate back if not already unmounted
    if (!fromUnmount) {
      onExit();
    }
  }, [flushProgress, setIsPlaying, clearHideControlsTimer, onExit]);

  const exitPlayerRef = useRef(exitPlayer);
  exitPlayerRef.current = exitPlayer;

  // Unmount cleanup as secondary defense (Requirement 18)
  // Must run ONLY on unmount, not on intermediate re-renders
  useEffect(() => {
    return () => {
      exitPlayerRef.current(true);
    };
  }, []);

  // Remote Back / hardwareBackPress handler (Requirements 17, 30)
  // Registered once on mount, deregistered on unmount
  useEffect(() => {
    const backAction = () => {
      // Requirement 30: If overlay is open, first Back closes overlay
      if (isNarraViewOpenRef.current) {
        handleCloseNarraViewRef.current();
        return true;
      }
      // Second Back or playback Back exits player with full teardown
      exitPlayerRef.current(false);
      return true;
    };

    let backHandler: any = null;
    if (BackHandler && typeof BackHandler.addEventListener === 'function') {
      backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    }
    return () => backHandler?.remove?.();
  }, []);

  // Initialize Viewer Session
  useEffect(() => {
    let isMounted = true;
    const initSession = async () => {
      const vid = await getViewerId();
      if (!isMounted) return;
      setViewerId(vid);

      const sess = await startPlaybackSession(vid, canonicalContentId, initialPositionSeconds);
      if (isMounted && sess?.sessionId) {
        setSessionId(sess.sessionId);
      }
    };

    initSession();
    return () => { isMounted = false; };
  }, [canonicalContentId, initialPositionSeconds]);

  // Content state verification
  useEffect(() => {
    let isMounted = true;
    const cid = item.contentId || item.id;

    console.log('[PLAYER_CONTENT_STATE]', {
      contentId: cid,
      title: item.title,
      aiReady: item.aiReady,
      runtimeProvider: item.runtimeProvider,
      mediaPlayable: item.mediaPlayable
    });

    const verifyFreshState = async () => {
      if (!cid) return;
      const latest = await getContent(cid);
      if (latest && isMounted) {
        const freshContentId = latest.contentId || cid;
        const runtimeProvider: RuntimeProvider | undefined = freshContentId === 'signal-lost'
          ? 'handcrafted'
          : (latest.runtimeProvider || (latest.aiReady ? 'intelligence' : undefined));

        const updated: ContentItem = {
          ...item,
          id: freshContentId,
          contentId: freshContentId,
          title: latest.title || item.title,
          description: latest.description || item.description,
          videoSource: latest.videoUrl || item.videoSource,
          aiReady: latest.aiReady === true,
          runtimeProvider,
          mediaPlayable: latest.mediaPlayable !== false,
          durationSeconds: typeof latest.durationSeconds === 'number' ? latest.durationSeconds : item.durationSeconds
        };

        setPlayerItem(updated);

        console.log('[PLAYER_CONTENT_STATE] (verified live)', {
          contentId: updated.contentId,
          title: updated.title,
          aiReady: updated.aiReady,
          runtimeProvider: updated.runtimeProvider,
          mediaPlayable: updated.mediaPlayable
        });
      }
    };

    verifyFreshState();
    return () => { isMounted = false; };
  }, [item]);

  useEffect(() => {
    console.log('[NarraView] content:', canonicalContentId);
    if (source && source.startsWith('https://')) {
      try {
        const urlObj = new URL(source);
        console.log('[NarraView] source host:', (urlObj as any).hostname);
      } catch (e) { /* ignore */ }
    }
  }, [canonicalContentId, source]);

  useEffect(() => {
    const tvEventHandler = new RNTVEventHandler();
    tvEventHandler.enable(undefined, (cmp: any, evt: any) => {
      if (evt && evt.eventType !== 'blur' && evt.eventType !== 'focus') {
        if (!isNarraViewOpen) {
          console.log('[NarraView Controls] interaction detected', evt.eventType);
          showControls();
        }
      }
    });
    
    return () => {
      tvEventHandler.disable();
    };
  }, [showControls, isNarraViewOpen]);

  // Loading timeout
  useEffect(() => {
    if (isBuffering && !isPlaying && !hasError && source) {
      loadingTimeoutRef.current = setTimeout(() => {
        setIsBuffering(false);
        setHasError(true);
        setErrorMessage("We couldn't load " + playerItem.title + ".");
      }, 25000);
    }
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [isBuffering, isPlaying, hasError, source, playerItem.title, setIsBuffering, setHasError, setErrorMessage]);

  const handleSeekBack = () => {
    if (isNarraViewOpen) return;
    showControls();
    if (videoRef.current) {
      const newTime = Math.max(0, currentTimeSeconds - 10);
      handleSeek(newTime);
      videoRef.current.seek(newTime);
      setCurrentTimeSeconds(newTime);
    }
  };

  const handleSeekForward = () => {
    if (isNarraViewOpen) return;
    showControls();
    if (videoRef.current && durationSeconds > 0) {
      const newTime = Math.min(durationSeconds, currentTimeSeconds + 10);
      handleSeek(newTime);
      videoRef.current.seek(newTime);
      setCurrentTimeSeconds(newTime);
    }
  };

  const handleTogglePlayPause = () => {
    if (isNarraViewOpen) return;
    showControls();
    if (videoRef.current) {
      if (isPlaying) {
        flushProgress(false);
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleOpenNarraView = () => {
    const allowed = isAiReady;
    const reason = allowed
      ? (canonicalContentId === 'signal-lost' || playerItem.runtimeProvider === 'handcrafted' ? 'handcrafted_ready' : 'backend_ai_ready')
      : 'backend_not_ready';

    console.log('[NARRAVIEW_GATE_CHECK]', {
      contentId: canonicalContentId,
      aiReady: playerItem.aiReady,
      runtimeProvider: playerItem.runtimeProvider,
      allowed,
      reason
    });

    wasPlayingBeforeNarraViewRef.current = isPlaying;
    if (isPlaying) {
      setIsPlaying(false);
      if (videoRef.current) {
        flushProgress(false);
        videoRef.current.pause();
      }
    }
    setFrozenTimestamp(currentTimeSeconds);
    setIsNarraViewOpen(true);
  };

  const handleCloseNarraView = () => {
    setIsNarraViewOpen(false);
    if (wasPlayingBeforeNarraViewRef.current) {
      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.play();
      }
    }
  };
  handleCloseNarraViewRef.current = handleCloseNarraView;

  if (!source) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorText}>No video source configured.</Text>
        <FocusableButton label="[ Go Back ]" onPress={() => exitPlayer(false)} hasTVPreferredFocus />
      </View>
    );
  }

  if (!source.startsWith('https://')) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorText}>Invalid video source.</Text>
        <FocusableButton label="[ Go Back ]" onPress={() => exitPlayer(false)} hasTVPreferredFocus />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <FocusableButton label="[ Go Back ]" onPress={() => exitPlayer(false)} hasTVPreferredFocus />
      </View>
    );
  }

  const shouldShowPlayerControls = isControlsVisible && !isNarraViewOpen;

  return (
    <View style={styles.screen}>
      <VideoPlayer
        ref={videoRef}
        source={source}
        paused={!isPlaying}
        onLoad={({ duration, currentTime }) => {
          setDurationSeconds(duration);
          if (!hasAppliedResumeRef.current && initialPositionSeconds && initialPositionSeconds > 0) {
            hasAppliedResumeRef.current = true;
            const resumeTarget = initialPositionSeconds >= 5
              ? Math.max(0, initialPositionSeconds - 3)
              : initialPositionSeconds;

            console.log('[VIEWER_TELEMETRY] RESUME_POSITION_APPLIED', {
              contentId: canonicalContentId,
              savedPosition: initialPositionSeconds,
              appliedPosition: resumeTarget
            });

            if (videoRef.current && typeof videoRef.current.seek === 'function') {
              videoRef.current.seek(resumeTarget);
              setCurrentTimeSeconds(resumeTarget);
            }
          } else {
            setCurrentTimeSeconds(currentTime);
          }
        }}
        onProgress={({ currentTime }) => {
          if (!isNarraViewOpen) {
            setCurrentTimeSeconds(currentTime);
          }
        }}
        onEnd={() => {
          handleEnd();
          exitPlayer(false);
        }}
        onBuffer={(buffering) => {
          setIsBuffering(buffering);
        }}
        onError={() => {
          setHasError(true);
          setErrorMessage("We couldn't load " + playerItem.title + ".");
        }}
        onPlayingChange={(playing) => {
          setIsPlaying(playing);
        }}
      />
      
      {isBuffering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading {playerItem.title}...</Text>
        </View>
      )}

      <View 
        style={[
          styles.controlsContainer, 
          { opacity: shouldShowPlayerControls ? 1 : 0 }
        ]} 
        pointerEvents={shouldShowPlayerControls ? 'auto' : 'none'}
      >
        <PlayerControls
          title={playerItem.title}
          currentScene={currentSceneLabel}
          currentTimeSeconds={currentTimeSeconds}
          durationSeconds={durationSeconds}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          hasError={hasError}
          onTogglePlayPause={handleTogglePlayPause}
          onSeekBack={handleSeekBack}
          onSeekForward={handleSeekForward}
          onOpenNarraView={handleOpenNarraView}
        />
      </View>

      {isNarraViewOpen && !isAiReady ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }]}>
          <Text style={{ color: '#F5B800', fontSize: 32, fontWeight: '700', letterSpacing: 2, marginBottom: 16 }}>NARRAVIEW</Text>
          <Text style={{ color: '#ffffff', fontSize: 20, opacity: 0.8, marginBottom: 48 }}>NarraView intelligence for this title is still being prepared.</Text>
          <FocusableButton 
            label="Back to Video" 
            onPress={handleCloseNarraView} 
            hasTVPreferredFocus 
            style={({focused}: any) => ({
              paddingHorizontal: 32,
              paddingVertical: 16,
              backgroundColor: focused ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: focused ? '#F5B800' : 'rgba(255,255,255,0.1)'
            })}
          />
        </View>
      ) : isNarraViewOpen ? (
        <NarraViewOverlay
          contentId={canonicalContentId}
          runtimeProvider={playerItem.runtimeProvider}
          currentTimeSeconds={currentTimeSeconds}
          currentScene={currentScene}
          onClose={handleCloseNarraView}
          contextTimestamp={frozenTimestamp}
          viewerId={viewerId}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  errorScreen: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ffffff', fontSize: 24, marginBottom: 20 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 20,
    marginTop: 16,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
});
