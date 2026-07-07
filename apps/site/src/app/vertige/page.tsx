"use client";

import dynamic from "next/dynamic";

const VertigeMap = dynamic(() => import("@/components/VertigeMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <VertigeMap />;
}
