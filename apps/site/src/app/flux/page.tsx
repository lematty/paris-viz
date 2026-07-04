"use client";

import dynamic from "next/dynamic";

// deck.gl touches WebGL/window at import time - client-only.
const FlowMap = dynamic(() => import("@/components/FlowMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <FlowMap />;
}
