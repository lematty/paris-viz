"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so the whole map app is client-only.
const App = dynamic(() => import("@/components/noctilien/App"), {
  ssr: false,
  loading: () => (
    <div className="app-loading">
      <strong>Noctilien</strong>
      <span>chargement de la carte… / loading map…</span>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
