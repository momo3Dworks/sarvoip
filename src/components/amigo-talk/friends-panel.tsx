"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Friend } from './amigo-talk-client';
import { cn } from '@/lib/utils';
import { Plus, User } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

interface FriendsPanelProps {
  friends: Friend[];
  selectedFriend: Friend;
  onSelectFriend: (friend: Friend) => void;
}

const statusClasses = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-500',
};

export function FriendsPanel({ friends, selectedFriend, onSelectFriend }: FriendsPanelProps) {
  return (
    <div className="w-72 bg-secondary flex flex-col h-full border-r border-border">
      <div className="p-2.5 border-b border-border shadow-sm">
        <Input type="text" placeholder="Find or start a conversation" className="bg-muted focus-visible:ring-primary" />
      </div>
      <div className="p-2">
        <Button variant="ghost" className="w-full justify-start text-foreground/80 hover:bg-muted hover:text-foreground">
          <User className="mr-2 h-5 w-5" />
          <span className='font-semibold'>Friends</span>
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex justify-between items-center text-xs text-muted-foreground font-semibold uppercase px-4 py-1">
          Direct Messages
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ul className="px-2 pb-2">
          {friends.map((friend) => (
            <li key={friend.id}>
              <button
                onClick={() => onSelectFriend(friend)}
                className={cn(
                  'w-full flex items-center p-2 rounded-md text-left transition-colors',
                  selectedFriend.id === friend.id 
                    ? 'bg-accent/30 text-foreground' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={friend.avatar} alt={friend.name} data-ai-hint={friend.dataAiHint} />
                    <AvatarFallback>{friend.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    'absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2',
                    selectedFriend.id === friend.id ? 'border-accent/30' : 'border-secondary',
                    statusClasses[friend.status]
                  )} />
                </div>
                <span className="ml-3 font-medium">{friend.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
