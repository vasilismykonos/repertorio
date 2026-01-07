// apps/web/app/components/InlineError.tsx
"use client";

import React from "react";

type Props = {
  message: string | null | undefined;
};

/**
 * Small, consistent error block used in forms.
 */
export default function InlineError({ message }: Props) {
  if (!message) return null;
  return (
    <p
      style={{
        color: "#f00",
        marginBottom: 12,
        whiteSpace: "pre-wrap",
      }}
    >
      {message}
    </p>
  );
}
