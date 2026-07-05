"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The shared animation heartbeat: one requestAnimationFrame loop advancing a
 * simulated clock held in a ref (never React state - the loop must not
 * re-render at 60 fps). The caller draws in onFrame; skipping redundant
 * redraws is the caller's business since only it knows its inputs.
 *
 * Respects prefers-reduced-motion: autoplay is disabled for those users
 * (they can still press play).
 */
export function useAnimationClock(opts: {
  initialTime: number;
  autoplay: boolean;
  initialSpeed: number;
  /** Applied after each advance; use it to wrap or clamp the clock. */
  normalize: (t: number) => number;
  onFrame: (t: number) => void;
}) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [playing, setPlaying] = useState(opts.autoplay && !reducedMotion);
  const [speed, setSpeed] = useState(opts.initialSpeed);
  const timeRef = useRef(opts.initialTime);
  // latest values for the loop without re-subscribing it
  const live = useRef({
    playing,
    speed,
    normalize: opts.normalize,
    onFrame: opts.onFrame,
  });
  live.current = {
    playing,
    speed,
    normalize: opts.normalize,
    onFrame: opts.onFrame,
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      const s = live.current;
      if (s.playing) {
        timeRef.current = s.normalize(timeRef.current + dt * s.speed);
      }
      s.onFrame(timeRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { timeRef, playing, setPlaying, speed, setSpeed };
}
