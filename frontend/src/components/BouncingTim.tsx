"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const SIZE = 110; // px
const SPEED = 0.7; // px per frame
const OPACITY = 0.55;

/**
 * DVD-screensaver-style bouncing Tim the Beaver. Pure DOM transform updates
 * via requestAnimationFrame; no React re-renders per frame.
 */
export default function BouncingTim() {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let x = window.innerWidth * 0.3;
    let y = window.innerHeight * 0.4;
    let vx = SPEED;
    let vy = SPEED;
    let raf = 0;
    let lastTs = performance.now();

    const tick = (ts: number) => {
      // Normalize by elapsed time so speed is monitor-independent
      const dt = Math.min(50, ts - lastTs);
      lastTs = ts;
      x += vx * dt * 0.06;
      y += vy * dt * 0.06;

      const maxX = window.innerWidth - SIZE;
      const maxY = window.innerHeight - SIZE;
      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
      } else if (x >= maxX) {
        x = maxX;
        vx = -Math.abs(vx);
      }
      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
      } else if (y >= maxY) {
        y = maxY;
        vy = -Math.abs(vy);
      }
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    // Pause when the tab is hidden so we don't burn battery in background tabs
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        lastTs = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      ref={elRef}
      aria-hidden="true"
      className="fixed top-0 left-0 pointer-events-none"
      style={{
        width: SIZE,
        height: SIZE,
        opacity: OPACITY,
        zIndex: -5,
        willChange: "transform",
      }}
    >
      <Image src="/tim.png" alt="" width={SIZE} height={SIZE} unoptimized priority />
    </div>
  );
}
