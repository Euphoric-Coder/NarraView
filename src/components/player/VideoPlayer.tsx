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

  if (!videoPlayerRef.current) {
    videoPlayerRef.current = new VegaVideoPlayer();
  }

  React.useImperativeHandle(ref, () => ({
    seek: (time: number) => {
      if (videoPlayerRef.current) {
         videoPlayerRef.current.currentTime = time;
      }
    },
    play: () => {
      if (videoPlayerRef.current) {
         videoPlayerRef.current.play();
      }
    },
    pause: () => {
      if (videoPlayerRef.current) {
         videoPlayerRef.current.pause();
      }
    }
  }));

  useEffect(() => {
    if (videoPlayerRef.current) {
      if (props.paused) {
        videoPlayerRef.current.pause();
      } else {
        videoPlayerRef.current.play();
      }
    }
  }, [props.paused]);

  const onSurfaceViewCreated = async (surfaceHandle: string) => {
    console.log('[NarraView] surface created');
    
    await videoPlayerRef.current?.initialize();
    console.log('[NarraView] player initialized');

    videoPlayerRef.current?.setSurfaceHandle(surfaceHandle);
    console.log('[NarraView] surface attached');
    
    if (videoPlayerRef.current && props.source) {
       videoPlayerRef.current.autoplay = true;

       videoPlayerRef.current.addEventListener('loadedmetadata', () => {
          console.log('[NarraView Player] loadedmetadata');
          const dur = videoPlayerRef.current.duration || 0;
          console.log('[NarraView Player] duration: ' + dur);
          props.onLoad({ duration: dur, currentTime: 0 });
       });
       
       videoPlayerRef.current.addEventListener('canplay', () => {
          console.log('[NarraView Player] canplay');
          props.onBuffer(false);
       });
       
       videoPlayerRef.current.addEventListener('playing', () => {
          console.log('[NarraView Player] playing');
          props.onBuffer(false);
          props.onPlayingChange(true);
       });
       
       videoPlayerRef.current.addEventListener('waiting', () => {
          console.log('[NarraView Player] waiting');
          props.onBuffer(true);
       });
       
       videoPlayerRef.current.addEventListener('pause', () => {
          props.onPlayingChange(false);
       });
       
       videoPlayerRef.current.addEventListener('ended', () => {
          props.onPlayingChange(false);
          props.onEnd();
       });
       
       videoPlayerRef.current.addEventListener('timeupdate', () => {
          const ct = videoPlayerRef.current.currentTime || 0;
          const dur = videoPlayerRef.current.duration || 0;
          console.log('[NarraView Player] timeupdate: ' + ct);
          props.onProgress({ currentTime: ct, playableDuration: dur, seekableDuration: dur });
       });

       videoPlayerRef.current.addEventListener('error', (e: any) => {
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

  const onSurfaceViewDestroyed = async (surfaceHandle: string) => {
    if (videoPlayerRef.current) {
       videoPlayerRef.current.pause();
       videoPlayerRef.current.clearSurfaceHandle(surfaceHandle);
       await videoPlayerRef.current.deinitialize();
    }
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
