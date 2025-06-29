"use client";

import React, { useState } from 'react';
import { ServerRail } from './server-rail';
import { FriendsPanel } from './friends-panel';
import { ChatPanel } from './chat-panel';

const mockFriends = [
  { id: 1, name: 'Elena', status: 'online' as const, avatar: 'https://placehold.co/40x40.png', dataAiHint: 'woman portrait' },
  { id: 2, name: 'Marco', status: 'away' as const, avatar: 'https://placehold.co/40x40.png', dataAiHint: 'man portrait' },
  { id: 3, name: 'Sofia', status: 'offline' as const, avatar: 'https://placehold.co/40x40.png', dataAiHint: 'woman smiling' },
  { id: 4, name: 'Leo', status: 'online' as const, avatar: 'https://placehold.co/40x40.png', dataAiHint: 'man smiling' },
  { id: 5, name: 'Isabella', status: 'online' as const, avatar: 'https://placehold.co/40x40.png', dataAiHint: 'woman looking away' },
];

export type Friend = typeof mockFriends[0];

export function AmigoTalkClient() {
  const [selectedFriend, setSelectedFriend] = useState<Friend>(mockFriends[0]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <ServerRail />
      <FriendsPanel friends={mockFriends} selectedFriend={selectedFriend} onSelectFriend={setSelectedFriend} />
      <ChatPanel friend={selectedFriend} />
    </div>
  );
}
