// apps/web/app/components/PageSuspense.tsx
import React, { Suspense } from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function PageSuspense({ children, fallback }: Props) {
  return (
    <Suspense fallback={fallback ?? <div style={{ padding: 8 }}>Φόρτωση…</div>}>
      {children}
    </Suspense>
  );
}
