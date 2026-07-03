"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the whole map app is client-only.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return <App />;
}
