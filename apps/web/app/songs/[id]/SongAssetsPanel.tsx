"use client";

import React from "react";
import { Paperclip } from "lucide-react";

import Button from "../../components/buttons/Button";
import SongAssetsClient from "./SongAssetsClient";

type Props = {
  open: boolean;
  hasAssets: boolean;
  assets: any[];
  onToggle: () => void;
};

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
          icon={Paperclip}
          disabled={!hasAssets}
        >
          Υλικό
        </Button>
      </span>

      {/* Panel moved to bottom (απόλυτα κάτω) */}
      <SongAssetsClient open={open} assets={assets ?? []} />
    </>
  );
}