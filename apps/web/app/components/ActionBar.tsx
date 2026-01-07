"use client";

import React from "react";

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;
};

export default function ActionBar({ left, right }: Props) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        marginBottom: 16,
        borderBottom: "1px solid #333",
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>{left}</div>
      <div style={{ display: "flex", gap: 8 }}>{right}</div>
    </div>
  );
}
