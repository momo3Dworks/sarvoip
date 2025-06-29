
"use client";

import React, { useEffect, useRef } from 'react';

interface ScreenShareViewProps {
  stream: MediaStream;
  muted?: boolean;
}

export function ScreenShareView({ stream, muted = false }: ScreenShareViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className="w-full h-full object-contain"
      autoPlay
      playsInline
      muted={muted}
    />
  );
}
