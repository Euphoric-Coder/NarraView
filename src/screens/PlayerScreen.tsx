import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, BackHandler, Text, ActivityIndicator, TVEventHandler as RNTVEventHandler } from 'react-native';

import { ContentItem, RuntimeProvider } from '../types/content';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { PlayerControls } from '../components/player/PlayerControls';
import { NarraViewOverlay } from '../components/player/NarraViewOverlay';
import { usePlaybackState } from '../player/usePlaybackState';
import { FocusableButton } from '../components/FocusableButton';
import { getCurrentScene } from '../utils/getCurrentScene';
import { getContent } from '../services/contentApi';

interface PlayerScreenProps {
  item: ContentItem;
  onExit: () => void;
}

export const PlayerScreen = ({ item, onExit }: PlayerScreenProps) => {
  const [playerItem, setPlayerItem] = useState<ContentItem>(item);
  const videoRef = useRef<any>(null);
  const [isNarraViewOpen, setIsNarraViewOpen] = useState(false);
  const wasPlayingBeforeNarraViewRef = useRef(false);
  const [frozenTimestamp, setFrozenTimestamp] = useState(0);

  const canonicalContentId = playerItem.contentId || playerItem.id;
  const isAiReady = playerItem.aiReady === true || canonicalContentId === 'signal-lost';

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
      } catch (e) {}
    }
  }, [canonicalContentId, source]);

  useEffect(() => {
    const backAction = () => {
      if (isNarraViewOpen) {
        handleCloseNarraView();
        return true;
      }
      clearHideControlsTimer();
      onExit();
      return true;
    };

    let backHandler: any = null;
    if (BackHandler && typeof BackHandler.addEventListener === 'function') {
      backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    }
    return () => backHandler?.remove?.();
  }, [isNarraViewOpen, onExit, clearHideControlsTimer, isPlaying]);

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
    let timeout: ReturnType<typeof setTimeout>;
    if (isBuffering && !isPlaying && !hasError && source) {
      timeout = setTimeout(() => {
        setIsBuffering(false);
        setHasError(true);
        setErrorMessage("We couldn't load " + playerItem.title + ".");
      }, 10000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isBuffering, isPlaying, hasError, source, playerItem.title, setIsBuffering, setHasError, setErrorMessage]);

  const handleSeekBack = () => {
    if (isNarraViewOpen) return;
    showControls();
    if (videoRef.current) {
      const newTime = Math.max(0, currentTimeSeconds - 10);
      videoRef.current.seek(newTime);
      setCurrentTimeSeconds(newTime);
    }
  };

  const handleSeekForward = () => {
    if (isNarraViewOpen) return;
    showControls();
    if (videoRef.current && durationSeconds > 0) {
      const newTime = Math.min(durationSeconds, currentTimeSeconds + 10);
      videoRef.current.seek(newTime);
      setCurrentTimeSeconds(newTime);
    }
  };

  const handleTogglePlayPause = () => {
    if (isNarraViewOpen) return;
    showControls();
    if (videoRef.current) {
      if (isPlaying) {
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

  if (!source) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorText}>No video source configured.</Text>
        <FocusableButton label="[ Go Back ]" onPress={onExit} hasTVPreferredFocus />
      </View>
    );
  }

  if (!source.startsWith('https://')) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorText}>Invalid video source.</Text>
        <FocusableButton label="[ Go Back ]" onPress={onExit} hasTVPreferredFocus />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <FocusableButton label="[ Go Back ]" onPress={onExit} hasTVPreferredFocus />
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
          setCurrentTimeSeconds(currentTime);
        }}
        onProgress={({ currentTime }) => {
          if (!isNarraViewOpen) {
            setCurrentTimeSeconds(currentTime);
          }
        }}
        onEnd={() => {
          setIsPlaying(false);
          onExit();
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
