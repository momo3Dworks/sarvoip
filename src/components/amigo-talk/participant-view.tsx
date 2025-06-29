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
}

export function ParticipantView({
  participant,
  stream,
  isMuted = false,
  isLocalParticipant = false,
  isSpeaking,
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
  const fallbackChar = pName ? pName.charAt(0).toUpperCase() : "A";

  return (
    <div className="flex flex-col items-center space-y-3 w-48">
      <div className="relative">
        <Avatar
          className={cn(
            'h-32 w-32 border-4 border-primary/50 transition-all duration-100 ease-in-out',
            isSpeaking && 'border-primary shadow-[0_0_25px_8px] shadow-primary/70'
          )}
        >
          <AvatarImage src={`https://placehold.co/128x128.png?text=${fallbackChar}`} data-ai-hint="person" />
          <AvatarFallback className="text-4xl">{fallbackChar}</AvatarFallback>
        </Avatar>
        {isMuted && (
            <div className="absolute bottom-2 right-2 bg-secondary rounded-full p-2">
                <MicOff className="h-5 w-5 text-secondary-foreground" />
            </div>
        )}
      </div>

      <span className="font-semibold text-lg truncate w-full text-center">{displayName}</span>

      {!isLocalParticipant && stream && (
        <>
          <audio ref={audioRef} autoPlay playsInline />
          <Slider
            defaultValue={[1]}
            max={1}
            step={0.05}
            onValueChange={(value) => setVolume(value[0])}
            className="w-[80%]"
            aria-label={`Volume for ${pName}`}
          />
        </>
      )}
      {isLocalParticipant && <div className="h-[20px] w-[80%]" />}
    </div>
  );
}
