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
      viewMode: (localStorage.getItem(VIEW_KEY) === 'paged') ? 'paged' : 'horizontal',

      // cache
      _xmlText: null,      // για καθαρό MusicXML (text)
      _mxlData: null,      // για binary MXL (ArrayBuffer)
      currentXmlDoc: null,
      _decidedTonality: null,
      _baseKeyInfo: null,

      // flags
      lastTransport: null,
      _osmdRenderPatched: false
    };
  }



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


    // --------------------------- OSMD renderWithOsmd ---------------------------
  async function renderWithOsmd(state, horizontal) {
    // 1. Φόρτωση αρχείου (μία φορά ανά state)
    if (!state._xmlText) {
      const res = await fetch(state.fileUrl);

      const ct = (res.headers.get("Content-Type") || "").toLowerCase();
      const url = String(state.fileUrl || "").toLowerCase();

      const isMxl =
        url.endsWith(".mxl") ||
        ct.includes("application/vnd.recordare.musicxml") ||
        ct.includes("application/vnd.recordare.musicxml+xml") ||
        ct.includes("application/x-mxl") ||
        ct.includes("application/zip") ||
        ct.includes("application/x-zip-compressed") ||
        ct.includes("application/octet-stream") ||
        ct.includes("musicxml") ||
        ct.includes("mxl");


      if (isMxl) {
        // MXL (zip) → διαβάζουμε binary και το κάνουμε binary string για την OSMD
        const buffer = await res.arrayBuffer();
        state._xmlText = arrayBufferToBinaryString(buffer);

        // ΔΕΝ προσπαθούμε να κάνουμε DOMParser εδώ, δεν είναι XML string
        state.currentXmlDoc = null;
      } else {
        // Καθαρό MusicXML → text
        state._xmlText = await res.text();
        try {
          state.currentXmlDoc = new DOMParser().parseFromString(
            state._xmlText,
            "application/xml"
          );
        } catch {
          state.currentXmlDoc = null;
        }
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

    // 5. Φόρτωση δεδομένων στην OSMD (είτε MXL binary-string είτε XML string)
    try {
      await state.osmd.load(state._xmlText);
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

  NS.wireControls = function (state) {
    ensureViewToggleUI(state);
    ensureZoomButtons(state);
    setViewClass(state);
    updateViewButtons(state);
    NS.updateTransportUI(state);

    // Play
    if (state.btnPlay) state.btnPlay.addEventListener("click", async () => {
      state.lastTransport = 'play';
      try {
        if (w.Tone?.context?.state !== "running") await w.Tone.context.resume();
        await w.Tone?.loaded?.();
      } catch {}
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

