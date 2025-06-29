"use client";

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Phone, Mic, Headphones, Settings, Shield, User, Bot, Send } from 'lucide-react';
import type { Friend } from './amigo-talk-client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

interface ChatPanelProps {
  friend: Friend;
}

type Message = {
  id: number | string;
  author: string;
  text: string;
  timestamp: string;
  avatar: string;
  dataAiHint: string;
};

const initialCallUsers = [
    { id: 1, name: 'You', avatar: 'https://placehold.co/48x48.png', dataAiHint: 'person' },
    { id: 2, name: 'Elena', avatar: 'https://placehold.co/48x48.png', dataAiHint: 'woman portrait' },
];

export function ChatPanel({ friend }: ChatPanelProps) {
  const getInitialMessages = (currentFriend: Friend): Message[] => [
    { id: 1, author: currentFriend.name, text: 'Hey, wanna play tonight?', timestamp: '5:30 PM', avatar: currentFriend.avatar, dataAiHint: currentFriend.dataAiHint },
    { id: 2, author: 'You', text: 'Sure! What time?', timestamp: '5:31 PM', avatar: 'https://placehold.co/40x40.png', dataAiHint: 'person' },
    { id: 3, author: currentFriend.name, text: 'Around 8pm maybe?', timestamp: '5:31 PM', avatar: currentFriend.avatar, dataAiHint: currentFriend.dataAiHint },
    { id: 4, author: 'You', text: 'Sounds good to me!', timestamp: '5:32 PM', avatar: 'https://placehold.co/40x40.png', dataAiHint: 'person' },
    { id: 5, author: currentFriend.name, text: "Great, see you then! Don't be late this time. 😉", timestamp: '5:33 PM', avatar: currentFriend.avatar, dataAiHint: currentFriend.dataAiHint },
  ];

  const [messages, setMessages] = React.useState<Message[]>(() => getInitialMessages(friend));
  const [inputValue, setInputValue] = React.useState('');
  const [callUsers, setCallUsers] = React.useState(() => {
    const updatedUsers = [...initialCallUsers];
    updatedUsers[1].name = friend.name;
    updatedUsers[1].avatar = friend.avatar;
    updatedUsers[1].dataAiHint = friend.dataAiHint;
    return updatedUsers;
  });
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  const [showInviteDialog, setShowInviteDialog] = React.useState(false);
  const [inviteLink, setInviteLink] = React.useState('');
  const [callId, setCallId] = React.useState('');
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    setMessages(getInitialMessages(friend));
    setCallUsers(prevUsers => {
        const updatedUsers = JSON.parse(JSON.stringify(prevUsers));
        updatedUsers[1] = { ...updatedUsers[1], name: friend.name, avatar: friend.avatar, dataAiHint: friend.dataAiHint };
        return updatedUsers;
    });
  }, [friend]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (inputValue.trim() === '') return;

    const newMessage: Message = {
        id: Date.now(),
        author: 'You',
        text: inputValue,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        avatar: 'https://placehold.co/40x40.png',
        dataAiHint: 'person'
    };
    
    setMessages(prevMessages => [...prevMessages, newMessage]);
    setInputValue('');
    
    setTimeout(() => {
        const replyMessage: Message = {
            id: Date.now() + 1,
            author: friend.name,
            text: `I received your message! Let's talk more later.`,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            avatar: friend.avatar,
            dataAiHint: friend.dataAiHint
        };
        setMessages(prevMessages => [...prevMessages, replyMessage]);
    }, 1500);
  };
  
  const handleStartCall = async () => {
    try {
      const callDocRef = await addDoc(collection(db, "calls"), {
        createdAt: new Date(),
        initiator: 'You',
        receiver: friend.name,
      });
      const newCallId = callDocRef.id;
      setCallId(newCallId);

      const link = `${window.location.origin}/call/${newCallId}`;
      setInviteLink(link);
      setShowInviteDialog(true);
    } catch (error) {
      console.error("Error creating call:", error);
      toast({
        variant: "destructive",
        title: "Failed to create call",
        description: "Please check your Firebase configuration and internet connection.",
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      <header className="flex items-center p-3 border-b border-border shadow-sm flex-shrink-0">
        <User className="h-6 w-6 text-muted-foreground mr-3" />
        <h2 className="font-bold text-lg">{friend.name}</h2>
        <div className="ml-auto flex items-center space-x-4">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={handleStartCall}>
            <Phone className="h-5 w-5" />
          </Button>
          <div className="flex items-center text-sm text-green-400 font-medium">
            <Shield className="h-5 w-5 mr-1" />
            <span>Secure</span>
          </div>
        </div>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex items-start space-x-4 hover:bg-muted/50 p-2 rounded-md transition-colors">
                    <Avatar className='h-10 w-10'>
                      <AvatarImage src={msg.avatar} data-ai-hint={msg.dataAiHint} />
                      <AvatarFallback>{msg.author.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-baseline space-x-2">
                        <span className="font-bold text-primary">{msg.author}</span>
                        <span className="text-xs text-muted-foreground">{msg.timestamp}</span>
                      </div>
                      <p className="text-foreground/90">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t border-border bg-background">
            <div className="relative">
              <Input
                placeholder={`Message @${friend.name}`}
                className="bg-muted border-none pr-12 rounded-lg"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={handleSendMessage}>
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <aside className="w-72 border-l border-border flex flex-col p-4 bg-secondary">
          <h3 className="font-semibold mb-4 text-lg">In Call</h3>
          <div className="space-y-4 flex-1">
            {callUsers.map(user => (
              <div key={user.id} className="group">
                  <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                          <AvatarImage src={user.avatar} data-ai-hint={user.dataAiHint} />
                          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-base">{user.name}</span>
                  </div>
                  <div className="flex items-center mt-2 pl-4">
                    <Mic className="h-4 w-4 mr-2 text-muted-foreground" />
                    <Slider defaultValue={[user.name === 'You' ? 100 : 75]} max={100} step={1} className="flex-1" />
                  </div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />
          
          <div className="flex flex-col space-y-2">
            <div className="flex items-center text-sm text-green-400 font-medium">
              <Bot className="h-5 w-5 mr-2" />
              <span>Voice Connected</span>
            </div>
            <div className="flex items-center justify-around bg-muted p-1 rounded-lg">
                <Button variant="ghost" size="icon" className="bg-primary/20 text-foreground"><Mic className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground"><Headphones className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground"><Settings className="h-5 w-5" /></Button>
                 <Button variant="destructive" size="icon">
                    <Phone className="h-5 w-5" />
                 </Button>
            </div>
          </div>
        </aside>
      </div>
      <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Comparte este enlace para iniciar la llamada</AlertDialogTitle>
            <AlertDialogDescription>
              Envía este enlace a tu amigo. Cuando ambos estéis listos, haced clic en 'Iniciar llamada' para uniros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2">
            <Input value={inviteLink} readOnly className="flex-1" />
            <Button onClick={() => {
                navigator.clipboard.writeText(inviteLink);
                toast({ title: '¡Enlace copiado!' });
            }}>Copiar</Button>
          </div>
          <AlertDialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancelar</Button>
            <AlertDialogAction onClick={() => router.push(`/call/${callId}`)}>Iniciar Llamada</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
