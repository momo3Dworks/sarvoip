
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Smile, Gift, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';


const GIPHY_API_KEY = 'YOUR_GIPHY_API_KEY_HERE'; 

const emojis = [
  '😊', '😂', '❤️', '👍', '🤔', '🎉', '🔥', '🙏', '😍', '😭', '🤯', '🥳',
  '😎', '🚀', '💯', '🙌', '💀', '💩', '👻', '🦄', '🌮', '🍕', '💻', '💡'
];

interface LobbyMessage {
  id: string;
  text: string; 
  type: 'text' | 'gif';
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
            {message.type === 'text' ? (
                <span className="ml-2">{message.text}</span>
            ) : (
                <img src={message.text} alt="GIF" className="mt-2 rounded-md max-w-xs" />
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
    
    const [gifSearchTerm, setGifSearchTerm] = useState("");
    const [debouncedGifSearchTerm, setDebouncedGifSearchTerm] = useState("");
    const [gifResults, setGifResults] = useState<any[]>([]);
    const [isSearchingGifs, setIsSearchingGifs] = useState(false);

    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const isChatActive = isFocused || isHovering;

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

    useEffect(() => {
        const handler = setTimeout(() => {
          setDebouncedGifSearchTerm(gifSearchTerm);
        }, 500);
    
        return () => {
          clearTimeout(handler);
        };
    }, [gifSearchTerm]);

    useEffect(() => {
        if (debouncedGifSearchTerm.trim() === "") {
            setGifResults([]);
            return;
        }

        const searchGifs = async () => {
            if (GIPHY_API_KEY === 'YOUR_GIPHY_API_KEY_HERE') {
                console.warn("GIPHY API Key not set. Please update it in LobbyChat.tsx");
                return;
            }
            setIsSearchingGifs(true);
            try {
                const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(debouncedGifSearchTerm)}&limit=12`);
                const { data } = await response.json();
                setGifResults(data || []);
            } catch (error) {
                console.error("Failed to fetch GIFs from GIPHY", error);
            } finally {
                setIsSearchingGifs(false);
            }
        };

        searchGifs();
    }, [debouncedGifSearchTerm]);

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

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === '' || !currentUser) return;

        const messagesColRef = collection(db, 'lobby_chat');
        await addDoc(messagesColRef, {
            text: newMessage.trim(),
            type: 'text',
            senderId: currentUser.uid,
            senderName: currentUser.name,
            timestamp: serverTimestamp(),
        });

        setNewMessage('');
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        deleteDoc(doc(db, 'lobby_typing', currentUser.uid));
    };
    
    const handleSendGif = async (gifUrl: string) => {
        if (!currentUser) return;
        const messagesColRef = collection(db, 'lobby_chat');
        await addDoc(messagesColRef, {
            text: gifUrl,
            type: 'gif',
            senderId: currentUser.uid,
            senderName: currentUser.name,
            timestamp: serverTimestamp(),
        });
    };

    const handleEmojiSelect = (emoji: string) => {
        setNewMessage(prev => prev + emoji);
    };

    const isMobile = useIsMobile();
    const ChatContainer = isMobile ? 'div' : Card;

    if (!currentUser) return null;

    return (
        <ChatContainer 
            className={cn(
                "flex flex-col h-full w-full transition-opacity duration-300", 
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
                <ScrollArea className="flex-grow pr-4" ref={scrollAreaRef}>
                    <div className="space-y-4">
                        {messages.map((msg) => <Message key={msg.id} message={msg} /> )}
                    </div>
                </ScrollArea>
                <div className="h-6 pt-1 flex-shrink-0">
                    <TypingIndicator users={typingUsers} />
                </div>
            </CardContent>
            <CardFooter className="p-2 md:p-4 border-t">
                <form onSubmit={handleSendMessage} className="flex w-full items-center gap-2">
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
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" type="button">
                                <Smile className="h-5 w-5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 border-2">
                             <Tabs defaultValue="emoji">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="emoji"><Smile className="mr-2" /> Emojis</TabsTrigger>
                                    <TabsTrigger value="gif"><Gift className="mr-2" /> GIFs</TabsTrigger>
                                </TabsList>
                                <TabsContent value="emoji" className="mt-4">
                                    <div className="grid grid-cols-6 gap-2">
                                        {emojis.map(emoji => (
                                        <Button key={emoji} variant="ghost" size="icon" onClick={() => handleEmojiSelect(emoji)} className="text-xl">
                                            {emoji}
                                        </Button>
                                        ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="gif" className="mt-4">
                                    <Input 
                                        placeholder="Search for GIFs..." 
                                        value={gifSearchTerm}
                                        onChange={(e) => setGifSearchTerm(e.target.value)}
                                    />
                                    {isSearchingGifs ? (
                                        <div className="flex justify-center items-center h-24">
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                        </div>
                                    ) : (
                                        <ScrollArea className="h-48 mt-2">
                                            <div className="grid grid-cols-3 gap-2 pr-4">
                                            {gifResults.map(gif => (
                                                <button key={gif.id} type="button" onClick={() => handleSendGif(gif.images.fixed_height.url)} className="rounded-md overflow-hidden focus:ring-2 ring-primary">
                                                    <img src={gif.images.fixed_height_small.url} alt={gif.title} className="w-full h-full object-cover" />
                                                </button>
                                            ))}
                                            </div>
                                        </ScrollArea>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-2 text-center">Powered by GIPHY</p>
                                </TabsContent>
                            </Tabs>
                        </PopoverContent>
                    </Popover>
                    <Button type="submit">Send</Button>
                </form>
            </CardFooter>
        </ChatContainer>
    );
}
