"use client";

import dynamic from "next/dynamic";

const CaniculeMap = dynamic(() => import("@/components/CaniculeMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <CaniculeMap />;
}
