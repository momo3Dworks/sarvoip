'use client';

import React, { useState, useEffect, useRef, useContext } from 'react';
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
  getDoc,
  deleteField,
  getDocs,
  query,
  writeBatch,
} from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '../ui/card';
import { Equalizer } from './equalizer';
import { ChatView } from './chat-view';
import { ParticipantView } from './participant-view';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '../ui/scroll-area';

interface CallViewProps {
  callId: string;
}

interface Participant {
  id: string;
  name: string;
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
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState('Connecting...');

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

      await setDoc(doc(participantsColRef, currentUser.id), { name: currentUser.name });

      const participantsUnsub = onSnapshot(participantsColRef, (snapshot) => {
        const currentParticipants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Participant[]);
        setParticipants(currentParticipants);
        const remoteParticipants = currentParticipants.filter(p => p.id !== currentUser.id);

        // Remove connections for participants who have left
        peersRef.current.forEach((pc, peerId) => {
            if (!remoteParticipants.some(p => p.id === peerId)) {
                pc.close();
                peersRef.current.delete(peerId);
                analysersRef.current.get(peerId)?.source.disconnect();
                analysersRef.current.delete(peerId);
                setRemoteStreams(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(peerId);
                    return newMap;
                });
            }
        });

        // Create connections for new participants
        remoteParticipants.forEach(async (participant) => {
            if (peersRef.current.has(participant.id)) return;

            const pc = new RTCPeerConnection(servers);
            peersRef.current.set(participant.id, pc);

            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            pc.onicecandidate = event => {
                if (event.candidate) {
                    addDoc(signalingColRef, { from: currentUser.id, to: participant.id, candidate: event.candidate.toJSON() });
                }
            };

            pc.ontrack = event => {
                const stream = event.streams[0];
                setRemoteStreams(prev => new Map(prev).set(participant.id, stream));
                if (audioContextRef.current && !analysersRef.current.has(participant.id)) {
                    const analyser = audioContextRef.current.createAnalyser();
                    const source = audioContextRef.current.createMediaStreamSource(stream);
                    source.connect(analyser);
                    analysersRef.current.set(participant.id, { analyser, source });
                }
            };
            
            // Create and send offer
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (pc.localDescription) {
                    await addDoc(signalingColRef, { from: currentUser.id, to: participant.id, offer: pc.localDescription.toJSON() });
                }
            } catch (err) {
                console.error("Error creating offer:", err);
            }
        });
        setCallStatus('Connected');
      });
      
      const signalingUnsub = onSnapshot(query(signalingColRef), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const message = change.doc.data();
                if (message.to !== currentUser.id) return;

                const peerId = message.from;
                const pc = peersRef.current.get(peerId);
                if (!pc) return;

                try {
                    if (message.offer) {
                        if (pc.signalingState !== 'stable') {
                            console.warn("Glare condition: received offer while not in stable state. Ignoring.");
                            return;
                        }
                        await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        if (pc.localDescription) {
                            await addDoc(signalingColRef, { from: currentUser.id, to: peerId, answer: pc.localDescription.toJSON() });
                        }
                    } else if (message.answer) {
                        await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
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
            }
        });
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
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
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
                checkLevel(localAnalyserRef.current.analyser, currentUser.id, isMuted);
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

  const handleEndCall = async () => {
    setCallStatus('Call ended');
    if(currentUser) {
        await deleteDoc(doc(db, 'calls', callId, 'participants', currentUser.id));
        const userDocRef = doc(db, 'users', currentUser.id);
        if (await getDoc(userDocRef)) {
            await updateDoc(userDocRef, {
                status: 'online',
                currentCallId: deleteField()
            });
        }
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

  const localParticipant = currentUser ? participants.find(p => p.id === currentUser.id) : null;
  const remoteParticipants = currentUser ? participants.filter(p => p.id !== currentUser.id) : participants;

  const ParticipantsGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-8 p-4">
      {localParticipant && (
        <ParticipantView
          key={localParticipant.id}
          participant={localParticipant}
          isMuted={isMuted}
          isLocalParticipant={true}
          isSpeaking={speaking.get(localParticipant.id) || false}
        />
      )}
      {remoteParticipants.map(p => (
        <ParticipantView
          key={p.id}
          participant={p}
          stream={remoteStreams.get(p.id)}
          isSpeaking={speaking.get(p.id) || false}
        />
      ))}
    </div>
  );

  const CallControls = () => (
    <div className="flex items-center space-x-4">
        {isMobile && (
            <Sheet>
                <SheetTrigger asChild>
                     <Button variant="outline" size="icon" className="w-16 h-16 rounded-full">
                        <MessageSquare className="h-8 w-8" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-full max-w-md">
                    <SheetHeader className="p-4 border-b">
                        <SheetTitle>Chat</SheetTitle>
                    </SheetHeader>
                    {currentUser && <ChatView callId={callId} currentUser={currentUser} />}
                </SheetContent>
            </Sheet>
        )}
      <Button onClick={toggleMute} variant={isMuted ? "secondary" : "default"} size="icon" className="w-16 h-16 rounded-full">
        {isMuted ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
      </Button>
      <Button onClick={handleEndCall} variant="destructive" size="icon" className="w-20 h-20 rounded-full">
        <PhoneOff className="h-10 w-10" />
      </Button>
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col md:flex-row items-stretch bg-background text-foreground">
        {/* Desktop Chat View */}
        {!isMobile && currentUser && (
            <div className="w-full max-w-sm border-r">
                 <ChatView callId={callId} currentUser={currentUser} />
            </div>
        )}

      <div className="relative flex-1 flex flex-col items-center justify-center p-4">
        <div className="absolute top-6 left-6 z-10">
          <Equalizer />
        </div>
        <Card className="w-full h-full flex flex-col items-center justify-between border-0 md:border shadow-none">
          <CardContent className="w-full flex flex-col items-center justify-center p-2 md:p-8">
            <h2 className="text-2xl font-bold mb-2">Voice Call</h2>
            <p className="text-muted-foreground mb-8">{callStatus}</p>
          </CardContent>
          
          <ScrollArea className="flex-grow w-full">
            <ParticipantsGrid />
          </ScrollArea>
          
          <div className="p-6">
            <CallControls />
          </div>
        </Card>
      </div>
    </div>
  );
}
