"use client";

import dynamic from "next/dynamic";

const MirageMap = dynamic(() => import("@/components/MirageMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <MirageMap />;
}
