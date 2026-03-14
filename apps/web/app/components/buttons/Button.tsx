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
  Share2,
  HelpCircle,
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
  | "share"
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
  | "logout"
  | "help";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;

  /** Used by CSS + icon mapping */
  action?: ButtonAction;

  /**
   * If true, ALWAYS icon-only rendering (hides label).
   * This has priority over showLabel.
   */
  iconOnly?: boolean;

  /**
   * If true, forces label to show (overrides auto icon-only on small screens),
   * unless iconOnly is true.
   */
  showLabel?: boolean;

  /** Optional custom icon override */
  icon?: LucideIcon;
};

function useIsSmallScreen(maxWidth = 640) {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setIsSmall(Boolean(mq.matches));

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
    case "share":
      return Share2;
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
    case "help":
      return HelpCircle;
    default:
      return null;
  }
}

function iconPx(size: ButtonSize) {
  if (size === "sm") return 16;
  if (size === "lg") return 20;
  return 18;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function pickAriaLabel(title?: string, children?: React.ReactNode) {
  if (typeof title === "string" && title.trim()) return title.trim();
  if (typeof children === "string" && children.trim()) return children.trim();
  return undefined;
}

/**
 * ✅ Critical fix:
 * Σε icon-only ΔΕΝ αποδίδουμε label node καθόλου,
 * γιατί το CSS (με !important) μπορεί να το εμφανίζει.
 */
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

  const Icon = useMemo(() => icon ?? actionToIcon(action), [icon, action]);
  const hasIcon = Boolean(Icon);

  const forceIconOnly = Boolean(iconOnly);
  const forceShowLabel = Boolean(showLabel);

  // Auto: small screen + hasIcon => icon-only (unless showLabel is forced)
  const autoIconOnly = isSmall && hasIcon && !forceShowLabel;

  const effectiveIconOnly = forceIconOnly ? true : autoIconOnly;
  const effectiveShowLabel = forceIconOnly ? false : forceShowLabel ? true : !effectiveIconOnly;

  // Accessibility:
  // - if icon-only, we must set aria-label (or render sr-only text)
  const ariaLabel = effectiveIconOnly ? pickAriaLabel(title, children) : undefined;
  const srLabel = effectiveIconOnly ? pickAriaLabel(title, children) : undefined;

  return (
    <button
      {...rest}
      title={title}
      aria-label={ariaLabel}
      data-action={action}
      data-icon-only={effectiveIconOnly ? "true" : undefined}
      data-show-label={effectiveShowLabel ? "true" : undefined}
      className={cn("btn", `btn--${variant}`, `btn--${size}`, className)}
    >
      {hasIcon ? (
        <span className="btn__icon" aria-hidden="true">
          {Icon ? <Icon size={iconPx(size)} strokeWidth={2} style={{ display: "block" }} /> : null}
        </span>
      ) : null}

      {/* ✅ Only render label when it should be visible */}
      {effectiveShowLabel ? <span className="btn__label">{children}</span> : null}

      {/* ✅ Icon-only: keep accessible text (won't be affected by your .btn__label css) */}
      {!effectiveShowLabel && srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </button>
  );
}