"use client";

import Link from "next/link";

export type SongDuplicateCandidate = {
  id: number;
  title: string;
  firstLyrics: string | null;
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
  matchedText: string | null;
};

type Props = {
  status: "idle" | "loading" | "done" | "error";
  candidates: SongDuplicateCandidate[];
  allowCreateAnyway: boolean;
  onAllowCreateAnyway: () => void;
};

function levelLabel(level: SongDuplicateCandidate["level"]): string {
  if (level === "high") return "Πολύ πιθανό";
  if (level === "medium") return "Πιθανό";
  return "Ίσως";
}

export default function SongDuplicateWarning({
  status,
  candidates,
  allowCreateAnyway,
  onAllowCreateAnyway,
}: Props) {
  const hasCandidates = candidates.length > 0;
  const hasStrongCandidate = candidates.some((candidate) => candidate.level === "high");

  if (status === "idle") return null;
  if (status === "done" && !hasCandidates) return null;

  return (
    <section
      className={`song-duplicate-box ${hasStrongCandidate ? "is-strong" : ""}`}
      aria-live="polite"
    >
      <style>{`
        .song-duplicate-box {
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: rgba(15, 23, 42, 0.72);
          border-radius: 10px;
          padding: 12px;
          color: #f8fafc;
          display: grid;
          gap: 10px;
        }
        .song-duplicate-box.is-strong {
          border-color: rgba(248, 113, 113, 0.75);
          background: rgba(69, 10, 10, 0.72);
        }
        .song-duplicate-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .song-duplicate-title {
          font-weight: 800;
          line-height: 1.2;
        }
        .song-duplicate-sub {
          margin-top: 3px;
          color: rgba(248, 250, 252, 0.78);
          font-size: 13px;
          line-height: 1.35;
        }
        .song-duplicate-loading {
          color: rgba(248, 250, 252, 0.72);
          font-size: 13px;
        }
        .song-duplicate-list {
          display: grid;
          gap: 8px;
        }
        .song-duplicate-item {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          padding: 10px;
          display: grid;
          gap: 7px;
        }
        .song-duplicate-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .song-duplicate-song-title {
          color: #fff;
          font-weight: 750;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .song-duplicate-score {
          flex: 0 0 auto;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          padding: 2px 7px;
          color: #e2e8f0;
          font-size: 12px;
          white-space: nowrap;
        }
        .song-duplicate-preview {
          color: rgba(248, 250, 252, 0.82);
          font-size: 13px;
          line-height: 1.35;
        }
        .song-duplicate-reasons {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        .song-duplicate-reason {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          color: #f8fafc;
          font-size: 12px;
          line-height: 18px;
          padding: 0 7px;
        }
        .song-duplicate-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .song-duplicate-link,
        .song-duplicate-continue {
          min-height: 34px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
          padding: 6px 10px;
          font-weight: 750;
          text-decoration: none;
          cursor: pointer;
        }
        .song-duplicate-continue {
          background: ${allowCreateAnyway ? "rgba(22, 101, 52, 0.9)" : "rgba(185, 28, 28, 0.9)"};
          border-color: ${allowCreateAnyway ? "rgba(74, 222, 128, 0.55)" : "rgba(252, 165, 165, 0.55)"};
        }
        @media (max-width: 640px) {
          .song-duplicate-box {
            padding: 10px;
          }
          .song-duplicate-row {
            align-items: flex-start;
            flex-direction: column;
          }
          .song-duplicate-song-title {
            white-space: normal;
          }
          .song-duplicate-actions {
            justify-content: stretch;
          }
          .song-duplicate-link,
          .song-duplicate-continue {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>

      <div className="song-duplicate-head">
        <div>
          <div className="song-duplicate-title">
            {hasCandidates
              ? "Μπορεί να υπάρχει ήδη αυτό το τραγούδι"
              : "Έλεγχος πιθανών διπλότυπων"}
          </div>
          <div className="song-duplicate-sub">
            {hasStrongCandidate
              ? "Βρέθηκε πολύ ισχυρή ομοιότητα. Άνοιξε το υπάρχον τραγούδι πριν δημιουργήσεις νέο."
              : "Ο έλεγχος συγκρίνει τίτλο, πρώτο στίχο και ομοιότητα στίχων."}
          </div>
        </div>
        {status === "loading" ? (
          <div className="song-duplicate-loading">Έλεγχος...</div>
        ) : null}
      </div>

      {status === "error" ? (
        <div className="song-duplicate-sub">
          Δεν ολοκληρώθηκε ο έλεγχος διπλότυπων. Η αποθήκευση παραμένει διαθέσιμη.
        </div>
      ) : null}

      {hasCandidates ? (
        <div className="song-duplicate-list">
          {candidates.map((candidate) => (
            <article key={candidate.id} className="song-duplicate-item">
              <div className="song-duplicate-row">
                <div className="song-duplicate-song-title">
                  #{candidate.id} · {candidate.title || "Χωρίς τίτλο"}
                </div>
                <div className="song-duplicate-score">
                  {levelLabel(candidate.level)} · {candidate.score}%
                </div>
              </div>

              {candidate.matchedText ? (
                <div className="song-duplicate-preview">{candidate.matchedText}</div>
              ) : null}

              {candidate.reasons.length ? (
                <div className="song-duplicate-reasons">
                  {candidate.reasons.slice(0, 3).map((reason) => (
                    <span key={reason} className="song-duplicate-reason">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="song-duplicate-actions">
                <Link
                  href={`/songs/${candidate.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="song-duplicate-link"
                >
                  Άνοιγμα υπάρχοντος
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {hasStrongCandidate ? (
        <div className="song-duplicate-actions">
          <button
            type="button"
            className="song-duplicate-continue"
            onClick={onAllowCreateAnyway}
          >
            {allowCreateAnyway
              ? "Επιβεβαιώθηκε δημιουργία νέου"
              : "Δημιουργία νέου παρόλα αυτά"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
