"use client";

import dynamic from "next/dynamic";

const ReliefMap = dynamic(() => import("@/components/ReliefMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <ReliefMap />;
}
