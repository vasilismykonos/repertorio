// apps/web/app/components/buttons/buttonActions.tsx
"use client";

import React from "react";

import Button, { type ButtonAction } from "./Button";
import LinkButton from "./LinkButton";

type CommonProps = {
  disabled?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;

  /**
   * Αν είναι true, θα εμφανίσει label ακόμα κι αν το global CSS κρύβει labels για data-action buttons.
   * Default: true (για να μην “εξαφανίζεται” το κείμενο).
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

function resolveVisibilityProps(p: CommonProps) {
  const iconOnly = !!p.iconOnly;
  const showLabel = iconOnly ? false : p.showLabel ?? true;
  return { iconOnly, showLabel };
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
        showLabel={showLabel}
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
        showLabel={showLabel}
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
        showLabel={showLabel}
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
        showLabel={showLabel}
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
        showLabel={showLabel}
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
        showLabel={showLabel}
      >
        {label}
      </Button>
    );
  },
};
