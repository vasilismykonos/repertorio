// apps/web/app/artists/[id]/ArtistActionBarClient.tsx
"use client";

import React from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

type Props = {
  artistId: number;
  canEdit: boolean;
};

export default function ArtistActionBarClient({ artistId, canEdit }: Props) {
  return (
    <ActionBar
      left={A.backLink({
        href: "/artists",
        title: "Πίσω στη λίστα καλλιτεχνών",
        label: "Πίσω",
      })}
      right={
        canEdit
          ? A.editLink({
              href: `/artists/${artistId}/edit`,
              title: "Επεξεργασία καλλιτέχνη",
              label: "Επεξεργασία",
            })
          : null
      }
    />
  );
}
