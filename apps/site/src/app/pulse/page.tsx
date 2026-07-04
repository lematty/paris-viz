"use client";

import dynamic from "next/dynamic";

// canvas animation touches window at import time - client-only.
const RidgeLandscape = dynamic(() => import("@/components/RidgeLandscape"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement… / loading…</div>,
});

export default function Page() {
  return <RidgeLandscape />;
}
