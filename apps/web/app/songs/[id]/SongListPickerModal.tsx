"use client";

import React, { useEffect, useMemo, useState } from "react";
import Button from "../../components/buttons/Button";
import { A } from "../../components/buttons";

type ListRole = "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";

type SongListOption = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
  role: ListRole;
  itemsCount: number;
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
  marked: boolean;
};

type Props = {
  open: boolean;
  songTitle: string;
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
  onSelectList: (list: SongListOption) => void | Promise<void>;
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
  songTitle,
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
      await onSelectList(list);
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

        <div style={{ padding: 16, borderBottom: "1px solid #222", display: "grid", gap: 10 }}>
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
                const title = normalizeListTitle(list);
                const groupLabel =
                  list.groupId === null
                    ? "Χωρίς ομάδα"
                    : groupLabelById.get(list.groupId) || `Ομάδα #${list.groupId}`;
                const disabled = mutating || alreadySelected;

                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      if (alreadySelected) return;
                      void onSelectList(list);
                    }}
                    disabled={disabled}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: 14,
                      border: alreadySelected ? "1px solid #1f6f45" : "1px solid #333",
                      background: busy ? "#18221a" : alreadySelected ? "#0f1f17" : "#111",
                      color: alreadySelected ? "#d7ffe8" : "inherit",
                      padding: "12px 14px",
                      cursor: disabled ? "default" : "pointer",
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
                          fontWeight: alreadySelected ? 700 : 400,
                          color: alreadySelected ? "#9df0ba" : undefined,
                        }}
                      >
                        {busy ? "Προσθήκη..." : alreadySelected ? "Επιλεγμένο" : "Επιλογή"}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
