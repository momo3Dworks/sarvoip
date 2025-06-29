"use client";

import { Users, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const AmigoTalkLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary-foreground">
    <path d="M21 11.5C21 16.7467 16.7467 21 11.5 21C10.5397 21 9.60833 20.8491 8.75 20.5679L4 22L5.43209 17.25C3.15086 15.3917 2 12.6083 2 11.5C2 6.25329 6.25329 2 11.5 2C16.7467 2 21 6.25329 21 11.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export function ServerRail() {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col items-center gap-y-4 p-3 bg-sidebar-background h-full border-r border-sidebar-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="h-12 w-12 flex items-center justify-center bg-primary rounded-2xl transition-all duration-300 ease-in-out hover:rounded-xl">
              <AmigoTalkLogo />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>AmigoTalk</p>
          </TooltipContent>
        </Tooltip>
        
        <div className="w-8 border-t border-border/50" />
        
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="h-12 w-12 flex items-center justify-center bg-accent/20 text-accent-foreground rounded-full transition-all duration-300 ease-in-out hover:rounded-xl hover:bg-accent/40">
              <Users className="h-6 w-6" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Friends</p>
          </TooltipContent>
        </Tooltip>

        <div className="mt-auto flex flex-col items-center gap-y-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button>
                <Avatar className="h-12 w-12">
                  <AvatarImage src="https://placehold.co/48x48.png" alt="User Avatar" data-ai-hint="person" />
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Your Profile</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="p-2 rounded-full hover:bg-muted">
                <Settings className="h-6 w-6 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
