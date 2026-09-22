import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, BackHandler, Text, ActivityIndicator, TVEventHandler as RNTVEventHandler } from 'react-native';

import { ContentItem } from '../types/content';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { PlayerControls } from '../components/player/PlayerControls';
import { NarraViewOverlay } from '../components/player/NarraViewOverlay';
import { usePlaybackState } from '../player/usePlaybackState';
import { FocusableButton } from '../components/FocusableButton';
import { getCurrentScene } from '../utils/getCurrentScene';

interface PlayerScreenProps {
  item: ContentItem;
  onExit: () => void;
}

export const PlayerScreen = ({ item, onExit }: PlayerScreenProps) => {
  const videoRef = useRef<any>(null);
  const [isNarraViewOpen, setIsNarraViewOpen] = useState(false);
  const wasPlayingBeforeNarraViewRef = useRef(false);
  const [frozenTimestamp, setFrozenTimestamp] = useState(0);
  
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

  const currentScene = getCurrentScene(item.scenes, currentTimeSeconds);
  const currentSceneLabel = currentScene?.label;

  const source = item.videoSource?.trim();

  useEffect(() => {
    console.log('[NarraView] content:', item.id);
    if (source && source.startsWith('https://')) {
      try {
        const urlObj = new URL(source);
        console.log('[NarraView] source host:', (urlObj as any).hostname);
      } catch (e) {}
    }
  }, [item, source]);

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

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
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
        setErrorMessage("We couldn't load " + item.title + ".");
      }, 10000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isBuffering, isPlaying, hasError, source, item.title, setIsBuffering, setHasError, setErrorMessage]);

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

  // When NarraView overlay is open, standard player controls should be hidden/uninteractable
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
          setErrorMessage("We couldn't load " + item.title + ".");
        }}
        onPlayingChange={(playing) => {
          setIsPlaying(playing);
        }}
      />
      
      {isBuffering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading {item.title}...</Text>
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
          title={item.title}
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

      {isNarraViewOpen && (
        <NarraViewOverlay
          contentId={item.id}
          currentTimeSeconds={currentTimeSeconds}
          currentScene={currentScene}
          onClose={handleCloseNarraView}
          contextTimestamp={frozenTimestamp}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  errorScreen: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ffffff', fontSize: 24, marginBottom: 20 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#ffffff', fontSize: 20, marginTop: 16 },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
  }
});
