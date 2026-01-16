// apps/web/app/categories/[id]/CategoryViewPageClient.tsx
"use client";

import React from "react";

import ActionBar from "@/app/components/ActionBar";
import { A } from "@/app/components/buttons";

type Props = {
  idNum: number;
  canEdit: boolean;
  category: {
    id: number;
    title: string;
    slug: string | null;
    songsCount: number;
  };
};

export default function CategoryViewPageClient({
  idNum,
  category,
  canEdit,
}: Props) {
  return (
    <section style={{ padding: "24px 16px", maxWidth: 900, margin: "0 auto" }}>
      <ActionBar
        right={
          canEdit
            ? A.editLink({
                href: `/categories/${idNum}/edit`,
                title: "Επεξεργασία κατηγορίας",
                label: "Επεξεργασία",
              })
            : null
        }
      />

      <h1 style={{ fontSize: 28, marginBottom: 16 }}>{category.title}</h1>

      

      <p style={{ marginBottom: 8 }}>
        <strong>Τραγούδια:</strong> {category.songsCount}
      </p>
    </section>
  );
}
