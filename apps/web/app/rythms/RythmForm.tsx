// apps/web/app/rythms/RythmForm.tsx
"use client";

import React from "react";
import InlineError from "../components/InlineError";

export type RythmForEdit = {
  id: number;
  title: string;
  slug: string | null;
};

export type RythmFormValues = {
  title: string;
  slug: string;
};

export type RythmFormProps = {
  value: RythmFormValues;
  onChange: (next: RythmFormValues) => void;
  error?: string | null;
  disabled?: boolean;
};

export default function RythmForm({
  value,
  onChange,
  error = null,
  disabled = false,
}: RythmFormProps) {
  return (
    <div style={{ maxWidth: 600 }}>
      <InlineError message={error} />

      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="rythm-title"
          style={{ display: "block", marginBottom: 4, fontWeight: 500 }}
        >
          Τίτλος
        </label>
        <input
          id="rythm-title"
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
          htmlFor="rythm-slug"
          style={{ display: "block", marginBottom: 4, fontWeight: 500 }}
        >
          Slug (προαιρετικό)
        </label>
        <input
          id="rythm-slug"
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
