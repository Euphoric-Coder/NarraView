import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoPlayer as VegaVideoPlayer, KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';

interface VideoPlayerProps {
  source: string; 
  paused: boolean;
  onProgress: (data: { currentTime: number; playableDuration: number; seekableDuration: number }) => void;
  onLoad: (data: { duration: number; currentTime: number }) => void;
  onEnd: () => void;
  onBuffer: (isBuffering: boolean) => void;
  onError: () => void;
  onPlayingChange: (isPlaying: boolean) => void;
}

export const VideoPlayer = React.forwardRef((props: VideoPlayerProps, ref) => {
  const videoPlayerRef = useRef<any>(null);
  const currentSurfaceHandleRef = useRef<string | null>(null);
  const listenersRef = useRef<Array<{ type: string; handler: any }>>([]);
  const isReleasedRef = useRef<boolean>(false);

  if (!videoPlayerRef.current) {
    videoPlayerRef.current = new VegaVideoPlayer();
  }

  const removeAllEventListeners = () => {
    if (videoPlayerRef.current && listenersRef.current.length > 0) {
      for (const { type, handler } of listenersRef.current) {
        try {
          videoPlayerRef.current.removeEventListener?.(type, handler);
        } catch (e) {}
      }
      listenersRef.current = [];
    }
  };

  const addTrackedListener = (type: string, handler: any) => {
    if (videoPlayerRef.current) {
      listenersRef.current.push({ type, handler });
      videoPlayerRef.current.addEventListener?.(type, handler);
    }
  };

  const pauseMedia = () => {
    try {
      videoPlayerRef.current?.pause?.();
    } catch (e) {
      console.warn('[VideoPlayer] pause exception:', e);
    }
  };

  const stopAndRelease = () => {
    if (isReleasedRef.current) {
      return;
    }
    isReleasedRef.current = true;
    console.log('[VideoPlayer] Executing stopAndRelease teardown');

    // 1. Pause media immediately to stop audio/video pipeline
    pauseMedia();

    // 2. Remove all attached media event listeners
    removeAllEventListeners();

    // 3. Clear surface handle if attached
    if (currentSurfaceHandleRef.current && videoPlayerRef.current) {
      try {
        videoPlayerRef.current.clearSurfaceHandle?.(currentSurfaceHandleRef.current);
      } catch (e) { /* ignore */ }
      currentSurfaceHandleRef.current = null;
    }

    // 4. Deinitialize player using supported SDK API
    if (videoPlayerRef.current) {
      try {
        if (typeof videoPlayerRef.current.deinitializeSync === 'function') {
          videoPlayerRef.current.deinitializeSync(500);
        } else if (typeof videoPlayerRef.current.deinitialize === 'function') {
          videoPlayerRef.current.deinitialize().catch(() => {});
        }
      } catch (e) {
        console.warn('[VideoPlayer] deinitialize exception:', e);
      }

      // 5. Clear media source
      try {
        videoPlayerRef.current.src = '';
      } catch (e) { /* ignore */ }
    }
  };

  React.useImperativeHandle(ref, () => ({
    seek: (time: number) => {
      if (videoPlayerRef.current && !isReleasedRef.current) {
        videoPlayerRef.current.currentTime = time;
      }
    },
    play: () => {
      if (videoPlayerRef.current && !isReleasedRef.current) {
        videoPlayerRef.current.play?.();
      }
    },
    pause: () => {
      pauseMedia();
    },
    stop: () => {
      stopAndRelease();
    },
    release: () => {
      stopAndRelease();
    },
    destroy: () => {
      stopAndRelease();
    }
  }));

  useEffect(() => {
    if (videoPlayerRef.current && !isReleasedRef.current) {
      if (props.paused) {
        pauseMedia();
      } else {
        videoPlayerRef.current.play?.();
      }
    }
  }, [props.paused]);

  useEffect(() => {
    return () => {
      stopAndRelease();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoPlayerRef.current && !isReleasedRef.current && currentSurfaceHandleRef.current && props.source) {
      if (videoPlayerRef.current.src !== props.source) {
        console.log('[NarraView Player] updating src:', props.source);
        videoPlayerRef.current.src = props.source;
      }
    }
  }, [props.source]);

  const onSurfaceViewCreated = async (surfaceHandle: string) => {
    if (isReleasedRef.current) return;
    console.log('[NarraView] surface created');
    currentSurfaceHandleRef.current = surfaceHandle;
    
    await videoPlayerRef.current?.initialize();
    console.log('[NarraView] player initialized');

    videoPlayerRef.current?.setSurfaceHandle(surfaceHandle);
    console.log('[NarraView] surface attached');
    
    if (videoPlayerRef.current && props.source) {
      videoPlayerRef.current.autoplay = true;

      addTrackedListener('loadedmetadata', () => {
        console.log('[NarraView Player] loadedmetadata');
        const dur = videoPlayerRef.current?.duration || 0;
        console.log('[NarraView Player] duration: ' + dur);
        props.onLoad({ duration: dur, currentTime: 0 });
      });
       
      addTrackedListener('canplay', () => {
        console.log('[NarraView Player] canplay');
        props.onBuffer(false);
      });
       
      addTrackedListener('playing', () => {
        console.log('[NarraView Player] playing');
        props.onBuffer(false);
        props.onPlayingChange(true);
      });
       
      addTrackedListener('waiting', () => {
        console.log('[NarraView Player] waiting');
        props.onBuffer(true);
      });
       
      addTrackedListener('pause', () => {
        props.onPlayingChange(false);
      });
       
      addTrackedListener('ended', () => {
        props.onPlayingChange(false);
        props.onEnd();
      });
       
      addTrackedListener('timeupdate', () => {
        const ct = videoPlayerRef.current?.currentTime || 0;
        const dur = videoPlayerRef.current?.duration || 0;
        props.onProgress({ currentTime: ct, playableDuration: dur, seekableDuration: dur });
      });

      addTrackedListener('error', (e: any) => {
        console.log('[NarraView] error:', JSON.stringify(e));
        if (videoPlayerRef.current) {
          console.log('[NarraView] error code:', videoPlayerRef.current.error);
          console.log('[NarraView] networkState:', videoPlayerRef.current.networkState);
          console.log('[NarraView] readyState:', videoPlayerRef.current.readyState);
        }
        props.onError();
      });

      console.log('[NarraView Player] setting src:', props.source);
      videoPlayerRef.current.src = props.source;
    }
  };

  const onSurfaceViewDestroyed = async (_surfaceHandle: string) => {
    stopAndRelease();
  };

  return (
    <View style={styles.container}>
      <KeplerVideoSurfaceView
        style={styles.video}
        onSurfaceViewCreated={onSurfaceViewCreated}
        onSurfaceViewDestroyed={onSurfaceViewDestroyed}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }
});
