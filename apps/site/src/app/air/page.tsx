"use client";

import dynamic from "next/dynamic";

// deck.gl touches WebGL/window at import time - client-only.
const AirMap = dynamic(() => import("@/components/AirMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement… / loading…</div>,
});

export default function Page() {
  return <AirMap />;
}
