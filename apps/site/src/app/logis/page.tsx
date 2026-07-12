"use client";

import dynamic from "next/dynamic";

const LogisMap = dynamic(() => import("@/components/LogisMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <LogisMap />;
}
