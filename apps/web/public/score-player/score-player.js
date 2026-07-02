// ============================ score-player.js ============================
// Κεντρικό script του score-player: διαβάζει MusicXML, αποδίδει μέσω
// OpenSheetMusicDisplay (OSMD) σε SVG, χειρίζεται αναπαραγωγή ήχου με Tone.js,
// διαχειρίζεται εναλλαγές προβολής (οριζόντια/σελίδων), tempo, transpose,
// tonality-badge και κουμπιά zoom + / -.

(function (w) {
  if (w.__SCORE_PLAYER_LOADED__) {
    console.warn('[score-player] already loaded, skipping second include');
    return;
  }
  w.__SCORE_PLAYER_LOADED__ = true;

  const NS = w.RepScore = w.RepScore || {};
  const C  = NS.consts || {};
  const TRANSPOSE_MIN = (C.TRANSPOSE_MIN ?? -12);
  const TRANSPOSE_MAX = (C.TRANSPOSE_MAX ??  12);
  const VIEW_KEY = 'spViewMode';


  // --------------------------- makeState ---------------------------
  function makeState(wrap) {
    const storedViewMode = localStorage.getItem(VIEW_KEY);
    const defaultViewMode = wrap.dataset.defaultView === 'paged' ? 'paged' : 'horizontal';
    return {
      wrap,
      fileUrl: wrap.dataset.file,
      transpose: parseInt(wrap.dataset.transpose || "0", 10) || 0,

      // DOM
      renderEl: wrap.querySelector(".sp-renderer"),
      btnPlay:  wrap.querySelector(".sp-play"),
      btnPause: wrap.querySelector(".sp-pause"),
      btnStop:  wrap.querySelector(".sp-stop"),
      btnUp:    wrap.querySelector(".sp-transpose-up"),
      btnDown:  wrap.querySelector(".sp-transpose-down"),
      tVal:     wrap.querySelector(".sp-transpose-val"),
      tempoInp: wrap.querySelector(".sp-tempo"),
      tempoVal: wrap.querySelector(".sp-tempo-val"),
      voiceFilterEl: wrap.querySelector(".sp-voice-filter"),
      voiceListEl: wrap.querySelector(".sp-voice-filter-list"),

      // view toggles
      btnViewH: wrap.querySelector(".sp-view-h"),
      btnViewP: wrap.querySelector(".sp-view-p"),

      // zoom controls
      btnZoomIn:  wrap.querySelector(".sp-zoom-in"),
      btnZoomOut: wrap.querySelector(".sp-zoom-out"),
      zoomInp:    wrap.querySelector(".sp-zoom"),

      // Rendering engine & Tone
      osmd: null,
      osmdZoom: 1,
      currentMidi: null,
      synth: null,
      parts: [],
      visualPart: null,
      playing: false,
      paused: false,
      baseBpm: 120,

      // view mode
      viewMode: (storedViewMode === 'paged' || storedViewMode === 'horizontal') ? storedViewMode : defaultViewMode,

      // cache
      _xmlText: null,      // για καθαρό MusicXML (text)
      _mxlData: null,      // για binary MXL (ArrayBuffer)
      currentXmlDoc: null,
      _decidedTonality: null,
      _baseKeyInfo: null,
      _activeVoiceKeys: null,
      _voiceOptions: [],
      _voiceOptionsSig: '',

      // flags
      lastTransport: null,
      _osmdRenderPatched: false,
      _pinchZoomBound: false,
      _pinchZoom: null
    };
  }

  function _xmlLocalName(el) {
    return (el && (el.localName || el.nodeName) || '').toLowerCase();
  }

  function _xmlChildren(el, name) {
    if (!el) return [];
    const target = String(name || '').toLowerCase();
    return Array.from(el.children || []).filter(child => _xmlLocalName(child) === target);
  }

  function _xmlFirst(el, name) {
    return _xmlChildren(el, name)[0] || null;
  }

  function _xmlText(el, name) {
    const node = name ? _xmlFirst(el, name) : el;
    return (node && node.textContent || '').trim();
  }

  function makeVoiceKey(partIndex, voice, staff) {
    return [partIndex, staff || '1'].join('|');
  }

  function readScorePartNames(xmlDoc) {
    const names = new Map();
    const scoreParts = Array.from(xmlDoc.getElementsByTagName('score-part'));
    scoreParts.forEach((scorePart, index) => {
      const id = scorePart.getAttribute('id') || '';
      const name = _xmlText(scorePart, 'part-name') || _xmlText(scorePart, 'part-abbreviation') || `Μέρος ${index + 1}`;
      if (id) names.set(id, name);
    });
    return names;
  }

  function collectVoiceOptions(xmlDoc) {
    if (!xmlDoc || xmlDoc.getElementsByTagName('parsererror').length) return [];

    const score = xmlDoc.documentElement;
    const rootName = _xmlLocalName(score);
    const partNames = readScorePartNames(xmlDoc);
    const parts = new Map();

    function ensurePart(partIndex, partId) {
      if (parts.has(partIndex)) return parts.get(partIndex);
      const partLabel = partNames.get(partId || '') || `Μέρος ${partIndex + 1}`;
      const meta = { partIndex, partId, partLabel, staves: new Set(), maxStaff: 1 };
      parts.set(partIndex, meta);
      return meta;
    }

    function addDeclaredStaves(partIndex, partId, container) {
      const meta = ensurePart(partIndex, partId);
      Array.from(container.getElementsByTagName('staves')).forEach(staves => {
        const count = Number.parseInt(_xmlText(staves), 10);
        if (!Number.isFinite(count) || count < 1) return;
        meta.maxStaff = Math.max(meta.maxStaff, count);
        for (let i = 1; i <= count; i += 1) meta.staves.add(String(i));
      });
    }

    function addStaff(partIndex, partId, staff) {
      const staffName = String(staff || '1').trim() || '1';
      const meta = ensurePart(partIndex, partId);
      const staffNumber = Number.parseInt(staffName, 10);
      if (Number.isFinite(staffNumber)) meta.maxStaff = Math.max(meta.maxStaff, staffNumber);
      meta.staves.add(staffName);
    }

    if (rootName === 'score-partwise') {
      _xmlChildren(score, 'part').forEach((part, partIndex) => {
        const partId = part.getAttribute('id') || '';
        addDeclaredStaves(partIndex, partId, part);
        Array.from(part.getElementsByTagName('note')).forEach(note => {
          addStaff(partIndex, partId, _xmlText(note, 'staff') || '1');
        });
      });
    } else if (rootName === 'score-timewise') {
      const partIndexById = new Map();
      _xmlChildren(score, 'measure').forEach(measure => {
        _xmlChildren(measure, 'part').forEach(part => {
          const partId = part.getAttribute('id') || `P${partIndexById.size + 1}`;
          if (!partIndexById.has(partId)) partIndexById.set(partId, partIndexById.size);
          const partIndex = partIndexById.get(partId);
          addDeclaredStaves(partIndex, partId, part);
          Array.from(part.getElementsByTagName('note')).forEach(note => {
            addStaff(partIndex, partId, _xmlText(note, 'staff') || '1');
          });
        });
      });
    }

    return Array.from(parts.values())
      .flatMap(meta => Array.from(meta.staves).map(staff => {
        const staffName = String(staff || '1').trim() || '1';
        return {
          key: makeVoiceKey(meta.partIndex, null, staffName),
          partIndex: meta.partIndex,
          voice: staffName,
          staff: staffName,
          label: meta.maxStaff > 1 ? `${meta.partLabel} · Πεντ. ${staffName}` : meta.partLabel
        };
      }))
      .sort((a, b) =>
        (a.partIndex - b.partIndex) ||
        String(a.staff).localeCompare(String(b.staff), undefined, { numeric: true })
      );
  }

  function getVisibleVoiceSet(state) {
    if (!state?._activeVoiceKeys) return null;
    return new Set(state._activeVoiceKeys);
  }

  function hasNoVisibleVoices(state) {
    const active = getVisibleVoiceSet(state);
    return !!active && active.size === 0;
  }

  function activePartIndexes(active) {
    const indexes = new Set();
    if (!active) return indexes;
    active.forEach(key => {
      const idx = Number.parseInt(String(key).split('|')[0], 10);
      if (Number.isFinite(idx)) indexes.add(idx);
    });
    return indexes;
  }

  function removeScorePart(score, partId) {
    if (!score || !partId) return;
    Array.from(score.getElementsByTagName('score-part')).forEach(scorePart => {
      if (scorePart.getAttribute('id') === partId) scorePart.remove();
    });
  }

  function activeStavesForPart(active, partIndex) {
    const staves = new Set();
    if (!active) return staves;

    active.forEach(key => {
      const parts = String(key).split('|');
      const idx = Number.parseInt(parts[0], 10);
      if (idx === partIndex) staves.add(parts[1] || '1');
    });

    return staves;
  }

  function compareStaffNames(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function partStaffNames(part) {
    const staves = new Set();

    Array.from(part.getElementsByTagName('staves')).forEach(stavesEl => {
      const count = Number.parseInt(_xmlText(stavesEl), 10);
      if (!Number.isFinite(count) || count < 1) return;
      for (let i = 1; i <= count; i += 1) staves.add(String(i));
    });

    Array.from(part.getElementsByTagName('note')).forEach(note => {
      staves.add(_xmlText(note, 'staff') || '1');
    });

    if (!staves.size) staves.add('1');
    return Array.from(staves).sort(compareStaffNames);
  }

  function setXmlChildText(parent, name, value) {
    if (!parent) return;
    let child = _xmlFirst(parent, name);
    if (!child) {
      child = parent.ownerDocument.createElement(name);
      parent.appendChild(child);
    }
    child.textContent = String(value);
  }

  function suppressNoteForHiddenVoice(note, replacementStaff) {
    if (!note) return;

    if (_xmlFirst(note, 'chord') || !_xmlFirst(note, 'duration')) {
      note.remove();
      return;
    }

    const doc = note.ownerDocument;
    const keepNames = new Set(['duration', 'voice', 'type', 'time-modification', 'staff']);
    const kept = Array.from(note.children)
      .filter(child => keepNames.has(_xmlLocalName(child)))
      .map(child => child.cloneNode(true));

    while (note.firstChild) note.removeChild(note.firstChild);

    note.setAttribute('print-object', 'no');
    note.setAttribute('print-spacing', 'yes');
    note.appendChild(doc.createElement('rest'));
    kept.forEach(child => note.appendChild(child));

    if (replacementStaff) setXmlChildText(note, 'staff', replacementStaff);
  }

  function remapStaffNumberedAttributes(attributes, activeStaves, staffMap) {
    const numberedNames = new Set(['clef', 'staff-details', 'staff-layout']);

    Array.from(attributes.children || []).forEach(child => {
      const name = _xmlLocalName(child);
      if (name === 'staves') {
        child.textContent = String(staffMap.size);
        return;
      }
      if (!numberedNames.has(name)) return;

      const originalStaff = child.getAttribute('number') || '1';
      if (!activeStaves.has(originalStaff)) {
        child.remove();
        return;
      }

      child.setAttribute('number', staffMap.get(originalStaff) || originalStaff);
    });
  }

  function remapOrRemoveStaffedElement(element, activeStaves, staffMap) {
    const staffEl = _xmlFirst(element, 'staff');
    if (!staffEl) return;

    const originalStaff = _xmlText(staffEl) || '1';
    if (!activeStaves.has(originalStaff)) {
      element.remove();
      return;
    }

    staffEl.textContent = staffMap.get(originalStaff) || originalStaff;
  }

  function compactPartToActiveStaves(part, activeStaves) {
    if (!part || !activeStaves || !activeStaves.size) return false;

    const allStaves = partStaffNames(part);
    const selectedStaves = allStaves.filter(staff => activeStaves.has(staff));
    if (!selectedStaves.length || selectedStaves.length === allStaves.length) return false;

    const staffMap = new Map(selectedStaves.map((staff, index) => [staff, String(index + 1)]));

    _xmlChildren(part, 'measure').forEach(measure => {
      _xmlChildren(measure, 'attributes').forEach(attributes => {
        remapStaffNumberedAttributes(attributes, activeStaves, staffMap);
      });

      Array.from(measure.children || []).forEach(child => {
        const name = _xmlLocalName(child);
        if (name === 'note') {
          const originalStaff = _xmlText(child, 'staff') || '1';
          if (activeStaves.has(originalStaff)) {
            setXmlChildText(child, 'staff', staffMap.get(originalStaff) || originalStaff);
          } else {
            suppressNoteForHiddenVoice(child, '1');
          }
        } else if (name === 'direction' || name === 'harmony' || name === 'figured-bass') {
          remapOrRemoveStaffedElement(child, activeStaves, staffMap);
        }
      });
    });

    return true;
  }

  function filteredXmlForVisibleVoices(state) {
    const source = state?._xmlText;
    if (!source || !source.trim().startsWith('<')) return source;

    const active = getVisibleVoiceSet(state);
    if (!active) return source;

    let doc;
    try {
      doc = new DOMParser().parseFromString(source, 'application/xml');
    } catch {
      return source;
    }
    if (!doc || doc.getElementsByTagName('parsererror').length) return source;

    const score = doc.documentElement;
    const rootName = _xmlLocalName(score);
    const activeParts = activePartIndexes(active);
    const pruneInactiveParts = active.size > 0 && activeParts.size > 0;

    function markNote(note, partIndex) {
      const voice = _xmlText(note, 'voice') || '1';
      const staff = _xmlText(note, 'staff') || '1';
      if (!active.has(makeVoiceKey(partIndex, voice, staff))) {
        suppressNoteForHiddenVoice(note);
      }
    }

    if (rootName === 'score-partwise') {
      _xmlChildren(score, 'part').forEach((part, partIndex) => {
        const partId = part.getAttribute('id') || '';
        if (pruneInactiveParts && !activeParts.has(partIndex)) {
          part.remove();
          removeScorePart(score, partId);
          return;
        }
        const activeStaves = activeStavesForPart(active, partIndex);
        const compacted = compactPartToActiveStaves(part, activeStaves);
        if (!compacted) Array.from(part.getElementsByTagName('note')).forEach(note => markNote(note, partIndex));
      });
    } else if (rootName === 'score-timewise') {
      const partIndexById = new Map();
      _xmlChildren(score, 'measure').forEach(measure => {
        _xmlChildren(measure, 'part').forEach(part => {
          const partId = part.getAttribute('id') || `P${partIndexById.size + 1}`;
          if (!partIndexById.has(partId)) partIndexById.set(partId, partIndexById.size);
          const partIndex = partIndexById.get(partId);
          if (pruneInactiveParts && !activeParts.has(partIndex)) {
            part.remove();
            removeScorePart(score, partId);
            return;
          }
          Array.from(part.getElementsByTagName('note')).forEach(note => markNote(note, partIndex));
        });
      });
    }

    try {
      return new XMLSerializer().serializeToString(doc);
    } catch {
      return source;
    }
  }

  async function handleVoiceFilterChange(state) {
    const checked = Array.from(state.voiceListEl.querySelectorAll('input[type="checkbox"]:checked'))
      .map(input => input.value);
    state._activeVoiceKeys = new Set(checked);

    const wasPlaying = !!state.playing;
    try {
      if (typeof NS.stopAudio === 'function') NS.stopAudio(state);
    } catch {}

    await NS.loadAndRenderScore(state);
    NS.updateTransportUI(state);

    if (wasPlaying && typeof NS.playAudio === 'function') {
      await NS.playAudio(state);
      NS.updateTransportUI(state);
    }
  }

  NS.getActiveVoiceKeys = function (state) {
    return getVisibleVoiceSet(state);
  };

  NS.makeVoiceKey = makeVoiceKey;

  NS.ensureVoiceFilterUI = function (state) {
    if (!state || !state.currentXmlDoc) return;

    if (!state.voiceFilterEl) {
      const panel = document.createElement('div');
      panel.className = 'sp-voice-filter';
      panel.setAttribute('aria-live', 'polite');

      const title = document.createElement('div');
      title.className = 'sp-voice-filter-title';
      title.textContent = 'Φωνές:';

      const list = document.createElement('div');
      list.className = 'sp-voice-filter-list';

      panel.appendChild(title);
      panel.appendChild(list);

      if (state.renderEl && state.renderEl.parentNode) {
        state.renderEl.parentNode.insertBefore(panel, state.renderEl);
      } else {
        state.wrap.appendChild(panel);
      }

      state.voiceFilterEl = panel;
      state.voiceListEl = list;
    } else if (!state.voiceListEl) {
      state.voiceListEl = state.voiceFilterEl.querySelector('.sp-voice-filter-list');
    }

    if (!state.voiceListEl) return;

    const options = collectVoiceOptions(state.currentXmlDoc);
    state._voiceOptions = options;

    if (!options.length) {
      state.voiceFilterEl.hidden = true;
      state._activeVoiceKeys = null;
      state._voiceOptionsSig = '';
      return;
    }

    const optionKeys = options.map(option => option.key);
    if (!state._activeVoiceKeys) {
      state._activeVoiceKeys = new Set(optionKeys);
    } else {
      const allowed = new Set(optionKeys);
      state._activeVoiceKeys = new Set(Array.from(state._activeVoiceKeys).filter(key => allowed.has(key)));
    }

    const activeSig = Array.from(state._activeVoiceKeys).sort().join(',');
    const nextSig = options.map(option => `${option.key}:${option.label}`).join('|') + `::${activeSig}`;
    if (state._voiceOptionsSig === nextSig) {
      state.voiceFilterEl.hidden = false;
      return;
    }
    state._voiceOptionsSig = nextSig;

    state.voiceListEl.innerHTML = '';
    options.forEach(option => {
      const label = document.createElement('label');
      label.className = 'sp-voice-option';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = option.key;
      input.checked = state._activeVoiceKeys.has(option.key);
      input.addEventListener('change', () => {
        handleVoiceFilterChange(state).catch(e => {
          console.warn('[score-player] voice filter change error', e);
        });
      });

      const text = document.createElement('span');
      text.textContent = option.label;

      label.appendChild(input);
      label.appendChild(text);
      state.voiceListEl.appendChild(label);
    });

    state.voiceFilterEl.hidden = false;
  };



  // --------------------------- UI helpers ---------------------------
  function setViewClass(state) {
    state.wrap.classList.toggle('sp-mode-horizontal', state.viewMode === 'horizontal');
    state.wrap.classList.toggle('sp-mode-paged',      state.viewMode === 'paged');
  }

  function updateViewButtons(state) {
    const isH = (state.viewMode === 'horizontal');
    if (state.btnViewH) {
      state.btnViewH.setAttribute('aria-pressed', isH ? 'true' : 'false');
      state.btnViewH.classList.toggle('is-active', isH);
    }
    if (state.btnViewP) {
      state.btnViewP.setAttribute('aria-pressed', !isH ? 'true' : 'false');
      state.btnViewP.classList.toggle('is-active', !isH);
    }
  }

  // --------------------------- Transport UI ---------------------------
  NS.updateTransportUI = function (state) {
    if (!state) return;
    const { btnPlay, btnPause, btnStop } = state;
    const setActive = (btn, active) => {
      if (!btn) return;
      btn.classList.toggle('is-active', !!active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.disabled = !!active;
    };

    if (!state.lastTransport && !state.playing && !state.paused) {
      [btnPlay, btnPause, btnStop].forEach(btn => {
        if (!btn) return;
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed', 'false');
        btn.disabled = false;
      });
      if (btnPlay)  btnPlay.disabled  = false;
      if (btnPause) btnPause.disabled = true;
      if (btnStop)  btnStop.disabled  = true;
      return;
    }

    let mode = 'stop';
    if (state.paused) mode = 'pause';
    else if (state.playing) mode = 'play';

    setActive(btnPlay,  mode === 'play');
    setActive(btnPause, mode === 'pause');
    setActive(btnStop,  mode === 'stop');
    if (btnPause && mode === 'stop') btnPause.disabled = true;
  };

  // --------------------------- Tempo από SVG ---------------------------
  function _readTempoFromSvg(svg) {
    if (!svg) return null;
    const textEls = Array.from(svg.querySelectorAll('text, tspan'))
      .filter(el => !el.closest('text.mNum, text.measureNumber'));

    const byGroup = new Map();
    for (const el of textEls) {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      const g = el.closest('g') || svg;
      const prev = byGroup.get(g) || '';
      byGroup.set(g, (prev + ' ' + txt).trim());
    }
    const candidates = Array.from(byGroup.values());

    for (const s of candidates) {
      const m = s.match(/\b(\d{1,3})\s*BPM\b/i);
      if (m) { const v = +m[1]; if (v >= 1 && v <= 500) return v; }
    }
    for (const s of candidates) {
      const m = s.match(/[=≈~]\s*(\d{1,3})\b/);
      if (m) { const v = +m[1]; if (v >= 1 && v <= 500) return v; }
    }

    const vb = svg.viewBox?.baseVal;
    const vbH = vb ? vb.height : svg.getBoundingClientRect().height;
    const topLimit = (vbH || 1000) / 3;

    const tops = Array.from(svg.querySelectorAll('text, tspan')).filter(el => {
      let r; try { r = el.getBBox(); } catch { r = null; }
      return r ? (r.y <= topLimit) : false;
    });
    for (const el of tops) {
      const gtxt = ((el.closest('g') || svg).textContent || '').replace(/\s+/g, ' ');
      if (/tempo|metronome|mm/i.test(gtxt)) {
        const m = gtxt.match(/\b(\d{1,3})\b/);
        if (m) { const v = +m[1]; if (v >= 1 && v <= 500) return v; }
      }
    }
    return null;
  }

  function applyTempoFromSvg(state) {
    try {
      const svg = state.renderEl.querySelector('.sp-page > svg, svg');
      const bpm = _readTempoFromSvg(svg);
      if (!bpm) return false;
      if (state._userChangedTempo) return false;

      state.baseBpm = bpm;
      if (state.tempoInp) state.tempoInp.value = String(Math.round(bpm));

      if (w?.Tone?.Transport) w.Tone.Transport.bpm.value = bpm;
      if (state.tempoVal) state.tempoVal.textContent = `${Math.round(bpm)} BPM`;
      return true;
    } catch { return false; }
  }

  // --------------------------- Tonality μέσα στο SVG (δίπλα στον τίτλο) ---------------------------
  (function(){
    function _dbg(...a){ try{ console.debug('[sp-tonality]', ...a); }catch{} }

    function findTitleCandidates(svg){
      if (!svg) return [];
      const vb = svg.viewBox?.baseVal;
      const vbW = vb ? vb.width : svg.getBoundingClientRect().width;
      const vbH = vb ? vb.height: svg.getBoundingClientRect().height;
      const H_TOP_FRAC = 0.18, W_CENTER_FRAC = 0.6;
      const topCut = vbH * H_TOP_FRAC;
      const leftCut = vbW * (1 - W_CENTER_FRAC) / 2;
      const rightCut = vbW - leftCut;

      const texts = Array.from(svg.querySelectorAll('text'));
      const filtered = texts.filter(t => {
        const txt = (t.textContent || '').trim();
        if (!txt || /^\d+$/.test(txt)) return false;
        let b; try { b = t.getBBox(); } catch { b = null; }
        if (!b) return false;
        const cy = b.y + b.height/2;
        const cx = b.x + b.width/2;
        if (cy > topCut) return false;
        if (cx < leftCut || cx > rightCut) return false;
        const cls = (t.getAttribute('class') || '').toLowerCase();
        if (/\bmnum\b|\bmeas|\bmeasure\b/.test(cls)) return false;
        return true;
      });

      filtered.sort((a,b)=>{
        let ba, bb; try{ ba=a.getBBox(); }catch{}; try{ bb=b.getBBox(); }catch{};
        const ay = (ba?.y ?? 0), by = (bb?.y ?? 0);
        if (ay !== by) return ay - by;
        const vbW2 = vbW || 1000;
        const ac = (ba ? ba.x + ba.width/2 : 0), bc = (bb ? bb.x+bb.width/2 : 0);
        return Math.abs(ac - vbW2/2) - Math.abs(bc - vbW2/2);
      });
      return filtered;
    }

    function computePlacement(svg, anchor){
      let ab = null; try { ab = anchor?.getBBox(); } catch {}
      const vb = svg.viewBox?.baseVal;
      const vbW = vb ? vb.width : svg.getBoundingClientRect().width;
      const vbH = vb ? vb.height: svg.getBoundingClientRect().height;

      const fontSize = (() => {
        const fs = anchor ? getComputedStyle(anchor).fontSize : null;
        const px = fs ? parseFloat(fs) : NaN;
        if (Number.isFinite(px) && px > 0) return px * 0.1;
        return Math.max(10, (vbW || 1000) * 0.018);
      })();

      const padX = Math.max(6, fontSize * 0.45);
      const x = ab ? (ab.x + ab.width + padX) : ((vbW || 1000) * 0.52);
      const y = ab ? (ab.y + ab.height * 0.9) : ((vbH || 1000) * 0.08);
      return { x, y, fontSize };
    }

    NS.paintTonalityInsideScore = function(state, tonalityText){
      try{
        if (!state?.renderEl) return;
        const svg = state.renderEl.querySelector('.sp-page > svg, svg');
        if (!svg) return;

        svg.querySelectorAll('.sp-tonality-in-title, #sp-key-badge').forEach(el => el.remove());
        if (!tonalityText) return;

        const anchor = (function(){
          const specific = svg.querySelector('text.title, g.header text.title, text.movement-title, text.work-title, g.page-margin text.title');
          if (specific) return specific;
          const cands = findTitleCandidates(svg);
          return cands[0] || null;
        })();

        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('id', 'sp-key-badge');

        const label = document.createElementNS(ns, 'text');
        label.setAttribute('class', 'sp-tonality-in-title');
        label.textContent = ' — ' + tonalityText;

        const { x, y, fontSize } = computePlacement(svg, anchor);
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(y));
        label.setAttribute('dominant-baseline', 'alphabetic');
        label.setAttribute('text-anchor', 'start');
        label.setAttribute('font-size', String(fontSize));
        label.setAttribute('font-family', 'serif');
        label.setAttribute('fill', '#111');
        label.setAttribute('pointer-events', 'none');

        g.appendChild(label);
        svg.appendChild(g);

        let lb; try { lb = label.getBBox(); } catch {}
        if (lb && lb.width && lb.height){
          const bg = document.createElementNS(ns, 'rect');
          bg.setAttribute('x', String(lb.x - 3));
          bg.setAttribute('y', String(lb.y - lb.height * 0.2));
          bg.setAttribute('width', String(lb.width + 6));
          bg.setAttribute('height', String(lb.height + lb.height * 0.25));
          bg.setAttribute('rx', String(Math.max(1, lb.height * 0.15)));
          bg.setAttribute('ry', bg.getAttribute('rx'));
          bg.setAttribute('fill', 'white');
          bg.setAttribute('opacity', '0.65');
          g.insertBefore(bg, label);
        }

        _dbg('paint OK', { text: tonalityText, x: label.getAttribute('x'), y: label.getAttribute('y') });
      }catch(e){
        console.warn('[sp-key-badge]', e);
      }
    };
  })();

  // --------------------------- Cursor styling (JS, όχι μόνο CSS) ---------------------------
  NS.styleOsmdCursor = function(state) {
    if (!state?.renderEl) return;
    const root = state.renderEl;

    const rects = root.querySelectorAll(
      'g[id*="cursor"] rect,' +
      'g[class*="cursor"] rect,' +
      'rect[id*="cursor"],' +
      'rect[class*="cursor"]'
    );

    rects.forEach(r => {
      try {
        r.setAttribute('fill', 'rgba(0,188,212,0.35)');
        let w = parseFloat(r.getAttribute('width') || '0');
        if (!Number.isFinite(w) || w <= 0) return;
        const newW = Math.max(1.5, w * 0.35);
        r.setAttribute('width', String(newW));
      } catch {}
    });
  };

  // --------------------------- Post-render hooks ---------------------------
  function postRender(state) {
    state.renderEl.querySelectorAll('svg').forEach(svg => {
      if (typeof NS.ensureHighlightCSS === 'function') NS.ensureHighlightCSS(svg);
      if (typeof NS.colorClefsByStaff === 'function') NS.colorClefsByStaff(svg);
      if (typeof NS.afterRenderFix === 'function') NS.afterRenderFix(state);
    });

    if (typeof NS.analyzeScoreParts === 'function') {
      try { state.analysis = NS.analyzeScoreParts(state); } catch {}
    }

    if (typeof NS.resetVoiceColors === 'function') NS.resetVoiceColors(state);
    state.renderEl.querySelectorAll('svg').forEach(svg => {
      if (typeof NS.colorNotesByVoice === 'function') NS.colorNotesByVoice(state, svg);
    });

    if (state.viewMode === 'horizontal' && typeof NS.buildMeasureCounters === 'function') {
      try { NS.buildMeasureCounters(state); } catch {}
    }
    if (typeof NS.buildVisualScheduler === 'function') {
      try { NS.buildVisualScheduler(state); } catch {}
    }
    if (typeof NS.animateTranspose === 'function') NS.animateTranspose(state, 0);

    if (state._decidedTonality && typeof NS.paintTonalityInsideScore === 'function') {
      NS.paintTonalityInsideScore(state, state._decidedTonality);
    }

    if (typeof NS.styleOsmdCursor === 'function') {
      NS.styleOsmdCursor(state);
    }
  }

  // --------------------------- OSMD helpers: transpose ---------------------------
  function setupOsmdTranspose(state) {
    if (!state || !state.osmd) return;

    const osmd  = state.osmd;
    const semis = Number.isFinite(state?.transpose) ? Number(state.transpose) : 0;

    try {
      const lib = w.opensheetmusicdisplay || window.opensheetmusicdisplay;
      if (!osmd.TransposeCalculator && lib && typeof lib.TransposeCalculator === 'function') {
        osmd.TransposeCalculator = new lib.TransposeCalculator();
      }
    } catch (e) {
      console.warn('[score-player] OSMD TransposeCalculator init error', e);
    }

    try {
      if (osmd.Sheet) {
        osmd.Sheet.Transpose = semis;
      }
    } catch (e) {
      console.warn('[score-player] OSMD Sheet.Transpose set error', e);
    }
  }

  // --------------------------- OSMD helpers: αρχικό Zoom ανά πλάτος & mode ---------------------------
  function getInitialZoomForWidth(pxWidth, horizontal) {
    if (horizontal) {
      if (pxWidth <= 480)       return 0.60;
      else if (pxWidth <= 768)  return 0.70;
      else if (pxWidth <= 1200) return 0.85;
      else                      return 0.90;
    } else {
      if (pxWidth <= 480)       return 0.75;
      else if (pxWidth <= 768)  return 0.85;
      else if (pxWidth <= 1200) return 0.95;
      else                      return 1.00;
    }
  }



  function clampZoom(z) {
    return Math.max(0.05, Math.min(z, 2.0));
  }

  async function applyOsmdZoom(state, newZoom) {
    if (!state.osmd) return;
    newZoom = clampZoom(newZoom);

    state.osmd.Zoom = newZoom;
    state.osmd.zoom = newZoom;
    state.osmdZoom  = newZoom;

    // ενημέρωση textbox zoom σε ποσοστό
    if (state.zoomInp) {
      const percent = Math.round(newZoom * 100);
      state.zoomInp.value = String(percent);
    }

    //console.log('[SP zoom]', 'newZoom=', newZoom);

    try {
      if (typeof state.osmd.updateGraphic === 'function') {
        await state.osmd.updateGraphic();
      }
    } catch {}

    try {
      await state.osmd.render();
    } catch (e) {
      console.error('[SP zoom] render error', e);
    }

    if (typeof NS.styleOsmdCursor === 'function') {
      NS.styleOsmdCursor(state);
    }
  }

  // Μετατροπή ArrayBuffer σε binary string (1 byte -> 1 char)
  function getPointerDistance(a, b) {
    const dx = (a.clientX || 0) - (b.clientX || 0);
    const dy = (a.clientY || 0) - (b.clientY || 0);
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function getPointerCenter(a, b) {
    return {
      x: ((a.clientX || 0) + (b.clientX || 0)) / 2,
      y: ((a.clientY || 0) + (b.clientY || 0)) / 2
    };
  }

  function getTouchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    return getPointerDistance(touches[0], touches[1]);
  }

  function getTouchCenter(touches) {
    if (!touches || touches.length < 2) return null;
    return getPointerCenter(touches[0], touches[1]);
  }

  function setTemporaryScoreScale(state, scale, center) {
    const renderEl = state?.renderEl;
    if (!renderEl) return;

    const rect = renderEl.getBoundingClientRect();
    const originX = center ? Math.max(0, center.x - rect.left + renderEl.scrollLeft) : 0;
    const originY = center ? Math.max(0, center.y - rect.top + renderEl.scrollTop) : 0;

    renderEl.querySelectorAll('.sp-page').forEach((el) => {
      el.style.transformOrigin = `${originX}px ${originY}px`;
      el.style.transform = `scale(${scale})`;
    });
  }

  function clearTemporaryScoreScale(state) {
    const renderEl = state?.renderEl;
    if (!renderEl) return;

    renderEl.querySelectorAll('.sp-page').forEach((el) => {
      el.style.transform = '';
      el.style.transformOrigin = '';
    });
  }

  function bindPinchZoom(state) {
    const renderEl = state?.renderEl;
    if (!renderEl || state._pinchZoomBound) return;
    state._pinchZoomBound = true;

    const pointers = new Map();

    const reset = async (commit) => {
      renderEl.classList.remove('sp-pinching');
      const pinch = state._pinchZoom;
      state._pinchZoom = null;
      pointers.clear();
      clearTemporaryScoreScale(state);

      if (!commit || !pinch || !Number.isFinite(pinch.targetZoom)) return;
      const current = state.osmdZoom || state.osmd?.Zoom || 1;
      if (Math.abs(pinch.targetZoom - current) < 0.01) return;
      await applyOsmdZoom(state, pinch.targetZoom);
    };

    renderEl.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch') return;
      pointers.set(ev.pointerId, ev);
      if (pointers.size !== 2) return;
      ev.preventDefault();
      renderEl.classList.add('sp-pinching');

      const active = Array.from(pointers.values());
      const distance = getPointerDistance(active[0], active[1]);
      if (!distance) return;

      const startZoom = state.osmdZoom || state.osmd?.Zoom || 1;
      state._pinchZoom = {
        startDistance: distance,
        startZoom,
        targetZoom: startZoom,
        center: getPointerCenter(active[0], active[1])
      };

      try { renderEl.setPointerCapture(ev.pointerId); } catch {}
    }, { passive: false });

    renderEl.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'touch' || !pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, ev);
      if (pointers.size !== 2 || !state._pinchZoom) return;

      ev.preventDefault();
      const active = Array.from(pointers.values());
      const distance = getPointerDistance(active[0], active[1]);
      if (!distance || !state._pinchZoom.startDistance) return;

      const scale = distance / state._pinchZoom.startDistance;
      const targetZoom = clampZoom(state._pinchZoom.startZoom * scale);
      state._pinchZoom.targetZoom = targetZoom;
      state._pinchZoom.center = getPointerCenter(active[0], active[1]);

      setTemporaryScoreScale(state, targetZoom / state._pinchZoom.startZoom, state._pinchZoom.center);

      if (state.zoomInp) {
        state.zoomInp.value = String(Math.round(targetZoom * 100));
      }
    }, { passive: false });

    renderEl.addEventListener('pointerup', (ev) => {
      if (ev.pointerType !== 'touch') return;
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) void reset(true);
    }, { passive: true });

    renderEl.addEventListener('pointercancel', (ev) => {
      if (ev.pointerType !== 'touch') return;
      void reset(false);
    }, { passive: true });

    renderEl.addEventListener('gesturestart', (ev) => {
      ev.preventDefault();
    }, { passive: false });

    renderEl.addEventListener('touchstart', (ev) => {
      if (!ev.touches || ev.touches.length !== 2) return;
      ev.preventDefault();
      renderEl.classList.add('sp-pinching');

      const distance = getTouchDistance(ev.touches);
      if (!distance) return;

      const startZoom = state.osmdZoom || state.osmd?.Zoom || 1;
      state._pinchZoom = {
        startDistance: distance,
        startZoom,
        targetZoom: startZoom,
        center: getTouchCenter(ev.touches)
      };
    }, { passive: false });

    renderEl.addEventListener('touchmove', (ev) => {
      if (!ev.touches || ev.touches.length !== 2 || !state._pinchZoom) return;
      ev.preventDefault();

      const distance = getTouchDistance(ev.touches);
      if (!distance || !state._pinchZoom.startDistance) return;

      const scale = distance / state._pinchZoom.startDistance;
      const targetZoom = clampZoom(state._pinchZoom.startZoom * scale);
      state._pinchZoom.targetZoom = targetZoom;
      state._pinchZoom.center = getTouchCenter(ev.touches);

      setTemporaryScoreScale(state, targetZoom / state._pinchZoom.startZoom, state._pinchZoom.center);

      if (state.zoomInp) {
        state.zoomInp.value = String(Math.round(targetZoom * 100));
      }
    }, { passive: false });

    renderEl.addEventListener('touchend', (ev) => {
      if (state._pinchZoom && (!ev.touches || ev.touches.length < 2)) void reset(true);
    }, { passive: true });

    renderEl.addEventListener('touchcancel', () => {
      if (state._pinchZoom) void reset(false);
    }, { passive: true });
  }

  function arrayBufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.length;
    const chunkSize = 0x8000; // 32K για να μην πεθαίνει η apply
    let binary = "";

    for (let i = 0; i < len; i += chunkSize) {
      const sub = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, sub);
    }
    return binary;
  }

  async function unzipMxlBufferToXml(buffer) {
    try {
      if (!w.JSZip && !(w.opensheetmusicdisplay && w.opensheetmusicdisplay.JSZip)) {
        await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', '__REP_SCORE_JSZIP_PROMISE__');
      }

      const JSZip = w.JSZip || (w.opensheetmusicdisplay && w.opensheetmusicdisplay.JSZip);
      if (!JSZip) return null;

      const zip = await JSZip.loadAsync(buffer);
      const candidates = [];
      zip.forEach((relPath, file) => {
        const lower = relPath.toLowerCase();
        if (file.dir) return;
        if (lower.endsWith(".xml") || lower.endsWith(".musicxml")) {
          candidates.push({ relPath, lower, file });
        }
      });

      if (!candidates.length) return null;

      let xmlEntry =
        candidates.find((c) => c.lower.endsWith(".musicxml")) ||
        candidates.find((c) => !c.lower.includes("meta-inf/") && !c.lower.endsWith("container.xml")) ||
        candidates[0];

      return await xmlEntry.file.async("text");
    } catch (e) {
      console.warn("[score-player] unzip MXL error", e);
      return null;
    }
  }

  function parseCurrentXmlDoc(state) {
    try {
      state.currentXmlDoc = new DOMParser().parseFromString(
        state._xmlText,
        "application/xml"
      );
    } catch {
      state.currentXmlDoc = null;
    }
  }


    // --------------------------- OSMD renderWithOsmd ---------------------------
  async function renderWithOsmd(state, horizontal) {
    // 1. Φόρτωση αρχείου (μία φορά ανά state)
    if (!state._xmlText) {
      const res = await fetch(state.fileUrl);

      if (!res.ok) {
        const details = await res.text().catch(() => "");
        console.warn("[score-player] score fetch failed", res.status, details);
        if (state.renderEl) {
          state.renderEl.innerHTML =
            '<div class="sp-score-error" role="status">Η παρτιτούρα δεν βρέθηκε ή δεν είναι διαθέσιμη.</div>';
        }
        return;
      }

      const ct = (res.headers.get("Content-Type") || "").toLowerCase();
      const url = String(state.fileUrl || "").toLowerCase();

      const isXmlContent =
        url.endsWith(".xml") ||
        url.endsWith(".musicxml") ||
        ct.includes("application/vnd.recordare.musicxml+xml") ||
        ct.includes("application/xml") ||
        ct.includes("text/xml");

      const isMxl =
        !isXmlContent && (
        url.endsWith(".mxl") ||
        ct.includes("application/vnd.recordare.musicxml") ||
        ct.includes("application/x-mxl") ||
        ct.includes("application/zip") ||
        ct.includes("application/x-zip-compressed") ||
        ct.includes("application/octet-stream") ||
        ct.includes("musicxml") ||
        ct.includes("mxl")
        );


      if (isMxl) {
        // MXL (zip) -> προτιμάμε καθαρό MusicXML ώστε να δουλεύει και το voice filter.
        const buffer = await res.arrayBuffer();
        const xmlText = await unzipMxlBufferToXml(buffer);

        if (xmlText) {
          state._xmlText = xmlText;
          parseCurrentXmlDoc(state);
        } else {
          state._xmlText = arrayBufferToBinaryString(buffer);
          state.currentXmlDoc = null;
        }
      } else {
        // Καθαρό MusicXML → text
        state._xmlText = await res.text();
        parseCurrentXmlDoc(state);
      }

      const xmlProbe = String(state._xmlText || "").trimStart();
      if (
        !xmlProbe.startsWith("<?xml") &&
        !xmlProbe.startsWith("<score-partwise") &&
        !xmlProbe.startsWith("<score-timewise")
      ) {
        console.warn("[score-player] invalid MusicXML response", xmlProbe.slice(0, 80));
        if (state.renderEl) {
          state.renderEl.innerHTML =
            '<div class="sp-score-error" role="status">Η παρτιτούρα δεν μπορεί να διαβαστεί.</div>';
        }
        return;
      }
    }

    const options = {
      backend: "svg",
      drawTitle: true,
      drawComposer: true,
      drawSubtitle: true,
      drawPartNames: false,
      renderSingleHorizontalStaffline: !!horizontal,
      autoResize: true
    };

    // 2. Δημιουργία OSMD ή ενημέρωση options
    if (!state.osmd) {
      try {
        const lib = w.opensheetmusicdisplay || window.opensheetmusicdisplay;
        state.osmd = new lib.OpenSheetMusicDisplay(state.renderEl, options);
      } catch (e) {
        console.error("OSMD init error", e);
        return;
      }
    } else {
      try {
        state.osmd.setOptions(options);
      } catch {}
    }

    // 3. Patch ΜΙΑ ΦΟΡΑ το osmd.render για log (όπως πριν)
    try {
      const osmd = state.osmd;
      if (!state._osmdRenderPatched && osmd && typeof osmd.render === "function") {
        state._osmdRenderPatched = true;
        const origRender = osmd.render.bind(osmd);

        osmd.render = function (...args) {
          let callerHint = "";
          try {
            const stack = new Error().stack.split("\n")[2] || "";
            callerHint = stack.trim();
          } catch {}

          //console.log("[OSMD render]", "Zoom=", this.Zoom ?? this.zoom, "caller≈", callerHint);
          return origRender(...args);
        };
      }
    } catch (e) {
      console.warn("[score-player] OSMD render patch error", e);
    }

    // 4. Καθάρισμα προηγούμενου render
    try {
      state.osmd.clear();
    } catch {}

    if (hasNoVisibleVoices(state)) {
      if (state.renderEl) {
        state.renderEl.innerHTML = '<div class="sp-empty-voices" role="status">Επίλεξε φωνή</div>';
      }
      return;
    }

    const osmdInput = filteredXmlForVisibleVoices(state);

    // 5. Φόρτωση δεδομένων στην OSMD (είτε MXL binary-string είτε XML string)
    try {
      await state.osmd.load(osmdInput);
      setupOsmdTranspose(state);

      try {
        if (typeof state.osmd.updateGraphic === "function") {
          await state.osmd.updateGraphic();
        }
      } catch (e) {
        console.warn("[score-player] OSMD updateGraphic error", e);
      }
    } catch (e) {
      console.error("OSMD load error", e);
      return;
    }

    // 6. Ορισμός Zoom με βάση πλάτος + mode
    try {
      const wWrap   = state.wrap?.clientWidth     || 0;
      const wRender = state.renderEl?.clientWidth || 0;
      const wWin    = window.innerWidth           || 0;
      const effectiveWidth = wWrap || wRender || wWin || 1024;

      const zoom = getInitialZoomForWidth(effectiveWidth, horizontal);
      state.osmd.Zoom = zoom;
      state.osmd.zoom = zoom;
      state.osmdZoom  = zoom;

      if (state.zoomInp) {
        state.zoomInp.value = String(Math.round(zoom * 100));
      }
    } catch (e) {
      console.warn("[score-player] set zoom before render error", e);
    }

    // 7. Render
    try {
      await state.osmd.render();
    } catch (e) {
      console.error("OSMD render error", e);
      return;
    }

    // 8. Τύλιγμα των svg σε div.sp-page (όπως πριν)
    try {
      const svgs = state.renderEl.querySelectorAll("svg");
      svgs.forEach((svg) => {
        const parent = svg.parentElement;
        if (!parent) return;
        if (parent.classList && parent.classList.contains("sp-page")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "sp-page";
        parent.replaceChild(wrapper, svg);
        wrapper.appendChild(svg);
      });
    } catch {}
  }




  // --------------------------- Tonality badge έξω από το SVG ---------------------------
  (function (w) {
    const NS = w.RepScore = w.RepScore || {};

    const NOTE_TO_SEMI = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 };
    const SEMI_TO_NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const NOTE_GR = {
      "C":"Ντο","C#":"Ντο♯","D":"Ρε","D#":"Ρε♯","E":"Μι","F":"Φα",
      "F#":"Φα♯","G":"Σολ","G#":"Σολ♯","A":"Λα","A#":"Λα♯","B":"Σι"
    };

    const FIFTHS_TO_MAJOR = {
      "-7":"Cb","-6":"Gb","-5":"Db","-4":"Ab","-3":"Eb","-2":"Bb","-1":"F",
       "0":"C",
       "1":"G","2":"D","3":"A","4":"E","5":"B","6":"F#","7":"C#"
    };
    const MAJOR_TO_MINOR = {
      "Cb":"Ab","Gb":"Eb","Db":"Bb","Ab":"F","Eb":"C","Bb":"G","F":"D",
      "C":"A","G":"E","D":"B","A":"F#","E":"C#","B":"G#","F#":"D#","C#":"A#"
    };

    function _text(el){ return (el && el.textContent || '').trim(); }
    function _wrap(n,mod){ return ((n % mod)+mod)%mod; }

    function _readBaseKeyFromXmlDoc(xmlDoc){
      if (!xmlDoc) return null;
      const keys = Array.from(xmlDoc.getElementsByTagNameNS('*','key'));
      for (const k of keys){
        const fifthsEl = k.getElementsByTagNameNS('*','fifths')[0];
        if (!fifthsEl) continue;
        const modeEl   = k.getElementsByTagNameNS('*','mode')[0];
        const fifths   = parseInt(_text(fifthsEl),10);
        if (!Number.isFinite(fifths) || fifths < -7 || fifths > 7) continue;

        const majLatin = FIFTHS_TO_MAJOR[String(fifths)];
        if (!majLatin) continue;

        let mode = (_text(modeEl) || '').toLowerCase();
        if (mode !== 'minor' && mode !== 'major') mode = 'major';

        let tonicLatin = majLatin;
        if (mode === 'minor') tonicLatin = MAJOR_TO_MINOR[majLatin] || 'A';

        return { tonicLatin, mode };
      }
      return null;
    }

    function _transposeLatin(tonicLatin, semis){
      const FLAT_TO_SHARP = { 'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B','Fb':'E' };
      let t = tonicLatin;
      if (FLAT_TO_SHARP[t]) t = FLAT_TO_SHARP[t];

      const base = NOTE_TO_SEMI[t];
      if (base == null) return tonicLatin;
      const idx  = _wrap(base + (semis|0), 12);
      return SEMI_TO_NOTE[idx];
    }

    function _gr(noteLatin){ return NOTE_GR[noteLatin] || noteLatin; }

    function _ensureBadgeEl(state){
      if (!state) return null;
      return state.wrap.querySelector('.sp-key-badge') || null;
    }

    NS.updateTonalityBadge = function (state){
      const badge = _ensureBadgeEl(state);
      if (!badge) return;

      if (!state._baseKeyInfo){
        state._baseKeyInfo = _readBaseKeyFromXmlDoc(state.currentXmlDoc);
      }

      if (!state._baseKeyInfo){
        badge.textContent = '—';
        badge.removeAttribute('data-key-pretty');
        return;
      }

      const semis = Number.isFinite(state?.transpose) ? state.transpose : 0;
      const nowLatin = _transposeLatin(state._baseKeyInfo.tonicLatin, semis);
      const pretty   = `${_gr(nowLatin)} ${state._baseKeyInfo.mode === 'minor' ? '-' : '+'}`;

      badge.textContent = pretty;
      badge.setAttribute('data-key-pretty', pretty);
      badge.setAttribute('data-key-latin', nowLatin);
      badge.setAttribute('data-mode', state._baseKeyInfo.mode);
      badge.title = `Τονικότητα: ${pretty}`;
    };
  })(window);

  // --------------------------- Render according to mode ---------------------------
async function renderAccordingToMode(state) {
  setViewClass(state);
  updateViewButtons(state);

  await renderWithOsmd(state, state.viewMode === 'horizontal');

  if (typeof NS.ensureVoiceFilterUI === 'function') {
    try { NS.ensureVoiceFilterUI(state); } catch (e) { console.warn('[score-player] voice filter UI error', e); }
  }

  const _appliedSvgTempo = applyTempoFromSvg(state);
  if (_appliedSvgTempo && state.tempoVal) state.tempoVal.style.visibility = "visible";

  if (state.viewMode === 'paged') {
    state.renderEl
      .querySelectorAll('.sp-mnum, .sp-measure-num, [data-sp-mnum]')
      .forEach(el => el.remove());
  }

  try {
    if (typeof NS.buildAudioParts === 'function') {
      await NS.buildAudioParts(state);
    }
  } catch (e) {
    console.warn('buildAudioParts error:', e);
  }

  if (!_appliedSvgTempo && typeof NS.syncTransportWithUI === "function") {
    NS.syncTransportWithUI(state);
  }
  if (state.tempoVal) state.tempoVal.style.visibility = "visible";

  if (typeof NS.updateTitleWithTonality === "function") {
    NS.updateTitleWithTonality(state);
  }
  if (typeof NS.updateTonalityBadge === "function") {
    NS.updateTonalityBadge(state);
  }

  // Ό,τι post-processing κάνουμε πάνω στο SVG
  postRender(state);

  // ΝΕΟ: Click στο SVG → μεταφορά δείκτη & Transport
  if (!state._svgClickBound) {
    state._svgClickBound = true;

    if (state.renderEl) {
      state.renderEl.addEventListener('click', (ev) => {
        try {
          // Μόνο αριστερό κλικ / tap
          if (ev.button !== undefined && ev.button !== 0) return;

          const target = ev.target;
          if (!target) return;

          const svg = target.closest('svg');
          if (!svg) return;

          if (typeof NS.seekToClientPoint === 'function') {
            NS.seekToClientPoint(state, ev.clientX, ev.clientY, svg);
          }
        } catch (e) {
          console.warn('[score-player] svg click seek error', e);
        }
      });
    }
  }

  // Styling του OSMD cursor (αν θες να τον κρατήσεις)
  if (typeof NS.styleOsmdCursor === 'function') {
    NS.styleOsmdCursor(state);
  }
}


  // --------------------------- Zoom controls UI ---------------------------
  function ensureZoomButtons(state) {
    if (state.btnZoomIn && state.btnZoomOut) return;

    const row = state.wrap.querySelector('.sp-controls');
    if (!row) return;

    // Αν δεν υπάρχουν, τα δημιουργούμε στο τέλος της πρώτης σειράς controls
    if (!state.btnZoomOut) {
      const btnMinus = document.createElement('button');
      btnMinus.type = 'button';
      btnMinus.className = 'sp-btn sp-zoom-out';
      btnMinus.title = 'Zoom -';
      btnMinus.textContent = '−';
      row.appendChild(btnMinus);
      state.btnZoomOut = btnMinus;
    }

    if (!state.btnZoomIn) {
      const btnPlus = document.createElement('button');
      btnPlus.type = 'button';
      btnPlus.className = 'sp-btn sp-zoom-in';
      btnPlus.title = 'Zoom +';
      btnPlus.textContent = '+';
      row.appendChild(btnPlus);
      state.btnZoomIn = btnPlus;
    }
  }

  // --------------------------- Wire controls ---------------------------
// --------------------------- Wire controls ---------------------------
function ensureViewToggleUI(state) {
  if (!state) return;

  // Τα κουμπιά προβολής υπάρχουν πλέον στην PHP,
  // οπότε απλώς τα βρίσκουμε και τα δένουμε στο state.
  if (!state.btnViewH) {
    state.btnViewH = state.wrap.querySelector('.sp-view-h');
  }
  if (!state.btnViewP) {
    state.btnViewP = state.wrap.querySelector('.sp-view-p');
  }
}


    // --------------------------- Print view helper ---------------------------
  function openPrintView(state) {
    try {
      const render = state?.renderEl;
      if (!render) return;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Το popup blocker δεν επιτρέπει την εκτύπωση.');
        return;
      }

      // Όλο το περιεχόμενο της παρτιτούρας (sp-page + svg κ.λπ.)
      const scoreHtml = render.innerHTML;

      printWindow.document.write(`
        <html>
        <head>
          <meta charset="utf-8">
          <title>Repertorio.net</title>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000;
              font-family: sans-serif;
            }
            .sp-print-toolbar {
              position: sticky;
              top: 0;
              z-index: 999;
              display: flex;
              justify-content: flex-start;
              gap: 8px;
              padding: 8px 12px;
              background: #f0f0f0;
              border-bottom: 1px solid #ccc;
            }
            .sp-print-toolbar button {
              padding: 6px 12px;
              font-size: 14px;
              border-radius: 4px;
              border: 1px solid #888;
              background: #ffffff;
              cursor: pointer;
            }
            .sp-print-toolbar button:hover {
              background: #e0e0e0;
            }
            .sp-print-score {
              padding: 10px;
            }
            .sp-print-score .sp-page {
              margin-bottom: 20px;
            }
            .sp-print-score svg {
              width: 100% !important;
              height: auto !important;
              display: block;
              margin: 0 auto 20px auto;
            }

            @media print {
              .sp-print-toolbar {
                display: none;
              }
              .sp-print-score {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="sp-print-toolbar">
            <button type="button" onclick="window.print()">🖨 Εκτύπωση</button>
            <button type="button" onclick="window.close()">⬅ Επιστροφή</button>
          </div>
          <div class="sp-print-score">
            ${scoreHtml}
          </div>
        </body>
        </html>
      `);

      printWindow.document.close();
      // Δεν καλούμε αυτόματα print() – ο χρήστης πατάει το κουμπί "Εκτύπωση"
    } catch (e) {
      console.error('Print view error:', e);
    }
  }

  function loadScriptOnce(src, markerKey) {
    if (!src) return Promise.resolve();
    if (markerKey && w[markerKey]) return w[markerKey];

    const existing = Array.from(document.scripts || []).find(script => {
      const current = String(script.src || '');
      return current === src || current.endsWith(src);
    });
    if (existing) {
      const promise = new Promise((resolve, reject) => {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
      if (markerKey) w[markerKey] = promise;
      return promise;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    if (markerKey) w[markerKey] = promise;
    return promise;
  }

  async function ensureAudioReady() {
    if (!w.Tone) {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js', '__REP_SCORE_TONE_PROMISE__');
    }
    if (typeof NS.playAudio !== 'function') {
      await loadScriptOnce('/score-player/score-audio.js?v=score-visual-first-20260630f', '__REP_SCORE_AUDIO_PROMISE__');
    }
  }

  NS.changeTranspose = async function (state, value) {
    if (!state) return;

    const next = Math.max(
      TRANSPOSE_MIN,
      Math.min(TRANSPOSE_MAX, Number.parseInt(String(value), 10) || 0)
    );
    const wasPlaying = !!state.playing;

    state.transpose = next;
    NS.__globalTranspose = next;

    if (typeof NS.updateTransposeUI === 'function') {
      try { NS.updateTransposeUI(state); } catch {}
    }

    try {
      if (wasPlaying && typeof NS.stopAudio === 'function') {
        NS.stopAudio(state);
      }
    } catch (e) {
      console.warn('[score-player] stop before transpose error', e);
    }

    await NS.loadAndRenderScore(state);

    if (wasPlaying && typeof NS.playAudio === 'function') {
      try {
        await NS.playAudio(state);
      } catch (e) {
        console.warn('[score-player] restart after transpose error', e);
      }
    }
  };

  NS.wireControls = function (state) {
    ensureViewToggleUI(state);
    ensureZoomButtons(state);
    bindPinchZoom(state);
    setViewClass(state);
    updateViewButtons(state);
    NS.updateTransportUI(state);

    // Play
    if (state.btnPlay) state.btnPlay.addEventListener("click", async () => {
      state.lastTransport = 'play';
      state.btnPlay.disabled = true;
      try {
        await ensureAudioReady();
        if (w.Tone?.context?.state !== "running") await w.Tone.context.resume();
        await w.Tone?.loaded?.();
      } catch (e) {
        console.warn('[score-player] audio lazy load error', e);
      }
      const v = Number.parseInt(state?.tempoInp?.value, 10);
      if (Number.isFinite(v) && v > 0 && w.Tone?.Transport) w.Tone.Transport.bpm.value = v;
      if (typeof NS.playAudio === 'function') await NS.playAudio(state);
      NS.updateTransportUI(state);
    });

    // Pause
    if (state.btnPause) state.btnPause.addEventListener("click", () => {
      state.lastTransport = 'pause';
      if (typeof NS.pauseAudio === 'function') NS.pauseAudio(state);
      NS.updateTransportUI(state);
    });

    // Stop
    if (state.btnStop) state.btnStop.addEventListener("click", () => {
      state.lastTransport = 'stop';
      if (typeof NS.stopAudio === 'function') NS.stopAudio(state);
      NS.updateTransportUI(state);
    });

    // Transpose up
    if (state.btnUp) state.btnUp.addEventListener("click", async () => {
      const next = Math.min(TRANSPOSE_MAX, state.transpose + 1);
      if (next === state.transpose) return;
      try {
        await NS.changeTranspose(state, next);
      } catch (e) {
        console.warn('[score-player] transpose up error', e);
      }
      NS.updateTransportUI(state);
    });

    // Transpose down
    if (state.btnDown) state.btnDown.addEventListener("click", async () => {
      const next = Math.max(TRANSPOSE_MIN, state.transpose - 1);
      if (next === state.transpose) return;
      try {
        await NS.changeTranspose(state, next);
      } catch (e) {
        console.warn('[score-player] transpose down error', e);
      }
      NS.updateTransportUI(state);
    });

    // Print button – ΚΕΝΤΡΙΚΑ, καθαρά
    const btnPrint = state.wrap.querySelector('.sp-print');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        openPrintView(state);
      });
    }

    // Tempo / BPM
    if (state.tempoInp) {
      const onTempo = () => {
        state._userChangedTempo = true;
        const v = Number.parseInt(state.tempoInp.value, 10);
        if (!Number.isFinite(v) || v <= 0) return;

        // Ενημέρωση label (με BPM)
        if (state.tempoVal) state.tempoVal.textContent = `${v} BPM`;

        // Ενημέρωση Tone.Transport
        if (w.Tone?.Transport) w.Tone.Transport.bpm.value = v;
      };

      const clampAndSet = (raw) => {
        let v = Number.parseInt(raw, 10);
        if (!Number.isFinite(v)) return;
        const min = Number.parseInt(state.tempoInp.min || '10', 10);
        const max = Number.parseInt(state.tempoInp.max || '400', 10);

        if (Number.isFinite(min)) v = Math.max(min, v);
        if (Number.isFinite(max)) v = Math.min(max, v);

        // Το input κρατάει ΜΟΝΟ τον αριθμό
        state.tempoInp.value = String(v);

        onTempo();
      };

      // Πληκτρολόγηση στο input
      state.tempoInp.addEventListener('input', () => {
        clampAndSet(state.tempoInp.value);
      });
      state.tempoInp.addEventListener('change', () => {
        clampAndSet(state.tempoInp.value);
      });

      // Κουμπί −
      const minusBtn = state.wrap.querySelector('.sp-tempo-dec');
      if (minusBtn) {
        minusBtn.addEventListener('click', () => {
          const cur = Number.parseInt(state.tempoInp.value, 10) || 0;
          clampAndSet(cur - 5); // αν θέλεις ±1, άλλαξε το 5 σε 1
        });
      }

      // Κουμπί +
      const plusBtn = state.wrap.querySelector('.sp-tempo-inc');
      if (plusBtn) {
        plusBtn.addEventListener('click', () => {
          const cur = Number.parseInt(state.tempoInp.value, 10) || 0;
          clampAndSet(cur + 5); // αν θέλεις ±1, άλλαξε το 5 σε 1
        });
      }
    }

    // Zoom textbox σε %
    if (state.zoomInp) {
      const clampAndApplyZoom = (raw) => {
        let v = Number.parseInt(String(raw).replace('%', ''), 10);
        if (!Number.isFinite(v)) return;
        // 5%–200% -> 0.4–2.0
        v = Math.max(5, Math.min(v, 200));
        state.zoomInp.value = String(v);
        const newZoom = v / 100;
        applyOsmdZoom(state, newZoom);
      };

      // Όταν ο χρήστης τελειώσει την εισαγωγή (change ή Enter)
      state.zoomInp.addEventListener('change', () => {
        clampAndApplyZoom(state.zoomInp.value);
      });

      state.zoomInp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          clampAndApplyZoom(state.zoomInp.value);
        }
      });
    }

    // View mode: horizontal
    if (state.btnViewH) state.btnViewH.addEventListener('click', async () => {
      if (state.viewMode === 'horizontal') return;
      state.viewMode = 'horizontal';
      localStorage.setItem(VIEW_KEY, state.viewMode);
      updateViewButtons(state);
      await renderAccordingToMode(state);
    });

    // View mode: paged
    if (state.btnViewP) state.btnViewP.addEventListener('click', async () => {
      if (state.viewMode === 'paged') return;
      state.viewMode = 'paged';
      localStorage.setItem(VIEW_KEY, state.viewMode);
      updateViewButtons(state);
      await renderAccordingToMode(state);
    });

    // Zoom buttons
    if (state.btnZoomIn) state.btnZoomIn.addEventListener('click', async () => {
      const current = state.osmdZoom || state.osmd?.Zoom || 1;
      const next = clampZoom(current * 1.1);
      if (next === current) return;
      await applyOsmdZoom(state, next);
    });

    if (state.btnZoomOut) state.btnZoomOut.addEventListener('click', async () => {
      const current = state.osmdZoom || state.osmd?.Zoom || 1;
      const next = clampZoom(current / 1.1);
      if (next === current) return;
      await applyOsmdZoom(state, next);
    });

    // On resize: ανανέωση counters, badge, cursor κ.λπ.
    w.addEventListener('resize', () => {
      if (typeof NS.refreshMeasureCounters === 'function') {
        NS.refreshMeasureCounters(state);
      } else if (typeof NS.buildMeasureCounters === 'function') {
        try { NS.buildMeasureCounters(state, true); } catch {}
      }
      if (state._decidedTonality && typeof NS.paintTonalityInsideScore === 'function') {
        NS.paintTonalityInsideScore(state, state._decidedTonality);
      }
      if (typeof NS.updateTonalityBadge === "function") {
        NS.updateTonalityBadge(state);
      }
      if (typeof NS.styleOsmdCursor === 'function') {
        NS.styleOsmdCursor(state);
      }
    });
  };

  // --------------------------- Μεταφορά συγχορδιών μέσα στο SVG ---------------------------
  // ΕΔΩ πλέον ΔΕΝ έχουμε δικό μας αλγόριθμο· χρησιμοποιούμε τη
  // RepScore.transposeChordSymbol από το score-transport.js
  (function (w) {
    const NS = w.RepScore = w.RepScore || {};

    // Μεταφορά μιας γραμμής κειμένου με συγχορδίες, π.χ. "Gm   D7  Cm"
    function transposeChordTextLine(text, semis) {
      if (!text) return text;

      // Regex για tokens συγχορδιών (ίδιο πνεύμα με πριν)
      const chordRegex =
        /\b([A-G](?:#|b)?(?:maj7|maj9|maj|m7b5|m7|m9|m6|m|dim7|dim|aug|sus2|sus4|add9|add11|add13|6|7|9|11|13)?(?:\/[A-G](?:#|b)?)?)\b/g;

      return text.replace(chordRegex, (match) => {
        const fn = NS.transposeChordSymbol;
        if (typeof fn === "function") {
          try {
            // Χρησιμοποιούμε την ΚΕΝΤΡΙΚΗ λογική από το score-transport.js
            return fn(match, semis);
          } catch (e) {
            console.warn("[sp-chords] transposeChordSymbol error", e);
          }
        }
        // Fallback: αν για κάποιο λόγο δεν υπάρχει transposeChordSymbol,
        // άφησε τη συγχορδία όπως είναι για να μην την χαλάσεις.
        return match;
      });
    }

    // Εφαρμογή σε όλα τα text/tspan του συγκεκριμένου SVG
    function transposeChordLabelsInSvg(svg, semis) {
      if (!svg) return;

      const texts = svg.querySelectorAll("text, tspan");
      texts.forEach((el) => {
        let orig = el.getAttribute("data-spChordOrig");
        if (orig == null) {
          orig = (el.textContent || "").trim();
          el.setAttribute("data-spChordOrig", orig);
        }

        if (!orig) return;

        const transposed = transposeChordTextLine(orig, semis);
        if (transposed && transposed !== el.textContent) {
          el.textContent = transposed;
        }
      });
    }

    // Κεντρική animateTranspose που καλείται από score-player.js
    NS.animateTranspose = function (state, step) {
      if (!state || !state.renderEl) return;

      const semis = Number.isFinite(state.transpose)
        ? Number(state.transpose)
        : 0;

      // 1) Ενημέρωση badge τονικότητας (πάνω αριστερά, με οπλισμό)
      try {
        if (typeof NS.updateTonalityBadge === "function") {
          NS.updateTonalityBadge(state);
        }
      } catch (e) {
        console.warn("[sp-chords] updateTonalityBadge error", e);
      }

      // 2) Μεταφορά συγχορδιών μέσα στο SVG με τον ΙΔΙΟ αλγόριθμο
      const svgs = state.renderEl.querySelectorAll(".sp-page > svg, svg");
      svgs.forEach((svg) => {
        try {
          transposeChordLabelsInSvg(svg, semis);
        } catch (e) {
          console.warn("[sp-chords] transposeChordLabelsInSvg error", e);
        }

        // Προαιρετικά: χρωματισμός φωνών όπως πριν
        try {
          if (typeof NS.colorNotesByVoice === "function") {
            NS.colorNotesByVoice(state, svg);
          }
        } catch (e) {
          console.warn("[sp-chords] colorNotesByVoice error", e);
        }
      });

      // 3) Προσαρμογή οπλισμών στα πεντάγραμμα (αν υπάρχει helper)
      try {
        if (typeof NS.updateKeySignaturesForState === "function") {
          NS.updateKeySignaturesForState(state);
        }
      } catch (e) {
        console.warn("[sp-chords] updateKeySignaturesForState error", e);
      }
    };
  })(window);



  // --------------------------- Public API ---------------------------
  NS.loadAndRenderScore = async function (state) {
    await renderAccordingToMode(state);
    if (typeof NS.updateTransposeUI === 'function') NS.updateTransposeUI(state);
    if (typeof NS.animateTranspose === 'function') NS.animateTranspose(state, 0);
  };

  // ΝΕΟ: επαναχρησιμοποιήσιμη initAllScores για όλα τα .score-player
  NS.initAllScores = async function () {
    const wraps = document.querySelectorAll(".score-player");
    if (!wraps.length) return;

    for (const wrap of wraps) {
      // Μην ξανα-αρχικοποιείς αν έχει ήδη γίνει
      if (wrap.dataset.spInited === '1') continue;
      wrap.dataset.spInited = '1';

      const state = makeState(wrap);
      NS.wireControls(state);

      if (state.tempoVal) {
        state.tempoVal.textContent = "";
        state.tempoVal.style.visibility = "hidden";
      }

      if (typeof NS.attachTempoSync === 'function') NS.attachTempoSync(state);
      if (typeof NS.hookPlayButton === 'function') NS.hookPlayButton(state);

      await NS.loadAndRenderScore(state);
      NS.updateTransportUI(state);
    }
  };

  // --------------------------- Bootstrap ---------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    // Πρώτο user interaction → resume Tone context (mobile/Chrome policy)
    w.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      try {
        if (typeof Tone !== "undefined" && Tone.context.state !== "running") {
          Tone.context.resume();
        }
      } catch {}
    }, { once: true });

    // Αρχικοποίηση όλων των players στην αρχική φόρτωση σελίδας
    await NS.initAllScores();
  });

})(window);
