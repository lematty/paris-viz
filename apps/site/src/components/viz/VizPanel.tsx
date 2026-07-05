"use client";

import { useState, type ReactNode, type RefObject } from "react";
import type { Lang } from "@/lib/lang";
import LangToggle from "../LangToggle";

export interface VizPanelLabels {
  play: string;
  pause: string;
  speed: string;
  time: string;
  sheetToggle: string;
}

/**
 * The shared control-panel shell of the animated visualizations: topbar with
 * home link, language toggle and mobile sheet toggle; title, subtitle, clock,
 * play/speed controls, slider - and viz-specific content in the slots.
 * Class names are part of the contract (tests and the mobile bottom-sheet
 * CSS target them).
 */
export default function VizPanel({
  lang,
  onLang,
  title,
  subtitle,
  clockRef,
  clockInitial = "--:--",
  playing,
  onTogglePlay,
  speed,
  speeds,
  onSpeed,
  labels,
  controlsExtra,
  beforeSlider,
  slider,
  footer,
  children,
}: {
  lang: Lang;
  onLang: (lang: Lang) => void;
  title: string;
  subtitle: ReactNode;
  clockRef: RefObject<HTMLDivElement | null>;
  clockInitial?: string;
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  speeds: { value: number; label: string }[];
  onSpeed: (value: number) => void;
  labels: VizPanelLabels;
  controlsExtra?: ReactNode;
  beforeSlider?: ReactNode;
  slider: {
    ref: RefObject<HTMLInputElement | null>;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    onInput: (value: number) => void;
  };
  footer: ReactNode;
  children?: ReactNode;
}) {
  // On small screens the panel is a bottom sheet, collapsed by default -
  // clock, controls, and slider stay visible; .sheet-hide content folds away.
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 640,
  );

  return (
    <div className={`flow-panel${sheetOpen ? "" : " collapsed"}`}>
      <div className="flow-topbar">
        <a className="home-link" href="/">
          ← Paris Viz
        </a>
        <LangToggle lang={lang} onChange={onLang} />
        <button
          className="sheet-toggle"
          aria-label={labels.sheetToggle}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((o) => !o)}
        >
          {sheetOpen ? "⌄" : "⌃"}
        </button>
      </div>
      <h1 className="sheet-hide">{title}</h1>
      <p className="sub sheet-hide">{subtitle}</p>
      <div className="flow-clock" ref={clockRef}>
        {clockInitial}
      </div>
      <div className="flow-controls">
        <button
          onClick={onTogglePlay}
          aria-label={playing ? labels.pause : labels.play}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <select
          value={speed}
          onChange={(e) => onSpeed(+e.target.value)}
          aria-label={labels.speed}
        >
          {speeds.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {controlsExtra}
      </div>
      {beforeSlider}
      <input
        ref={slider.ref}
        className="flow-slider"
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        defaultValue={slider.defaultValue}
        onInput={(e) => slider.onInput(+(e.target as HTMLInputElement).value)}
        aria-label={labels.time}
      />
      {children}
      <p className="flow-footer sheet-hide">{footer}</p>
    </div>
  );
}
