"use client";

import React, { useMemo } from "react";
import Button from "../../components/buttons/Button";
import { A } from "../../components/buttons";

type SongListOption = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  itemsCount: number;
  name?: string;
  listTitle?: string;
  list_title?: string;

  // Νέα optional flags ώστε το modal να ξέρει αν η λίστα περιέχει ήδη το τραγούδι
  containsSong?: boolean;
  selected?: boolean;
  isSelected?: boolean;
};

type Props = {
  open: boolean;
  songTitle: string;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  availableLists: SongListOption[];
  filteredLists: SongListOption[];
  submittingListId: number | null;
  onClose: () => void;
  onSelectList: (list: SongListOption) => void | Promise<void>;
  normalizeListTitle: (list: Partial<SongListOption> | null | undefined) => string;
};

function isListAlreadySelected(list: SongListOption): boolean {
  return Boolean(list.containsSong || list.selected || list.isSelected);
}

export default function SongListPickerModal({
  open,
  songTitle,
  query,
  onQueryChange,
  loading,
  error,
  availableLists,
  filteredLists,
  submittingListId,
  onClose,
  onSelectList,
  normalizeListTitle,
}: Props) {
  const sortedFilteredLists = useMemo(() => {
    return [...filteredLists].sort((a, b) => {
      const aSelected = isListAlreadySelected(a);
      const bSelected = isListAlreadySelected(b);

      if (aSelected !== bSelected) return aSelected ? -1 : 1;

      if (Boolean(a.marked) !== Boolean(b.marked)) return a.marked ? -1 : 1;

      return normalizeListTitle(a).localeCompare(normalizeListTitle(b), "el", {
        sensitivity: "base",
      });
    });
  }, [filteredLists, normalizeListTitle]);

  if (!open) return null;

  return (
    <div
      data-no-swipe
      onClick={() => {
        if (submittingListId === null) onClose();
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
          maxWidth: 640,
          maxHeight: "85vh",
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
            disabled={submittingListId !== null}
            title="Κλείσιμο"
            aria-label="Κλείσιμο"
            iconOnly
          >
            Κλείσιμο
          </Button>
        </div>

        <div style={{ padding: 16, borderBottom: "1px solid #222" }}>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Αναζήτηση λίστας..."
            autoFocus
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid #333",
              background: "#111",
              color: "inherit",
              padding: "10px 12px",
              outline: "none",
            }}
          />
        </div>

        {error ? (
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
            {error}
          </div>
        ) : null}

        <div
          style={{
            padding: 16,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {loading ? (
            <div style={{ opacity: 0.85 }}>Φόρτωση λιστών...</div>
          ) : sortedFilteredLists.length === 0 ? (
            <div style={{ opacity: 0.85 }}>
              {availableLists.length === 0
                ? "Δεν βρέθηκαν διαθέσιμες λίστες."
                : "Δεν βρέθηκαν λίστες για αυτό το φίλτρο."}
            </div>
          ) : (
            sortedFilteredLists.map((list) => {
              const busy = submittingListId === list.id;
              const alreadySelected = isListAlreadySelected(list);
              const title = normalizeListTitle(list);

              const disabled = submittingListId !== null || alreadySelected;

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
                    background: busy
                      ? "#18221a"
                      : alreadySelected
                        ? "#0f1f17"
                        : "#111",
                    color: alreadySelected ? "#d7ffe8" : "inherit",
                    padding: "12px 14px",
                    cursor: disabled ? "default" : "pointer",
                    opacity:
                      submittingListId !== null && !busy
                        ? 0.7
                        : 1,
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
                      <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                        {title}
                      </div>

                      <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>
                        {list.itemsCount} τραγούδια · ρόλος {list.role}
                        {list.marked ? " · ⭐" : ""}
                        {alreadySelected ? "" : ""}
                      </div>
                    </div>

                    <div
                      style={{
                        flexShrink: 0,
                        fontWeight: alreadySelected ? 700 : 400,
                        color: alreadySelected ? "#9df0ba" : undefined,
                      }}
                    >
                      {busy
                        ? "Προσθήκη..."
                        : alreadySelected
                          ? "Επιλεγμένο"
                          : "Επιλογή"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: 16,
            borderTop: "1px solid #222",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          {A.cancel({
            title: "Κλείσιμο",
            label: "Κλείσιμο",
            disabled: submittingListId !== null,
            onClick: onClose,
          })}
        </div>
      </div>
    </div>
  );
}