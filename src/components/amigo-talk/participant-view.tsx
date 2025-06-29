
"use client";

import React, { useRef, useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { MicOff } from 'lucide-react';

interface Participant {
  uid: string;
  name: string | null;
}

interface ParticipantViewProps {
  participant: Participant;
  stream?: MediaStream;
  isMuted?: boolean;
  isLocalParticipant?: boolean;
  isSpeaking: boolean;
  isFilmstrip?: boolean;
}

export function ParticipantView({
  participant,
  stream,
  isMuted = false,
  isLocalParticipant = false,
  isSpeaking,
  isFilmstrip = false,
}: ParticipantViewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const pName = participant.name || 'Anonymous';
  const displayName = isLocalParticipant ? 'You' : pName;
  const fallbackChar = pName ? pName.charAt(0).toUpperCase() : 'A';

  return (
    <div className={cn(
        "flex flex-col items-center space-y-2",
        isFilmstrip ? "w-32 flex-shrink-0" : "w-48"
    )}>
      <div className="relative">
        <Avatar
          className={cn(
            'border-4 border-primary/50 transition-all duration-100 ease-in-out',
            isSpeaking && 'border-primary shadow-[0_0_25px_8px] shadow-primary/70',
            isFilmstrip ? 'h-24 w-24' : 'h-32 w-32'
          )}
        >
          <AvatarImage src={`https://placehold.co/128x128.png?text=${fallbackChar}`} data-ai-hint="person" />
          <AvatarFallback className={cn(isFilmstrip ? 'text-3xl' : 'text-4xl')}>{fallbackChar}</AvatarFallback>
        </Avatar>
        {isMuted && (
          <div className="absolute bottom-1 right-1 bg-secondary rounded-full p-1.5">
            <MicOff className="h-4 w-4 text-secondary-foreground" />
          </div>
        )}
      </div>

      <span className={cn(
        "font-semibold truncate w-full text-center",
        isFilmstrip ? "text-sm" : "text-lg"
      )}>
          {displayName}
      </span>

      {!isLocalParticipant && stream && (
        <>
          <audio ref={audioRef} autoPlay playsInline />
          {!isFilmstrip && (
            <Slider
              defaultValue={[1]}
              max={1}
              step={0.05}
              onValueChange={(value) => setVolume(value[0])}
              className="w-[80%]"
              aria-label={`Volume for ${pName}`}
            />
          )}
        </>
      )}
      {!isFilmstrip && isLocalParticipant && <div className="h-[20px] w-[80%]" />}
    </div>
  );
}
