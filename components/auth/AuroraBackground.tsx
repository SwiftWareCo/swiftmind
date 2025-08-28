"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/utils/accessibility";

/**
 * GPU-accelerated Aurora background animation
 * Optimized for 60fps performance with minimal CPU usage
 */
export function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", {
      alpha: true,
      desynchronized: true, // Better performance
      powerPreference: "low-power" // Prefer battery life
    });
    if (!ctx) return;

    let animationFrame: number;
    let time = 0;
    let lastTime = 0;
    let isVisible = true;

    // Performance monitoring
    let frameCount = 0;
    let lastFpsTime = 0;

    // Intersection Observer to pause animation when not visible
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (!isVisible && animationFrame) {
        cancelAnimationFrame(animationFrame);
      } else if (isVisible && !prefersReducedMotion) {
        animate(performance.now());
      }
    });

    observer.observe(canvas);

    // Resize canvas to match container with throttling
    let resizeTimeout: NodeJS.Timeout;
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio, 2); // Cap at 2x for performance
      canvas.width = rect.width * pixelRatio;
      canvas.height = rect.height * pixelRatio;
      ctx.scale(pixelRatio, pixelRatio);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };

    // Aurora animation parameters
    const gradientConfig = {
      primary: { 
        hue: 280, // Purple base
        saturation: 60,
        lightness: 25,
        alpha: 0.4 // Reduced for better performance
      },
      secondary: { 
        hue: 200, // Cyan base
        saturation: 80,
        lightness: 30,
        alpha: 0.3 // Reduced for better performance
      },
      tertiary: { 
        hue: 320, // Magenta accent
        saturation: 70,
        lightness: 35,
        alpha: 0.2 // Reduced for better performance
      }
    };

    const animate = (currentTime: number) => {
      if (!isVisible || prefersReducedMotion) return;

      // Target 30fps for better performance
      const deltaTime = currentTime - lastTime;
      if (deltaTime < 33) { // ~30fps
        animationFrame = requestAnimationFrame(animate);
        return;
      }

      lastTime = currentTime;
      time += 0.003; // Slower animation for smoother performance
      
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      // Use globalCompositeOperation for better blending performance
      ctx.globalCompositeOperation = 'screen';
      ctx.clearRect(0, 0, width, height);

      // Reduce number of gradients for better performance
      const gradients = [
        {
          ...gradientConfig.primary,
          x: width * 0.3 + Math.sin(time * 0.5) * width * 0.1,
          y: height * 0.3 + Math.cos(time * 0.4) * height * 0.08,
          radius: Math.min(width, height) * 0.4,
        },
        {
          ...gradientConfig.secondary,
          x: width * 0.7 + Math.cos(time * 0.7) * width * 0.08,
          y: height * 0.7 + Math.sin(time * 0.6) * height * 0.1,
          radius: Math.min(width, height) * 0.35,
        }
      ];

      // Use simpler gradients
      gradients.forEach((gradient) => {
        const radialGradient = ctx.createRadialGradient(
          gradient.x, gradient.y, 0,
          gradient.x, gradient.y, gradient.radius
        );

        radialGradient.addColorStop(0, 
          `hsla(${gradient.hue}, ${gradient.saturation}%, ${gradient.lightness}%, ${gradient.alpha})`
        );
        radialGradient.addColorStop(1, 'transparent');

        ctx.fillStyle = radialGradient;
        ctx.fillRect(0, 0, width, height);
      });

      // FPS monitoring (development only)
      if (process.env.NODE_ENV === 'development') {
        frameCount++;
        if (currentTime - lastFpsTime > 1000) {
          console.log(`Aurora FPS: ${frameCount}`);
          frameCount = 0;
          lastFpsTime = currentTime;
        }
      }

      animationFrame = requestAnimationFrame(animate);
    };

    // Throttled resize handler
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 150);
    };

    // Initialize
    resizeCanvas();
    
    // Only start animation if motion is not reduced
    if (!prefersReducedMotion) {
      animate(performance.now());
    }

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      clearTimeout(resizeTimeout);
    };
  }, [prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{
        background: 'radial-gradient(ellipse at center, hsl(var(--primary) / 0.05) 0%, transparent 70%)',
      }}
    />
  );
}

/**
 * CSS-only Aurora background (fallback/alternative)
 * Lower performance impact but less dynamic
 */
export function CSSAuroraBackground() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      
      {/* Animated aurora layers - only animate if motion is not reduced */}
      <div className="absolute inset-0">
        <div 
          className={`absolute w-[800px] h-[800px] -top-40 -left-40 rounded-full opacity-30 ${
            !prefersReducedMotion ? 'animate-pulse' : ''
          }`}
          style={{
            background: 'radial-gradient(circle, hsl(280 60% 25% / 0.4) 0%, transparent 70%)',
            animationDuration: prefersReducedMotion ? '0s' : '8s',
            animationDelay: '0s',
          }}
        />
        <div 
          className={`absolute w-[600px] h-[600px] top-1/2 right-0 -translate-y-1/2 translate-x-1/3 rounded-full opacity-25 ${
            !prefersReducedMotion ? 'animate-pulse' : ''
          }`}
          style={{
            background: 'radial-gradient(circle, hsl(200 80% 30% / 0.3) 0%, transparent 70%)',
            animationDuration: prefersReducedMotion ? '0s' : '12s',
            animationDelay: '2s',
          }}
        />
        <div 
          className={`absolute w-[500px] h-[500px] bottom-0 left-1/3 translate-y-1/3 rounded-full opacity-20 ${
            !prefersReducedMotion ? 'animate-pulse' : ''
          }`}
          style={{
            background: 'radial-gradient(circle, hsl(320 70% 35% / 0.2) 0%, transparent 70%)',
            animationDuration: prefersReducedMotion ? '0s' : '10s',
            animationDelay: '4s',
          }}
        />
      </div>
      
      {/* Subtle grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />
    </div>
  );
}
