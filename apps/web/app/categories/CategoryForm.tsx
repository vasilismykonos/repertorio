"use client";

import React from "react";
import InlineError from "../components/InlineError";

export type CategoryForEdit = {
  id: number;
  title: string;
  slug: string | null;
};

export type CategoryFormValues = {
  title: string;
  slug: string;
};

export type CategoryFormProps = {
  value: CategoryFormValues;
  onChange: (next: CategoryFormValues) => void;
  error?: string | null;
  disabled?: boolean;
};

export default function CategoryForm({
  value,
  onChange,
  error = null,
  disabled = false,
}: CategoryFormProps) {
  return (
    <div style={{ maxWidth: 600 }}>
      <InlineError message={error} />

      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="category-title"
          style={{ display: "block", marginBottom: 4, fontWeight: 500 }}
        >
          Τίτλος
        </label>
        <input
          id="category-title"
          type="text"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.currentTarget.value })}
          required
          disabled={disabled}
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "16px",
            borderRadius: 4,
            border: "1px solid #ccc",
            color: "#000",
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="category-slug"
          style={{ display: "block", marginBottom: 4, fontWeight: 500 }}
        >
          Slug (προαιρετικό)
        </label>
        <input
          id="category-slug"
          type="text"
          value={value.slug}
          onChange={(e) => onChange({ ...value, slug: e.currentTarget.value })}
          placeholder="αν αφεθεί κενό, θα δημιουργηθεί αυτόματα"
          disabled={disabled}
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "16px",
            borderRadius: 4,
            border: "1px solid #ccc",
            color: "#000",
          }}
        />
        <small style={{ fontSize: "12px", color: "#888" }}>
          Αν αφεθεί κενό, θα παραχθεί αυτόματα από τον τίτλο.
        </small>
      </div>
    </div>
  );
}
