'use client';
import { cn } from '@/lib/utils';
import React, { useState, useEffect } from 'react';

export function Equalizer() {
  const [heights, setHeights] = useState([60, 40, 80]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeights([
        Math.random() * 80 + 20,
        Math.random() * 80 + 20,
        Math.random() * 80 + 20,
      ]);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-end h-10 w-12 gap-1" title="Visualizer">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-1/3 bg-primary/70 transition-all duration-200 ease-in-out"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
