"use client";

import React from "react";
import { Paperclip, type LucideIcon } from "lucide-react";

import Button from "../../components/buttons/Button";
import SongAssetsClient from "./SongAssetsClient";

type Props = {
  open: boolean;
  hasAssets: boolean;
  assets: any[];
  onToggle: () => void;
};

const PANEL_ICON_HAS_CONTENT = "#22c55e";

function panelIcon(Icon: LucideIcon, hasContent: boolean): LucideIcon {
  function PanelIcon(props: any) {
    return <Icon {...props} color={hasContent ? PANEL_ICON_HAS_CONTENT : props.color} />;
  }
  return PanelIcon as LucideIcon;
}

export default function SongAssetsPanel(props: Props) {
  const { open, hasAssets, assets, onToggle } = props;

  return (
    <>
      {/* Button (πάνω στα panel buttons) */}
      <span data-tour="btn-assets" style={{ display: "inline-flex" }}>
        <Button
          type="button"
          variant={open ? "primary" : "secondary"}
          onClick={onToggle}
          title={open ? "Απόκρυψη υλικού" : "Εμφάνιση υλικού"}
          aria-pressed={open}
          icon={panelIcon(Paperclip, hasAssets)}
        >
          Υλικό
        </Button>
      </span>

      {/* Panel moved to bottom (απόλυτα κάτω) */}
      <SongAssetsClient open={open} assets={assets ?? []} />
    </>
  );
}
