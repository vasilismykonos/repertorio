  // score-audio.js — MusicXML-based playback με micro-intervals, πλήρες transporto,
  // Transport-synced playhead, και "αφόπλιση" του legacy MIDI/Sampler μονοπατιού.
  //
  // ΔΕΝ προστίθενται νέα αρχεία. Όλα γίνονται εδώ.

  (function (w) {
    const NS = w.RepScore = w.RepScore || {};
    const C  = NS.consts || {};

    // ===========================
    // Σταθερές / helpers
    // ===========================
    const DEFAULT_PPQ = 960;
    const A4_FREQ = 440;
    const A4_MIDI = 69;
    const X_TOL = Number.isFinite(C.X_TOL) ? C.X_TOL : 18;

    // Global/canonical transpose fallback (αν δεν έχουμε state.*)
    NS.__globalTranspose = NS.__globalTranspose || 0;

    function _num(x, d=0){
      if (x === null || x === undefined) return d;
      const s = String(x).trim();
      if (s === "") return d;
      const v = Number(s);
      return Number.isFinite(v) ? v : d;
    }
    function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

    // ===== Transporto: βρες την τρέχουσα τιμή από ΟΠΟΥ και να είναι
    function resolveTranspose(state){
      // Προτίμηση: explicit state.transpose αν υπάρχει
      if (Number.isFinite(state?.transpose))   return _num(state.transpose, 0);
      if (Number.isFinite(state?.transporto))  return _num(state.transporto, 0);
      if (Number.isFinite(state?.semitones))   return _num(state.semitones, 0);
      if (Number.isFinite(state?.shift))       return _num(state.shift, 0);

      // Inputs
      if (state?.tInp && state.tInp.value != null) return _num(state.tInp.value, NS.__globalTranspose);
      if (state?.transposeInput && state.transposeInput.value != null) return _num(state.transposeInput.value, NS.__globalTranspose);

      // API hooks
      try { if (typeof NS.getTranspose === 'function') return _num(NS.getTranspose(), NS.__globalTranspose); } catch {}
      try {
        if (state?.transport && typeof state.transport.getTranspose === 'function') {
          return _num(state.transport.getTranspose(), NS.__globalTranspose);
        }
      } catch {}

      return _num(NS.__globalTranspose, 0);
    }

    function musicXmlStepToSemitone(stepChar){
      switch(String(stepChar||'C').toUpperCase()){
        case 'C': return 0; case 'D': return 2; case 'E': return 4;
        case 'F': return 5; case 'G': return 7; case 'A': return 9;
        case 'B': return 11; default: return 0;
      }
    }

    // Υπολογισμός συχνότητας: αντιμετωπίζουμε το alter ως ΠΛΗΡΗ ημιτόνια
    // (διέσεις/υφέσεις). Τυχόν micro-interval τιμές (π.χ. 0.5) στρογγυλοποιούνται
    // στο κοντινότερο ημιτόνιο ώστε να αποφεύγονται «φάλτσες» λόγω OMR.
    function pitchToFreq(step, alter, octave, transposeSemi){
      const stepSemi  = musicXmlStepToSemitone(step);
      const baseMidi  = (octave + 1) * 12 + stepSemi;
      const alterSemi = Math.round(alter || 0);
      const finalSemi = baseMidi + (transposeSemi || 0) + alterSemi;
      const cents     = 0;
      const semiFromA4 = finalSemi - A4_MIDI;
      const freq = A4_FREQ * Math.pow(2, semiFromA4/12);
      return { freqHz: freq, centsDetune: cents };
    }

    // ===========================
    // MusicXML → events
    // ===========================
    function parseMusicXML(xmlText) {
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const score = doc.documentElement;
      const divisions = _num(score.querySelector('divisions')?.textContent, 480);

      let bpm = 120;
      {
        const snd = score.querySelector('sound[tempo]');
        if (snd) bpm = clamp(_num(snd.getAttribute('tempo'), 120), 20, 300);
        const pm = score.querySelector('direction metronome per-minute');
        if (!snd && pm) bpm = clamp(_num(pm.textContent, 120), 20, 300);
      }

      const parts = Array.from(score.querySelectorAll('score-partwise > part, part'));
      const events = [];

      parts.forEach((part, pIdx) => {
        let curTick = 0;
        const measures = Array.from(part.querySelectorAll('measure'));

        measures.forEach((m) => {
          const snd = m.querySelector('sound[tempo]');
          if (snd) bpm = clamp(_num(snd.getAttribute('tempo'), bpm), 20, 300);

          let lastChordTick = null;

          for (const el of Array.from(m.children)) {
            const name = el.localName;

            if (name === 'backup') {
              curTick -= _num(el.querySelector('duration')?.textContent, 0);
              if (curTick < 0) curTick = 0;
            } else if (name === 'forward') {
              curTick += _num(el.querySelector('duration')?.textContent, 0);
            } else if (name === 'note') {
              const isRest = !!el.querySelector('rest');
              const dur    = _num(el.querySelector('duration')?.textContent, 0);
              const voiceN = el.querySelector('voice')?.textContent || '1';
              const staffN = el.querySelector('staff')?.textContent || '1';
              const vel    = _num(el.querySelector('velocity')?.textContent, 0.85);
              const chord  = !!el.querySelector('chord');

              let step=null, alter=0, oct=4;
              if (!isRest) {
                const p = el.querySelector('pitch');
                step  = p?.querySelector('step')?.textContent || 'C';
                alter = _num(p?.querySelector('alter')?.textContent, 0);
                oct   = _num(p?.querySelector('octave')?.textContent, 4);
              }

              const tTick = chord && lastChordTick != null ? lastChordTick : curTick;

              events.push({
                part: pIdx, tTicks: tTick, dTicks: dur,
                isRest, step, alter, oct,
                voice: voiceN, staff: staffN, velocity: clamp(vel, 0, 1)
              });

              if (!chord) {
                lastChordTick = curTick;
                curTick += dur;
              }
            }
          }
        });
      });

      // divisions → ppq/tone ticks
      const ppq = DEFAULT_PPQ;
      const tickToTone = (t) => Math.max(1, Math.round((t / divisions) * ppq));

      events.sort((a,b)=> a.tTicks - b.tTicks || (a.isRest - b.isRest));
      events.forEach(e => {
        e.tTone = tickToTone(e.tTicks);
        e.dTone = tickToTone(e.dTicks);
      });

      // distinct onsets για visual
      const onsetTicks = [];
      let last = -1;
      for (const e of events) {
        if (e.tTone !== last) {
          onsetTicks.push(e.tTone);
          last = e.tTone;
        }
      }
      return { ppq, bpm, divisions, events, onsetTicks };
    }

    // ===========================
    // Διαχείριση Tone/legacy
    // ===========================
    function disposePart(p){ try { p?.dispose?.(); } catch {} }
    function disposeParts(parts){ if (parts && Array.isArray(parts)) parts.forEach(disposePart); }
    function stopTransport(){ try { w.Tone.Transport.stop(); } catch {} }
    function pauseTransport(){ try { w.Tone.Transport.pause(); } catch {} }

    // Αφόπλιση οποιουδήποτε legacy scheduling (MIDI/Sampler) πριν στήσουμε τα δικά μας
    function neutralizeLegacy(state) {
      try { w.Tone.Transport.cancel(0); } catch {}
      // καθάρισε sampler/legacy parts αν υπάρχουν
      try {
        if (state?.sampler) { state.sampler.dispose?.(); state.sampler = null; }
      } catch {}
      try {
        if (state?.legacyParts && Array.isArray(state.legacyParts)) {
          state.legacyParts.forEach(p => { try { p.stop?.(); p.dispose?.(); } catch {} });
          state.legacyParts = [];
        }
      } catch {}
    }

    function _ensureSynth(state) {
      if (state.synth) return;
      try {
          state.synth = new Tone.Sampler({
              urls: {
                  C4: "C4.mp3",
                  "D#4": "Ds4.mp3",
                  "F#4": "Fs4.mp3",
                  A4: "A4.mp3"
              },
              release: 1,
              baseUrl: "https://tonejs.github.io/audio/salamander/"
          }).toDestination();
          Tone.loaded();
      } catch (e) {
          console.error(e);
      }
  }


    function _setTransportBpm(bpm) {
      if (w.Tone?.Transport) w.Tone.Transport.bpm.value = clamp(_num(bpm, 120), 20, 300);
    }

    async function _loadXmlText(state) {
      if (state._xmlText && state._xmlText.length > 40) return state._xmlText;
      if (state.fileUrl) {
        try { const res = await fetch(state.fileUrl, { credentials: 'same-origin' }); return await res.text(); }
        catch {}
      }
      // Στα παλαιότερα implementations η φόρτωση γινόταν και από το Verovio toolkit.
      // Στην υλοποίηση με OSMD δεν υπάρχει αυτή η μέθοδος, οπότε απλά επιστρέφουμε κενό.
      return '';
    }

    // ===========================
    // DOM columns / Playhead
    // ===========================
    function _systemIndexOf(svg, el) {
      try {
        const systems = Array.from(svg.querySelectorAll('g.system'));
        if (!systems.length) return 0;
        const r = el.getBoundingClientRect(), cy = r.top + r.height/2;
        for (let i=0;i<systems.length;i++){
          const sr = systems[i].getBoundingClientRect();
          if (cy >= sr.top && cy <= sr.bottom) return i;
        }
        let bestI=0, bestD=Infinity;
        systems.forEach((s,i)=>{
          const sr = s.getBoundingClientRect();
          const mid = (sr.top+sr.bottom)/2;
          const d = Math.abs(cy-mid);
          if (d<bestD){bestD=d;bestI=i;}
        });
        return bestI;
      } catch { return 0; }
    }

    function _centerClientX(el) {
      const r = el.getBoundingClientRect();
      return r.left + r.width/2;
    }

    function clientToLocal(svg, clientX, clientY) {
      if (NS.svgClientToLocal) return NS.svgClientToLocal(svg, clientX, clientY);
      try {
        const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
        const inv = svg.getScreenCTM()?.inverse();
        if (inv) { const p = pt.matrixTransform(inv); return { x: p.x, y: p.y }; }
      } catch {}
      return { x: clientX, y: clientY };
    }

    function localToClient(svg, xLocal, yLocal) {
      if (NS.svgLocalToClient) return NS.svgLocalToClient(svg, xLocal, yLocal);
      const pt = svg.createSVGPoint(); pt.x = xLocal; pt.y = yLocal;
      const ctm = svg.getScreenCTM();
      const p = ctm ? pt.matrixTransform(ctm) : { x: xLocal, y: yLocal };
      return { x: p.x, y: p.y };
    }

    function ensurePlayhead(svg) {
      if (!svg) return null;
      let wrap = svg.querySelector('g.sp-playhead-wrap');
      if (!wrap) {
        wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrap.setAttribute('class', 'sp-playhead-wrap');
        wrap.setAttribute('pointer-events', 'none');
        svg.appendChild(wrap);
      }
      let line = wrap.querySelector('line.sp-playhead');
      const wpx = Number.isFinite(C.PLAYHEAD_WIDTH) ? C.PLAYHEAD_WIDTH : 2;
      if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'sp-playhead');
        line.setAttribute('stroke', '#00bcd4');
        line.setAttribute('stroke-width', String(wpx));
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0.9');
        line.setAttribute('x1', '0'); line.setAttribute('x2', '0');
        line.setAttribute('y1', '0'); line.setAttribute('y2', '0');
        wrap.appendChild(line);
      } else {
        line.setAttribute('stroke-width', String(wpx));
      }
      return { wrap, line };
    }

    function setPlayheadXY(svg, xLocal, yTopLocal, yBotLocal) {
      const ph = ensurePlayhead(svg);
      if (!ph) return;
      let y1 = yTopLocal, y2 = yBotLocal;
      if (!Number.isFinite(y1) || !Number.isFinite(y2)) {
        const vb = svg.viewBox?.baseVal;
        y1 = 0;
        y2 = vb?.height ?? (svg.getBBox().y + svg.getBBox().height);
      }
      ph.line.setAttribute('x1', String(xLocal));
      ph.line.setAttribute('x2', String(xLocal));
      ph.line.setAttribute('y1', String(y1));
      ph.line.setAttribute('y2', String(y2));
      ph.wrap.style.display = '';
    }

  function computeSystemSpanAtX(svg, xLocal, systemIndex) {
    // Αν το score-visual μας δίνει ειδικό helper, χρησιμοποίησέ τον
    if (NS.computeSystemSpanAtX) {
      const s = NS.computeSystemSpanAtX(svg, xLocal, systemIndex);
      if (s) return s;
    }

    // Fallback: αν δεν υπάρχει τίποτε άλλο, πιάσε όλη τη σελίδα
    const vb = svg.viewBox?.baseVal;
    const yTopLocal = 0;
    const yBotLocal = vb?.height ?? (svg.getBBox().y + svg.getBBox().height);
    return { yTopLocal, yBotLocal };
  }



    function keepPlayheadInView(state, svg, xLocal, systemIndex) {
      try {
        const r = state.renderEl; if (!r) return;
        const clientX = localToClient(svg, xLocal, 0).x;
        const rBox = r.getBoundingClientRect();
        const deltaLeft  = clientX - rBox.left;
        const deltaRight = rBox.right - clientX;
        const hPad = rBox.width * 0.2;

        if (deltaLeft < hPad) {
          r.scrollLeft = Math.max(0, r.scrollLeft - (hPad - deltaLeft));
        } else if (deltaRight < hPad) {
          r.scrollLeft = r.scrollLeft + (hPad - deltaRight);
        }

        const systems = Array.from(svg.querySelectorAll('g.system'));
        let vTop, vBottom;
        if (systems.length && typeof systemIndex === 'number' && systemIndex >= 0 && systemIndex < systems.length) {
          const sr = systems[systemIndex].getBoundingClientRect();
          vTop = sr.top; vBottom = sr.bottom;
        } else {
          const span = computeSystemSpanAtX(svg, xLocal, systemIndex);

          vTop = localToClient(svg, xLocal, span.yTopLocal).y;
          vBottom = localToClient(svg, xLocal, span.yBotLocal).y;
        }

        const sysMid = (vTop + vBottom) / 2;
        const desired = rBox.top + (rBox.height * 0.5);
        const dy = (sysMid - desired);
        if (Math.abs(dy) > 1) r.scrollTop += dy;
      } catch {}
    }

      // Συλλογή "note-like" groups μέσα στο SVG, συμβατή με Verovio ΚΑΙ OSMD
    function collectNoteLikeGroups(svg) {
      if (!svg) return [];

      // 1) Παλιά Verovio classes
      let items = Array.from(svg.querySelectorAll('g.chord, g.note'));
      if (items.length) return items;

      // 2) Τυπικά VexFlow/OSMD groups για νότες
      items = Array.from(svg.querySelectorAll('g.vf-stavenote, g.vf-note, g.vf-stem'));
      if (items.length) return items;

      // 3) Οτιδήποτε έχει κλάση που περιέχει vf-note / vf-stavenote
      items = Array.from(svg.querySelectorAll('g[class*="vf-note"], g[class*="vf-stavenote"]'));
      if (items.length) return items;

      // 4) Fallback: πάρε noteheads και ανέβα στο κοντινό <g>
      const noteheads = Array.from(svg.querySelectorAll(
        'path[class*="vf-notehead"], ellipse.notehead, use.notehead, path[class*="notehead"]'
      ));
      const groups = new Set();
      noteheads.forEach(n => {
        const g = n.closest('g');
        if (g) groups.add(g);
      });
      return Array.from(groups);
    }

    function buildDomColumns(state) {
      const root = state.renderEl || state.wrap || state.container || document;
      const svgs = Array.from(root.querySelectorAll('.sp-page > svg, svg'));
      const result = [];

      svgs.forEach((svg) => {
        const items = collectNoteLikeGroups(svg);
        if (!items.length) return;

        // Ταξινόμηση από αριστερά προς δεξιά
        items.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const xa = ra.left + ra.width / 2;
          const xb = rb.left + rb.width / 2;
          return xa - xb;
        });

        let col = null;
        for (const el of items) {
          const xC = _centerClientX(el);
          const xL = clientToLocal(svg, xC, 0).x;
          const sys = _systemIndexOf(svg, el);

          if (!col) {
            col = { svg, system: sys, centerClient: xC, centerLocal: xL, elements: [el] };
            continue;
          }

          // Ομαδοποίηση σε "στήλη" αν είναι στο ίδιο σύστημα και κοντά σε X
          if (col.system === sys && Math.abs(xC - col.centerClient) <= X_TOL) {
            col.elements.push(el);
            col.centerClient = (col.centerClient * (col.elements.length - 1) + xC) / col.elements.length;
            col.centerLocal  = clientToLocal(svg, col.centerClient, 0).x;
          } else {
            result.push(col);
            col = { svg, system: sys, centerClient: xC, centerLocal: xL, elements: [el] };
          }
        }
        if (col) result.push(col);
      });

      // Ταξινόμηση στήλες κατά σύστημα & X
      result.sort((a, b) => {
        if (a.svg !== b.svg) return 0;
        return (a.system - b.system) || (a.centerClient - b.centerClient);
      });

      return result;
    }

    NS._rebuildDomColumnsForScheduler = function (state) {
      state._domColumns = buildDomColumns(state);
    };


    // ===========================
    // Visual scheduler πάνω στον Transport
    // ===========================
    function disposeVisualPart(state){
      if (state.visualPart) { try { state.visualPart.dispose(); } catch {} }
      state.visualPart = null;
    }

  function buildVisualSchedulerTransportSynced(state, mappingOnly) {
    if (!state?.renderEl) return;
    if (!state._domColumns) state._domColumns = buildDomColumns(state);
    const cols = state._domColumns;
    if (!cols.length) return;
    if (!state._onsetTicks || !state._onsetTicks.length) return;

    // Υπολόγισε κάθετη έκταση ανά στήλη
    cols.forEach(col => {
      col._span = computeSystemSpanAtX(col.svg, col.centerLocal, col.system);
    });

    // Αντιγραφή και ταξινόμηση χρονικών στιγμών (ticks)
    const onsets = state._onsetTicks.slice().sort((a, b) => a - b);

    // Χάρτης: κάθε στήλη → ένα tick (χρονοστιγμή Transport)
    const colTicks = new Array(cols.length);
    let onsetIdx = 0;
    let lastTick = onsets.length ? onsets[0] : 0;

    for (let ci = 0; ci < cols.length; ci++) {
      if (onsetIdx < onsets.length) {
        lastTick = onsets[onsetIdx++];
        colTicks[ci] = lastTick;
      } else {
        // Αν τελειώσουν τα onsets, κράτα την τελευταία τιμή
        colTicks[ci] = lastTick;
      }
    }

    // Αποθήκευσε για χρήση από το click–seek
    state._visualColTicks = colTicks;
    state._visualCols     = cols;

    // Αν ζητήθηκε μόνο mapping, μην στήσεις καθόλου τον παλιό δείκτη
    if (mappingOnly) {
      return;
    }

    let curCol = -1;

    const showCol = (i) => {
      i = clamp(i, 0, cols.length - 1);

      // Καθάρισε προηγούμενη επισήμανση
      if (curCol >= 0 && curCol < cols.length) {
        cols[curCol].elements.forEach(el => el.classList.remove('note-highlight'));
      }

      // Νέα στήλη
      const col = cols[i];
      col.elements.forEach(el => el.classList.add('note-highlight'));

      // Δείκτης (παλιός playhead γραμμή)
      setPlayheadXY(col.svg, col.centerLocal, col._span?.yTopLocal, col._span?.yBotLocal);
      keepPlayheadInView(state, col.svg, col.centerLocal, col.system);

      curCol = i;
    };

    // Καθάρισε προηγούμενο visualPart
    disposeVisualPart(state);

    // Γεγονότα: κάθε στήλη έχει ένα δικό της time και index
    const visualEvents = colTicks.map((t, idx) => ({
      time: w.Tone.Ticks(t),
      colIndex: idx
    }));

    const vPart = new w.Tone.Part((time, ev) => {
      try {
        showCol(ev.colIndex);
      } catch {}
    }, visualEvents);

    vPart.start(0);
    state.visualPart = vPart;

    // Αποθήκευσε helpers για stop/pause/start
    state._visualStop = function () {
      try {
        if (curCol >= 0 && curCol < cols.length) {
          cols[curCol].elements.forEach(el => el.classList.remove('note-highlight'));
        }
        state.renderEl
          .querySelectorAll('svg g.sp-playhead-wrap')
          .forEach(w => w.style.display = 'none');
      } catch {}
      curCol = -1;
    };
    state._visualPause = function () { /* ο Transport παγώνει το vPart */ };
    state._visualStart = function () { /* το vPart τρέχει με τον Transport */ };
  }



  


    // ===========================
    // Click στο SVG → μεταφορά δείκτη & Transport + OSMD cursor
    // ===========================
    NS.seekToClientPoint = function (state, clientX, clientY, svgHint) {
      if (!state) return;

      // Στήλες και mapping "στήλη → ticks" που έχουν φτιαχτεί στο _buildCore
      let cols = state._visualCols || state._domColumns;
      if (!cols || !cols.length) return;
      if (!state._visualColTicks || !state._visualColTicks.length) return;

      const colTicks = state._visualColTicks;

      // Διάλεξε SVG
      const svg =
        svgHint ||
        (cols[0] && cols[0].svg) ||
        (state.renderEl && state.renderEl.querySelector('svg'));

      if (!svg) return;

      // 1) Μετατροπή του clientX σε τοπικό X μέσα στο SVG (xLocal)
      const localPoint = clientToLocal(svg, clientX, clientY);
      const xLocal = localPoint.x;

      // 2) Βρες την πλησιέστερη "στήλη" με βάση την απόσταση στο τοπικό X
      let bestIdx = -1;
      let bestDx  = Infinity;

      cols.forEach((col, idx) => {
        if (col.svg !== svg) return; // δούλεψε μόνο στο συγκεκριμένο SVG

        const dx = Math.abs(xLocal - col.centerLocal);
        if (dx < bestDx) {
          bestDx  = dx;
          bestIdx = idx;
        }
      });

      if (bestIdx < 0) return;
      if (!colTicks || bestIdx >= colTicks.length) return;

      // 3) Πάρε το ακριβές tick που αντιστοιχεί στη στήλη
      const tick = colTicks[bestIdx];
      if (!Number.isFinite(tick)) return;

      const wasPlaying = !!state.playing;

      // 4) Σταμάτα προσωρινά τον Transport
      try { w.Tone.Transport.pause(); } catch {}

      // 5) Μετακίνηση Transport στη νέα θέση (σε ticks)
      try { w.Tone.Transport.ticks = tick; } catch {}

      // 6) Μετακίνηση OSMD cursor στην αντίστοιχη μουσική στιγμή (πλησιέστερο onset)
      try {
        const osmd = state.osmd;
        if (osmd && osmd.cursor && typeof osmd.cursor.show === 'function') {
          const onsets = Array.isArray(state._onsetTicks)
            ? state._onsetTicks.slice().sort((a, b) => a - b)
            : [];

          let evIndex = 0;
          if (onsets.length > 1) {
            let bestDist = Infinity;
            for (let i = 0; i < onsets.length; i++) {
              const d = Math.abs(onsets[i] - tick);
              if (d < bestDist) {
                bestDist = d;
                evIndex = i;
              }
            }
          }

          osmd.cursor.reset();
          let first = true;
          for (let i = 0; i <= evIndex; i++) {
            if (first) {
              osmd.cursor.show();
              first = false;
            } else {
              osmd.cursor.next();
            }
          }
        }
      } catch (e) {
        console.warn('OSMD cursor seek error', e);
      }

      // 7) Αν έπαιζε πριν, ξαναξεκίνα από τη νέα θέση
      if (wasPlaying) {
        try { w.Tone.Transport.start(); } catch {}
      }
    };






    /**
     * Εναλλακτικός visual scheduler για το OSMD όταν υπάρχει διαθέσιμος
     * cursor. Αντί να ψάχνει τα στοιχεία του SVG μέσω class names (g.note
     * κ.λπ.) που ίσχυαν μόνο για το Verovio, χρησιμοποιεί το built-in
     * cursor του OpenSheetMusicDisplay για να προβάλλει την τρέχουσα
     * θέση/νότα. Ο cursor επισημαίνει την τρέχουσα νότα και σχεδιάζει
     * ένα εικονίδιο/πλαίσιο στην παρτιτούρα.
     *
     * Ο scheduler δημιουργεί ένα Tone.Part με tick events ίδιους με
     * τα onsetTicks του MusicXML. Για κάθε event, καλεί το cursor.next()
     * (με εξαίρεση το πρώτο event όπου καλεί cursor.show()) ώστε να
     * προχωράει στην επόμενη νότα. Στο stop/pause εξαφανίζει τον cursor.
     */
    function buildVisualSchedulerOsmd(state) {
      if (!state?.renderEl) return;
      if (!state._onsetTicks || !state._onsetTicks.length) return;
      const osmd = state.osmd;
      if (!osmd || !osmd.cursor || typeof osmd.cursor.show !== 'function') {
        return;
      }
      try { osmd.cursor.reset(); } catch {}
      let first = true;
      // Dispose old visual part if exists
      disposeVisualPart(state);
      // Make local copy of onsets and sort ascending
      const onsets = state._onsetTicks.slice().sort((a,b)=>a-b);
      const events = onsets.map(t => ({ time: w.Tone.Ticks(t) }));
      const vPart = new w.Tone.Part((time, ev) => {
        try {
          if (first) {
            osmd.cursor.show();
            first = false;
          } else {
            osmd.cursor.next();
          }
        } catch (e) { console.warn('OSMD cursor error', e); }
      }, events);
      vPart.start(0);
      state.visualPart = vPart;
      // Define control hooks for playhead
      state._visualStop = function() {
        try { osmd.cursor.hide?.(); } catch {}
        try { vPart.stop?.(); vPart.dispose?.(); } catch {}
      };
      state._visualPause = function() {
        // Tone.Transport.pause will pause the part automatically
        try { osmd.cursor.hide?.(); } catch {}
      };
      state._visualStart = function() {
        // Nothing extra needed; part resumes with Tone.Transport.start
        try { osmd.cursor.show?.(); } catch {}
      };
    }

    // ===========================
    // Watchers για transporto (global + state)
    // ===========================
    function _initTransposeWatchers(state){
      if (state && state.__transposeWatchersInit) return;
      if (state) state.__transposeWatchersInit = true;

      // Input live (αν υπάρχει)
      if (state?.tInp && !state.tInp.__repBound) {
        let to=null;
        state.tInp.addEventListener('input', ()=>{
          clearTimeout(to);
          to = setTimeout(()=>{ _applyTransposeAndRebuild(state, state.tInp.value); }, 120);
        });
        state.tInp.__repBound = true;
      }

      // Global window events
      const evNames = ['rep-transpose','transpose-change','transporto-change','set-transpose'];
      evNames.forEach(name=>{
        if (!window.__repTransposeBound) {
          window.addEventListener(name, (e)=>{
            try {
              const v = (e && e.detail != null) ? Number(e.detail) : 0;
              NS.__globalTranspose = _num(v, 0);
              const st = NS.__lastStateForAudio;
              if (st) _applyTransposeAndRebuild(st, NS.__globalTranspose);
            } catch {}
          });
        }
      });
      window.__repTransposeBound = true;
    }

    // ===========================
    // Κεντρικό build από MusicXML (με transporto)
    // ===========================
    async function _buildCore(state) {
      // Απενεργοποίησε legacy scheduling
      neutralizeLegacy(state);

      // καθάρισε παλιά μέρη μας
      disposeParts(state.parts); state.parts = [];
      disposeVisualPart(state);

      const xmlText = await _loadXmlText(state);
      if (!(xmlText && xmlText.length > 40)) {
        console.warn('[score-audio] Δεν βρέθηκε MusicXML για ήχο.');
        return false;
      }

      let parsed = null;
      try { parsed = parseMusicXML(xmlText); }
      catch (e) { console.error('[score-audio] XML parse error:', e); }

      if (!parsed || !parsed.events?.length) {
        console.warn('[score-audio] Κενή ροή γεγονότων.');
        return false;
      }

      state._onsetTicks = parsed.onsetTicks || [];

      try { w.Tone.Transport.PPQ = parsed.ppq || DEFAULT_PPQ; } catch {}
      state.baseBpm = parsed.bpm || 120;
      const uiBpm = _num(state?.tempoInp?.value, state.baseBpm);
      if (state.tempoVal) state.tempoVal.textContent = String(Math.round(uiBpm));
      _setTransportBpm(uiBpm);

      _ensureSynth(state);

      // ✅ Υιοθέτησε/κάνε canonical την τρέχουσα μετατόπιση
      const transposeNow = resolveTranspose(state);
      state.transpose = transposeNow;
      NS.__globalTranspose = transposeNow;
      NS.updateTransposeUI?.(state);

      // Χτίσε audio events με transporto
      const partEvents = parsed.events.map(ev => {
        if (ev.isRest) {
          return { time: w.Tone.Ticks(ev.tTone), durationTicks: ev.dTone, rest: true };
        }
        const { freqHz, centsDetune } = pitchToFreq(ev.step, ev.alter, ev.oct, transposeNow);
        return {
          time: w.Tone.Ticks(ev.tTone),
          durationTicks: ev.dTone,
          freq: freqHz,
          detune: centsDetune,
          velocity: ev.velocity,
          staff: ev.staff, voice: ev.voice
        };
      });

          const audioPart = new w.Tone.Part((time, e) => {
        if (e.rest) return;
        const durSec = w.Tone.Ticks(e.durationTicks).toSeconds();
        try { state.synth.set({ detune: e.detune || 0 }); } catch {}
        try { state.synth.triggerAttackRelease(e.freq, durSec, time, e.velocity); } catch {}
      }, partEvents);

      audioPart.start(0);
      state.parts = [audioPart];

      // Visual:
      try {
        // 1) DOM στήλες για click–seek
        NS._rebuildDomColumnsForScheduler?.(state);

        // 2) Χάρτης "στήλη → ticks" χωρίς να ενεργοποιηθεί ο παλιός δείκτης
        buildVisualSchedulerTransportSynced(state, true);

        // 3) Επίσημος OSMD cursor για την οπτική ένδειξη
        buildVisualSchedulerOsmd(state);
      } catch (e) {
        console.warn('Visual scheduler error:', e);
      }

      return true;

    }


    // Δημόσιο API build
    NS.buildAudioParts = async function (state) {
      if (!state) return;
      NS.__lastStateForAudio = state;
      _initTransposeWatchers(state);
      return _buildCore(state);
    };

    // ===========================
    // Transport hooks (ήχος + visual)
    // ===========================
    NS.playAudio = async function (state) {
      NS.__lastStateForAudio = state;
      _initTransposeWatchers(state);

      try { if (w.Tone?.context.state !== 'running') await w.Tone.context.resume(); } catch {}

      // Αν κάνεις resume από pause, μην ξαναχτίζεις
      if (state.paused && state.playing === false && state.parts && state.parts.length) {
        try { w.Tone.Transport.start(); } catch {}
        state.playing = true; state.paused = false;
        state._visualStart?.();
        return;
      }

      await _buildCore(state);
      try { w.Tone.Transport.start(); } catch {}
      state.playing = true; state.paused = false;
      state._visualStart?.();
    };

    NS.pauseAudio = function (state) {
      pauseTransport();
      state.paused = true; state.playing = false;
      try { state._visualPause?.(); } catch {}
    };

    NS.stopAudio = function (state) {
      stopTransport();
      try { w.Tone.Transport.position = 0; } catch {}
      state.paused = false; state.playing = false;
      try { state._visualStop?.(); } catch {}
    };

    // ===========================
    // Tempo / Transpose UI Sync
    // ===========================
    NS.setTempo = function (state, bpm) {
      const v = Number.parseInt(bpm, 10);
      if (!Number.isFinite(v) || v <= 0) return;

      if (state.tempoInp) state.tempoInp.value = String(v) + ' bpm';
      if (state.tempoVal) state.tempoVal.textContent = String(v);
      _setTransportBpm(v);
    };

    NS.updateTransposeUI = function (state) {
      const v = (function resolveTranspose(s){
        if (Number.isFinite(s?.transpose))   return Number(s.transpose);
        if (Number.isFinite(s?.transporto))  return Number(s.transporto);
        if (Number.isFinite(s?.semitones))   return Number(s.semitones);
        if (Number.isFinite(s?.shift))       return Number(s.shift);
        if (s?.tInp && s.tInp.value != null) return Number(s.tInp.value) || 0;
        if (s?.transposeInput && s.transposeInput.value != null) return Number(s.transposeInput.value) || 0;
        try { if (typeof NS.getTranspose === 'function') return Number(NS.getTranspose()) || 0; } catch {}
        try { if (s?.transport && typeof s.transport.getTranspose === 'function') return Number(s.transport.getTranspose()) || 0; } catch {}
        return Number(NS.__globalTranspose || 0);
      })(state);

      if (state.tVal) state.tVal.textContent = String(v);
      if (state.tInp && String(state.tInp.value) !== String(v)) state.tInp.value = String(v);

      // ✅ ενημέρωσε και την «τονικότητα έξω από το SVG»
      try { if (typeof NS.updateTonalityBadge === 'function') NS.updateTonalityBadge(state); } catch {}
    };


      // ===========================
    // Transporto: hooks + rebuild
    // ===========================
    async function _applyTransposeAndRebuild(state, newVal){
      if (!state) return;

      const val = _num(newVal, resolveTranspose(state));
      state.transpose = val;        // canonical
      NS.__globalTranspose = val;

      // UI sync
      if (state.tInp) state.tInp.value = String(val);
      if (state.tVal) state.tVal.textContent = String(val);
      try {
        if (typeof NS.updateTransposeUI === 'function') {
          NS.updateTransposeUI(state);
        }
      } catch (e) {
        console.warn('[score-audio] updateTransposeUI error', e);
      }

      const wasPlaying = !!state.playing;

      // Σταμάτα τον ήχο και καθάρισε τον τρέχοντα προγραμματισμό
      try {
        if (typeof NS.stopAudio === 'function') {
          NS.stopAudio(state);
        } else if (w.Tone?.Transport) {
          w.Tone.Transport.stop();
          w.Tone.Transport.position = 0;
        }
      } catch (e) {
        console.warn('[score-audio] stopAudio error', e);
      }

      // Πλήρες rebuild: OSMD render + audio parts + cursor
      try {
        if (typeof NS.loadAndRenderScore === 'function') {
          await NS.loadAndRenderScore(state);
        } else {
          await _buildCore(state);
        }
      } catch (e) {
        console.warn('[score-audio] transpose rebuild error', e);
        return;
      }

      // Αν έπαιζε πριν, ξαναξεκίνα με το νέο transporto
      if (wasPlaying) {
        try {
          if (w.Tone?.context?.state !== 'running') {
            await w.Tone.context.resume();
          }
          if (w.Tone?.Transport) {
            w.Tone.Transport.start();
          }
          state.playing = true;
          state.paused = false;
          try { state._visualStart?.(); } catch {}
        } catch (e) {
          console.warn('[score-audio] restart after transpose error', e);
        }
      }
    }

    // Δημόσιο API για αλλαγές transporto, συμβατό με παλιό κώδικα
    NS.onTransposeChanged = async function(state){ await _applyTransposeAndRebuild(state, resolveTranspose(state)); };
    NS.setTranspose       = async function(state,v){ await _applyTransposeAndRebuild(state, v); };
    NS.changeTranspose    = async function(state,v){ await _applyTransposeAndRebuild(state, v); };
    NS.applyTranspose     = async function(state,v){ await _applyTransposeAndRebuild(state, v); };
    NS.transposeChanged   = async function(state,v){ await _applyTransposeAndRebuild(state, v); };

    // Init layer (αν θέλεις να το καλέσεις ρητά)
    NS.initAudioLayer = function(state){
      NS.__lastStateForAudio = state;
      _initTransposeWatchers(state);
      // Αρχικοποίηση UI με την τρέχουσα μετατόπιση
      state.transpose = resolveTranspose(state);
      NS.__globalTranspose = state.transpose;
      NS.updateTransposeUI?.(state);
    };

    // ===========================
    // Autoplay policy tip:
    // Αν δεις "AudioContext was not allowed...", η πρώτη κλήση play πρέπει να γίνει μετά από χειρονομία χρήστη.
    // Εμείς ήδη κάνουμε Tone.context.resume() στο playAudio.
    // ===========================
// --- Bridge: ενοποίηση transporto παρτιτούρας & συγχορδιών ---
(function () {
  // 12-φθογγο σύστημα, ίδιο με το PHP transportChords
  const ALL_TONES = ["Ντο","Ντο#","Ρε","Ρε#","Μι","Φα","Φα#","Σολ","Σολ#","Λα","Λα#","Σι"];
  const GREEK_TO_LATIN = {
    "Ντο": "C",
    "Ρε":  "D",
    "Μι":  "E",
    "Φα":  "F",
    "Σολ": "G",
    "Λα":  "A",
    "Σι":  "B"
  };

  let ignoreNextScoreEvent = false;

  // ⭐ Βασικό transporto παρτιτούρας (offset μεταξύ XML και συγχορδιών)
  // π.χ. αν το MusicXML ήταν ήδη σε +2 ημιτόνια όταν φόρτωσε,
  // κρατάμε αυτό σαν βάση ώστε τα clicks από τις συγχορδίες να
  // προσθέτουν από πάνω (relative), όχι να το μηδενίζουν.
  let baseScoreTranspose = 0;
  let baseScoreTransposeInitialized = false;

  function normTone(x) {
    return (x || "").trim();
  }

  function getBaseTone() {
    const el = document.querySelector("#chords");
    if (!el) return "";
    return normTone(el.getAttribute("data-base-tonicity") || "");
  }

  function getBaseSign() {
    const el = document.querySelector("#chords");
    if (!el) return "+";
    const s = (el.getAttribute("data-base-sign") || "+").trim();
    return (s === "-") ? "-" : "+";
  }

  function getSemitonesForTonicity(baseTone, targetTone) {
    baseTone   = normTone(baseTone);
    targetTone = normTone(targetTone);
    if (!baseTone || !targetTone) return 0;

    const baseIdx   = ALL_TONES.indexOf(baseTone);
    const targetIdx = ALL_TONES.indexOf(targetTone);
    if (baseIdx < 0 || targetIdx < 0) return 0;

    let diff = targetIdx - baseIdx;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    return diff;
  }

  function getTonicityForSemitones(baseTone, semitones) {
    baseTone = normTone(baseTone);
    if (!baseTone) return "";
    const baseIdx = ALL_TONES.indexOf(baseTone);
    if (baseIdx < 0) return "";

    const steps = ((semitones % 12) + 12) % 12; // 0..11
    const idx = (baseIdx + steps) % 12;
    return ALL_TONES[idx] || "";
  }

  function greekToLatin(baseTone) {
    baseTone = normTone(baseTone);
    if (!baseTone) return "";

    const m = baseTone.match(/^(Ντο|Ρε|Μι|Φα|Σολ|Λα|Σι)([#♯b♭]?)/);
    if (!m) return "";
    const root = m[1];
    const acc  = m[2] || "";

    let latin = GREEK_TO_LATIN[root] || "";
    if (!latin) return "";

    if (acc === "#" || acc === "♯") {
      latin += "#";
    } else if (acc === "b" || acc === "♭") {
      latin += "b";
    }
    return latin;
  }

  function applyToScore(semitones) {
    // ✨ ΕΔΩ είναι το βασικό fix:
    //   τελικό transpose = baseScoreTranspose (όπως ήρθε από το XML/player)
    //                    + semitones από τις συγχορδίες
    const rel = Number(semitones) || 0;
    const base = baseScoreTransposeInitialized ? baseScoreTranspose : 0;
    const targetTranspose = base + rel;

    if (
      window.RepScore &&
      typeof window.RepScore.setTranspose === "function" &&
      window.RepScore.__lastStateForAudio
    ) {
      window.RepScore.setTranspose(window.RepScore.__lastStateForAudio, targetTranspose);
    } else {
      // Fallback: συμβατότητα με rep-transpose listeners
      const ev = new CustomEvent("rep-transpose", { detail: targetTranspose });
      window.dispatchEvent(ev);
    }
  }

  function patchScoreBaseKey() {
    if (!window.RepScore || !window.RepScore.__lastStateForAudio) return false;
    const st = window.RepScore.__lastStateForAudio;

    const baseTone = getBaseTone();
    if (!baseTone) return false;
    const baseSign = getBaseSign();

    const latin = greekToLatin(baseTone);
    if (!latin) return false;

    // ⭐ Μία φορά ανά φόρτωμα παρτιτούρας,
    // κρατάμε το "αρχικό" transpose του score ως βάση
    if (!baseScoreTransposeInitialized) {
      const stTranspose = Number(st.transpose ?? st.transporto ?? st.semitones ?? st.shift);
      const globalTr    = Number(window.RepScore.__globalTranspose ?? 0);

      if (Number.isFinite(stTranspose) && stTranspose !== 0) {
        baseScoreTranspose = stTranspose;
      } else if (Number.isFinite(globalTr) && globalTr !== 0) {
        baseScoreTranspose = globalTr;
      } else {
        baseScoreTranspose = 0;
      }

      baseScoreTransposeInitialized = true;
      // console.log("[bridge] baseScoreTranspose =", baseScoreTranspose);
    }

    st._baseKeyInfo = {
      tonicLatin: latin,
      mode: baseSign === "-" ? "minor" : "major"
    };

    try {
      if (typeof window.RepScore.updateTonalityBadge === "function") {
        window.RepScore.updateTonalityBadge(st);
      }
    } catch (e) {
      console.warn("[bridge] updateTonalityBadge error", e);
    }
    return true;
  }

  // Μικρό retry μέχρι να φορτωθεί ο player
  (function autoPatch () {
    let attempts = 0;
    const max = 20;
    const timer = setInterval(function () {
      attempts++;
      if (patchScoreBaseKey() || attempts >= max) {
        clearInterval(timer);
      }
    }, 300);
  })();

  // --------------------------------------------------
  // 1) Συγχορδίες -> Παρτιτούρα
  // --------------------------------------------------
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".tonicity-button, .tonicity-button-user");
    if (!btn) return;

    const ton = normTone(btn.getAttribute("data-tonicity") || "");
    if (!ton) return;

    const baseTone = getBaseTone();
    if (!baseTone) return;

    const semis = getSemitonesForTonicity(baseTone, ton);
    ignoreNextScoreEvent = true;  // για να μη γυρίσει πίσω διπλά
    applyToScore(semis);
  });

  // --------------------------------------------------
  // 2) Παρτιτούρα -> Συγχορδίες (αν εκπέμπεις event από player)
  // --------------------------------------------------
  window.addEventListener("song-chords-transpose-from-score", function (e) {
    const val = (e && e.detail != null) ? Number(e.detail) : 0;
    if (!Number.isFinite(val)) return;

    if (ignoreNextScoreEvent) {
      ignoreNextScoreEvent = false;
      return;
    }

    const baseTone = getBaseTone();
    if (!baseTone) return;

    // ✨ Εδώ κάνουμε την αντίστροφη διόρθωση:
    //   το event μάλλον δίνει το ΤΕΛΙΚΟ transpose της παρτιτούρας
    //   -> αφαιρούμε το baseScoreTranspose για να βρούμε
    //      πόσα ημιτόνια πάνω/κάτω είναι σε σχέση με την αρχική
    let rel = val;
    if (baseScoreTransposeInitialized) {
      rel = val - baseScoreTranspose;
    }

    const targetTon = getTonicityForSemitones(baseTone, rel);
    if (!targetTon) return;

    const btn =
      document.querySelector('.tonicity-button[data-tonicity="' + targetTon + '"]') ||
      document.querySelector('.tonicity-button-user[data-tonicity="' + targetTon + '"]');

    if (btn) {
      btn.click();
    }
  });
})();


  })(window);
