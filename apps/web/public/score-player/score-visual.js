// score-visual.js
// Βοηθητικές ρουτίνες οπτικοποίησης για το Repertorio Score Player
// - ensureHighlightCSS(svg)
// - colorClefsByStaff(svg)
// - setVoicePalette(palette)       ← ΝΕΟ (προαιρετικό)
// - resetVoiceColors(state)        ← ΝΕΟ (διορθώνει το σφάλμα)
// - getVoiceColor(state, key)      ← ΝΕΟ
// - colorNotesByVoice(state, svg)
// - afterRenderFix(state)

(function (w) {
  const NS = w.RepScore = w.RepScore || {};
  const C  = NS.consts || {};

  // ---------------------------
  // Defaults / Palette
  // ---------------------------
  const DEFAULT_VOICE_PALETTE =
    (C && C.VOICE_COLORS) ||
    [ '#000000ff'];

  // Επιλογή ενεργής παλέτας (global για το module)
  let ACTIVE_VOICE_PALETTE = DEFAULT_VOICE_PALETTE.slice();

  // -------------------------------------------
  // ΔΙΑΧΕΙΡΙΣΗ HIGHLIGHT CSS (glow + current)
  // -------------------------------------------
  function ensureHighlightCSS(svg) {
    if (!svg) return;
    // Πρόσθεσε μόνο μία φορά
    let style = svg.querySelector('style[data-sp="hl"]');
    if (style) return;

    style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.setAttribute('data-sp', 'hl');
    style.textContent = `
      .sp-current { filter: url(#sp-glow); }
      .sp-hl { filter: url(#sp-glow); }
      .sp-muted { opacity: 0.35; }

      /* Προαιρετικό μικρό outline στα noteheads για αντίθεση */
      g.note use.notehead, g.note path.notehead, g.note ellipse.notehead {
        paint-order: stroke fill;
      }
    `;
    svg.appendChild(style);

    // Ορισμός φίλτρου glow αν δεν υπάρχει
    if (!svg.querySelector('#sp-glow')) {
      const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svg.firstChild);
      const flt  = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      flt.setAttribute('id', 'sp-glow');
      flt.setAttribute('x', '-50%');
      flt.setAttribute('y', '-50%');
      flt.setAttribute('width', '200%');
      flt.setAttribute('height', '200%');

      const feGaussian = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
      feGaussian.setAttribute('in', 'SourceGraphic');
      feGaussian.setAttribute('stdDeviation', '2.2');

      const feMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
      const fe1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
      const fe2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
      fe2.setAttribute('in', 'SourceGraphic');

      feMerge.appendChild(fe1);
      feMerge.appendChild(fe2);
      flt.appendChild(feGaussian);
      flt.appendChild(feMerge);
      defs.appendChild(flt);
    }
  }

  // ---------------------------
  // CLEFS ανά staff (προαιρετικό styling)
  // ---------------------------
  function colorClefsByStaff(svg) {
    if (!svg) return;
    const clefs = svg.querySelectorAll('g.clef, .clef');
    clefs.forEach((c) => {
      const staff = c.closest('g.staff, .staff');
      if (!staff) return;
      // μπορείς να εφαρμόσεις εναλλακτική απόχρωση ανά staff
    });
  }

  // ---------------------------
  // Voice palette helpers
  // ---------------------------
  function resetVoiceColors(state) {
    state.__voiceColorMap = new Map();
    state.__voiceColorIdx = 0;
  }

  function getVoiceColor(state, key) {
    if (!state.__voiceColorMap) resetVoiceColors(state);
    if (state.__voiceColorMap.has(key)) return state.__voiceColorMap.get(key);
    const col = ACTIVE_VOICE_PALETTE[state.__voiceColorIdx % ACTIVE_VOICE_PALETTE.length];
    state.__voiceColorMap.set(key, col);
    state.__voiceColorIdx++;
    return col;
  }

  // ---------------------------
  // Ελαφρύς helper για ανάγνωση αριθμητικών attributes
  // ---------------------------
  function _numberAttr(el, name, def = 0) {
    if (!el) return def;
    const v = el.getAttribute(name);
    if (v == null) return def;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : def;
  }

  function _firstLyricTspan(gVerse) {
    if (!gVerse) return null;
    // Δοκίμασε λίγους συνήθεις selectors
    return gVerse.querySelector('tspan.text tspan[font-size], text tspan tspan[font-size], text tspan[font-size]');
  }

  // -------------------------------------------
  // ΔΙΟΡΘΩΣΗ ΕΠΙΚΑΛΥΨΕΩΝ ΣΤΙΧΩΝ ΣΤΟ ΙΔΙΟ Y
  // -------------------------------------------
  function fixOverlappingLyricsOnSVG(svg) {
    if (!svg) return;
    const notes = svg.querySelectorAll('g.note');
    notes.forEach((note) => {
      const verses = Array.from(note.querySelectorAll(':scope > g.verse'));
      if (verses.length <= 1) return;

      // Ομαδοποιούμε απόλυτα στο ίδιο y
      const groups = new Map(); // y -> array of verses
      verses.forEach((gv) => {
        const textEl = gv.querySelector('text');
        if (!textEl) return;
        const y = _numberAttr(textEl, 'y', NaN);
        if (!Number.isFinite(y)) return;
        const arr = groups.get(y) || [];
        arr.push(gv);
        groups.set(y, arr);
      });

      groups.forEach((list, y) => {
        if (list.length <= 1) return;

        // Ταξινόμηση με βάση το x ώστε η 1η να μείνει ως έχει
        list.sort((a,b)=>{
          const xa = _numberAttr(a.querySelector('text'), 'x', 0);
          const xb = _numberAttr(b.querySelector('text'), 'x', 0);
          return xa - xb;
        });

        // Υπολογισμός line-height από το font-size (fallback 405px)
        let fsize = 405;
        const ts = _firstLyricTspan(list[0]);
        if (ts) {
          const fs = ts.getAttribute('font-size');
          if (fs) {
            const m = String(fs).match(/\d+/);
            if (m) fsize = parseFloat(m[0]);
          }
        }
        const lineH = Math.round(fsize * 1.25);

        // Στοίχιση κατακόρυφη: αφήνουμε την 1η στο αρχικό y,
        // και κατεβάζουμε τις επόμενες γραμμές κάτω από αυτή
        for (let i = 1; i < list.length; i++) {
          const g = list[i];
          const textEl = g.querySelector('text');
          if (!textEl) continue;
          const newY = y + i * lineH;
          textEl.setAttribute('y', String(newY));
        }
      });
    });
  }

  // -------------------------------------------
  // ΝΕΟ: ΑΠΟΜΑΚΡΥΝΣΗ ΣΤΙΧΩΝ ΑΠΟ ΤΟ ΕΠΟΜΕΝΟ ΣΥΣΤΗΜΑ
  // -------------------------------------------
  function clampLyricsAwayFromNextSystem(svg) {
    if (!svg) return;
    const systems = Array.from(svg.querySelectorAll('g.system'));
    const SAFE_GAP = 120; // SVG units: μικρό περιθώριο πριν το επόμενο πεντάγραμμο
    systems.forEach((sys, idx) => {
      const next = systems[idx + 1];
      if (!next) return;
      let nextTop;
      try {
        const bb = next.getBBox();
        nextTop = bb ? (bb.y || null) : null;
      } catch { nextTop = null; }
      if (!Number.isFinite(nextTop)) return;

      const safeLimit = nextTop - SAFE_GAP;

      const texts = Array.from(sys.querySelectorAll('g.verse text'));
      if (!texts.length) return;

      // Βρες το μέγιστο y των στίχων αυτού του system
      let maxY = -Infinity;
      texts.forEach(t => {
        const y = _numberAttr(t, 'y', NaN);
        if (Number.isFinite(y) && y > maxY) maxY = y;
      });
      if (!Number.isFinite(maxY)) return;

      if (maxY > safeLimit) {
        const delta = maxY - safeLimit;
        texts.forEach(t => {
          const y = _numberAttr(t, 'y', NaN);
          if (Number.isFinite(y)) t.setAttribute('y', String(y - delta));
        });
      }
    });
  }

  // ------------------------------------------------------------
  // ΝΕΟ: Απομάκρυνση συγχορδιών/οδηγιών (g.dir) από το επόμενο σύστημα
  // ώστε οι ενδείξεις όπως "D#m", "F" κ.λπ. να μην καλύπτουν τη
  // επόμενη πεντάγραμμη γραμμή.  Λειτουργεί ανά σύστημα όπως και
  // clampLyricsAwayFromNextSystem.
  function clampDirectionsAwayFromNextSystem(svg) {
    if (!svg) return;
    const systems = Array.from(svg.querySelectorAll('g.system'));
    const SAFE_GAP = 120; // μικρό περιθώριο πριν το επόμενο πεντάγραμμο
    systems.forEach((sys, idx) => {
      const next = systems[idx + 1];
      if (!next) return;
      // προσδιορισμός του πάνω ορίου του επόμενου συστήματος
      let nextTop;
      try {
        const bb = next.getBBox();
        nextTop = bb ? (bb.y || null) : null;
      } catch {
        nextTop = null;
      }
      if (!Number.isFinite(nextTop)) return;
      const safeLimit = nextTop - SAFE_GAP;
      // βρες όλα τα group με κλάση dir σε αυτό το σύστημα
      const dirs = Array.from(sys.querySelectorAll('g.dir'));
      if (!dirs.length) return;
      // βρες το μεγαλύτερο bottomY των dir
      let maxBottom = -Infinity;
      dirs.forEach(g => {
        try {
          const bb = g.getBBox();
          if (bb) {
            const bottom = bb.y + bb.height;
            if (Number.isFinite(bottom) && bottom > maxBottom) maxBottom = bottom;
          }
        } catch {}
      });
      if (!Number.isFinite(maxBottom)) return;
      if (maxBottom > safeLimit) {
        const delta = maxBottom - safeLimit;
        dirs.forEach(g => {
          // Προσπάθησε να μετακινήσεις το κείμενο προς τα πάνω κατά delta
          // είτε μέσω y attribute στο text είτε μέσω transform translate
          const textEl = g.querySelector('text');
          if (textEl) {
            // Πάρε τρέχον y ως αριθμό αν υπάρχει
            const yAttr = textEl.getAttribute('y');
            const yVal = yAttr != null ? parseFloat(String(yAttr)) : NaN;
            if (Number.isFinite(yVal)) {
              textEl.setAttribute('y', String(yVal - delta));
            } else {
              // fallback: δοκίμασε να εφαρμόσεις μετατόπιση μέσω transform
              const origTr = g.getAttribute('transform') || '';
              const translate = ` translate(0,${-delta})`;
              g.setAttribute('transform', origTr + translate);
            }
          } else {
            // δεν βρέθηκε text, μετέφερε όλο το group
            const origTr = g.getAttribute('transform') || '';
            const translate = ` translate(0,${-delta})`;
            g.setAttribute('transform', origTr + translate);
          }
        });
      }
    });
  }

  // Προαιρετικό: όρισε custom παλέτα φωνών (array από hex/rgb strings)
  NS.setVoicePalette = function (palette) {
    if (Array.isArray(palette) && palette.length) {
      ACTIVE_VOICE_PALETTE = palette.slice();
    } else {
      ACTIVE_VOICE_PALETTE = DEFAULT_VOICE_PALETTE.slice();
    }
  };

  // ---------------------------
  // Χρωματισμός νοτών ανά voice
  // ---------------------------
  NS.colorNotesByVoice = function (state, svg) {
    if (!svg) return;

    // αν θες να διαβάσεις φωνή από attribute
    const notes = svg.querySelectorAll('g.note');
    notes.forEach((n) => {
      let vKey = null;

      // 1) voice από <voice> text node
      const vEl = n.querySelector(':scope > voice, voice');
      if (vEl && vEl.textContent) vKey = vEl.textContent.trim();

      // 2) διαφορετικά από κλάσεις (π.χ. voice-1, v1)
      if (!vKey) {
        const cls = n.getAttribute('class') || '';
        const m = cls.match(/\bvoice-?(\d+)\b/);
        if (m) vKey = m[1];
      }

      if (!vKey) return;

      const color = getVoiceColor(state, vKey);
      // Εφαρμογή χρώματος σε notehead/stem/flag
      const head = n.querySelector('use.notehead, path.notehead, ellipse.notehead, g.notehead use, g.notehead path');
      if (head) head.setAttribute('fill', color);

      const stem = n.querySelector(':scope > .stem path, :scope > .stem');
      if (stem) stem.setAttribute('stroke', color);

      const flag = n.querySelector(':scope > .flag path, :scope > .flag');
      if (flag) flag.setAttribute('stroke', color);
    });
  };

  // ---------------------------
  // Μετά το render: πάχυνση stems/beam κ.λπ. + φωνές
  // ---------------------------
  NS.afterRenderFix = function (state) {
    const root = state?.renderEl;
    if (!root) return;

    const scale = getScale(state);
    const STEM_BASE_AT_50 = 2.6; // px
    const BEAM_BASE_AT_50 = 3.2; // px
    const stemW = Math.max(1, (scale / 50) * STEM_BASE_AT_50);
    const beamW = Math.max(1.2, (scale / 50) * BEAM_BASE_AT_50);

    const svgs = root.querySelectorAll('svg');
    svgs.forEach((svg) => {
      // ensure CSS (highlight + glow)
      ensureHighlightCSS(svg);

      // clefs styling (προαιρετικό)
      colorClefsByStaff(svg);

      // stems
      svg.querySelectorAll('g.stem path, .stem path').forEach((el) => {
        el.setAttribute('stroke-width', String(stemW));
        if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#000');
      });

      // beams
      svg.querySelectorAll('g.beam path, g.beam polygon, [class*="beam"]').forEach((el) => {
        el.setAttribute('stroke-width', String(beamW));
        if (!el.getAttribute('fill')) el.setAttribute('stroke', '#000');
      });

      // heads outline βελτίωση (αν θέλεις ελαφρύ περίγραμμα)
      svg.querySelectorAll('g.note use.notehead, g.note path.notehead, g.note ellipse.notehead').forEach((el) => {
        if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#000');
        if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', String(Math.max(0.6, stemW / 3)));
      });

      // Διόρθωση στίχων (επικαλύψεις ίδιου y) + αποφυγή επόμενου system
      fixOverlappingLyricsOnSVG(svg);
      clampLyricsAwayFromNextSystem(svg);
      // ΝΕΟ: επίσης απομάκρυνε τις συγχορδίες/dir ώστε να μην
      // επικαλύπτουν το επόμενο σύστημα
      clampDirectionsAwayFromNextSystem(svg);

      // Χρωματισμός φωνών
      NS.colorNotesByVoice(state, svg);
    });
  };

  // ---------------------------
  // Helpers
  // ---------------------------
  function getScale(state) {
    try {
      return parseFloat(state?.vrvToolkit?.getOptions()?.scale || '50');
    } catch {
      return 50;
    }
  }

  function ensureNode(el) {
    return el && typeof el.querySelector === 'function';
  }

})(window);
