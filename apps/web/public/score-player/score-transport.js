(function (w) {
  const NS = w.RepScore = w.RepScore || {};

  // ============================================================
  // Helpers για συγχορδίες (ανίχνευση/μετατόπιση root και slash-bass)
  // ============================================================

  // Σημειογραφία 12ηχου για έξοδο
  const SHARP_NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const FLAT_NOTES  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

  // Βάσεις φυσικών φθόγγων
  const NAT_SEMI = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

  function countChar(str, ch) {
    let c = 0;
    for (let i = 0; i < str.length; i++) if (str[i] === ch) c++;
    return c;
  }

  // Απομόνωση ρίζας: επιστρέφει {letter, acc, rest}
  // letter: A–G, acc: σειρά από #/b (οποιοδήποτε μήκος), rest: ό,τι ακολουθεί
  function splitRoot(str) {
    const m = String(str).trim().match(/^([A-G])([#b]*)(.*)$/i);
    if (!m) return null;
    return { letter: m[1].toUpperCase(), acc: m[2] || "", rest: m[3] || "" };
  }

  // Μετατροπή ονόματος νότας (με πολλαπλές αλλοιώσεις) σε ημιτόνια 0..11
  function noteNameToSemis(name) {
    const p = splitRoot(name);
    if (!p) return null;
    const base = NAT_SEMI[p.letter];
    if (base == null) return null;
    const up = countChar(p.acc, '#');
    const dn = countChar(p.acc, 'b');
    const total = base + up - dn;
    return ((total % 12) + 12) % 12;
  }

  // Επιλογή flat έξοδου όταν το αρχικό είχε flats και όχι sharps
  function preferFlatForText(noteText) {
    const p = splitRoot(noteText);
    if (!p) return false;
    return p.acc.includes('b') && !p.acc.includes('#');
  }

  // Απόδοση ημιτονίων σε όνομα, με προτίμηση flats/sharps
  function semisToNoteName(semi, useFlats) {
    const s = ((semi % 12) + 12) % 12;
    return useFlats ? FLAT_NOTES[s] : SHARP_NOTES[s];
  }

  // Επιστρέφει {name, rest} από πλήρη συμβολισμό (root+rest)
  function normalizeNoteName(str) {
    const m = String(str).trim().match(/^([A-G](?:[#b]*))(.*)$/i);
    if (!m) return null;
    return { name: m[1], rest: m[2] || "" };
  }

  // Transpose μιας νότας ονόματος (root) κατά semitones, με προτίμηση flats/sharps
  function transposeNoteName(name, semitones, useFlats) {
    const semi = noteNameToSemis(name);
    if (semi == null) return name;
    const target = semi + (semitones || 0);
    return semisToNoteName(target, !!useFlats);
  }

  // Κάνει transpose σε πλήρες σύμβολο συγχορδίας: Root + Suffix [+ /Bass]
  function transposeChordSymbol(sym, semitones) {
    const txt = String(sym).trim();
    if (!txt) return txt;

    // Διαχωρισμός root(+accidental)* + υπόλοιπο, και optional slash-bass
    // Π.χ. "Bbmaj7/D" -> rootPart="Bbmaj7", bassPart="D"
    const slashIdx = txt.indexOf("/");
    const rootPart = slashIdx >= 0 ? txt.slice(0, slashIdx) : txt;
    const bassPart = slashIdx >= 0 ? txt.slice(slashIdx + 1) : null;

    const rootParsed = normalizeNoteName(rootPart);
    if (!rootParsed) return txt; // Δεν μοιάζει με σύμβολο συγχορδίας

    const useFlatsForRoot = preferFlatForText(rootParsed.name);
    const newRoot =
      transposeNoteName(rootParsed.name, semitones, useFlatsForRoot) +
      rootParsed.rest;

    let newBass = "";
    if (bassPart && bassPart.trim()) {
      const bassParsed = normalizeNoteName(bassPart);
      if (bassParsed) {
        const useFlatsForBass = preferFlatForText(bassParsed.name);
        newBass =
          "/" +
          transposeNoteName(bassParsed.name, semitones, useFlatsForBass) +
          bassParsed.rest;
      } else {
        // Αν δεν αναγνωρίστηκε σαν νότα, κράτα το όπως είναι
        newBass = "/" + bassPart;
      }
    }

    return newRoot + newBass;
  }

  // Βρίσκει το “βαθύτερο” tspan με κείμενο μέσα σε έναν κόμβο (για ιεραρχίες text/tspan/tspan)
  function deepestTextTspan(node) {
    if (!node) return null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (el.tagName && el.tagName.toLowerCase() === "tspan") {
          const hasElementChild = Array.from(el.children).some(ch => ch.nodeType === 1);
          const text = (el.textContent || "").trim();
          if (!hasElementChild && text) return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });
    let last = null, n;
    while ((n = walker.nextNode())) last = n;
    return last;
  }

  function isLikelyChordText(s) {
    // Χοντρικό φίλτρο για chord labels (αποφεύγει στίχους/αριθμούς)
    const t = String(s).trim();
    if (!t) return false;
    if (!/^[A-G]/i.test(t)) return false;
    if (/\s{2,}/.test(t)) return false;
    // Επιτρέπει πολλαπλές αλλοιώσεις στη ρίζα και στο slash-bass
    return /^([A-G](?:[#b]*)(?:m(?!aj)|maj|dim|aug|sus|add|7|6|9|11|13|°|\+|\-|M)?[0-9]*(?:sus[24])?(?:add[2469])?(?:maj7|m7|m6|m9|M7)?(?:\([^)]*\))?)(?:\/[A-G](?:[#b]*)(?:[0-9]*)?)?$/i.test(t);
  }

  function transposeChordLabelsInSvg(svg, semitones) {
    if (!svg) return;

    // Συνήθως κάτω από το staff, ως directions: <g class="dir"> ... "Gm"
    const dirGroups = svg.querySelectorAll('g.dir');
    dirGroups.forEach(dir => {
      const tspan = deepestTextTspan(dir) || dir.querySelector('text tspan');
      if (!tspan) return;

      const raw = (tspan.textContent || "").trim();
      if (!raw) return;
      if (!isLikelyChordText(raw)) return;

      if (!tspan.dataset.spChordOrig) {
        // Φύλαξε το πρωτότυπο μία φορά
        tspan.dataset.spChordOrig = raw;
      }
      const orig = tspan.dataset.spChordOrig || raw;
      // Αν υπάρχει global προτίμηση για flats/sharps (ορισμένη από την
      // updateTonalityBadge) χρησιμοποίησέ την ώστε να ορθογραφηθεί
      // σωστά το root και το slash-bass, ακόμη κι όταν semitones=0.
      let newTxt;
      const usePref = (w.RepScore && typeof w.RepScore._transposeUseFlats !== 'undefined')
        ? w.RepScore._transposeUseFlats
        : undefined;
      if (typeof usePref === 'boolean') {
        // Παράγει νέο κείμενο με βάση την προτίμηση flats/sharps
        const txtSym = String(orig).trim();
        const slashAt = txtSym.indexOf('/');
        const rootPart = slashAt >= 0 ? txtSym.slice(0, slashAt) : txtSym;
        const bassPart = slashAt >= 0 ? txtSym.slice(slashAt + 1) : null;
        let ok = true;
        let newRoot = rootPart;
        try {
          const p = normalizeNoteName(rootPart);
          if (p && p.name) {
            const rootSemi = noteNameToSemis(p.name);
            if (rootSemi != null) {
              const target = rootSemi + (semitones || 0);
              const noteName = semisToNoteName(target, usePref);
              newRoot = noteName + (p.rest || '');
            }
          }
        } catch {
          ok = false;
        }
        let newBass = '';
        if (bassPart && bassPart.trim()) {
          try {
            const bp = normalizeNoteName(bassPart);
            if (bp && bp.name) {
              const bassSemi = noteNameToSemis(bp.name);
              if (bassSemi != null) {
                const bTarget = bassSemi + (semitones || 0);
                const bName = semisToNoteName(bTarget, usePref);
                newBass = '/' + bName + (bp.rest || '');
              } else {
                newBass = '/' + bassPart;
              }
            } else {
              newBass = '/' + bassPart;
            }
          } catch {
            newBass = '/' + bassPart;
          }
        }
        if (ok) {
          newTxt = newRoot + newBass;
        }
      }
      // Αν δεν βρέθηκε προτίμηση ή απέτυχε, χρησιμοποίησε την υπάρχουσα υλοποίηση
      if (!newTxt) {
        newTxt = semitones ? transposeChordSymbol(orig, semitones) : orig;
      }
      if (newTxt && newTxt !== tspan.textContent) {
        tspan.textContent = newTxt;
      }
    });
  }

  // ---------------------------
  // Transporto: απλή οπτική ενημέρωση (OSMD + Verovio)
  // ---------------------------
  NS.animateTranspose = function (state, step) {
    if (!state || !state.renderEl) return;

    // Πάντα ενημέρωσε το badge τονικότητας, αν υπάρχει
    try {
      if (typeof NS.updateTonalityBadge === 'function') {
        NS.updateTonalityBadge(state);
      }
    } catch (e) {
      console.warn('[transporto] updateTonalityBadge error', e);
    }

    const svgs = state.renderEl.querySelectorAll('svg');
    if (!svgs.length) return;

    const semis = Number.isFinite(state?.transpose) ? Number(state.transpose) : 0;

    svgs.forEach((svg) => {
      // 1) Transpose chord labels (κείμενα συγχορδιών)
      try {
        transposeChordLabelsInSvg(svg, semis);
      } catch (e) {
        console.warn('[transporto] transposeChordLabelsInSvg error', e);
      }

      // 2) Χρωματισμός φωνών (αν υπάρχει helper)
      try {
        if (typeof NS.colorNotesByVoice === 'function') {
          NS.colorNotesByVoice(state, svg);
        }
      } catch (e) {
        console.warn('[transporto] colorNotesByVoice error', e);
      }
    });

    // 3) Ενημέρωση οπλισμών (key signatures) στο SVG, αν υπάρχει helper
    try {
      if (typeof NS.updateKeySignaturesForState === 'function') {
        NS.updateKeySignaturesForState(state);
      }
    } catch (e) {
      console.warn('[transporto] updateKeySignaturesForState error', e);
    }
  };


  // --- Tempo sync helpers (παραμένουν διαθέσιμα για player) ---
  NS.syncTransportWithUI = function(state){
    const v = Number.parseInt(state?.tempoInp?.value, 10);
    if (!Number.isFinite(v) || v <= 0) return;
    if (typeof NS.setTempo === 'function') {
      NS.setTempo(state, v);      // ενημερώνει Transport + label
    } else {
      if (state.tempoVal) state.tempoVal.textContent = String(v);
      if (w.Tone?.Transport) w.Tone.Transport.bpm.value = v;
    }
  };

})(window);

// -----------------------------------------------------------------------------
// Βελτιωμένη ενημέρωση οπλισμού στα πεντάγραμμα
//
// Η παρακάτω ενότητα ορίζει μια helper συνάρτηση που ενημερώνει τα
// g.keySig στα πεντάγραμμα κάθε φορά που αλλάζει η τονικότητα μέσω
// της μεταφοράς.  Διαβάζει την πληροφορία για τον οπλισμό από το badge
// (data-key-sig) που ενημερώνεται από την updateTonalityBadge και στη
// συνέχεια επαναδημιουργεί τα σύμβολα του οπλισμού (διέσεις/υφέσεις)
// τοποθετώντας τα στις σωστές θέσεις ανάλογα με το κλειδί (sol/bass).

;(function (w) {
  const NS = w.RepScore = w.RepScore || {};
  if (NS.__enhancedKeySig) return;
  NS.__enhancedKeySig = true;

  // Parse a transform string and extract the translate component.
  // Returns {x,y} if present, otherwise null.
  function parseTranslate(t) {
    if (!t) return null;
    const m = String(t).match(/translate\s*\(\s*([-\d\.]+)\s*,\s*([-\d\.]+)\s*\)/);
    if (!m) return null;
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  }

  // Parse a transform string and extract the scale component (uniform).
  // Returns a single float for the x-scale (assumes uniform scale).
  function parseScale(t) {
    if (!t) return null;
    const m = String(t).match(/scale\s*\(\s*([-\d\.]+)(?:\s*,\s*([-\d\.]+))?\s*\)/);
    if (!m) return null;
    const sx = parseFloat(m[1]);
    const sy = m[2] != null ? parseFloat(m[2]) : sx;
    return { sx, sy };
  }

  // Parse a key signature string like '5♭' or '3#' or '0'.  Returns an
  // object { count: number, type: 'flat'|'sharp'|'none' }.  Negative
  // values are converted to flats, positive to sharps.
  function parseKeySigString(sig) {
    if (!sig) return { count: 0, type: 'none' };
    const s = String(sig).trim();
    const m = s.match(/^(\d+)\s*([#♯b♭])?/);
    if (!m) return { count: 0, type: 'none' };
    const num = parseInt(m[1], 10);
    const sym = m[2] || '';
    if (!sym || num === 0) return { count: 0, type: 'none' };
    if (sym === '#' || sym === '♯') return { count: num, type: 'sharp' };
    return { count: num, type: 'flat' };
  }

  // Determine clef type (treble or bass) for a given staff element.
  function getClefTypeForStaff(staffEl) {
    if (!staffEl) return 'treble';
    const clefUse = staffEl.querySelector('g.clef use');
    if (!clefUse) return 'treble';
    const href = clefUse.getAttribute('xlink:href') || clefUse.getAttribute('href') || '';
    // In MusicXML/Bravura, E050 is treble clef, E062 is bass clef, others exist.
    if (/E062/i.test(href)) return 'bass';
    return 'treble';
  }

  // Arrays of indices for accidentals on the staff.  The index 0
  // corresponds to the top staff line; each increment of 1 corresponds to
  // moving down a half-space (line or space).  Negative indices are above
  // the staff.
  const TREBLE_FLAT_IDX  = [4, 1, 5, 2, 6, 3, 0];
  const TREBLE_SHARP_IDX = [0, 3, -1, 2, 5, 1, 4];
  const BASS_FLAT_IDX    = [6, 3, 7, 4, 8, 5, 9];
  const BASS_SHARP_IDX   = [2, 5, 1, 4, 7, 3, 6];

  function getAccidentalIndices(clef, type, count) {
    const arr = (function () {
      if (clef === 'bass') {
        return type === 'sharp' ? BASS_SHARP_IDX : BASS_FLAT_IDX;
      }
      return type === 'sharp' ? TREBLE_SHARP_IDX : TREBLE_FLAT_IDX;
    })();
    return arr.slice(0, count);
  }

  // Update the key signature for a single staff element.  It removes any
  // existing accidental glyphs and adds the required number of accidentals
  // at the correct positions.  It stores computed metrics (x-base,
  // x-step, topLineY, halfSpacing, scale) in data attributes for reuse.
  function updateKeySigForStaff(staffEl, count, type) {
    if (!staffEl) return;
    const gKey = staffEl.querySelector('g.keySig, g.keysig');
    if (!gKey) return;
    /*
     * Αποθήκευσε το αρχικό περιεχόμενο (πριν οποιαδήποτε αλλαγή) ώστε να
     * μπορεί να αποκατασταθεί σε περιπτώσεις ουδέτερου οπλισμού (0 αλλοιώσεις).
     * Αυτό αποτρέπει το πρόβλημα όπου ο οπλισμός εξαφανίζεται όταν ο
     * υπολογισμός δώσει 0.
     */
    if (!gKey.dataset.origSigHtml) {
      try {
        gKey.dataset.origSigHtml = gKey.innerHTML || '';
      } catch {
        gKey.dataset.origSigHtml = '';
      }
    }
    // Αν δεν χρειάζεται αλλοιώσεις (count ≤ 0 ή τύπος none) επανέφερε το αρχικό
    if (!count || count <= 0 || type === 'none') {
      // Εάν υπάρχει αποθηκευμένο αρχικό, χρησιμοποίησέ το, αλλιώς αφήσέ το ως έχει
      if (gKey.dataset.origSigHtml != null) {
        try {
          gKey.innerHTML = gKey.dataset.origSigHtml;
        } catch {}
      }
      // Καθόρισε ότι αυτή είναι πλέον η τρέχουσα κατάσταση (0 αλλοιώσεις)
      gKey.dataset.lastSig = '0';
      return;
    }
    // Determine or compute metrics the first time.  Metrics are stored on
    // the g.keySig dataset to persist across calls and transpositions.
    let xBase = parseFloat(gKey.dataset.xBase);
    let xStep = parseFloat(gKey.dataset.xStep);
    let topY = parseFloat(gKey.dataset.topY);
    let halfSpacing = parseFloat(gKey.dataset.halfSpacing);
    let scaleVal = parseFloat(gKey.dataset.scale);
    if (!Number.isFinite(xBase) || !Number.isFinite(xStep) ||
        !Number.isFinite(topY) || !Number.isFinite(halfSpacing) || !Number.isFinite(scaleVal)) {
      // Αν δεν έχει υπολογιστεί xBase, χρησιμοποίησε ένα ασφαλές default (0)
      if (!Number.isFinite(xBase)) xBase = 0;
      // Compute metrics from existing elements.
      const accs = gKey.querySelectorAll('g.keyAccid');
      if (accs.length) {
        // Use first accidental to get base x and y, and scale.
        const firstUse = accs[0].querySelector('use');
        if (firstUse) {
        const tr = parseTranslate(firstUse.getAttribute('transform'));
        const sc = parseScale(firstUse.getAttribute('transform'));
        // Only assign values from the existing transform if they are finite numbers.
        if (tr && Number.isFinite(tr.x)) {
          xBase = tr.x;
          // We'll compute topY separately
        }
        if (sc && Number.isFinite(sc.sx)) {
          scaleVal = sc.sx;
        }
        }
        if (accs.length >= 2) {
        const u1 = accs[0].querySelector('use');
        const u2 = accs[1].querySelector('use');
        if (u1 && u2) {
          const t1 = parseTranslate(u1.getAttribute('transform'));
          const t2 = parseTranslate(u2.getAttribute('transform'));
          // Compute xStep only if both positions are finite; otherwise fallback to default later.
          if (t1 && t2 && Number.isFinite(t1.x) && Number.isFinite(t2.x)) {
            const stepVal = t2.x - t1.x;
            if (Number.isFinite(stepVal) && stepVal !== 0) {
              xStep = stepVal;
            }
          }
        }
        }
      }
      // If xStep or scaleVal undefined, use reasonable defaults
      if (!Number.isFinite(xStep) || xStep === 0) xStep = 180; // typical spacing
      if (!Number.isFinite(scaleVal) || scaleVal === 0) scaleVal = 0.72;
      // Compute topY and spacing from staff lines (<line> or <path>)
      // Collect y-coordinates from long horizontal lines
      let lineYs = [];
      const lines = staffEl.querySelectorAll('path, line');
      lines.forEach(l => {
        // consider only long horizontal lines (staff lines).  Use bounding box heuristic.
        try {
          const bbox = l.getBBox();
          if (bbox.width > bbox.height * 3) {
            // parse y coordinate from path/line. For path, use the middle y.
            if (l.tagName.toLowerCase() === 'line') {
              const y1 = parseFloat(l.getAttribute('y1'));
              const y2 = parseFloat(l.getAttribute('y2'));
              if (Number.isFinite(y1) && Number.isFinite(y2)) {
                lineYs.push((y1 + y2) / 2);
              }
            } else if (l.tagName.toLowerCase() === 'path') {
              const d = l.getAttribute('d') || '';
              const m = d.match(/M\s*[-\d\.]+\s+([-\d\.]+)/);
              if (m) {
                const y = parseFloat(m[1]);
                if (Number.isFinite(y)) lineYs.push(y);
              }
            }
          }
        } catch {}
      });
      // Sort and take first two for top line and second line
      lineYs = lineYs.filter(v => Number.isFinite(v)).sort((a,b) => a - b);
      if (lineYs.length >= 2) {
        topY = lineYs[0];
        const spacing = lineYs[1] - lineYs[0];
        // Each index step corresponds to half the spacing (line or space)
        halfSpacing = spacing / 2;
      } else {
        // Fallback values if cannot compute
        topY = 0;
        halfSpacing = 90;
      }
      // Save metrics
      gKey.dataset.xBase = String(xBase);
      gKey.dataset.xStep = String(xStep);
      gKey.dataset.topY = String(topY);
      gKey.dataset.halfSpacing = String(halfSpacing);
      gKey.dataset.scale = String(scaleVal);
    }
    // Remove existing accidental children
    while (gKey.firstChild) gKey.removeChild(gKey.firstChild);
    // Note: at this point count>0 and type is either 'sharp' or 'flat'
    const clef = getClefTypeForStaff(staffEl);
    const indices = getAccidentalIndices(clef, type, count);
    // Glyph id for flats/sharps.  E260 is flat, E262 is sharp in Bravura font.
    const glyphId = type === 'sharp' ? '#E262-lgs0n6o' : '#E260-lgs0n6o';
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const x = xBase + xStep * i;
      const y = topY + halfSpacing * idx;
      // Build g.keyAccid with a use element
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'keyAccid');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('xlink:href', glyphId);
      use.setAttribute('transform', `translate(${x},${y}) scale(${scaleVal},${scaleVal})`);
      g.appendChild(use);
      gKey.appendChild(g);
    }
  }

  // Main entry: update all staves key signatures for the given state.
  NS.updateKeySignaturesForState = function (state) {
    try {
      // Determine the signature string from the current player's tonality badge.
      // Prefer the badge attached to the given state. If not available, search
      // within this player's wrapper for any element carrying data-key-sig.
      let sigStr = null;
      let badge = null;
      if (state && state.tonalityBadge) {
        badge = state.tonalityBadge;
      } else if (state && state.wrap) {
        badge = state.wrap.querySelector('[data-key-sig]');
      }
      if (badge) {
        sigStr = badge.getAttribute('data-key-sig');
      }
      // If there is no signature string, avoid modifying the existing key signatures.
      if (!sigStr) {
        return;
      }
      // Parse the signature string (e.g. '3#' or '2♭'). Defaults to none when parsing fails.
      let count = 0;
      let type = 'none';
      if (sigStr) {
        const parsed = parseKeySigString(sigStr);
        count = parsed.count;
        type = parsed.type;
      }
      // Operate only on the SVGs belonging to the current player's render element.
      const svgs = state && state.renderEl
        ? state.renderEl.querySelectorAll('svg')
        : document.querySelectorAll('svg');
      svgs.forEach(svg => {
        const staffs = svg.querySelectorAll('g.staff');
        staffs.forEach(staff => {
          updateKeySigForStaff(staff, count, type);
        });
      });
    } catch (ex) {
      // swallow errors
    }
  };

})(window);

// -----------------------------------------------------------------------------
// Βελτίωση ενημέρωσης τονικότητας & οπλισμού
//
// Το ακόλουθο μπλοκ επαναπροσδιορίζει τη λειτουργία updateTonalityBadge ώστε,
// πέρα από το όνομα τονικότητας, να υπολογίζει και τον οπλισμό (αριθμό διέσεων
// ή υφέσεων) σύμφωνα με πιο μουσικά ορθό αλγόριθμο. Η λογική βασίζεται στην
// κλασική ορθογραφία της χρωματικής κλίμακας: κατά την άνοδο χρησιμοποιούνται
// ονόματα φθόγγων όπως G, A♭, A, B♭, B, C, C♯, D, E♭, E, F, F♯, G, ενώ κατά
// την κάθοδο F♯, F, E, E♭, D, D♭, C, B, B♭, A, A♭, G. Με αυτόν τον τρόπο
// εξασφαλίζεται ότι κάθε γράμμα εμφανίζεται διαδοχικά στη σωστή σειρά. Επιπλέον
// υπολογίζει το σχετικό ματζόρε για μια μινόρε τονικότητα ώστε να βρεθεί ο
// κατάλληλος οπλισμός.
//
// Το patch αυτό εφαρμόζεται εδώ (στο αρχείο "transporto") για να μην
// τροποποιηθούν άλλα αρχεία. Αρχικά αποθηκεύεται η αρχική υλοποίηση του
// updateTonalityBadge (αν υπάρχει) ώστε να χρησιμοποιηθεί για την εξαγωγή
// βασικών πληροφοριών από το MusicXML. Στη συνέχεια ορίζεται μια νέα
// συνάρτηση που καλεί την παλιά υλοποίηση μία φορά μόνο για να γεμίσει το
// state._baseKeyInfo και στη συνέχεια υπολογίζει τη νέα τονικότητα και τον
// οπλισμό.

;(function (w) {
  const NS = w.RepScore = w.RepScore || {};

  // Μην επαναπροσδιορίζεις πολλαπλές φορές
  if (NS.__enhancedTonality) return;
  NS.__enhancedTonality = true;

  // Φύλαξε την αρχική υλοποίηση (αν υπάρχει)
  const _origUpdateTonality = NS.updateTonalityBadge;

  // Χάρτης φυσικών φθόγγων → ημιτόνια
  const NAT_SEMI = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  // Χάρτης γράμματος → index 0..6 (C=0,...,B=6)
  const LETTER_IDX = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };
  const LETTERS = ['C','D','E','F','G','A','B'];

  // Ελληνικά ονόματα φθόγγων για την απεικόνιση
  const NOTE_GR = {
    "C":"Ντο","C#":"Ντο♯","Db":"Ρε♭",
    "D":"Ρε","D#":"Ρε♯","Eb":"Μι♭",
    "E":"Μι","F":"Φα","F#":"Φα♯",
    "Gb":"Σολ♭","G":"Σολ","G#":"Σολ♯",
    "Ab":"Λα♭","A":"Λα","A#":"Λα♯",
    "Bb":"Σι♭","B":"Σι","Cb":"Ντο♭",
    "E#":"Μι♯","B#":"Σι♯"
  };

  // Χάρτης ματζόρε → αριθμός διαστημάτων πέμπτων (θετικό=διέσεις, αρνητικό=υφέσεις)
  // Αν λείπει κάποια καταχώριση, θα γίνει προσπάθεια κανονικοποίησης παρακάτω
  const MAJOR_FIFTHS = {
    "C":0, "G":1, "D":2, "A":3, "E":4, "B":5, "F#":6, "C#":7,
    "F":-1, "Bb":-2, "Eb":-3, "Ab":-4, "Db":-5, "Gb":-6, "Cb":-7
  };

  // Μετατροπή οποιασδήποτε ματζόρε τονικότητας σε ισοδύναμη “κανονική” με
  // τις λιγότερες δυνατές αλλοιώσεις. Αυτό είναι απαραίτητο προκειμένου να
  // υπολογιστεί σωστά ο οπλισμός ακόμη κι όταν το αρχικό όνομα είναι
  // εξωτικό (π.χ. Ebb, B#, κ.λπ.). Επιλέγεται ο κανονικός τόνος (από την
  // προ-υπολογισμένη λίστα MAJOR_FIFTHS) που αντιστοιχεί στο ίδιο ηχόχρωμα.
  const CANONICAL_MAJOR_KEYS = [
    'C','G','D','A','E','B','F#','C#','F','Bb','Eb','Ab','Db','Gb','Cb'
  ];
  function noteNameToPitch(name) {
    // υπολογίζει τα ημιτόνια (0..11) ενός ονόματος νότας με πολλαπλές αλλοιώσεις
    const p = parseTonic(name);
    if (!p) return null;
    let semi = NAT_SEMI[p.letter] + p.acc;
    semi = ((semi % 12) + 12) % 12;
    return semi;
  }
  function normalizeMajorKey(name) {
    // Αν υπάρχει άμεση καταχώριση, επιστρέφεται όπως είναι
    if (MAJOR_FIFTHS[name] !== undefined) return name;
    const pitch = noteNameToPitch(name);
    if (pitch == null) return name;
    let best = null;
    let bestAbs = Infinity;
    // αναζητούμε όλα τα κανονικά ματζόρε ονόματα που αντιστοιχούν στην ίδια νότα
    for (const cand of CANONICAL_MAJOR_KEYS) {
      const candPitch = noteNameToPitch(cand);
      if (candPitch === pitch) {
        const fifths = MAJOR_FIFTHS[cand];
        if (fifths == null) continue;
        const abs = Math.abs(fifths);
        if (abs < bestAbs) {
          bestAbs = abs;
          best = cand;
        }
      }
    }
    return best || name;
  }

  // Έξτρα όνομα κατάλληλου αριθμού υφέσεων/διέσεων για την εμφάνιση
  function keySignatureString(fifths) {
    if (fifths > 0) return String(fifths) + '#';
    if (fifths < 0) return String(-fifths) + '♭';
    return '0';
  }

  // Ανάλυση ονόματος φθόγγου σε γράμμα και αλλοίωση
  function parseTonic(name) {
    const m = String(name).trim().match(/^([A-Ga-g])(#+|b+)?$/);
    if (!m) return { letter:'C', acc:0 };
    const letter = m[1].toUpperCase();
    const accStr = m[2] || '';
    let acc = 0;
    for (const ch of accStr) {
      if (ch === '#') acc += 1;
      else if (ch.toLowerCase() === 'b') acc -= 1;
    }
    return { letter, acc };
  }

  // Υπολογισμός νέου τονικού ονόματος (γράμμα+αλλοίωση) με βάση τη μεταφορά
  const ASC_LETTER_OFFSET = [0,1,1,2,2,3,3,4,5,5,6,6];
  // Καθοδική μετατόπιση γραμμάτων: για κάθε ημιτόνιο προς τα κάτω,
  // μετακινούμε το γράμμα κατά -1 σε κάθε ζευγάρι ημιτονίων, όπως
  // περιγράφεται στον κλασικό χρωματικό σχηματισμό (π.χ. G -> F# -> F -> E -> Eb -> D -> Db
  // -> C -> Cb -> Bbb -> Ab -> κ.λπ.). Η σειρά αυτή αντιστοιχεί στον
  // πίνακα τιμών [-1,-1,-2,-2,-3,-3,-4,-4,-5,-5,-6,-6] για n=1..11 και 0 για n=0.
  const DESC_LETTER_OFFSET = [0, -1, -1, -2, -2, -3, -3, -4, -4, -5, -5, -6];

  // Προσπάθησε να επιλέξεις την εναρμονική ονομασία με τα λιγότερα ακραία
  // σύμβολα (διπλές υφέσεις/διέσεις) όταν γίνεται μεταφορά προς τα κάτω. Η
  // επιλογή γίνεται ανάμεσα σε όλα τα πιθανά γράμματα (C,B,A,...), ώστε να
  // ελαχιστοποιηθεί ο απόλυτος αριθμός του οπλισμού.
  function unifyTonicName(name, semis, mode) {
    // unify applies only when transposing downwards (semis<0). For upward or
    // zero transpositions we should not alter the computed tonic.
    if (!name || !Number.isFinite(semis) || semis >= 0) return name;

    // Determine the absolute semitone distance within the octave.  When
    // transposing downward some raw names (e.g. Db, Cb, Bbb) arise from the
    // chromatic letter pattern.  These names are enharmonic to more
    // conventional tonics (C#, B and A respectively) which have much smaller
    // key signatures.  We only convert such raw names at specific semitone
    // offsets: 6, 8 and 10 semitones down from the tonic.  For all other
    // distances we preserve the raw name (even if another enharmonic has
    // fewer accidentals) so that the ascending/descending sequences follow
    // the traditional Greek naming convention described by the user.
    const n = Math.abs(semis) % 12;
    // Θέσεις (σε αριθμό ημιτονίων) όπου το αρχικό γράμμα θα είναι μη
    // αναμενόμενο (διπλή ύφεση/διέση). Μόνο σε αυτές τις περιπτώσεις
    // επιχειρούμε να βρούμε μια πιο “καθαρή” εναρμονική.
    const conversionPositions = [6, 8, 10];
    if (!conversionPositions.includes(n)) {
      // Για άλλες αποστάσεις διατηρούμε το αρχικό όνομα, ακόμα κι αν
      // ενδέχεται να υπάρχουν εναλλακτικά με λιγότερα σύμβολα. Αυτό
      // εξασφαλίζει ότι για τις περισσότερες μεταφορές το γράμμα
      // παραμένει συνεπές με την αρχική ακολουθία γραμμάτων.
      return name;
    }
    // Υπολόγισε το actual pitch του δοσμένου ονόματος
    const { letter: baseL, acc: baseA } = parseTonic(name);
    let pitch = (NAT_SEMI[baseL] + baseA) % 12;
    if (pitch < 0) pitch += 12;
    let best = name;
    let bestAbs = Infinity;
    // Φύλαξε το γράμμα (A–G) του αρχικού rawName ώστε σε περίπτωση ισοπαλίας να
    // προτιμάμε εναλλακτικές με το ίδιο γράμμα (π.χ. Eb αντί για D#)
    const targetLetter = (function(){
      const p = parseTonic(name);
      return p ? p.letter : null;
    })();

    for (const L of LETTERS) {
      const baseSemi = NAT_SEMI[L];
      let diff = pitch - baseSemi;
      // Περιορισμός diff στο εύρος [-6,6]
      while (diff > 6) diff -= 12;
      while (diff < -6) diff += 12;
      // Απορρίπτουμε λύσεις με περισσότερες από μία αλλοιώσεις ώστε να
      // αποφεύγουμε ακραίες περιπτώσεις όπως A####
      if (Math.abs(diff) > 1) continue;
      let accStr = '';
      if (diff > 0) accStr = '#'.repeat(diff);
      else if (diff < 0) accStr = 'b'.repeat(-diff);
      const cand = L + accStr;
      // Υπολόγισε τον οπλισμό για τον υποψήφιο (μινόρε ή ματζόρε)
      const sig = computeKeySig(cand, mode);
      // εξαγωγή αριθμού από συμβολοσειρά τύπου “4#” ή “5♭”
      let numVal = 0;
      if (typeof sig === 'string' && sig.length) {
        const m = sig.match(/([0-9]+)/);
        if (m) numVal = parseInt(m[1], 10);
      }
      const absSig = Number.isFinite(numVal) ? Math.abs(numVal) : Infinity;
      // Σε ισοπαλία, προτίμησε τις διέσεις για καθοδική μεταφορά ώστε η σειρά
      // των γραμμάτων (π.χ. ...D → C# → C...) να είναι ομαλή. Συγκρίνουμε
      // αν ο υποψήφιος έχει περισσότερες αλλοιώσεις (#) σε σχέση με τον
      // τρέχοντα καλύτερο.
      if (absSig < bestAbs) {
        bestAbs = absSig;
        best = cand;
      } else if (absSig === bestAbs && best !== cand) {
        // Σε περίπτωση ισοπαλίας του απόλυτου οπλισμού (ίσος αριθμός διέσεων/υφέσεων)
        // εφαρμόζουμε διαφορετικά κριτήρια ανάλογα με το αν βρισκόμαστε σε θέση
        // μετατροπής (conversionPositions) ή όχι. Στις θέσεις μετατροπής (6,8,10)
        // θέλουμε να απαλλαγούμε από τα “παράξενα” ονόματα (π.χ. Db → C#,
        // Cb → B, Bbb → A). Σε αυτές τις περιπτώσεις δεν προτιμάμε το ίδιο γράμμα
        // αλλά συγκρίνουμε το πλήθος των συμβόλων αλλοίωσης (διέσεων/υφέσεων).
        // Επιλέγουμε τον υποψήφιο με το μικρότερο μήκος συμβολοσειράς αλλοιώσεων.
        if (conversionPositions.includes(n)) {
          const bestAcc = best.replace(/^[A-G]/, '');
          const candAcc = cand.replace(/^[A-G]/, '');
          const bestLen = bestAcc.length;
          const candLen = candAcc.length;
          if (candLen < bestLen) {
            best = cand;
          } else if (candLen === bestLen) {
            // Αν έχουν ίσο μήκος, προτίμησε τις διέσεις έναντι των υφέσεων
            const bestIsFlat = /b/.test(bestAcc);
            const candIsSharp = /#/i.test(candAcc);
            if (candIsSharp && bestIsFlat) {
              best = cand;
            }
          }
        } else {
          // Εκτός των θέσεων μετατροπής, διατηρούμε την προηγούμενη λογική:
          // προτίμησε τον υποψήφιο που έχει το ίδιο γράμμα με το αρχικό rawName.
          const bestLetter = best ? best[0] : null;
          if (targetLetter && L === targetLetter && bestLetter !== targetLetter) {
            best = cand;
            continue;
          }
          // Αν και οι δύο έχουν ή δεν έχουν το ίδιο γράμμα, συνέχισε με το
          // προηγούμενο κριτήριο: προτίμηση σε περισσότερες διέσεις και
          // λιγότερα σύμβολα αλλοίωσης.
          const bestAcc = best.replace(/^[A-G]/, '');
          const candAcc = cand.replace(/^[A-G]/, '');
          const bestIsFlat = /b/.test(bestAcc);
          const candIsSharp = /#/i.test(candAcc);
          if (candIsSharp && bestIsFlat) {
            best = cand;
          } else if (bestAcc.length > candAcc.length) {
            best = cand;
          }
        }
      }
    }
    return best;
  }

  function computeNewTonic(baseName, semis, mode) {
    // baseName π.χ. "G" ή "Bb" κ.λπ.
    const { letter: baseLetter, acc: baseAcc } = parseTonic(baseName);
    const baseSemi = NAT_SEMI[baseLetter] + baseAcc;
    if (!Number.isFinite(semis) || semis === 0) return baseName;
    const positive = semis > 0;
    const n = Math.abs(semis) % 12;
    let letterOffset;
    if (positive) {
      letterOffset = ASC_LETTER_OFFSET[n];
    } else {
      letterOffset = DESC_LETTER_OFFSET[n];
    }
    const newIdx = (LETTER_IDX[baseLetter] + letterOffset + 7) % 7;
    const newLetter = LETTERS[newIdx];
    const newPitch = baseSemi + semis;
    const natSemi = NAT_SEMI[newLetter];
    let diff = ((newPitch - natSemi) % 12 + 12) % 12;
    if (diff > 6) diff -= 12;
    let accStr = '';
    if (diff > 0) accStr = '#'.repeat(diff);
    else if (diff < 0) accStr = 'b'.repeat(-diff);
    let rawName = newLetter + accStr;
    // Αν μεταφέρεται προς τα κάτω, προσπάθησε να βελτιώσεις το όνομα
    if (semis < 0) {
      rawName = unifyTonicName(rawName, semis, mode);
    }
    return rawName;
  }

  // Υπολογισμός σχετικής ματζόρε για μια μινόρε τονικότητα
  function relativeMajor(minorTonic) {
    const { letter, acc } = parseTonic(minorTonic);
    const minorSemi = NAT_SEMI[letter] + acc;
    const relSemi = minorSemi + 3; // 3 ημιτόνια πάνω
    const relIdx = (LETTER_IDX[letter] + 2) % 7; // δύο γράμματα πάνω
    const relLetter = LETTERS[relIdx];
    const relNatSemi = NAT_SEMI[relLetter];
    let diff = ((relSemi - relNatSemi) % 12 + 12) % 12;
    if (diff > 6) diff -= 12;
    let accStr = '';
    if (diff > 0) accStr = '#'.repeat(diff);
    else if (diff < 0) accStr = 'b'.repeat(-diff);
    return relLetter + accStr;
  }

  // Υπολογισμός οπλισμού για μινόρε/ματζόρε
  function computeKeySig(tonicName, mode) {
    if (!tonicName) return '0';
    if (mode && mode.toLowerCase() === 'minor') {
      // Βρες τη σχετική ματζόρε και έπειτα τον οπλισμό της
      const maj = relativeMajor(tonicName);
      // Κανονικοποίησε το όνομα της ματζόρε στον πιο κοντινό κανονικό τόνο
      const norm = normalizeMajorKey(maj);
      const fifths = MAJOR_FIFTHS[norm];
      return keySignatureString(fifths == null ? 0 : fifths);
    }
    // Για ματζόρε υπολόγισε απευθείας
    const norm = normalizeMajorKey(tonicName);
    const fifths = MAJOR_FIFTHS[norm];
    return keySignatureString(fifths == null ? 0 : fifths);
  }

  // Μετατρέπει το λατινικό όνομα σε ελληνικό (αν υπάρχει)
  function prettyName(tonicLatin, mode) {
    const gr = NOTE_GR[tonicLatin] || tonicLatin;
    const quality = (String(mode).toLowerCase() === 'minor') ? '-' : '+';
    return `${gr} ${quality}`;
  }

  // Βελτιωμένη ενημέρωση του badge
  NS.updateTonalityBadge = function(state) {
    if (!state) return;
    const wrap = state.wrap;
    if (!wrap) return;
    const badge = wrap.querySelector('.sp-key-badge');
    // Store reference for later use (e.g. updateKeySignaturesForState)
    if (badge) {
      try { state.tonalityBadge = badge; } catch {}
    }
    if (!badge) return;
    // Αν δεν έχουμε ήδη προσδιορίσει βασική τονικότητα, καλέστε την αρχική
    // υλοποίηση (αν υπάρχει) ώστε να γεμίσει το state._baseKeyInfo
    try {
      if (!_origUpdateTonality) {
        // αν δεν υπάρχει αρχική, προσπαθήστε να διαβάσετε τονικά δεδομένα μέσω xml
        if (!state._baseKeyInfo) {
          // αναζήτηση πρώτου <key>/<fifths> στο MusicXML (όπως στο score-player.js)
          let xmlDoc = state.currentXmlDoc;
          if (!xmlDoc && state._xmlText) {
            try { xmlDoc = new DOMParser().parseFromString(state._xmlText, 'application/xml'); } catch {}
          }
          if (xmlDoc) {
            const keys = xmlDoc.getElementsByTagName('key');
            for (let i = 0; i < keys.length; i++) {
              const k = keys[i];
              const fifthsEl = k.getElementsByTagName('fifths')[0];
              if (!fifthsEl) continue;
              const modeEl   = k.getElementsByTagName('mode')[0];
              const fifths   = parseInt((fifthsEl.textContent||'').trim(),10);
              if (!Number.isFinite(fifths) || fifths < -7 || fifths > 7) continue;
              // Μείζονα βάση
              const FIFTHS_TO_MAJOR = {
                "-7":"Cb", "-6":"Gb", "-5":"Db", "-4":"Ab", "-3":"Eb", "-2":"Bb", "-1":"F",
                 "0":"C",
                 "1":"G", "2":"D", "3":"A", "4":"E", "5":"B", "6":"F#", "7":"C#"
              };
              const MAJOR_TO_MINOR = {
                "Cb":"Ab", "Gb":"Eb", "Db":"Bb", "Ab":"F", "Eb":"C", "Bb":"G", "F":"D",
                "C":"A", "G":"E", "D":"B", "A":"F#", "E":"C#", "B":"G#", "F#":"D#", "C#":"A#"
              };
              const majLatin = FIFTHS_TO_MAJOR[String(fifths)];
              if (!majLatin) continue;
              let mode = (modeEl && (modeEl.textContent||'').trim().toLowerCase()) || 'major';
              if (mode !== 'minor' && mode !== 'major') mode = 'major';
              let tonicLatin = majLatin;
              if (mode === 'minor') tonicLatin = MAJOR_TO_MINOR[majLatin] || 'A';
              state._baseKeyInfo = { tonicLatin, mode };
              break;
            }
          }
        }
      } else {
        if (!state._baseKeyInfo) {
          try { _origUpdateTonality(state); } catch {}
        }
      }
    } catch {}
    // Αν δεν καταφέραμε να βρούμε τονικότητα, δείξε ενωμένο dash
    if (!state._baseKeyInfo) {
      badge.textContent = '—';
      return;
    }
    const base = state._baseKeyInfo;
    // προσδιορισμός μεταφοράς
    const semis = Number(state?.transpose) || 0;
    // υπολογισμός νέου τονικού ονόματος και οπλισμού
    const newTonic = computeNewTonic(base.tonicLatin, semis, base.mode);
    const sig = computeKeySig(newTonic, base.mode);
    const pretty = prettyName(newTonic, base.mode);
    //badge.textContent = `${pretty} (${sig})`;
    badge.textContent = pretty;
    badge.setAttribute('data-key-pretty', pretty);
    badge.setAttribute('data-key-latin', newTonic);
    badge.setAttribute('data-mode', base.mode);
    badge.setAttribute('data-key-sig', sig);
    badge.title = `Τονικότητα: ${pretty} — Οπλισμός: ${sig}`;

    // Ενημέρωσε ένα global flag για το αν πρέπει να προτιμώνται flats ή sharps
    // κατά την μετατόπιση συμβόλων συγχορδιών. Αν ο οπλισμός περιέχει
    // οποιαδήποτε ένδειξη υφέσεων (b ή ♭) και όχι διέσεις, θεωρούμε ότι
    // προτιμούμε flats· αν περιέχει διέσεις (#) και όχι υφέσεις, προτιμούμε
    // sharps. Σε άλλες περιπτώσεις αφήνουμε το flag undefined ώστε η
    // transposeChordSymbol να αποφασίσει με βάση το πρωτότυπο κείμενο.
    try {
      const sigStr = String(sig || '');
      const hasFlat = /♭|b/.test(sigStr);
      const hasSharp = /#/.test(sigStr);
      if (hasFlat && !hasSharp) {
        w.RepScore._transposeUseFlats = true;
      } else if (hasSharp && !hasFlat) {
        w.RepScore._transposeUseFlats = false;
      } else {
        // unset
        w.RepScore._transposeUseFlats = undefined;
      }
    } catch {}
  };

  /*
   * Το score-player.js επαναπροσδιορίζει την NS.updateTonalityBadge μετά
   * την φόρτωση όλων των modules, με αποτέλεσμα να παρακάμπτει την
   * βελτιωμένη υλοποίηση που ορίζουμε εδώ. Για να διασφαλίσουμε ότι
   * χρησιμοποιείται το παρόν (βελτιωμένο) function μετά την πλήρη
   * φόρτωση της σελίδας, αποθηκεύουμε το reference σε μία τοπική
   * μεταβλητή και το επανα-αναθέτουμε στην RepScore.updateTonalityBadge
   * όταν συμβεί το DOMContentLoaded. Έτσι, ακόμη κι αν άλλο module
   * τροποποιήσει τη μέθοδο, στο τέλος θα επικρατήσει η δική μας
   * υλοποίηση.
   */
  const __enhancedUpdateTonality = NS.updateTonalityBadge;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const RS = window.RepScore || {};
        if (typeof __enhancedUpdateTonality === 'function') {
          RS.updateTonalityBadge = __enhancedUpdateTonality;
        }
      } catch {}
    });
  }

  // -------------------------------------------------------------------------
  // Επαναπροσδιορισμός transposeChordSymbol ώστε να χρησιμοποιεί την ίδια
  // λογική μετατροπής με το computeNewTonic. Η προεπιλεγμένη υλοποίηση
  // επιλέγει διέσεις αν το πρωτότυπο δεν είχε υφέσεις, οδηγώντας π.χ.
  // το "Gm" με μεταφορά +1 σε "G#m" αντί "Abm". Εδώ χρησιμοποιούμε
  // την computeNewTonic για το root και το slash-bass ώστε να ακολουθούμε
  // την ίδια ορθογραφία (π.χ. Ab, Bb, C#, κ.λπ.) όπως στον οπλισμό.
  try {
    const _origTransposeChordSymbol = transposeChordSymbol;
    transposeChordSymbol = function(sym, semitones) {
      const txt = String(sym).trim();
      if (!txt) return txt;
      const sVal = Number(semitones) || 0;
      if (sVal === 0) return sym;
      // Διαχωρισμός ρίζας (με suffix) και slash-bass
      const slashIdx = txt.indexOf('/');
      const rootPart = slashIdx >= 0 ? txt.slice(0, slashIdx) : txt;
      const bassPart = slashIdx >= 0 ? txt.slice(slashIdx + 1) : null;
      const rootParsed = normalizeNoteName(rootPart);
      if (!rootParsed) {
        // Fallback στην αρχική υλοποίηση
        return _origTransposeChordSymbol.call(this, sym, semitones);
      }
      // Μετατόπιση ρίζας χρησιμοποιώντας computeNewTonic. Θεωρούμε την
      // τονικότητα “minor” για να ευθυγραμμιστεί με τη συμπεριφορά της
      // μινόρε κλίμακας που ζητά ο χρήστης.
      let newRootName;
      try {
        newRootName = computeNewTonic(rootParsed.name, sVal, 'minor');
      } catch {
        // Αν αποτύχει, fallback
        return _origTransposeChordSymbol.call(this, sym, semitones);
      }
      // Ενδεχομένως απλοποίησε ονόματα όπως Bbb → A, Cb → B, Fb → E κ.λπ.
      const simplifyIfUnnatural = function(noteName) {
        if (!noteName) return noteName;
        // Μη φυσικά αν περιέχουν διπλές αλλοιώσεις ή είναι ειδικές περιπτώσεις
        const m = String(noteName).match(/^([A-G])([#b]*)(.*)$/);
        if (!m) return noteName;
        const letter = m[1];
        const accStr = m[2] || '';
        const suffix = m[3] || '';
        // Περιπτώσεις π.χ. Cb (B), Fb (E), E# (F), B# (C)
        const isWeirdSingle = (accStr === 'b' && (letter === 'C' || letter === 'F')) ||
                              (accStr === '#' && (letter === 'E' || letter === 'B'));
        const hasDouble = /bb|##/.test(accStr);
        if (!hasDouble && !isWeirdSingle) return noteName;
        // υποψήφιες εναρμονικές με abs(diff)<=1
        const p = parseTonic(letter + accStr);
        let pitch = (NAT_SEMI[p.letter] + p.acc) % 12;
        if (pitch < 0) pitch += 12;
        let best = noteName;
        let bestAbs = Infinity;
        for (const L of LETTERS) {
          const baseSemi = NAT_SEMI[L];
          let diff = pitch - baseSemi;
          while (diff > 6) diff -= 12;
          while (diff < -6) diff += 12;
          if (Math.abs(diff) > 1) continue;
          let accStr2 = '';
          if (diff > 0) accStr2 = '#'.repeat(diff);
          else if (diff < 0) accStr2 = 'b'.repeat(-diff);
          const cand = L + accStr2;
          // Μην δημιουργείς διπλές αλλοιώσεις
          if (/bb|##/.test(accStr2)) continue;
          const sig = computeKeySig(cand, 'minor');
          let numVal = 0;
          const mm = sig.match(/([0-9]+)/);
          if (mm) numVal = parseInt(mm[1], 10);
          const absSig = Math.abs(numVal);
          if (absSig < bestAbs) {
            bestAbs = absSig;
            best = cand;
          } else if (absSig === bestAbs) {
            // Tie-break: προτιμήστε τον υποψήφιο με λιγότερα σύμβολα αλλοιώσεων
            const bestLen = best.replace(/^[A-G]/,'').length;
            const candLen = accStr2.length;
            if (candLen < bestLen) {
              best = cand;
            } else if (candLen === bestLen) {
              // Αν ίσο μήκος, προτιμήστε τον υποψήφιο με διέσεις
              const bestIsFlat = /b/.test(best);
              const candIsSharp = /#/.test(cand);
              if (candIsSharp && bestIsFlat) best = cand;
            }
          }
        }
        return best + suffix;
      };
      newRootName = simplifyIfUnnatural(newRootName);
      const newRoot = newRootName + (rootParsed.rest || '');
      let newBass = '';
      if (bassPart && bassPart.trim()) {
        const bassParsed = normalizeNoteName(bassPart);
        if (bassParsed && bassParsed.name) {
          let newBassName;
          try {
            newBassName = computeNewTonic(bassParsed.name, sVal, 'minor');
          } catch {
            newBassName = _origTransposeChordSymbol.call(this, bassParsed.name, semitones);
          }
          newBassName = simplifyIfUnnatural(newBassName);
          newBass = '/' + newBassName + (bassParsed.rest || '');
        } else {
          newBass = '/' + bassPart;
        }
      }
      return newRoot + newBass;
    };
  } catch (ex) {
    // Αν για κάποιο λόγο αποτύχει, απλώς αγνόησε την επαναπροσδιορισμό
  }

  /*
   * Μετά την βελτιωμένη επαναπροσδιορισμό του transposeChordSymbol
   * παραπάνω, εφαρμόζουμε ακόμη έναν wrapper που λαμβάνει υπόψιν τον
   * οπλισμό του badge (data-key-sig) ώστε να επιλέγει συνεπώς flats ή
   * sharps κατά τη μεταφορά.  Αυτό το wrapper εκτελείται πάντοτε και
   * κληρονομεί την αρχική συμπεριφορά ως fallback.  Χρησιμοποιεί τα
   * βοηθητικά noteNameToSemis και semisToNoteName που ορίζονται στην
   * αρχή του αρχείου, καθώς και την προκαθορισμένη συνάρτηση
   * preferFlatForText όταν δεν έχει ρυθμιστεί το global flag
   * w.RepScore._transposeUseFlats.  Επιπλέον, καθαρίζει “παράξενες”
   * ονομασίες (π.χ. Cb → B, E# → F) μέσω της simplifyIfUnnatural.
   */
  try {
    const __priorTransposeChordSymbol = transposeChordSymbol;
    // helper: απλοποίηση ονομάτων με υπερβολικές αλλοιώσεις
    function simplifyIfUnnaturalNoteName(noteName) {
      if (!noteName) return noteName;
      const m = String(noteName).match(/^([A-G])([#b]*)(.*)$/);
      if (!m) return noteName;
      const letter = m[1];
      const accStr = m[2] || '';
      const suffix = m[3] || '';
      const hasDouble = /bb|##/.test(accStr);
      // ειδικές περιπτώσεις μιας αλλοίωσης που οδηγούν σε παράξενες
      // ονομασίες (Cb→B, Fb→E, E#→F, B#→C)
      const isWeirdSingle = (accStr === 'b' && (letter === 'C' || letter === 'F')) ||
                            (accStr === '#' && (letter === 'E' || letter === 'B'));
      if (!hasDouble && !isWeirdSingle) return noteName;
      // υπολογισμός pitch
      const p = parseTonic(letter + accStr);
      let pitch = NAT_SEMI[p.letter] + p.acc;
      pitch = ((pitch % 12) + 12) % 12;
      let best = noteName;
      let bestAbs = Infinity;
      for (const L of LETTERS) {
        const baseSemi = NAT_SEMI[L];
        let diff = pitch - baseSemi;
        while (diff > 6) diff -= 12;
        while (diff < -6) diff += 12;
        if (Math.abs(diff) > 1) continue;
        let acc = '';
        if (diff > 0) acc = '#'.repeat(diff);
        else if (diff < 0) acc = 'b'.repeat(-diff);
        // απόφυγε διπλές αλλοιώσεις
        if (/bb|##/.test(acc)) continue;
        const cand = L + acc;
        const sig = computeKeySig(cand, 'minor');
        const mSig = sig.match(/([0-9]+)/);
        const numVal = mSig ? parseInt(mSig[1], 10) : 0;
        const absSig = Math.abs(numVal);
        if (absSig < bestAbs) {
          bestAbs = absSig;
          best = cand;
        } else if (absSig === bestAbs) {
          // λιγότερα σύμβολα αλλοίωσης
          const bestLen = best.replace(/^[A-G]/, '').length;
          const candLen = acc.length;
          if (candLen < bestLen) {
            best = cand;
          } else if (candLen === bestLen) {
            // αν ίσα, προτίμησε διέσεις αντί υφέσεων
            const bestIsFlat = /b/.test(best);
            const candIsSharp = /#/.test(cand);
            if (candIsSharp && bestIsFlat) best = cand;
          }
        }
      }
      return best + suffix;
    }

    transposeChordSymbol = function(sym, semitones) {
      const txt = String(sym).trim();
      if (!txt) return txt;
      const sVal = Number(semitones) || 0;
      if (sVal === 0) return sym;
      const slashIdx = txt.indexOf('/');
      const rootPart = slashIdx >= 0 ? txt.slice(0, slashIdx) : txt;
      const bassPart = slashIdx >= 0 ? txt.slice(slashIdx + 1) : null;
      const rootParsed = normalizeNoteName(rootPart);
      if (!rootParsed) {
        return __priorTransposeChordSymbol.call(this, sym, semitones);
      }
      // αποφάσισε flats/sharps από global flag ή από το πρωτότυπο
      let useFlats;
      try {
        const flag = w.RepScore && w.RepScore._transposeUseFlats;
        if (flag === true) useFlats = true;
        else if (flag === false) useFlats = false;
        else {
          useFlats = preferFlatForText(rootParsed.name);
        }
      } catch {
        useFlats = preferFlatForText(rootParsed.name);
      }
      const rootSemi = noteNameToSemis(rootParsed.name);
      if (rootSemi == null) {
        return __priorTransposeChordSymbol.call(this, sym, semitones);
      }
      const newSemi = rootSemi + sVal;
      let newRootName = semisToNoteName(newSemi, !!useFlats);
      newRootName = simplifyIfUnnaturalNoteName(newRootName);
      const newRoot = newRootName + (rootParsed.rest || '');
      let newBass = '';
      if (bassPart && bassPart.trim()) {
        const bassParsed = normalizeNoteName(bassPart);
        if (bassParsed && bassParsed.name) {
          let useFlatsBass;
          try {
            const flag = w.RepScore && w.RepScore._transposeUseFlats;
            if (flag === true) useFlatsBass = true;
            else if (flag === false) useFlatsBass = false;
            else {
              useFlatsBass = preferFlatForText(bassParsed.name);
            }
          } catch {
            useFlatsBass = preferFlatForText(bassParsed.name);
          }
          const bassSemi = noteNameToSemis(bassParsed.name);
          if (bassSemi != null) {
            const newBassSemi = bassSemi + sVal;
            let newBassName = semisToNoteName(newBassSemi, !!useFlatsBass);
            newBassName = simplifyIfUnnaturalNoteName(newBassName);
            newBass = '/' + newBassName + (bassParsed.rest || '');
          } else {
            newBass = '/' + bassPart;
          }
        } else {
          newBass = '/' + bassPart;
        }
      }
      return newRoot + newBass;
    };
  } catch (ex) {
    // αν αποτύχει, διατήρησε το προηγούμενο transposeChordSymbol
  }

})(window);
