// apps/web/app/components/Button.tsx
"use client";

import React from "react";

/**
 * A reusable button component with variant-based styling.  By
 * centralising the styling logic here we ensure a consistent look
 * and feel across all forms in the application.  Variants mirror
 * common actions such as primary (save), secondary (cancel),
 * danger (delete) and ghost (link-like) buttons.  Additional
 * properties from the standard button element are forwarded
 * transparently via the rest parameter.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant of the button.  Primary is used for the main
   * affirmative action (e.g. save), secondary for neutral actions
   * (e.g. cancel), danger for destructive actions (e.g. delete)
   * and ghost for link‑like buttons.
   */
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export default function Button({
  variant = "primary",
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  // Base styling applied to all buttons.  Individual variants
  // override colour and border definitions below.
  const baseStyle: React.CSSProperties = {
    padding: "8px 16px",
    fontWeight: 600,
    borderRadius: 4,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };
  // Determine colours and borders based on the variant.
  let variantStyle: React.CSSProperties;
  switch (variant) {
    case "primary":
      variantStyle = {
        backgroundColor: "#0070f3",
        color: "#fff",
        border: "none",
      };
      break;
    case "secondary":
      variantStyle = {
        backgroundColor: "transparent",
        color: "#fff",
        border: "1px solid #555",
      };
      break;
    case "danger":
      variantStyle = {
        backgroundColor: "#b00020",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.2)",
      };
      break;
    case "ghost":
    default:
      variantStyle = {
        backgroundColor: "transparent",
        color: "#0070f3",
        border: "none",
      };
      break;
  }
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...baseStyle, ...variantStyle }}
    >
      {children}
    </button>
  );
}