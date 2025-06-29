"use client";

import { useState, useContext } from 'react';
import { UserContext } from '@/context/UserProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function LoginView() {
  const [name, setName] = useState('');
  const { login } = useContext(UserContext);

  const handleLogin = () => {
    if (name.trim()) {
      login(name.trim());
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to SAR</CardTitle>
          <CardDescription>Enter your name to join the lobby.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            autoFocus
          />
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={handleLogin} disabled={!name.trim()}>
            Let's SAR
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
