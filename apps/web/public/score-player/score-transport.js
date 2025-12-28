//apps/rooms/score-transport.js

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

    // Για να μην επεξεργαζόμαστε τον ίδιο κόμβο δύο φορές
    const processed = new Set();

    function processTspan(tspan) {
      if (!tspan) return;
      if (processed.has(tspan)) return;
      processed.add(tspan);

      const raw = (tspan.textContent || "").trim();
      if (!raw) return;
      if (!isLikelyChordText(raw)) return;

      // Φυλάμε το αρχικό κείμενο ΜΙΑ φορά, ώστε όλες οι μεταφορές
      // να γίνονται πάνω στην αρχική συγχορδία και όχι πάνω σε ήδη
      // μεταφερμένη εκδοχή.
      if (!tspan.dataset.spChordOrig) {
        tspan.dataset.spChordOrig = raw;
      }

      const orig = tspan.dataset.spChordOrig || raw;

      // ΧΩΡΙΣ έξτρα «έξυπνο» re-spelling εδώ.
      // Απλώς χρησιμοποιούμε την ίδια transposeChordSymbol που
      // χρησιμοποιείς και στα text-chords, ώστε:
      // - στο semitones=0 να μένει όπως είναι,
      // - για κάθε βήμα transpose να ταιριάζει με το badge/τονικότητα.
      var newTxt = semitones ? transposeChordSymbol(orig, semitones) : orig;

      if (newTxt && newTxt !== tspan.textContent) {
        tspan.textContent = newTxt;
      }
    }

    // 1) Στόχευση γνωστών groups για συγχορδίες (όπως πριν + επέκταση)
    const chordGroups = svg.querySelectorAll(
      'g.dir, g.harmony, g.harm, g.chordSymbol, g.chord-symbol, g[class*="chord"], g[class*="harm"]'
    );

    chordGroups.forEach(function (grp) {
      const tspan =
        deepestTextTspan(grp) ||
        grp.querySelector("text tspan") ||
        grp.querySelector("text");
      processTspan(tspan);
    });

    // 2) Safety net: σκάναρε όλα τα text / tspan στο SVG και πιάσε ό,τι μοιάζει με συγχορδία
    const textNodes = svg.querySelectorAll("text, tspan");
    textNodes.forEach(function (node) {
      let tspan = node;
      if (node.tagName && node.tagName.toLowerCase() === "text") {
        tspan = deepestTextTspan(node) || node;
      }
      processTspan(tspan);
    });
  }

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
// ...

;(function (w) {
  const NS = w.RepScore = w.RepScore || {};
  if (NS.__enhancedKeySig) return;
  NS.__enhancedKeySig = true;

  // (όλος ο υπόλοιπος κώδικας ΔΕΝ έχει πειραχτεί — τον αφήνω όπως τον έστειλες)

  // ... ΜΕΧΡΙ ΤΟ ΣΗΜΕΙΟ ΠΟΥ ΥΠΑΡΧΕΙ ΤΟ ΠΡΟΒΛΗΜΑ ...

  /*
   * Μετά την βελτιωμένη επαναπροσδιορισμό του transposeChordSymbol
   * παραπάνω, εφαρμόζουμε ακόμη έναν wrapper ...
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
      } else {
        newBass = '/' + bassPart;
      }
      return newRoot + newBass;
    };
  } catch (ex) {  // <- ΕΔΩ ήταν η extra αγκύλη. Τώρα το try κλείνει σωστά.
    // αν αποτύχει, διατήρησε το προηγούμενο transposeChordSymbol
  }

  // Στο τέλος: δημοσιοποίησε την transposeChordSymbol για να τη χρησιμοποιεί και ο player
  try {
    NS.transposeChordSymbol = transposeChordSymbol;
  } catch {}
})(window);
