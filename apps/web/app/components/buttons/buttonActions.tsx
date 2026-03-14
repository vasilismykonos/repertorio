// apps/web/app/components/buttons/buttonActions.tsx
"use client";

import React from "react";
import { signIn, signOut } from "next-auth/react";
import Button, { type ButtonAction } from "./Button";
import LinkButton from "./LinkButton";

type CommonProps = {
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;

  /**
   * Αν είναι true, θα εμφανίσει label ακόμα κι αν το Button θα έκανε auto icon-only σε μικρές οθόνες.
   * ✅ Default: undefined (ΔΕΝ το κάνουμε force)
   */
  showLabel?: boolean;

  /**
   * Αν είναι true, κρύβει το label (icon-only). Έχει προτεραιότητα από showLabel.
   */
  iconOnly?: boolean;
};

type ClickProps = CommonProps & {
  onClick?: () => void;
};

type SaveProps = ClickProps & {
  loading?: boolean;
  label?: string;
  loadingLabel?: string;
};

type DeleteProps = ClickProps & {
  loading?: boolean;
  label?: string;
  loadingLabel?: string;
};

type AddProps = ClickProps & {
  label?: string;
};

export type LinkProps = CommonProps & {
  href: string;
  label?: string;
};

// ✅ Single source of truth for LinkButton action type
type LinkAction = React.ComponentProps<typeof LinkButton>["action"];

type LinkLikeProps = LinkProps & {
  action?: LinkAction;
  variant?: React.ComponentProps<typeof LinkButton>["variant"];
  target?: React.ComponentProps<typeof LinkButton>["target"];
  rel?: React.ComponentProps<typeof LinkButton>["rel"];
};

/**
 * ✅ KEY FIX:
 * - ΜΗΝ κάνεις default showLabel=true γιατί ακυρώνει το auto icon-only του Button σε μικρές οθόνες.
 * - Αν showLabel είναι undefined, ΔΕΝ το κάνουμε force -> αφήνουμε το Button να αποφασίσει.
 */
function resolveVisibilityProps(p: CommonProps) {
  const iconOnly = p.iconOnly === true;

  // Αν iconOnly => showLabel πάντα false.
  // Αλλιώς: δείξε label ΜΟΝΟ αν ο caller έδωσε ρητά showLabel (true/false).
  const showLabel = iconOnly ? false : p.showLabel;

  return { iconOnly, showLabel };
}

function getSameOriginCallbackUrl(fallback = "/") {
  if (typeof window === "undefined") return fallback;
  const path = window.location.pathname + window.location.search;
  return path || fallback;
}

/**
 * Centralised UI actions (buttons/links) to keep the UI consistent across pages.
 */
export const A = {
  // ---------- Generic links ----------
  link(props: LinkLikeProps) {
    const {
      href,
      disabled,
      title,
      className,
      style,
      label = "",
      variant = "secondary",
      target,
      rel,
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <LinkButton
        href={href}
        action={props.action ?? "none"}
        title={title}
        className={className}
        style={style}
        aria-label={title || label || undefined}
        disabled={disabled}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
        variant={variant}
        target={target}
        rel={rel}
      >
        {label}
      </LinkButton>
    );
  },

  externalLink(props: Omit<LinkLikeProps, "target" | "rel">) {
    return A.link({
      ...props,
      target: "_blank",
      rel: "noreferrer",
    });
  },

  // ---------- Semantic links ----------
  backLink(props: LinkProps & { action?: LinkAction }) {
    const {
      href,
      disabled,
      title = "Πίσω",
      className,
      style,
      label = "Πίσω",
    } = props;

    return A.link({
      href,
      disabled,
      title,
      className,
      style,
      label,
      action: props.action ?? "back",
      variant: "secondary",
      iconOnly: props.iconOnly,
      showLabel: props.showLabel,
    });
  },

  nextLink(props: LinkProps & { action?: LinkAction }) {
    const {
      href,
      disabled,
      title = "Επόμενη",
      className,
      style,
      label = "Επόμενη",
    } = props;

    return A.link({
      href,
      disabled,
      title,
      className,
      style,
      label,
      action: props.action ?? "select",
      variant: "secondary",
      iconOnly: props.iconOnly,
      showLabel: props.showLabel,
    });
  },

  sortLink(props: LinkProps & { action?: LinkAction }) {
    const {
      href,
      disabled,
      title = "Ταξινόμηση",
      className,
      style,
      label = "Ταξινόμηση",
    } = props;

    return A.link({
      href,
      disabled,
      title,
      className,
      style,
      label,
      action: props.action ?? "sort",
      variant: "secondary",
      iconOnly: props.iconOnly,
      showLabel: props.showLabel,
    });
  },

  // ---------- Search ----------
  search(props: ClickProps & { action?: ButtonAction; label?: string }) {
    const {
      onClick,
      disabled,
      title = "Αναζήτηση",
      className,
      style,
      label = "Αναζήτηση",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="primary"
        size="md"
        action={props.action ?? "search"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  // ---------- Help (NEW) ----------
  help(
    props: ClickProps & {
      action?: ButtonAction;
      label?: string;
      storageKey?: string;
    },
  ) {
    const {
      onClick,
      disabled,
      title = "Βοήθεια",
      className,
      style,
      label = "Βοήθεια",
      storageKey,
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    const handleClick = () => {
      if (onClick) {
        onClick();
        return;
      }
      if (typeof window === "undefined") return;

      try {
        if (storageKey) window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }

      try {
        window.dispatchEvent(
          new CustomEvent("repertorio_help", { detail: { storageKey } }),
        );
      } catch {
        // ignore
      }
    };

    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        action={props.action ?? ("help" as ButtonAction)}
        disabled={disabled}
        onClick={handleClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  // ---------- Share ----------
  share(
    props: CommonProps & {
      label?: string;
      url?: string;
      shareTitle?: string;
      onCopied?: () => void;
    },
  ) {
    const {
      disabled,
      title = "Κοινοποίηση",
      className,
      style,
      label = "Share",
      url,
      shareTitle,
      onCopied,
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    const onClick = async () => {
      const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
      const shareT =
        shareTitle ?? (typeof document !== "undefined" ? document.title : "Share");

      if (!shareUrl) return;

      try {
        if (typeof navigator !== "undefined" && "share" in navigator) {
          await (navigator as any).share({ title: shareT, url: shareUrl });
          return;
        }

        const nav: Navigator | undefined =
          typeof window !== "undefined" ? window.navigator : undefined;

        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(shareUrl);
          onCopied?.();
          return;
        }

        if (typeof window !== "undefined") {
          window.prompt("Αντιγραφή link:", shareUrl);
        }
      } catch (e) {
        console.error("Share failed:", e);
        if (typeof window !== "undefined") {
          try {
            window.prompt("Αντιγραφή link:", shareUrl);
          } catch {
            // ignore
          }
        }
      }
    };

    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        action="share"
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  newLink(props: LinkProps & { action?: LinkAction }) {
    const {
      href,
      disabled,
      title = "Νέο",
      className,
      style,
      label = "Νέο",
    } = props;

    return A.link({
      href,
      disabled,
      title,
      className,
      style,
      label,
      action: props.action ?? "new",
      variant: "primary",
      iconOnly: props.iconOnly,
      showLabel: props.showLabel,
    });
  },

  editLink(props: LinkProps & { action?: LinkAction }) {
    const {
      href,
      disabled,
      title = "Επεξεργασία",
      className,
      style,
      label = "Επεξεργασία",
    } = props;

    return A.link({
      href,
      disabled,
      title,
      className,
      style,
      label,
      action: props.action ?? "edit",
      variant: "secondary",
      iconOnly: props.iconOnly,
      showLabel: props.showLabel,
    });
  },

  edit(props: ClickProps & { action?: ButtonAction; label?: string }) {
    const {
      onClick,
      disabled,
      title = "Επεξεργασία",
      className,
      style,
      label = "Επεξεργασία",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        action={props.action ?? "edit"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  settingsLink(props: LinkProps & { action?: LinkAction }) {
    const {
      href,
      disabled,
      title = "Ρυθμίσεις",
      className,
      style,
      label = "Ρυθμίσεις",
    } = props;

    return A.link({
      href,
      disabled,
      title,
      className,
      style,
      label,
      action: props.action ?? "settings",
      variant: "secondary",
      iconOnly: props.iconOnly,
      showLabel: props.showLabel,
    });
  },

  // ---------- Buttons ----------
  save(props: SaveProps & { action?: ButtonAction }) {
    const {
      onClick,
      disabled,
      loading,
      title = "Αποθήκευση",
      className,
      style,
      label = "Αποθήκευση",
      loadingLabel = "Αποθήκευση...",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="primary"
        size="md"
        action={props.action ?? "save"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {loading ? loadingLabel : label}
      </Button>
    );
  },

  del(props: DeleteProps & { action?: ButtonAction }) {
    const {
      onClick,
      disabled,
      loading,
      title = "Διαγραφή",
      className,
      style,
      label = "Διαγραφή",
      loadingLabel = "Διαγραφή...",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="danger"
        size="md"
        action={props.action ?? "delete"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {loading ? loadingLabel : label}
      </Button>
    );
  },

  cancel(props: ClickProps & { action?: ButtonAction; label?: string }) {
    const {
      onClick,
      disabled,
      title = "Άκυρο",
      className,
      style,
      label = "Άκυρο",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        action={props.action ?? "cancel"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  add(props: AddProps & { action?: ButtonAction }) {
    const {
      onClick,
      disabled,
      title = "Προσθήκη",
      className,
      style,
      label = "Προσθήκη",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="primary"
        size="md"
        action={props.action ?? "new"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  room(props: ClickProps & { action?: ButtonAction; label?: string }) {
    const {
      onClick,
      disabled,
      title = "Αποστολή στο room",
      className,
      style,
      label = "Room",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        action={props.action ?? "room"}
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  refresh(props: ClickProps & { label?: string }) {
    const {
      onClick,
      disabled,
      title = "Ανανέωση",
      className,
      style,
      label = "Ανανέωση",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        action="refresh"
        disabled={disabled}
        onClick={onClick}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  login(props: CommonProps & { label?: string; provider?: string; callbackUrl?: string }) {
    const {
      disabled,
      title = "Σύνδεση",
      className,
      style,
      label = "Σύνδεση",
      provider = "google",
      callbackUrl,
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant="primary"
        size="md"
        action="login"
        disabled={disabled}
        onClick={() => {
          const cb = callbackUrl ?? getSameOriginCallbackUrl("/");
          void signIn(provider, { callbackUrl: cb });
        }}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },

  logout(
    props: CommonProps & {
      label?: string;
      callbackUrl?: string;
      variant?: React.ComponentProps<typeof Button>["variant"];
    },
  ) {
    const {
      disabled,
      title = "Αποσύνδεση",
      className,
      style,
      label = "Αποσύνδεση",
      callbackUrl,
      variant = "danger",
    } = props;

    const { iconOnly, showLabel } = resolveVisibilityProps(props);

    return (
      <Button
        type="button"
        variant={variant}
        size="md"
        action="logout"
        disabled={disabled}
        onClick={() => {
          const cb = callbackUrl ?? getSameOriginCallbackUrl("/");
          void signOut({ callbackUrl: cb });
        }}
        title={title}
        aria-label={title}
        className={className}
        style={style}
        iconOnly={iconOnly}
        {...(showLabel !== undefined ? { showLabel } : {})}
      >
        {label}
      </Button>
    );
  },
};