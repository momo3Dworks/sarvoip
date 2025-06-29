
"use client";

import React, { useState, useEffect, useRef, useContext } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, limit, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Paperclip, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { resizeImage } from '@/lib/utils';

const emojis = [
  '😊', '😂', '❤️', '👍', '🤔', '🎉', '🔥', '🙏', '😍', '😭', '🤯', '🥳',
  '😎', '🚀', '💯', '🙌', '💀', '💩', '👻', '🦄', '🌮', '🍕', '💻', '💡'
];

interface LobbyMessage {
  id: string;
  text?: string;
  imageUrl?: string;
  senderId: string;
  senderName: string | null;
  timestamp: any;
}

interface TypingUser {
    uid: string;
    name: string | null;
}

const Message = ({ message }: { message: LobbyMessage }) => {
    const senderName = message.senderName || "Anonymous";
    return (
        <div>
            <span className="font-black uppercase">{senderName}:</span>
            {message.text && <span className="ml-2">{message.text}</span>}
            {message.imageUrl && (
                <div className="ml-2 mt-1">
                    <img 
                        src={message.imageUrl} 
                        alt="Shared content" 
                        className="rounded-md max-w-xs h-auto my-1 border cursor-pointer"
                        onClick={() => window.open(message.imageUrl, '_blank')}
                    />
                </div>
            )}
        </div>
    );
};

const TypingIndicator = ({ users }: { users: TypingUser[] }) => {
    if (users.length === 0) return null;

    const names = users.map(u => u.name || "Anonymous").join(', ');
    const verb = users.length > 1 ? 'are' : 'is';

    return (
        <div className="flex items-center text-sm text-muted-foreground">
            <span>{names} {verb} typing</span>
            <div className="flex items-end ml-1">
                <span className="animate-bounce w-1 h-1 bg-muted-foreground rounded-full"></span>
                <span className="animate-bounce delay-150 w-1 h-1 bg-muted-foreground rounded-full mx-0.5"></span>
                <span className="animate-bounce delay-300 w-1 h-1 bg-muted-foreground rounded-full"></span>
            </div>
        </div>
    )
}

export function LobbyChat() {
    const { user: currentUser } = useContext(UserContext);
    const { toast } = useToast();
    const [messages, setMessages] = useState<LobbyMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

    const [isFocused, setIsFocused] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isChatActive = isFocused || isHovering;
    const isMobile = useIsMobile();
    const ChatContainer = isMobile ? 'div' : Card;

    useEffect(() => {
        if (!currentUser) return;
        const messagesColRef = collection(db, 'lobby_chat');
        const q = query(messagesColRef, orderBy('timestamp', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LobbyMessage)).reverse();
            setMessages(newMessages);
        }, (error) => {
            console.error("Lobby chat snapshot error: ", error);
            toast({
                variant: "destructive",
                title: "Chat Error",
                description: "Could not load lobby messages. Check permissions or connection."
            });
        });

        return () => unsubscribe();
    }, [currentUser, toast]);

     useEffect(() => {
        if (!currentUser) return;
        const typingColRef = collection(db, 'lobby_typing');
        
        const unsubscribe = onSnapshot(typingColRef, (snapshot) => {
            const users = snapshot.docs
                .map(doc => ({ uid: doc.id, ...doc.data() } as TypingUser))
                .filter(u => u.uid !== currentUser.uid);
            setTypingUsers(users);
        }, (error) => {
            console.error("Typing indicator snapshot error: ", error);
            toast({
                variant: "destructive",
                title: "Chat Error",
                description: "Could not load typing indicators. Check permissions or connection."
            });
        });

        return () => unsubscribe();
     }, [currentUser, toast]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTop = viewport.scrollHeight;
            }
        }
    }, [messages]);

    const updateTypingStatus = () => {
        if (!currentUser) return;
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        const typingDocRef = doc(db, 'lobby_typing', currentUser.uid);
        setDoc(typingDocRef, { name: currentUser.name, uid: currentUser.uid, timestamp: serverTimestamp() });

        typingTimeoutRef.current = setTimeout(() => {
            deleteDoc(typingDocRef);
        }, 3000);
    };

    const sendMessage = async (text: string, imageUrl?: string) => {
        if (!currentUser || (text.trim() === '' && !imageUrl)) return;

        const messagesColRef = collection(db, 'lobby_chat');
        await addDoc(messagesColRef, {
            text: text.trim(),
            imageUrl: imageUrl || null,
            senderId: currentUser.uid,
            senderName: currentUser.name,
            timestamp: serverTimestamp(),
        });

        setNewMessage('');
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        deleteDoc(doc(db, 'lobby_typing', currentUser.uid));
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await sendMessage(newMessage);
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


    if (!currentUser) return null;

    return (
        <ChatContainer 
            className={cn(
                "flex flex-col h-full w-full transition-opacity duration-300", 
                !isMobile && "bg-card/80 backdrop-blur-[6px] border border-primary/20",
                isChatActive ? 'opacity-100' : 'opacity-40'
            )}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {!isMobile && (
                <CardHeader>
                    <CardTitle>Lobby Chat</CardTitle>
                </CardHeader>
            )}
            <CardContent className="flex-1 overflow-hidden p-2 md:p-6 flex flex-col">
                <ScrollArea className="flex-grow pr-4 lobby-chat-scrollbar" ref={scrollAreaRef}>
                    <div className="space-y-4">
                        {messages.map((msg) => <Message key={msg.id} message={msg} /> )}
                    </div>
                </ScrollArea>
                <div className="h-6 pt-1 flex-shrink-0">
                    <TypingIndicator users={typingUsers} />
                </div>
            </CardContent>
            <CardFooter className="p-2 md:p-4 border-t">
                <form onSubmit={handleFormSubmit} className="flex w-full items-center gap-2">
                    <Input
                        value={newMessage}
                        onChange={(e) => {
                            setNewMessage(e.target.value);
                            updateTypingStatus();
                        }}
                        placeholder="Type a message..."
                        autoComplete="off"
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
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
                            <div className="grid grid-cols-6 gap-2">
                                {emojis.map(emoji => (
                                <Button key={emoji} variant="ghost" size="icon" onClick={() => handleEmojiSelect(emoji)} className="text-xl">
                                    {emoji}
                                </Button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                    <Button type="submit">Send</Button>
                </form>
            </CardFooter>
        </ChatContainer>
    );
}
