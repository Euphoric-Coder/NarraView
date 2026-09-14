import { useState, useCallback, useRef, useEffect } from 'react';

export interface PlaybackState {
  isPlaying: boolean;
  currentTimeSeconds: number;
  durationSeconds: number;
  isControlsVisible: boolean;
  isBuffering: boolean;
  hasError: boolean;
  errorMessage: string;
}

export const usePlaybackState = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("We couldn't load the video.");
  
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideControlsTimer = useCallback(() => {
    if (hideControlsTimer.current) {
      console.log('[NarraView Controls] timer cancelled');
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearHideControlsTimer();
    
    if (!isPlaying || isBuffering || hasError) {
      return;
    }
    
    console.log('[NarraView Controls] scheduling hide');
    hideControlsTimer.current = setTimeout(() => {
      console.log('[NarraView Controls] hidden');
      setIsControlsVisible(false);
    }, 3000);
  }, [isPlaying, isBuffering, hasError, clearHideControlsTimer]);

  const showControls = useCallback(() => {
    if (!isControlsVisible) {
      console.log('[NarraView Controls] visible');
    }
    setIsControlsVisible(true);
    
    if (isPlaying) {
      scheduleHideControls();
    }
  }, [isPlaying, isControlsVisible, scheduleHideControls]);

  // Lifecycle effects for state transitions
  useEffect(() => {
    if (!isPlaying || isBuffering || hasError) {
      clearHideControlsTimer();
      setIsControlsVisible(true);
      if (!isPlaying && !isBuffering && !hasError) {
        console.log('[NarraView Controls] visible');
      }
    } else {
      scheduleHideControls();
    }
    
    return () => clearHideControlsTimer();
  }, [isPlaying, isBuffering, hasError, scheduleHideControls, clearHideControlsTimer]);

  return {
    isPlaying,
    setIsPlaying,
    currentTimeSeconds,
    setCurrentTimeSeconds,
    durationSeconds,
    setDurationSeconds,
    isControlsVisible,
    setIsControlsVisible,
    isBuffering,
    setIsBuffering,
    hasError,
    setHasError,
    errorMessage,
    setErrorMessage,
    showControls,
    scheduleHideControls,
    clearHideControlsTimer,
  };
};
