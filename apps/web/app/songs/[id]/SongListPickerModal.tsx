"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Button from "../../components/buttons/Button";
import { A } from "../../components/buttons";
import type {
  ListItemSingerSuggestion,
  ListItemToneValue,
} from "@/app/components/ListItemTonePicker";

const ListItemTonePicker = dynamic(
  () => import("@/app/components/ListItemTonePicker"),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        style={{
          minHeight: 34,
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.32)",
          background: "#181818",
          color: "#fff",
          fontWeight: 800,
          opacity: 0.72,
        }}
      >
        Τόνος / φωνή
      </button>
    ),
  },
);

type ListRole = "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";

type SongListOption = {
  id: number;
  title: string;
  groupId: number | null;
  groupIds?: number[];
  groups?: ListGroupOption[];
  marked: boolean;
  role: ListRole;
  itemsCount: number;
  listItemId?: number | null;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  selectedSingerTuneTitle?: string | null;
  selectedSingerTuneTune?: string | null;
  name?: string;
  listTitle?: string;
  list_title?: string;
  containsSong?: boolean;
  selected?: boolean;
  isSelected?: boolean;
};

type ListGroupOption = {
  id: number;
  title: string;
  fullTitle?: string | null;
  listsCount?: number;
};

type CreateListInput = {
  title: string;
  groupId: number | null;
  groupIds?: number[];
  marked: boolean;
};

type Props = {
  open: boolean;
  songId: number;
  songTitle: string;
  songOriginalKey?: string | null;
  songOriginalKeySign?: "+" | "-" | null;
  defaultToneSelection: ListItemToneValue;
  listToneSelections: Record<number, ListItemToneValue | undefined>;
  onListToneSelectionChange: (
    list: SongListOption,
    value: ListItemToneValue,
  ) => void | Promise<void>;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  availableLists: SongListOption[];
  availableGroups: ListGroupOption[];
  filteredLists: SongListOption[];
  lastSelectedListId: number | null;
  submittingListId: number | null;
  onClose: () => void;
  onSelectList: (list: SongListOption, toneSelection: ListItemToneValue) => void | Promise<void>;
  onCreateList: (input: CreateListInput) => Promise<SongListOption>;
  normalizeListTitle: (list: Partial<SongListOption> | null | undefined) => string;
};

function isListAlreadySelected(list: SongListOption): boolean {
  return Boolean(list.containsSong || list.selected || list.isSelected);
}

function stripTrailingCount(label: string): string {
  return String(label || "").replace(/\s*\(\d+\)\s*$/, "").trim();
}

function normalizeGroupTitle(group: Partial<ListGroupOption> | null | undefined): string {
  const raw = group?.fullTitle || group?.title || "";
  return stripTrailingCount(raw);
}

function nullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function nullablePositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

function nullableSign(value: unknown): "+" | "-" | null {
  return value === "+" || value === "-" ? value : null;
}

function toneValueFromList(
  list: Partial<SongListOption> | null | undefined,
  fallback?: ListItemToneValue,
): ListItemToneValue {
  return {
    selectedTonicity: nullableText(list?.selectedTonicity) ?? fallback?.selectedTonicity ?? null,
    selectedTonicitySign:
      nullableSign(list?.selectedTonicitySign) ?? fallback?.selectedTonicitySign ?? null,
    selectedSingerTuneId:
      nullablePositiveInt(list?.selectedSingerTuneId) ??
      fallback?.selectedSingerTuneId ??
      null,
    selectedSingerTuneTitle:
      nullableText(list?.selectedSingerTuneTitle) ??
      fallback?.selectedSingerTuneTitle ??
      null,
    selectedSingerTuneTune:
      nullableText(list?.selectedSingerTuneTune) ??
      fallback?.selectedSingerTuneTune ??
      null,
  };
}

function normalizeSuggestionTitle(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("el");
}

function canEditListSongs(list: SongListOption): boolean {
  return list.role === "OWNER" || list.role === "LIST_EDITOR" || list.role === "SONGS_EDITOR";
}

const inputStyle: React.CSSProperties = {
  width: "28ch",
  maxWidth: "100%",
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid #d0d0d0",
  background: "#fff",
  color: "#111",
  padding: "10px 12px",
  outline: "none",
};

export default function SongListPickerModal({
  open,
  songId,
  songTitle,
  songOriginalKey,
  songOriginalKeySign,
  defaultToneSelection,
  listToneSelections,
  onListToneSelectionChange,
  query,
  onQueryChange,
  loading,
  error,
  availableLists,
  availableGroups,
  filteredLists,
  lastSelectedListId,
  submittingListId,
  onClose,
  onSelectList,
  onCreateList,
  normalizeListTitle,
}: Props) {
  const [creatingList, setCreatingList] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreatingList(false);
    setLocalError(null);
  }, [open]);

  const groupLabelById = useMemo(() => {
    const labels = new Map<number, string>();

    for (const group of availableGroups) {
      const id = Number(group.id);
      if (!Number.isFinite(id) || id <= 0 || labels.has(id)) continue;
      labels.set(id, normalizeGroupTitle(group) || `Ομάδα #${id}`);
    }

    return labels;
  }, [availableGroups]);

  const singerSuggestions = useMemo<ListItemSingerSuggestion[]>(() => {
    const seen = new Set<string>();
    const out: ListItemSingerSuggestion[] = [];

    for (const list of availableLists) {
      const title = nullableText(list.selectedSingerTuneTitle);
      if (!title) continue;

      const key = normalizeSuggestionTitle(title);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        title,
        tune: nullableText(list.selectedSingerTuneTune ?? list.selectedTonicity),
        singerTuneId: nullablePositiveInt(list.selectedSingerTuneId),
      });
    }

    return out.slice(0, 8);
  }, [availableLists]);

  const sortedFilteredLists = useMemo(() => {
    return [...filteredLists].sort((a, b) => {
      const aLastSelected = a.id === lastSelectedListId;
      const bLastSelected = b.id === lastSelectedListId;
      const aSelected = isListAlreadySelected(a);
      const bSelected = isListAlreadySelected(b);

      if (aLastSelected !== bLastSelected) return aLastSelected ? -1 : 1;
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      if (Boolean(a.marked) !== Boolean(b.marked)) return a.marked ? -1 : 1;

      return normalizeListTitle(a).localeCompare(normalizeListTitle(b), "el", {
        sensitivity: "base",
      });
    });
  }, [filteredLists, lastSelectedListId, normalizeListTitle]);

  const searchTitle = query.trim();
  const mutating = submittingListId !== null || creatingList;
  const shownError = localError || error;
  const canCreateFromSearch =
    searchTitle.length > 0 && !loading && !error && sortedFilteredLists.length === 0;

  async function handleCreateListAndAdd() {
    if (mutating) return;

    const title = searchTitle;
    if (!title) {
      setLocalError("Συμπλήρωσε τίτλο λίστας.");
      return;
    }

    setCreatingList(true);
    setLocalError(null);

    try {
      const list = await onCreateList({
        title,
        groupId: null,
        marked: false,
      });
      await onSelectList(list, defaultToneSelection);
    } catch (e: any) {
      setLocalError(String(e?.message || e || "Αποτυχία δημιουργίας λίστας."));
    } finally {
      setCreatingList(false);
    }
  }

  if (!open) return null;

  return (
    <div
      data-no-swipe
      onClick={() => {
        if (!mutating) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Επιλογή λίστας"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "88vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          border: "1px solid #333",
          background: "#0b0b0b",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderBottom: "1px solid #222",
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Προσθήκη σε λίστα</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>{songTitle}</div>
          </div>

          <Button
            type="button"
            variant="secondary"
            action="cancel"
            onClick={onClose}
            disabled={mutating}
            title="Κλείσιμο"
            aria-label="Κλείσιμο"
            iconOnly
          >
            Κλείσιμο
          </Button>
        </div>

        <div style={{ padding: 16, borderBottom: "1px solid #222", display: "grid", gap: 12 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Αναζήτηση λίστας ή ομάδας..."
            autoFocus
            style={inputStyle}
          />
        </div>

        {shownError ? (
          <div
            style={{
              margin: 16,
              marginBottom: 0,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #6f1f1f",
              background: "#1f1010",
              color: "#ffd7d7",
            }}
          >
            {shownError}
          </div>
        ) : null}

        <div
          style={{
            padding: 16,
            overflowY: "auto",
            display: "grid",
            gap: 14,
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {loading ? (
              <div style={{ opacity: 0.85 }}>Φόρτωση λιστών...</div>
            ) : sortedFilteredLists.length === 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ opacity: 0.85 }}>
                  {searchTitle
                    ? `Δεν βρέθηκε λίστα ή ομάδα για "${searchTitle}".`
                    : availableLists.length === 0
                      ? "Δεν βρέθηκαν διαθέσιμες λίστες."
                      : "Πληκτρολόγησε για αναζήτηση λίστας ή ομάδας."}
                </div>

                {canCreateFromSearch ? (
                  <div>
                    <Button
                      type="button"
                      variant="primary"
                      action="new"
                      showLabel
                      disabled={mutating}
                      onClick={() => void handleCreateListAndAdd()}
                    >
                      {creatingList ? "Δημιουργία..." : "Δημιουργία και προσθήκη"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              sortedFilteredLists.map((list) => {
                const busy = submittingListId === list.id;
                const alreadySelected = isListAlreadySelected(list);
                const isLastSelected = list.id === lastSelectedListId;
                const rowToneSelection =
                  listToneSelections[list.id] ??
                  toneValueFromList(list, alreadySelected ? undefined : defaultToneSelection);
                const title = normalizeListTitle(list);
                const groupLabels = Array.isArray(list.groups)
                  ? list.groups.map((group) => normalizeGroupTitle(group)).filter(Boolean)
                  : [];
                if (!groupLabels.length && Array.isArray(list.groupIds)) {
                  for (const groupId of list.groupIds) {
                    const id = Number(groupId);
                    if (Number.isFinite(id) && id > 0) {
                      groupLabels.push(groupLabelById.get(id) || `Tag #${id}`);
                    }
                  }
                }
                if (!groupLabels.length && list.groupId !== null) {
                  groupLabels.push(groupLabelById.get(list.groupId) || `Tag #${list.groupId}`);
                }
                const groupLabel = groupLabels.length ? groupLabels.join(", ") : "Χωρίς tag";
                const canChangeTone = !alreadySelected || canEditListSongs(list);
                const actionDisabled = mutating || alreadySelected;

                return (
                  <div
                    key={list.id}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: 14,
                      border: alreadySelected ? "1px solid #1f6f45" : "1px solid #333",
                      background: busy ? "#18221a" : alreadySelected ? "#0f1f17" : "#111",
                      color: alreadySelected ? "#d7ffe8" : "inherit",
                      padding: "12px 14px",
                      boxSizing: "border-box",
                      opacity: mutating && !busy ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            fontWeight: 700,
                            overflowWrap: "anywhere",
                          }}
                        >
                          <span>{title}</span>

                          {isLastSelected ? (
                            <span
                              title="Πιο πρόσφατη επιλογή"
                              aria-label="Πιο πρόσφατη επιλογή"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                borderRadius: 999,
                                border: "1px solid #315a66",
                                background: "#0d252c",
                                color: "#9ee8f5",
                                padding: "2px 8px",
                                fontSize: 12,
                                fontWeight: 700,
                                lineHeight: 1.2,
                              }}
                            >
                              ↺ Πρόσφατη
                            </span>
                          ) : null}
                        </div>

                        <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>
                          {groupLabel}
                        </div>

                        <div style={{ fontSize: 13, opacity: 0.68, marginTop: 2 }}>
                          {list.itemsCount} τραγούδια · ρόλος {list.role}
                          {list.marked ? " · ★" : ""}
                        </div>
                      </div>

                      <div
                        style={{
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.7)",
                              fontWeight: 700,
                            }}
                          >
                            Τόνος / φωνή
                          </span>
                          <ListItemTonePicker
                            songId={songId}
                            songOriginalKey={songOriginalKey}
                            songOriginalKeySign={songOriginalKeySign}
                            value={rowToneSelection}
                            onChange={(nextValue) => {
                              void onListToneSelectionChange(list, nextValue);
                            }}
                            singerSuggestions={singerSuggestions}
                            disabled={mutating || !canChangeTone}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (alreadySelected) return;
                            void onSelectList(list, rowToneSelection);
                          }}
                          disabled={actionDisabled}
                          style={{
                            minHeight: 36,
                            borderRadius: 10,
                            border: alreadySelected ? "1px solid #1f6f45" : "1px solid #444",
                            background: busy
                              ? "#1b2b1f"
                              : alreadySelected
                                ? "#102a1b"
                                : "#1b1b1b",
                            color: alreadySelected ? "#9df0ba" : "#fff",
                            padding: "7px 12px",
                            fontWeight: 800,
                            cursor: actionDisabled ? "default" : "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {busy
                            ? alreadySelected
                              ? "Αποθήκευση..."
                              : "Προσθήκη..."
                            : alreadySelected
                              ? "Επιλεγμένο"
                              : "Επιλογή"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
