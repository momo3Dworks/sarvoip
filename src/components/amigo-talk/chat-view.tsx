
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
import { Paperclip, Smile } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { resizeImage } from '@/lib/utils';

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
  text?: string;
  imageUrl?: string;
  senderId: string;
  senderName: string | null;
  timestamp: any;
}

const emojis = ['😊', '😂', '❤️', '👍', '🤔', '🎉', '🔥', '🙏'];

export function ChatView({ callId, currentUser }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  const sendMessage = async (text: string, imageUrl?: string) => {
    if (text.trim() === '' && !imageUrl) return;

    const messagesColRef = collection(db, 'calls', callId, 'messages');
    await addDoc(messagesColRef, {
      text: text.trim(),
      imageUrl: imageUrl || null,
      senderId: currentUser.uid,
      senderName: currentUser.name || "Anonymous",
      timestamp: serverTimestamp(),
    });

    setNewMessage('');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(newMessage);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select an image file.' });
      return;
    }

    try {
      const resizedImageUrl = await resizeImage(file, 800, 800);
      await sendMessage(newMessage, resizedImageUrl);
    } catch (error) {
      console.error("Error processing image:", error);
      toast({ variant: 'destructive', title: 'Image Upload Failed', description: 'Could not process the image. Please try again.' });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="Shared content"
                      className="rounded-md max-w-full h-auto my-2 cursor-pointer"
                      onClick={() => window.open(msg.imageUrl, '_blank')}
                    />
                  )}
                  {msg.text && <p>{msg.text}</p>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <form onSubmit={handleFormSubmit} className="flex w-full items-center gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            autoComplete="off"
          />
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
          <Button variant="outline" size="icon" type="button" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-5 w-5" />
          </Button>
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
