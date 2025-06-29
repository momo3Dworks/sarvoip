"use client";

import React, { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, LogOut, Loader2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '../ui/scroll-area';

interface OnlineUser {
  id: string;
  name: string;
  status: 'online' | 'in-call';
  currentCallId?: string;
}

export function LobbyView() {
  const { user: currentUser, logout } = useContext(UserContext);
  const router = useRouter();
  const { toast } = useToast();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const userDocRef = doc(db, 'users', currentUser.id);

    // Set user as online
    setDoc(userDocRef, { name: currentUser.name, status: 'online', last_seen: serverTimestamp() }, { merge: true });

    const handleBeforeUnload = () => {
        // This is not guaranteed to run, but it's a good fallback
        deleteDoc(userDocRef);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Listen for user changes
    const usersCollectionRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCollectionRef, (snapshot) => {
      const users: OnlineUser[] = [];
      snapshot.forEach((doc) => {
        if (doc.id !== currentUser.id) {
          users.push({ id: doc.id, ...doc.data() } as OnlineUser);
        } else {
            // Check if I am being called
            const myData = doc.data();
            if(myData.status === 'in-call' && myData.currentCallId) {
                router.push(`/call/${myData.currentCallId}`);
            }
        }
      });
      setOnlineUsers(users);
      setIsLoading(false);
    });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // On component unmount (e.g., logout), set user offline
      deleteDoc(userDocRef);
      unsubscribe();
    };
  }, [currentUser, router]);

  const handleStartCall = async (targetUser: OnlineUser) => {
    if (!currentUser) return;

    try {
      // Create a new call document
      const callDocRef = await addDoc(collection(db, "calls"), {
        createdAt: serverTimestamp(),
        initiator: currentUser.id,
        target: targetUser.id,
        participants: {},
      });
      const callId = callDocRef.id;

      // Update both users' status to 'in-call'
      const currentUserDocRef = doc(db, 'users', currentUser.id);
      const targetUserDocRef = doc(db, 'users', targetUser.id);
      
      await updateDoc(currentUserDocRef, { status: 'in-call', currentCallId: callId });
      await updateDoc(targetUserDocRef, { status: 'in-call', currentCallId: callId });
      
      // The local user is redirected immediately
      router.push(`/call/${callId}`);

    } catch (error) {
      console.error("Error starting call:", error);
      toast({
        variant: "destructive",
        title: "Failed to start call",
        description: "Please check your internet connection and try again.",
      });
    }
  };

  const handleJoinCall = (callId: string) => {
     router.push(`/call/${callId}`);
  };

  const getCallParticipantNames = (callId: string): string => {
    const participantsInCall = onlineUsers.filter(u => u.currentCallId === callId);
    return participantsInCall.map(p => p.name).join(', ');
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md h-[70vh] flex flex-col">
        <CardHeader className='flex-shrink-0'>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl">Lobby</CardTitle>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : onlineUsers.length === 0 ? (
             <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-4">
                <Users className="h-16 w-16 mb-4" />
                <h3 className='text-lg font-semibold'>You're the first one here!</h3>
                <p className='text-sm'>Share the page URL to invite others.</p>
             </div>
          ) : (
            <ScrollArea className="flex-1 px-6">
              <ul className="space-y-2">
                {onlineUsers.map((user) => (
                  <li
                    key={user.id}
                    className="flex items-center space-x-4 p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Avatar>
                      <AvatarImage src={`https://placehold.co/40x40.png?text=${user.name.charAt(0)}`} data-ai-hint="person portrait" />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{user.name}</p>
                      {user.status === 'in-call' && user.currentCallId ? (
                        <p className="text-xs text-primary">In a call</p>
                      ) : (
                        <p className="text-xs text-green-400">Online</p>
                      )}
                    </div>
                    {user.status === 'online' ? (
                      <Button size="sm" onClick={() => handleStartCall(user)}>
                        <Phone className="mr-2 h-4 w-4" /> Call
                      </Button>
                    ) : (
                       user.currentCallId && (
                         <Button size="sm" variant="secondary" onClick={() => handleJoinCall(user.currentCallId!)}>
                            Join Call
                         </Button>
                       )
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
         <div className='flex-shrink-0 p-4 border-t text-sm text-muted-foreground'>
            Welcome, <span className='font-semibold text-foreground'>{currentUser?.name}</span>
         </div>
      </Card>
    </div>
  );
}
