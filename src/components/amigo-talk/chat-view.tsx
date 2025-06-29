"use client";

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';

interface User {
  uid: string;
  name: string | null;
}

interface ChatViewProps {
  callId: string;
  currentUser: User;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string | null;
  timestamp: any;
}

const emojis = ['😊', '😂', '❤️', '👍', '🤔', '🎉', '🔥', '🙏'];

export function ChatView({ callId, currentUser }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const messagesColRef = collection(db, 'calls', callId, 'messages');
    const q = query(messagesColRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(newMessages);
    });

    return () => unsubscribe();
  }, [callId]);

  useEffect(() => {
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;

    const messagesColRef = collection(db, 'calls', callId, 'messages');
    await addDoc(messagesColRef, {
      text: newMessage,
      senderId: currentUser.uid,
      senderName: currentUser.name || "Anonymous",
      timestamp: serverTimestamp(),
    });

    setNewMessage('');
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };
  
  const displayName = (name: string | null) => name || "Anonymous";

  return (
    <div className="w-full h-full flex flex-col bg-card">
      <CardHeader className="hidden md:block">
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 py-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${
                  msg.senderId === currentUser.uid ? 'justify-end' : ''
                }`}
              >
                {msg.senderId !== currentUser.uid && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`https://placehold.co/32x32.png?text=${displayName(msg.senderName).charAt(0)}`} data-ai-hint="person" />
                    <AvatarFallback>{displayName(msg.senderName).charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[75%] rounded-lg p-3 text-sm ${
                    msg.senderId === currentUser.uid
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.senderId !== currentUser.uid && (
                    <p className="font-semibold mb-1">{displayName(msg.senderName)}</p>
                  )}
                  <p>{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            autoComplete="off"
          />
           <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" type="button">
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <div className="grid grid-cols-4 gap-2">
                {emojis.map(emoji => (
                  <Button
                    key={emoji}
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEmojiSelect(emoji)}
                    className="text-xl"
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button type="submit">Send</Button>
        </form>
      </CardFooter>
    </div>
  );
}
