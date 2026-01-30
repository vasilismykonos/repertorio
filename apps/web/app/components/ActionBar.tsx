"use client";

import React from "react";

type Props = {
  left?: React.ReactNode;
  right?: React.ReactNode;

  /** Προαιρετικός τίτλος στο κέντρο */
  title?: React.ReactNode;

  /** Προαιρετικό μικρό κείμενο κάτω από το title */
  subtitle?: React.ReactNode;
};

export default function ActionBar({ left, title, subtitle, right }: Props) {
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
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          minWidth: 0,
          flex: "0 0 auto",
        }}
      >
        {left}
      </div>

      <div
        style={{
          minWidth: 0,
          flex: "1 1 auto",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {title ? (
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              lineHeight: "20px",
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {title}
          </div>
        ) : null}

        {subtitle ? (
          <div
            style={{
              fontSize: 12,
              lineHeight: "16px",
              color: "#aaa",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          minWidth: 0,
          flex: "0 0 auto",
          justifyContent: "flex-end",
        }}
      >
        {right}
      </div>
    </div>
  );
}
