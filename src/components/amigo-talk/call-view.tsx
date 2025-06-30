
'use client';

import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  onSnapshot,
  updateDoc,
  addDoc,
  deleteDoc,
  setDoc,
  getDocs,
  query,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, MessageSquare, ScreenShare, ScreenShareOff, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Equalizer } from './equalizer';
import { ChatView } from './chat-view';
import { ParticipantView } from './participant-view';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '../ui/scroll-area';
import { ScreenShareView } from './screen-share-view';
import { cn } from '@/lib/utils';

interface CallViewProps {
  callId: string;
}

interface Participant {
  uid: string;
  name: string | null;
}

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export function CallView({ callId }: CallViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user: currentUser } = useContext(UserContext);
  const isMobile = useIsMobile();

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const screenSendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());
  const mainScreenViewRef = useRef<HTMLDivElement>(null);

  const [remoteAudioStreams, setRemoteAudioStreams] = useState<Map<string, MediaStream>>(new Map());
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [callStatus, setCallStatus] = useState('Connecting...');
  const [selectedScreenShareId, setSelectedScreenShareId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);


  const [speaking, setSpeaking] = useState<Map<string, boolean>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>>(new Map());
  const localAnalyserRef = useRef<{ analyser: AnalyserNode; source: MediaStreamAudioSourceNode } | null>(null);

  useEffect(() => {
    if (!currentUser || !callId) return;

    let localStream: MediaStream;
    const callDocRef = doc(db, 'calls', callId);
    const participantsColRef = collection(callDocRef, 'participants');
    const signalingColRef = collection(callDocRef, 'signaling');

    const setupCall = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        localStreamRef.current = localStream;
        
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const analyser = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(localStream);
        source.connect(analyser);
        localAnalyserRef.current = { analyser, source };

      } catch (error) {
        console.error("Error accessing media devices.", error);
        toast({
          variant: 'destructive',
          title: 'Microphone access denied',
          description: 'Please allow microphone access to use voice calls.',
        });
        setCallStatus('Microphone access denied');
        return;
      }

      await setDoc(doc(participantsColRef, currentUser.uid), { name: currentUser.name, avatarUrl: currentUser.avatarUrl });

      const participantsUnsub = onSnapshot(participantsColRef, (snapshot) => {
        const currentParticipants = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as Participant);
        setParticipants(currentParticipants);
        const remoteParticipants = currentParticipants.filter(p => p.uid !== currentUser.uid);

        peersRef.current.forEach((pc, peerId) => {
            if (!remoteParticipants.some(p => p.uid === peerId)) {
                pc.close();
                peersRef.current.delete(peerId);
                analysersRef.current.get(peerId)?.source.disconnect();
                analysersRef.current.delete(peerId);
                setRemoteAudioStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(peerId);
                    return newMap;
                });
                 setRemoteScreenStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(peerId);
                    return newMap;
                });
            }
        });

        remoteParticipants.forEach(async (participant) => {
            if (peersRef.current.has(participant.uid) || !currentUser || !localStreamRef.current) return;

            const pc = new RTCPeerConnection(servers);
            peersRef.current.set(participant.uid, pc);

            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));

            const isCaller = currentUser.uid > participant.uid;
            
            pc.onnegotiationneeded = async () => {
              try {
                if(isCaller) {
                  const offer = await pc.createOffer();
                  await pc.setLocalDescription(offer);
                  if (pc.localDescription && currentUser) {
                      await addDoc(signalingColRef, { from: currentUser.uid, to: participant.uid, offer: pc.localDescription.toJSON() });
                  }
                }
              } catch (err) {
                  console.error(`Error creating offer for ${participant.uid}:`, err);
              }
            };

            pc.onicecandidate = event => {
                if (event.candidate && currentUser) {
                    addDoc(signalingColRef, { from: currentUser.uid, to: participant.uid, candidate: event.candidate.toJSON() });
                }
            };

            pc.ontrack = event => {
                const stream = event.streams[0];
                if (!stream) return;

                stream.onremovetrack = (ev) => {
                    if (ev.track.kind === 'video' && stream.getVideoTracks().length === 0) {
                        setRemoteScreenStreams(prev => {
                            const newMap = new Map(prev);
                            if (newMap.get(participant.uid) === stream) {
                                newMap.delete(participant.uid);
                            }
                            return newMap;
                        })
                    }
                };

                if (event.track.kind === 'video') {
                     setRemoteScreenStreams(prev => new Map(prev).set(participant.uid, stream));
                } else if (event.track.kind === 'audio') {
                    if (stream.getAudioTracks().length > 0) {
                        const existingStream = remoteAudioStreams.get(participant.uid);
                        if (existingStream !== stream) {
                            setRemoteAudioStreams(prev => new Map(prev).set(participant.uid, stream));
                            if (audioContextRef.current && !analysersRef.current.has(participant.uid)) {
                                const analyser = audioContextRef.current.createAnalyser();
                                const source = audioContextRef.current.createMediaStreamSource(stream);
                                source.connect(analyser);
                                analysersRef.current.set(participant.uid, { analyser, source });
                            }
                        }
                    }
                }
            };
        });
        setCallStatus('Connected');
      }, (error) => {
          console.error("Participants snapshot error: ", error);
          toast({ variant: 'destructive', title: 'Connection error', description: 'Could not load participants.' });
      });
      
      const signalingUnsub = onSnapshot(query(signalingColRef), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type !== 'added' || !currentUser) return;
            
            const message = change.doc.data();
            if (message.to !== currentUser.uid) return;

            const peerId = message.from;
            const pc = peersRef.current.get(peerId);
            if (!pc) return;

            try {
                if (message.offer) {
                    if (pc.signalingState !== "stable") {
                      // Handle glare, let the caller win
                      const isCaller = currentUser.uid > peerId;
                      if (!isCaller) return;
                    }
                    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    if (pc.localDescription) {
                        await addDoc(signalingColRef, { from: currentUser.uid, to: peerId, answer: pc.localDescription.toJSON() });
                    }
                } else if (message.answer) {
                    if (pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                    }
                } else if (message.candidate) {
                    if (pc.remoteDescription) {
                        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                    }
                }
            } catch (err) {
                console.error("Signaling error:", err);
            } finally {
                await deleteDoc(change.doc.ref);
            }
        });
      }, (error) => {
          console.error("Signaling snapshot error: ", error);
          toast({ variant: 'destructive', title: 'Connection error', description: 'Call signaling failed.' });
      });

      return () => {
        participantsUnsub();
        signalingUnsub();
      };
    };

    const unsubscribePromise = setupCall();

    return () => {
        unsubscribePromise.then(unsub => unsub && unsub());
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        localScreenStreamRef.current?.getTracks().forEach(track => track.stop());
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        screenSendersRef.current.clear();
        analysersRef.current.forEach(({ source }) => source.disconnect());
        analysersRef.current.clear();
        localAnalyserRef.current?.source.disconnect();
        audioContextRef.current?.close().catch(console.error);
    };
  }, [callId, currentUser, toast]);

    useEffect(() => {
        let animationFrameId: number;
        const checkSpeaking = () => {
            const newSpeaking = new Map<string, boolean>();
            let changed = false;
            const checkLevel = (analyser: AnalyserNode, id: string, isLocalAndMuted: boolean) => {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (const amplitude of dataArray) { sum += amplitude * amplitude; }
                const level = Math.sqrt(sum / dataArray.length);
                const isCurrentlySpeaking = !isLocalAndMuted && level > 5;
                if (speaking.get(id) !== isCurrentlySpeaking) { changed = true; }
                newSpeaking.set(id, isCurrentlySpeaking);
            };
            if (localAnalyserRef.current && currentUser) {
                checkLevel(localAnalyserRef.current.analyser, currentUser.uid, isMuted);
            }
            analysersRef.current.forEach(({ analyser }, peerId) => {
                checkLevel(analyser, peerId, false);
            });
            if (changed) { setSpeaking(new Map(newSpeaking)); }
            animationFrameId = requestAnimationFrame(checkSpeaking);
        };
        if(audioContextRef.current) { checkSpeaking(); }
        return () => cancelAnimationFrame(animationFrameId);
    }, [speaking, isMuted, currentUser]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const stopScreenShare = () => {
      setIsSharingScreen(false);
      
      screenSendersRef.current.forEach((senders, peerId) => {
        const pc = peersRef.current.get(peerId);
        if (pc) {
          senders.forEach(sender => {
              if (pc.getSenders().includes(sender)) {
                  pc.removeTrack(sender);
              }
          });
        }
      });
      screenSendersRef.current.clear();

      localScreenStreamRef.current?.getTracks().forEach(track => track.stop());
      localScreenStreamRef.current = null;
    };
    
    const startScreenShare = async () => {
      if (!currentUser) return;
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: {
            frameRate: 30,
            height: { ideal: 720 },
            cursor: "always",
          }, 
          audio: true 
        });
        localScreenStreamRef.current = stream;
        setIsSharingScreen(true);
        setSelectedScreenShareId(currentUser.uid);
    
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
            stopScreenShare();
            return;
        }
        videoTrack.onended = stopScreenShare;
    
        const newSenders = new Map<string, RTCRtpSender[]>();
        peersRef.current.forEach((pc, peerId) => {
            const senders: RTCRtpSender[] = [];
            stream.getTracks().forEach(track => {
                senders.push(pc.addTrack(track, stream));
            });
            newSenders.set(peerId, senders);
        });
        screenSendersRef.current = newSenders;

      } catch (error: any) {
        console.error('Error starting screen share:', error);
        let description = 'Could not start screen sharing. Please check your browser permissions.';
        if (error.name === 'NotAllowedError') {
            description = 'You denied permission to share your screen. To enable it, you may need to reset permissions for this site in your browser settings.';
        } else if (error.message && error.message.includes('permissions policy')) {
            description = 'Screen sharing is blocked by the browser\'s Permissions Policy. This is a server configuration issue. Please ensure the `headers` section in `next.config.ts` allows "display-capture". A server restart might be required for the change to take effect.';
        }
        toast({
          variant: 'destructive',
          title: 'Screen Share Failed',
          description,
        });
        setIsSharingScreen(false);
      }
    };

    const toggleScreenShare = () => {
        if (isSharingScreen) {
          stopScreenShare();
        } else {
          startScreenShare();
        }
      };
      
  const handleEndCall = async () => {
    if (isSharingScreen) {
      stopScreenShare();
    }
    setCallStatus('Call ended');
    if(currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            status: 'online',
            currentCallId: deleteField()
        }).catch(err => console.error("Could not update my own status on call end:", err));
        
        await deleteDoc(doc(db, 'calls', callId, 'participants', currentUser.uid));
    }

    const participantsSnapshot = await getDocs(collection(db, 'calls', callId, 'participants'));
    if(participantsSnapshot.empty) {
        try {
            const callDocRef = doc(db, 'calls', callId);
            const batch = writeBatch(db);
            const signalingSnap = await getDocs(collection(callDocRef, 'signaling'));
            signalingSnap.forEach(doc => batch.delete(doc.ref));
            const messagesSnap = await getDocs(collection(callDocRef, 'messages'));
            messagesSnap.forEach(doc => batch.delete(doc.ref));
            batch.delete(callDocRef);
            await batch.commit();
        } catch (error) {
            console.error("Error cleaning up call documents:", error);
        }
    }
    router.push('/');
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
    setIsMuted(prev => !prev);
  };
  
  const handleToggleFullscreen = () => {
    if (!mainScreenViewRef.current) return;
    if (isFullscreen) {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    } else {
        mainScreenViewRef.current.requestFullscreen();
    }
  };

  const localParticipant = currentUser ? participants.find(p => p.uid === currentUser.uid) : null;
  const remoteParticipants = currentUser ? participants.filter(p => p.uid !== currentUser.uid) : participants;

  const allShares = useMemo(() => {
    const shares = new Map<string, MediaStream>();
    if (isSharingScreen && localScreenStreamRef.current && currentUser) {
        shares.set(currentUser.uid, localScreenStreamRef.current);
    }
    remoteScreenStreams.forEach((stream, uid) => {
        shares.set(uid, stream);
    });
    return shares;
  }, [isSharingScreen, remoteScreenStreams, currentUser]);

  useEffect(() => {
    if (allShares.size === 0) {
        setSelectedScreenShareId(null);
        return;
    }
    if (!selectedScreenShareId || !allShares.has(selectedScreenShareId)) {
        setSelectedScreenShareId(allShares.keys().next().value);
    }
  }, [allShares, selectedScreenShareId]);

  const isSomeoneSharing = allShares.size > 0;
  const selectedStream = selectedScreenShareId ? allShares.get(selectedScreenShareId) : null;
  const selectedSharer = participants.find(p => p.uid === selectedScreenShareId);
  
  const thumbnailShares = new Map(allShares);
  if (selectedScreenShareId) {
    thumbnailShares.delete(selectedScreenShareId);
  }

  const ParticipantsGrid = ({ isFilmstrip = false }: { isFilmstrip?: boolean }) => (
    <div
      className={cn(
        isFilmstrip
          ? 'flex flex-row space-x-4 p-2'
          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-8 p-4'
      )}
    >
      {localParticipant && (
        <ParticipantView
          key={localParticipant.uid}
          participant={localParticipant}
          isMuted={isMuted}
          isLocalParticipant={true}
          isSpeaking={speaking.get(localParticipant.uid) || false}
          isFilmstrip={isFilmstrip}
        />
      )}
      {remoteParticipants.map(p => (
        <ParticipantView
          key={p.uid}
          participant={p}
          stream={remoteAudioStreams.get(p.uid)}
          isSpeaking={speaking.get(p.uid) || false}
          isFilmstrip={isFilmstrip}
        />
      ))}
    </div>
  );

  const CallControls = () => (
    <div className="flex items-center justify-center space-x-4">
      {isMobile && (
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="w-16 h-16">
              <MessageSquare className="h-8 w-8" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-full max-w-md bg-card/80 backdrop-blur-[6px]">
            <SheetHeader className="p-4 border-b">
              <SheetTitle>Chat</SheetTitle>
            </SheetHeader>
            {currentUser && <ChatView callId={callId} currentUser={currentUser} />}
          </SheetContent>
        </Sheet>
      )}
      <Button onClick={toggleMute} variant={isMuted ? 'secondary' : 'default'} size="icon" className="w-16 h-16">
        {isMuted ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
      </Button>
      <Button onClick={handleEndCall} variant="destructive" size="icon" className="w-20 h-20">
        <PhoneOff className="h-10 w-10" />
      </Button>
      <Button onClick={toggleScreenShare} variant={isSharingScreen ? "secondary" : "default"} size="icon" className="w-16 h-16">
        {isSharingScreen ? <ScreenShareOff className="h-8 w-8" /> : <ScreenShare className="h-8 w-8" />}
      </Button>
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col md:flex-row items-stretch text-foreground">
      {!isMobile && currentUser && (
        <div className="w-full max-w-sm border-r border-primary/20 flex-shrink-0">
          <ChatView callId={callId} currentUser={currentUser} />
        </div>
      )}

      <div className="relative flex-1 flex flex-col items-stretch">
        <div className="absolute top-6 left-6 z-10">
          <Equalizer />
        </div>
        
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
            {isSomeoneSharing ? (
                <div className='w-full h-full flex flex-col gap-4'>
                    <div ref={mainScreenViewRef} className='flex-1 bg-black/80 backdrop-blur-[6px] border border-primary/20 relative overflow-hidden'>
                        {selectedStream && (
                            <ScreenShareView stream={selectedStream} muted={selectedScreenShareId === currentUser?.uid} />
                        )}
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white px-3 py-1 text-sm rounded">
                           {selectedSharer?.uid === currentUser?.uid ? "You are sharing your screen" : `${selectedSharer?.name || 'Someone'} is sharing`}
                        </div>
                        <div className="absolute top-2 right-2">
                            <Button onClick={handleToggleFullscreen} variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white">
                                {isFullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
                                <span className="sr-only">{isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</span>
                            </Button>
                        </div>
                    </div>

                    <div className={cn("flex-shrink-0", isMobile ? 'h-32' : 'h-48')}>
                      <ScrollArea className='h-full w-full'>
                        <div className="flex flex-row items-center h-full p-2 space-x-4">
                          <ParticipantsGrid isFilmstrip />
                          
                          {thumbnailShares.size > 0 && (
                            <>
                              <div className="h-full w-px bg-border mx-2" />
                              {Array.from(thumbnailShares.entries()).map(([uid, stream]) => {
                                const sharer = participants.find(p => p.uid === uid);
                                return (
                                  <div
                                    key={uid}
                                    onClick={() => setSelectedScreenShareId(uid)}
                                    className={cn(
                                      "relative w-48 h-full flex-shrink-0 cursor-pointer overflow-hidden border-2 bg-black",
                                      selectedScreenShareId === uid ? "border-primary" : "border-transparent hover:border-primary/50"
                                    )}
                                  >
                                    <ScreenShareView stream={stream} muted />
                                    <div className="absolute bottom-1 left-1 bg-black/60 text-white px-2 py-0.5 text-xs rounded">
                                      {sharer?.uid === currentUser?.uid ? "You" : sharer?.name || '...'}
                                    </div>
                                  </div>
                                )
                              })}
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                </div>
            ) : (
                <div className='w-full h-full flex flex-col items-center justify-center'>
                    <h2 className="text-2xl font-bold mb-2">Voice Call</h2>
                    <p className="text-muted-foreground mb-8">{callStatus}</p>
                    <ScrollArea className="flex-grow w-full max-w-5xl">
                        <ParticipantsGrid />
                    </ScrollArea>
                </div>
            )}
        </div>

        <div className="p-6 flex-shrink-0">
          <CallControls />
        </div>
      </div>
    </div>
  );
}

    