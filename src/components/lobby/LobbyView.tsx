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
  query,
  where,
} from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, LogOut, Loader2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { LobbyChat } from './LobbyChat';
import { useIsMobile } from '@/hooks/use-mobile';

interface OnlineUser {
  uid: string;
  name: string | null;
  status: 'online' | 'in-call';
  currentCallId?: string;
}

export function LobbyView() {
  const { user: currentUser, logout } = useContext(UserContext);
  const router = useRouter();
  const { toast } = useToast();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!currentUser) return;

    // Set user presence in Firestore
    const userDocRef = doc(db, 'users', currentUser.uid);
    setDoc(userDocRef, { name: currentUser.name, status: 'online', last_seen: serverTimestamp() }, { merge: true });

    // Listen for other users
    const usersCollectionRef = collection(db, 'users');
    const q = query(usersCollectionRef, where("status", "in", ["online", "in-call"]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users: OnlineUser[] = [];
      snapshot.forEach((doc) => {
        // Exclude current user from the list
        if (doc.id !== currentUser.uid) {
          users.push({ uid: doc.id, ...doc.data() } as OnlineUser);
        } else {
            // Check my own status for redirecting to a call
            const myData = doc.data();
            if(myData.status === 'in-call' && myData.currentCallId) {
                if(!window.location.pathname.includes('/call/')) {
                    router.push(`/call/${myData.currentCallId}`);
                }
            }
        }
      });
      setOnlineUsers(users);
      setIsLoading(false);
    }, (error) => {
        console.error("Lobby users snapshot error: ", error);
        toast({ variant: "destructive", title: "Connection Error", description: "Could not fetch online users."});
        setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, router, toast]);

  const handleStartCall = async (targetUser: OnlineUser) => {
    if (!currentUser) return;

    try {
      const callDocRef = await addDoc(collection(db, "calls"), {
        createdAt: serverTimestamp(),
        initiator: currentUser.uid,
      });
      const callId = callDocRef.id;

      const currentUserDocRef = doc(db, 'users', currentUser.uid);
      const targetUserDocRef = doc(db, 'users', targetUser.uid);
      
      await updateDoc(currentUserDocRef, { status: 'in-call', currentCallId: callId });
      await updateDoc(targetUserDocRef, { status: 'in-call', currentCallId: callId });
      
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

  const handleJoinCall = async (callId: string) => {
    if(!currentUser) return;
    try {
        const currentUserDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(currentUserDocRef, { status: 'in-call', currentCallId: callId });
        router.push(`/call/${callId}`);
    } catch(error) {
        console.error("Error joining call:", error);
        toast({
            variant: "destructive",
            title: "Failed to join call",
            description: "The call may no longer be active.",
        });
    }
  };
  
  const displayName = (user: OnlineUser) => user.name || "Anonymous";

  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <div className="flex h-full w-full max-w-7xl flex-col md:flex-row md:gap-6">
        <Card className="flex w-full flex-col md:w-1/2 lg:w-2/5 bg-card/70 backdrop-blur-[4px] border border-primary/20">
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
                        <p className='text-sm'>Invite others by sharing the URL!</p>
                    </div>
                ) : (
                    <ScrollArea className="flex-1 px-6">
                    <ul className="space-y-2">
                        {onlineUsers.map((user) => (
                        <li
                            key={user.uid}
                            className="flex items-center space-x-4 p-2 rounded-lg hover:bg-muted transition-colors"
                        >
                            <Avatar>
                            <AvatarImage src={`https://placehold.co/40x40.png?text=${displayName(user).charAt(0)}`} data-ai-hint="person portrait" />
                            <AvatarFallback>{displayName(user).charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                            <p className="font-semibold">{displayName(user)}</p>
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
            
            {isMobile && <LobbyChat />}

            <div className='flex-shrink-0 p-4 border-t text-sm text-muted-foreground'>
                Welcome, <span className='font-semibold text-foreground'>{currentUser?.name || 'User'}</span>
            </div>
        </Card>
        
        {!isMobile && (
            <div className="hidden md:flex flex-1 flex-col">
                <LobbyChat />
            </div>
        )}
      </div>
    </div>
  );
}
