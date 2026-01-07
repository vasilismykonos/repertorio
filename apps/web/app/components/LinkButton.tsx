"use client";

import React from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  title?: string;
  prefetch?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

function variantStyle(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case "primary":
      return {
        backgroundColor: "#0070f3",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.15)",
      };
    case "secondary":
      return {
        backgroundColor: "transparent",
        color: "#fff",
        border: "1px solid #555",
      };
    case "danger":
      return {
        backgroundColor: "#b00020",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.2)",
      };
    case "ghost":
    default:
      return {
        backgroundColor: "transparent",
        color: "#0070f3",
        border: "1px solid transparent",
      };
  }
}

export default function LinkButton({
  href,
  children,
  variant = "secondary",
  title,
  prefetch,
  className,
  style,
}: Props) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      title={title}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 16px",
        fontWeight: 600,
        borderRadius: 8,
        textDecoration: "none",
        cursor: "pointer",
        ...variantStyle(variant),
        ...style,
      }}
    >
      {children}
    </Link>
  );
}
