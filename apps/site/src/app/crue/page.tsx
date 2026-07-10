"use client";

import dynamic from "next/dynamic";

const CrueMap = dynamic(() => import("@/components/CrueMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <CrueMap />;
}
