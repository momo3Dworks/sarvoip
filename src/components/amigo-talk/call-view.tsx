'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  onSnapshot,
  updateDoc,
  addDoc,
  getDoc,
  writeBatch,
  getDocs,
} from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '../ui/card';

interface CallViewProps {
  callId: string;
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

  const pc = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState('Conectando...');

  useEffect(() => {
    pc.current = new RTCPeerConnection(servers);
    const unsubscribes: (() => void)[] = [];

    const setupStreams = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        localStreamRef.current = stream;

        if (localAudioRef.current) {
            localAudioRef.current.srcObject = stream;
        }

        stream.getTracks().forEach((track) => {
          pc.current?.addTrack(track, stream);
        });

        remoteStreamRef.current = new MediaStream();
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }

        pc.current.ontrack = (event) => {
          event.streams[0].getTracks().forEach((track) => {
            remoteStreamRef.current?.addTrack(track);
          });
          setCallStatus('Conectado');
        };
        
        await setupSignaling();

      } catch (error) {
        console.error("Error accessing media devices.", error);
        toast({
            variant: 'destructive',
            title: 'Acceso a micrófono denegado',
            description: 'Por favor, permite el acceso al micrófono para usar las llamadas de voz.',
        });
        setCallStatus('Acceso a micrófono denegado');
      }
    };

    const setupSignaling = async () => {
        if (pc.current!.signalingState !== 'stable') {
            console.warn("Skipping signaling setup: connection is not in a stable state.");
            return;
        }
        
        const callDocRef = doc(db, 'calls', callId);
        const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

        const callDocSnapshot = await getDoc(callDocRef);

        if (!callDocSnapshot.exists() || !callDocSnapshot.data()?.offer) {
            // Lógica del llamante
            pc.current!.onicecandidate = (event) => {
                event.candidate && addDoc(offerCandidatesRef, event.candidate.toJSON());
            };

            const offerDescription = await pc.current!.createOffer();
            await pc.current!.setLocalDescription(offerDescription);

            const offer = {
                sdp: offerDescription.sdp,
                type: offerDescription.type,
            };

            await updateDoc(callDocRef, { offer });

            const unsub1 = onSnapshot(callDocRef, (snapshot) => {
                const data = snapshot.data();
                if (!pc.current!.currentRemoteDescription && data?.answer) {
                    const answerDescription = new RTCSessionDescription(data.answer);
                    pc.current!.setRemoteDescription(answerDescription);
                }
            });
            unsubscribes.push(unsub1);

            const unsub2 = onSnapshot(answerCandidatesRef, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        pc.current!.addIceCandidate(candidate);
                    }
                });
            });
            unsubscribes.push(unsub2);

        } else {
            // Lógica del que recibe la llamada
            pc.current!.onicecandidate = (event) => {
                event.candidate && addDoc(answerCandidatesRef, event.candidate.toJSON());
            };

            const offer = callDocSnapshot.data()?.offer;
            await pc.current!.setRemoteDescription(new RTCSessionDescription(offer));

            const answerDescription = await pc.current!.createAnswer();
            await pc.current!.setLocalDescription(answerDescription);

            const answer = {
                sdp: answerDescription.sdp,
                type: answerDescription.type,
            };

            await updateDoc(callDocRef, { answer });
            
            const unsub = onSnapshot(offerCandidatesRef, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        pc.current!.addIceCandidate(candidate);
                    }
                });
            });
            unsubscribes.push(unsub);
        }
    };

    setupStreams();
    
    return () => {
        unsubscribes.forEach(unsub => unsub());
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        pc.current?.close();
    };
  }, [callId, toast]);

  const handleEndCall = async () => {
    setCallStatus('Llamada finalizada');

    // Limpiar Firestore
    try {
        const callDocRef = doc(db, 'calls', callId);
        const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
        const answerCandidatesRef = collection(callDocRef, 'answerCandidates');
        
        const offerCandidatesSnap = await getDocs(offerCandidatesRef);
        const answerCandidatesSnap = await getDocs(answerCandidatesRef);
        
        const batch = writeBatch(db);
        offerCandidatesSnap.forEach(doc => batch.delete(doc.ref));
        answerCandidatesSnap.forEach(doc => batch.delete(doc.ref));
        batch.delete(callDocRef);
        await batch.commit();
    } catch (error) {
        console.error("Error cleaning up call documents:", error);
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
  
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground p-4">
        <audio ref={localAudioRef} autoPlay muted playsInline />
        <audio ref={remoteAudioRef} autoPlay playsInline />

        <Card className="w-full max-w-md">
            <CardContent className="p-6 flex flex-col items-center justify-center">
                 <h2 className="text-2xl font-bold mb-2">Llamada de voz</h2>
                 <p className="text-muted-foreground mb-6">{callStatus}</p>

                <div className="flex items-center space-x-8 mb-8">
                    <div className="flex flex-col items-center space-y-2">
                        <Avatar className="h-24 w-24 border-4 border-primary">
                            <AvatarImage src="https://placehold.co/96x96.png" data-ai-hint="person" />
                            <AvatarFallback>TÚ</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">Tú</span>
                    </div>
                    <div className="flex flex-col items-center space-y-2">
                         <Avatar className="h-24 w-24 border-4 border-muted-foreground">
                            <AvatarImage src="https://placehold.co/96x96.png" data-ai-hint="friend portrait" />
                            <AvatarFallback>AM</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">Amigo</span>
                    </div>
                </div>
                
                <div className="flex items-center space-x-4">
                    <Button onClick={toggleMute} variant={isMuted ? "secondary" : "default"} size="icon" className="w-16 h-16 rounded-full">
                        {isMuted ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                    </Button>
                    <Button onClick={handleEndCall} variant="destructive" size="icon" className="w-16 h-16 rounded-full">
                        <PhoneOff className="h-8 w-8" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
