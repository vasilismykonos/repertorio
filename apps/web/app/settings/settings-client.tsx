"use client";

// apps/web/app/settings/settings-client.tsx
import { useMemo, useState } from "react";
import ElasticsearchTab from "./tabs/ElasticsearchTab";
import TagsTab from "./tabs/TagsTab";

type TabKey = "general" | "elasticsearch" | "tags";

export default function SettingsClient() {
  const [active, setActive] = useState<TabKey>("elasticsearch");

  const tabs = useMemo(
    () => [
      { key: "general" as const, label: "Γενικά" },
      { key: "elasticsearch" as const, label: "Elasticsearch" },
      { key: "tags" as const, label: "Tags" },
    ],
    [],
  );

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 10 }}>Ρυθμίσεις</h1>

      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "1px solid #ddd",
          paddingBottom: 10,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: active === t.key ? "#111" : "#fff",
              color: active === t.key ? "#fff" : "#111",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "general" && (
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 14,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Γενικά</h2>
          <p style={{ marginBottom: 0, color: "#444" }}>
            (placeholder)
          </p>
        </div>
      )}

      {active === "elasticsearch" && <ElasticsearchTab />}
      {active === "tags" && <TagsTab />}
    </div>
  );
}
