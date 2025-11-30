(function (w) {
  const NS = w.RepScore = w.RepScore || {};
  const C  = NS.consts;

  // Polyfill για CSS.escape (όπως πριν)
  if (typeof CSS === "undefined" || typeof CSS.escape !== "function") {
    w.CSS = w.CSS || {};
    CSS.escape = function (s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); };
  }

  // -----------------------------------------------------------
  // makeState
  // -----------------------------------------------------------
  NS.makeState = function (wrap) {
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

      // Rendering engine & MIDI/Tone
      // Αντί για το Verovio toolkit, χρησιμοποιείται το OpenSheetMusicDisplay (OSMD).
      // Το πεδίο osmd θα αρχικοποιηθεί κατά το πρώτο render.
      osmd: null,
      // Παραμένουν τα πεδία για αναπαραγωγή ήχου μέσω Tone.js
      currentMidi: null,
      synth: null,
      parts: [],
      visualPart: null,
      playing: false,
      paused: false,
      baseBpm: 120,

      // Χρώματα ανά φωνή
      voiceColors: new Map(), // key "staff/voice" -> color
      scoreMap: null,
    };
  };

  // -----------------------------------------------------------
  // Staff / Voice helpers
  // -----------------------------------------------------------
  NS.staffNumberOf = function (el) {
    const staff = el.closest('g.staff');
    if (!staff) return '1';
    const nAttr = staff.getAttribute('n') || staff.getAttribute('data-n');
    if (nAttr) return String(nAttr);
    const parent = staff.parentNode;
    const siblings = Array.from(parent.querySelectorAll(':scope > g.staff'));
    const idx = siblings.indexOf(staff);
    return String(idx >= 0 ? idx + 1 : 1);
  };

  NS.voiceKeyOf = function (el) {
    const staff = el.closest('g.staff');
    let staffN = staff?.getAttribute('n') || staff?.getAttribute('data-n');
    if (!staffN && staff && staff.parentNode) {
      const sibs = Array.from(staff.parentNode.querySelectorAll(':scope > g.staff'));
      staffN = String(Math.max(1, sibs.indexOf(staff) + 1));
    }
    const layer = el.closest('g.layer');
    let voiceN =
      layer?.getAttribute('n') || layer?.getAttribute('data-n') ||
      el.getAttribute('data-voice') || el.getAttribute('voice') || el.getAttribute('data-voice.ges');

    if (!voiceN && layer && layer.parentNode) {
      const lsibs = Array.from(layer.parentNode.querySelectorAll(':scope > g.layer'));
      voiceN = String(Math.max(1, lsibs.indexOf(layer) + 1));
    }
    return `${staffN || '1'}/${voiceN || '1'}`;
  };

  // -----------------------------------------------------------
  // SVG helpers: client <-> local & εύρεση κάθετου span συστήματος
  // -----------------------------------------------------------
  NS.svgClientToLocal = function (svg, clientX, clientY) {
    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      const inv = svg.getScreenCTM()?.inverse();
      if (inv) {
        const p = pt.matrixTransform(inv);
        return { x: p.x, y: p.y };
      }
    } catch {}
    return { x: clientX, y: clientY };
  };

  NS.svgLocalToClient = function (svg, xLocal, yLocal) {
    const pt = svg.createSVGPoint();
    pt.x = xLocal; pt.y = yLocal;
    const ctm = svg.getScreenCTM();
    const p = ctm ? pt.matrixTransform(ctm) : { x: xLocal, y: yLocal };
    return { x: p.x, y: p.y };
  };

  // Υπολόγισε το κατακόρυφο span του ΣΥΣΤΗΜΑΤΟΣ που τέμνει ένα xLocal
  NS.computeSystemSpanAtX = function (svg, xLocal) {
    const cx = NS.svgLocalToClient(svg, xLocal, 0).x;

    // (1) Προσπάθησε με g.system (Verovio)
    const systems = Array.from(svg.querySelectorAll('g.system'));
    const targetSystem = systems.find(sys => {
      const r = sys.getBoundingClientRect();
      return cx >= r.left && cx <= r.right;
    });
    if (targetSystem) {
      const r = targetSystem.getBoundingClientRect();
      const top = r.top, bottom = r.bottom;
      return {
        yTopLocal: NS.svgClientToLocal(svg, cx, top).y,
        yBotLocal: NS.svgClientToLocal(svg, cx, bottom).y,
      };
    }

    // (2) Fallback: πάρε όλα τα g.staff και βρες το συνολικό span που καλύπτει το cx
    const staffs = Array.from(svg.querySelectorAll('g.staff'));
    let top = +Infinity, bottom = -Infinity, any = false;
    for (const st of staffs) {
      const r = st.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right) {
        any = true;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
    }
    if (any) {
      return {
        yTopLocal: NS.svgClientToLocal(svg, cx, top).y,
        yBotLocal: NS.svgClientToLocal(svg, cx, bottom).y,
      };
    }
    return null;
  };

  // -----------------------------------------------------------
  // Μέτρηση & σχεδίαση αύξοντα αριθμού μέτρων
  // -----------------------------------------------------------
  const _moBySvg = new WeakMap();        // MutationObserver ανά svg
  const _pendingByRoot = new WeakMap();  // debounce per renderEl

  function _scheduleRebuild(state, delay = 60) {
    const root = state?.renderEl;
    if (!root) return;
    const prev = _pendingByRoot.get(root);
    if (prev) cancelAnimationFrame(prev.raf);
    const raf = requestAnimationFrame(() => {
      clearTimeout(prev?.t);
      const t = setTimeout(() => {
        try { NS.buildMeasureCounters(state, true); } catch {}
      }, delay);
      _pendingByRoot.set(root, { raf: 0, t });
    });
    _pendingByRoot.set(root, { raf, t: null });
  }

  // Δημιουργεί/ανανεώνει τους αριθμούς μέτρων πάνω από κάθε "στήλη" μέτρου.
  // Αν secondPass=true, θα καθαρίσει και θα τους ξαναφτιάξει.
  NS.buildMeasureCounters = function (state, secondPass = false) {
    if (!state?.renderEl) return;

    const svgs = Array.from(state.renderEl.querySelectorAll('.sp-page > svg, svg'));
    if (!svgs.length) return;

    // attach observers για auto-refresh όταν αλλάζουν transforms στα layers (π.χ. transpose)
    for (const svg of svgs) {
      if (!_moBySvg.has(svg)) {
        const mo = new MutationObserver((mutList) => {
          // αν αλλάξει transform/style σε g.layer ή στο svg, κάνε reflow
          const important = mutList.some(m =>
            m.type === 'attributes' &&
            (m.attributeName === 'transform' || m.attributeName === 'style') &&
            (m.target.tagName === 'g' || m.target.tagName === 'svg')
          );
          if (important) _scheduleRebuild(state, 30);
        });
        mo.observe(svg, { subtree: true, childList: false, attributes: true, attributeFilter: ['transform', 'style'] });
        _moBySvg.set(svg, mo);
      }
    }

    const scale = parseFloat(state.vrvToolkit?.getOptions()?.scale || "50");
    const FONT_AT_50   = 12;      // px
    const MARGIN_AT_50 = 14;      // px πάνω από το top staff
    const X_TOL_PX     = 6;       // ανοχή clustering (σε client px)

    const fontSize = Math.max(10, (scale / 50) * FONT_AT_50);
    const yMargin  = (scale / 50) * MARGIN_AT_50;

    svgs.forEach(svg => {
      // καθάρισε παλιούς counters
      svg.querySelectorAll('g.sp-measure-counters').forEach(g => g.remove());

      const measures = Array.from(svg.querySelectorAll('g.measure'));
      if (!measures.length) return;

      // Μάζεψε x-θέσεις σε client space για clustering ανά στήλη μέτρου
      const items = measures.map(m => {
        const r = m.getBoundingClientRect();
        const leftClient  = r.left;
        const rightClient = r.right;
        const centerClient = (leftClient + rightClient) / 2;
        const centerLocal  = NS.svgClientToLocal(svg, centerClient, r.top).x;
        return { m, leftClient, centerClient, centerLocal };
      }).sort((a,b) => a.leftClient - b.leftClient);

      // Cluster ανά "στήλη" → πάρε ένα entry ανά group
      const cols = [];
      let lastLeft = -Infinity;
      for (const it of items) {
        if (it.leftClient - lastLeft > X_TOL_PX) {
          cols.push(it);
          lastLeft = it.leftClient;
        } else {
          // ίδιο column: κράτα το πιο αριστερά (πρακτικά το πρώτο)
        }
      }

      // Δημιούργησε overlay group
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'sp-measure-counters');
      g.setAttribute('pointer-events', 'none');
      svg.appendChild(g);

      // Σχεδίασε τους αριθμούς
      cols.forEach((c, i) => {
        const span = NS.computeSystemSpanAtX(svg, c.centerLocal);
        let yTopLocal = null;
        if (span) yTopLocal = span.yTopLocal;
        else {
          // fallback: πάρε min y από staff lines
          const lines = Array.from(svg.querySelectorAll('g.staff line'));
          if (lines.length) {
            const ys = lines.map(l => parseFloat(l.getAttribute('y1') || l.getAttribute('y2') || '0'));
            yTopLocal = Math.min.apply(Math, ys);
          } else {
            yTopLocal = 0;
          }
        }

        const x = c.centerLocal;
        const y = yTopLocal - yMargin;

        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('class', 'sp-measure-num');
        t.setAttribute('x', String(x));
        t.setAttribute('y', String(y));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', String(fontSize));
        t.setAttribute('font-weight', '700');
        // outline για αναγνωσιμότητα πάνω από γραμμές staff
        t.setAttribute('fill', '#111');
        t.setAttribute('stroke', '#fff');
        t.setAttribute('stroke-width', String(Math.max(1, fontSize / 8)));
        t.setAttribute('paint-order', 'stroke fill');
        t.textContent = String(i + 1);
        g.appendChild(t);
      });
    });
  };

  // Εξωτερικό API για να ζητάς refresh (π.χ. μετά από δικό σου layout)
  NS.refreshMeasureCounters = function (state) {
    try { NS.buildMeasureCounters(state, true); } catch {}
  };

})(window);
