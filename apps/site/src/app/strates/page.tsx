"use client";

import dynamic from "next/dynamic";

const StratesMap = dynamic(() => import("@/components/StratesMap"), {
  ssr: false,
  loading: () => <div className="flow-loading">chargement…</div>,
});

export default function Page() {
  return <StratesMap />;
}
