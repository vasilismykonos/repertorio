"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  Settings,
} from "lucide-react";

export type LinkButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "outline"
  | "link"
  | "icon";

export type LinkButtonSize = "sm" | "md" | "lg";

export type LinkButtonAction =
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
  | "settings"; 

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: LinkButtonVariant;
  size?: LinkButtonSize;
  action?: LinkButtonAction;

  iconOnly?: boolean;
  showLabel?: boolean;

  icon?: LucideIcon;

  /** Optional: emulate disabled */
  disabled?: boolean;
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

    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [maxWidth]);

  return isSmall;
}

function actionToIcon(action: LinkButtonAction | undefined): LucideIcon | null {
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
    case "edit":
      return Pencil;
    case "apply":
      return Check;
    case "search":
      return Search;
    case "select":
      return CircleDot;
    case "sort":
      return ArrowUpDown;
    case "settings":
      return Settings;
    default:
      return null;
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function LinkButton(props: Props) {
  const {
    href,
    variant = "secondary",
    size = "md",
    action = "none",
    iconOnly,
    showLabel,
    icon,
    className,
    children,
    title,
    disabled,
    onClick,
    ...rest
  } = props;

  const isSmall = useIsSmallScreen(640);

  // Ποιο icon ισχύει
  const Icon = useMemo(() => {
    return icon ?? actionToIcon(action);
  }, [icon, action]);

  const hasIcon = !!Icon;

  // Βάση λογικής: σε μικρή οθόνη ή αν το ζητήσεις ρητά => icon-only
  const baseIconOnly = !!iconOnly || isSmall;

  // ΤΕΛΙΚΑ: icon-only ΜΟΝΟ αν υπάρχει icon
  const effectiveIconOnly = baseIconOnly && hasIcon;

  // Αν είναι icon-only → δεν δείχνουμε label.
  // Αλλιώς → δείχνουμε label by default, εκτός αν showLabel === false.
  const effectiveShowLabel = effectiveIconOnly ? false : showLabel ?? true;

  const effectiveTitle = isSmall ? undefined : title;

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  };

  return (
    <Link
      href={disabled ? "#" : href}
      onClick={handleClick}
      title={effectiveTitle}
      aria-disabled={disabled ? "true" : undefined}
      data-action={action}
      data-icon-only={effectiveIconOnly ? "true" : undefined}
      data-show-label={effectiveShowLabel ? "true" : undefined}
      className={cn(
        "btn",
        `btn--${variant}`,
        `btn--${size}`,
        disabled && "btn--disabled",
        className,
      )}
      {...rest}
    >
      <span className="btn__icon" aria-hidden="true">
        {Icon ? <Icon size={18} strokeWidth={2} style={{ display: "block" }} /> : null}
      </span>

      <span className="btn__label">{children}</span>
    </Link>
  );
}
