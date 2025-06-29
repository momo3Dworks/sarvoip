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
} from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mic, MicOff, PhoneOff, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '../ui/card';

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

  useEffect(() => {
    if (!currentUser || !callId) return;

    const peerConnections = peersRef.current;
    let localStream: MediaStream;

    const setupCall = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        localStreamRef.current = localStream;
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

      // Add self to participants on join
      await setDoc(doc(callDocRef, 'participants', currentUser.id), { name: currentUser.name });

      const participantsColRef = collection(callDocRef, 'participants');
      const signalingColRef = collection(callDocRef, 'signaling');

      const participantsUnsub = onSnapshot(participantsColRef, (snapshot) => {
        const newParticipants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Participant[];
        setParticipants(newParticipants);

        const currentPeerIds = Array.from(peerConnections.keys());
        const newPeerIds = newParticipants.map(p => p.id).filter(id => id !== currentUser.id);

        // Remove connections for participants who left
        currentPeerIds.forEach(peerId => {
          if (!newPeerIds.includes(peerId)) {
            peerConnections.get(peerId)?.close();
            peerConnections.delete(peerId);
            setRemoteStreams(prev => {
              const newMap = new Map(prev);
              newMap.delete(peerId);
              return newMap;
            });
          }
        });

        // Create connections for new participants
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
              setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.set(peerId, event.streams[0]);
                return newMap;
              });
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
            if (!pc) return;

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
            // Delete message after processing
            await deleteDoc(change.doc.ref);
          }
        });
      });
      
      // I am the initiator
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
         }, 1000); // Wait a bit for the other user to set up listeners
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
    };
  }, [callId, currentUser, toast]);

  const handleEndCall = async () => {
    setCallStatus('Call ended');
    if(currentUser) {
        // Remove myself from participants
        const participantRef = doc(db, 'calls', callId, 'participants', currentUser.id);
        await deleteDoc(participantRef);

        // Update my user status
        const userDocRef = doc(db, 'users', currentUser.id);
        await updateDoc(userDocRef, {
            status: 'online',
            currentCallId: deleteField()
        });
    }
    
    // If I'm the last one, I'll delete the call doc
    if(participants.length <= 1) {
        try {
            const callDocRef = doc(db, 'calls', callId);
            const signalingColRef = collection(callDocRef, 'signaling');
            const participantsColRef = collection(callDocRef, 'participants');
            
            // This is simplified cleanup. In a real app you might want a cloud function.
            const signalingSnap = await getDocs(signalingColRef);
            signalingSnap.forEach(doc => deleteDoc(doc.ref));
            const participantsSnap = await getDocs(participantsColRef);
            participantsSnap.forEach(doc => deleteDoc(doc.ref));
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

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground p-4">
      {[...remoteStreams.values()].map((stream, index) => (
        <audio key={index} autoPlay playsInline ref={audio => { if(audio) audio.srcObject = stream }} />
      ))}
      <Card className="w-full max-w-lg">
        <CardContent className="p-6 flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold mb-2">Voice Call</h2>
          <p className="text-muted-foreground mb-6">{callStatus}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            {participants.map(p => (
              <div key={p.id} className="flex flex-col items-center space-y-2">
                <Avatar className="h-24 w-24 border-4 border-primary">
                   <AvatarImage src={`https://placehold.co/96x96.png?text=${p.name.charAt(0)}`} data-ai-hint="person" />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{p.id === currentUser?.id ? 'You' : p.name}</span>
              </div>
            ))}
             {participants.length === 0 && (
                <div className="flex flex-col items-center space-y-2">
                    <UserIcon className="h-24 w-24 text-muted-foreground" />
                    <span className="font-medium">Connecting...</span>
                </div>
             )}
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
