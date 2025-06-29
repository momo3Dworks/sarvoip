
"use client";

import React, { useState, useEffect, useRef, useContext } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { UserContext } from '@/context/UserProvider';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface LobbyMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: any;
}

interface TimedMessage extends LobbyMessage {
  isFresh: boolean;
}

const Message = ({ message, isHovering }: { message: TimedMessage, isHovering: boolean }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (message.isFresh) {
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, 10000);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(false);
        }
    }, [message.isFresh]);

    return (
        <div className={cn(
            "transition-opacity duration-500",
            (isVisible || isHovering) ? 'opacity-100' : 'opacity-0'
        )}>
            <span className="font-black uppercase">{message.senderName}:</span>
            <span className="ml-2">{message.text}</span>
        </div>
    );
};

export function LobbyChat() {
    const { user: currentUser } = useContext(UserContext);
    const [messages, setMessages] = useState<TimedMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isHovering, setIsHovering] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const messagesColRef = collection(db, 'lobby_chat');
        const q = query(messagesColRef, orderBy('timestamp', 'desc'), limit(20));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const now = Date.now();
            const newMessages = snapshot.docs
                .map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    isFresh: doc.data().timestamp && (now - doc.data().timestamp.toMillis()) < 10000 
                } as TimedMessage))
                .reverse();
            
            setMessages(newMessages);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || newMessage.trim() === '' || !currentUser) return;
        
        e.preventDefault();

        const messagesColRef = collection(db, 'lobby_chat');
        await addDoc(messagesColRef, {
            text: newMessage.trim(),
            senderId: currentUser.id,
            senderName: currentUser.name,
            timestamp: serverTimestamp(),
        });

        setNewMessage('');
    };

    if (!currentUser) return null;

    return (
        <div className="flex flex-col h-36 p-4 pt-2">
            <div 
                className="flex-1 overflow-y-auto lobby-chat-scrollbar text-sm space-y-1"
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                {messages.map((msg) => (
                    <Message key={msg.id} message={msg} isHovering={isHovering} />
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="mt-2">
                <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleSendMessage}
                    placeholder="Press Enter to chat..."
                    autoComplete="off"
                    className="h-8 bg-transparent border-t-0 border-x-0 rounded-none border-b border-input focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-primary"
                />
            </div>
        </div>
    );
}
