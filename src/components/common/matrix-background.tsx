"use client";

import React, { useRef, useEffect } from 'react';

const MatrixBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        let columns = Math.floor(width / 20);
        const drops: number[] = [];
        for (let i = 0; i < columns; i++) {
          // Start drops at random heights
          drops[i] = Math.floor(Math.random() * (height / 20));
        }

        const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
        const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const nums = '0123456789';
        const characters = katakana + latin + nums;

        let animationFrameId: number;
        let lastTime = 0;
        const fps = 20; // Slowed down animation
        const nextFrame = 1000 / fps;
        let timer = 0;

        const draw = (timeStamp: number) => {
            const deltaTime = timeStamp - lastTime;
            lastTime = timeStamp;

            // Only draw if enough time has passed
            if (timer > nextFrame) {
                // The semi-transparent fill creates the motion blur/fading trail effect
                ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
                ctx.fillRect(0, 0, width, height);
                
                const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary');
                const hslValues = primaryColor.match(/\d+/g);
                const primaryHsl = (hslValues && hslValues.length >= 3) 
                    ? `hsl(${hslValues[0]}, ${hslValues[1]}%, ${hslValues[2]}%)`
                    : '#0F0';

                ctx.font = '15px monospace';

                for (let i = 0; i < drops.length; i++) {
                    const text = characters.charAt(Math.floor(Math.random() * characters.length));
                    const y = drops[i] * 20;
                    
                    // Style for the glowing head character
                    ctx.fillStyle = '#d1fae5'; // A very light, almost white-green
                    ctx.shadowColor = primaryHsl;
                    ctx.shadowBlur = 8;
                    
                    // Draw the character
                    ctx.fillText(text, i * 20, y);

                    // Reset shadow for next character in the loop
                    ctx.shadowBlur = 0;
                    
                    // Move the drop down for the next frame.
                    // If it's off-screen, randomly reset it to the top.
                    if (y > height && Math.random() > 0.975) {
                        drops[i] = 0;
                    }
                    drops[i]++;
                }
                timer = 0;
            } else {
                timer += deltaTime;
            }

            animationFrameId = window.requestAnimationFrame(draw);
        };
        
        requestAnimationFrame(draw);

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            columns = Math.floor(width / 20);
            
            const currentLength = drops.length;
            drops.length = columns;
            if (columns > currentLength) {
                for (let i = currentLength; i < columns; i++) {
                    drops[i] = Math.floor(Math.random() * (height/20));
                }
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <canvas 
            ref={canvasRef} 
            className="fixed top-0 left-0 w-full h-full -z-10 blur-[2px]"
        />
    );
};

export default MatrixBackground;
