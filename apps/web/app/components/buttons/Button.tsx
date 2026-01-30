"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Save,
  Trash2,
  X,
  ArrowLeft,
  Plus,
  Check,
  Search,
  CircleDot,
  Pencil,
  ArrowUpDown,
  Recycle,
  Settings,
  RefreshCw,
  LogIn,
  LogOut,
} from "lucide-react";


export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "outline"
  | "link"
  | "icon";

export type ButtonSize = "sm" | "md" | "lg";

export type ButtonAction =
  | "none"
  | "save"
  | "delete"
  | "cancel"
  | "back"
  | "new"
  | "edit"
  | "apply"
  | "search"
  | "select"
  | "sort"
  | "room"
  | "settings"
  | "refresh"
  | "login"
  | "logout";


type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;

  /** Used by CSS + icon mapping */
  action?: ButtonAction;

  /** If true, forces icon-only rendering (hides label) */
  iconOnly?: boolean;

  /**
   * If true, forces label to show (overrides global CSS label hiding),
   * unless iconOnly is true.
   */
  showLabel?: boolean;

  /** Optional custom icon override (rare) */
  icon?: LucideIcon;
};

function useIsSmallScreen(maxWidth = 640) {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setIsSmall(!!mq.matches);

    onChange();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }

    // Safari fallback
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [maxWidth]);

  return isSmall;
}

function actionToIcon(action: ButtonAction | undefined): LucideIcon | null {
  switch (action) {
    case "save":
      return Save;
    case "delete":
      return Trash2;
    case "cancel":
      return X;
    case "back":
      return ArrowLeft;
    case "new":
      return Plus;
    case "apply":
      return Check;
    case "search":
      return Search;
    case "select":
      return CircleDot;
    case "edit":
      return Pencil;
    case "sort":
      return ArrowUpDown;
    case "room":
      return Recycle;
    case "settings": 
      return Settings;
    case "refresh":
      return RefreshCw;
    case "login":
      return LogIn;
    case "logout":
      return LogOut;

    default:
      return null;
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function Button(props: Props) {
  const {
    variant = "primary",
    size = "md",
    action = "none",
    iconOnly,
    showLabel,
    icon,
    className,
    children,
    title,
    ...rest
  } = props;

  const isSmall = useIsSmallScreen(640);

  const Icon = useMemo(() => {
    return icon ?? actionToIcon(action);
  }, [icon, action]);

  const hasIcon = !!Icon;

  const baseIconOnly = !!iconOnly || isSmall;
  const effectiveIconOnly = baseIconOnly && hasIcon;
  const effectiveShowLabel = effectiveIconOnly ? false : showLabel ?? true;

  const effectiveTitle = isSmall ? undefined : title;

  return (
    <button
      {...rest}
      title={effectiveTitle}
      data-action={action}
      data-icon-only={effectiveIconOnly ? "true" : undefined}
      data-show-label={effectiveShowLabel ? "true" : undefined}
      className={cn("btn", `btn--${variant}`, `btn--${size}`, className)}
    >
      <span className="btn__icon" aria-hidden="true">
        {Icon ? <Icon size={18} strokeWidth={2} style={{ display: "block" }} /> : null}
      </span>

      <span className="btn__label">{children}</span>
    </button>
  );
}
