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
  serverTimestamp,
  deleteField,
  getDocs,
} from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '../ui/card';
import { Equalizer } from './equalizer';
import { ChatView } from './chat-view';
import { ParticipantView } from './participant-view';

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

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState('Connecting...');

  // Voice Activity Detection
  const [speaking, setSpeaking] = useState<Map<string, boolean>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>>(new Map());
  const localAnalyserRef = useRef<{ analyser: AnalyserNode; source: MediaStreamAudioSourceNode } | null>(null);


  useEffect(() => {
    if (!currentUser || !callId) return;

    const peerConnections = peersRef.current;
    let localStream: MediaStream;

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

      const callDocRef = doc(db, 'calls', callId);
      await setDoc(doc(callDocRef, 'participants', currentUser.id), { name: currentUser.name });

      const participantsColRef = collection(callDocRef, 'participants');
      const signalingColRef = collection(callDocRef, 'signaling');

      const participantsUnsub = onSnapshot(participantsColRef, (snapshot) => {
        const newParticipants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Participant[];
        setParticipants(newParticipants);

        const currentPeerIds = Array.from(peerConnections.keys());
        const newPeerIds = newParticipants.map(p => p.id).filter(id => id !== currentUser.id);

        currentPeerIds.forEach(peerId => {
          if (!newPeerIds.includes(peerId)) {
            peerConnections.get(peerId)?.close();
            peerConnections.delete(peerId);
            analysersRef.current.get(peerId)?.source.disconnect();
            analysersRef.current.delete(peerId);
            setRemoteStreams(prev => {
              const newMap = new Map(prev);
              newMap.delete(peerId);
              return newMap;
            });
          }
        });

        newPeerIds.forEach(peerId => {
          if (!peerConnections.has(peerId)) {
            const pc = new RTCPeerConnection(servers);
            peerConnections.set(peerId, pc);

            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            pc.onicecandidate = event => {
              if (event.candidate) {
                addDoc(signalingColRef, {
                  from: currentUser.id,
                  to: peerId,
                  candidate: event.candidate.toJSON(),
                });
              }
            };

            pc.ontrack = event => {
              const stream = event.streams[0];
              setRemoteStreams(prev => new Map(prev).set(peerId, stream));
              
              if (audioContextRef.current && !analysersRef.current.has(peerId)) {
                const analyser = audioContextRef.current.createAnalyser();
                const source = audioContextRef.current.createMediaStreamSource(stream);
                source.connect(analyser);
                analysersRef.current.set(peerId, { analyser, source });
              }
            };
            
            setCallStatus('Connected');
          }
        });
      });
      
      const signalingUnsub = onSnapshot(signalingColRef, snapshot => {
        snapshot.docChanges().forEach(async change => {
          if (change.type === 'added') {
            const message = change.doc.data();
            if (message.to !== currentUser.id) return;
            
            const peerId = message.from;
            const pc = peerConnections.get(peerId);
            if (!pc || pc.signalingState !== 'stable') return;

            if (message.offer) {
              await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await addDoc(signalingColRef, { from: currentUser.id, to: peerId, answer });
            } else if (message.answer) {
              await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
            } else if (message.candidate) {
               try {
                await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
               } catch (e) {
                console.error('Error adding received ice candidate', e);
               }
            }
            await deleteDoc(change.doc.ref);
          }
        });
      });
      
      const callDocSnap = await getDoc(callDocRef);
      if (callDocSnap.data()?.initiator === currentUser.id){
         const targetUserId = callDocSnap.data()?.target;
         setTimeout(async () => {
             const pc = peerConnections.get(targetUserId);
             if (pc) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await addDoc(signalingColRef, { from: currentUser.id, to: targetUserId, offer });
             }
         }, 1000);
      }

      return () => {
        participantsUnsub();
        signalingUnsub();
      };
    };

    const unsubscribePromise = setupCall();

    return () => {
        unsubscribePromise.then(unsub => unsub && unsub());
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        peerConnections.forEach(pc => pc.close());
        peerConnections.clear();
        analysersRef.current.forEach(({ source }) => source.disconnect());
        analysersRef.current.clear();
        localAnalyserRef.current?.source.disconnect();
        audioContextRef.current?.close().catch(console.error);
        audioContextRef.current = null;
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
                for (const amplitude of dataArray) {
                    sum += amplitude * amplitude;
                }
                const level = Math.sqrt(sum / dataArray.length);
                const isCurrentlySpeaking = !isLocalAndMuted && level > 5;
                if (speaking.get(id) !== isCurrentlySpeaking) {
                    changed = true;
                }
                newSpeaking.set(id, isCurrentlySpeaking);
            };

            if (localAnalyserRef.current && currentUser) {
                checkLevel(localAnalyserRef.current.analyser, currentUser.id, isMuted);
            }

            analysersRef.current.forEach(({ analyser }, peerId) => {
                checkLevel(analyser, peerId, false);
            });

            if (changed) {
                setSpeaking(new Map(newSpeaking));
            }
            animationFrameId = requestAnimationFrame(checkSpeaking);
        };

        if(audioContextRef.current) {
            checkSpeaking();
        }

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [speaking, isMuted, currentUser]);


  const handleEndCall = async () => {
    setCallStatus('Call ended');
    if(currentUser) {
        const participantRef = doc(db, 'calls', callId, 'participants', currentUser.id);
        await deleteDoc(participantRef);

        const userDocRef = doc(db, 'users', currentUser.id);
        await updateDoc(userDocRef, {
            status: 'online',
            currentCallId: deleteField()
        });
    }
    
    if(participants.length <= 1) {
        try {
            const callDocRef = doc(db, 'calls', callId);
            const signalingColRef = collection(callDocRef, 'signaling');
            const participantsColRef = collection(callDocRef, 'participants');
            const messagesColRef = collection(callDocRef, 'messages');
            
            const signalingSnap = await getDocs(signalingColRef);
            signalingSnap.forEach(doc => deleteDoc(doc.ref));
            const participantsSnap = await getDocs(participantsColRef);
            participantsSnap.forEach(doc => deleteDoc(doc.ref));
            const messagesSnap = await getDocs(messagesColRef);
            messagesSnap.forEach(doc => deleteDoc(doc.ref));
            await deleteDoc(callDocRef);
        } catch (error) {
            console.error("Error cleaning up call documents:", error);
        }
    }

    router.push('/');
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
    });
    setIsMuted(prev => !prev);
  };

  const localParticipant = currentUser ? participants.find(p => p.id === currentUser.id) : null;
  const remoteParticipants = currentUser ? participants.filter(p => p.id !== currentUser.id) : participants;

  return (
    <div className="flex h-screen w-full flex-row items-center justify-center gap-8 bg-background p-8 text-foreground">
      {currentUser && <ChatView callId={callId} currentUser={currentUser} />}
      <div className="relative flex h-full flex-col items-center justify-center">
        <div className="absolute top-6 left-6 z-10">
          <Equalizer />
        </div>
        <Card className="w-full max-w-4xl">
          <CardContent className="p-8 flex flex-col items-center justify-center">
            <h2 className="text-2xl font-bold mb-2">Voice Call</h2>
            <p className="text-muted-foreground mb-8">{callStatus}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-8 mb-8">
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
            
            <div className="flex items-center space-x-6">
              <Button onClick={toggleMute} variant={isMuted ? "secondary" : "default"} size="icon" className="w-16 h-16 rounded-full">
                {isMuted ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </Button>
              <Button onClick={handleEndCall} variant="destructive" size="icon" className="w-20 h-20 rounded-full">
                <PhoneOff className="h-10 w-10" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
