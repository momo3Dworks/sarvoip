"use client";

import { useContext } from 'react';
import { UserContext } from '@/context/UserProvider';
import { LoginView } from '@/components/lobby/LoginView';
import { LobbyView } from '@/components/lobby/LobbyView';
import { Skeleton } from '@/components/ui/skeleton';

export default function Home() {
  const { user, loading } = useContext(UserContext);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
    );
  }

  return user ? <LobbyView /> : <LoginView />;
}
