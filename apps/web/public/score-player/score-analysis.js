// ========================== score-analysis.js ==========================
// Ανάλυση SVG + MusicXML (μέτρο, κλειδιά, τονικότητα) με ασφαλή helpers.
(function (w) {
  const NS = w.RepScore = w.RepScore || {};

  // ---------- Safe helpers ----------
  const qAll = (root, sel) => Array.from(root.querySelectorAll(sel));

  const staffNumberOf = typeof NS.staffNumberOf === 'function'
    ? NS.staffNumberOf
    : function (el) {
        const staff = el.closest?.('g.staff');
        if (!staff) return '1';
        const nAttr = staff.getAttribute('n') || staff.getAttribute('data-n');
        if (nAttr) return String(nAttr);
        const parent = staff.parentNode;
        const siblings = Array.from(parent?.querySelectorAll(':scope > g.staff') || []);
        const idx = siblings.indexOf(staff);
        return String(idx >= 0 ? idx + 1 : 1);
      };

  const voiceKeyOf = typeof NS.voiceKeyOf === 'function'
    ? NS.voiceKeyOf
    : function (el) {
        const staff = el.closest?.('g.staff');
        let staffN = staff?.getAttribute('n') || staff?.getAttribute('data-n');
        if (!staffN && staff && staff.parentNode) {
          const sibs = Array.from(staff.parentNode.querySelectorAll(':scope > g.staff'));
          staffN = String(Math.max(1, sibs.indexOf(staff) + 1));
        }
        const layer = el.closest?.('g.layer');
        let voiceN =
          layer?.getAttribute('n') || layer?.getAttribute('data-n') ||
          el.getAttribute?.('data-voice') || el.getAttribute?.('voice') || el.getAttribute?.('data-voice.ges');
        if (!voiceN && layer && layer.parentNode) {
          const lsibs = Array.from(layer.parentNode.querySelectorAll(':scope > g.layer'));
          voiceN = String(Math.max(1, lsibs.indexOf(layer) + 1));
        }
        return `${staffN || '1'}/${voiceN || '1'}`;
      };

  const readPitchSafe = (el) => {
    try {
      if (typeof NS.readPitch === 'function') return NS.readPitch(el) || {};
      if (typeof NS.readPitchFromSvg === 'function') return NS.readPitchFromSvg(el) || {};
    } catch {}
    return {};
  };

  // ---------- Ετικέτα staff (π.χ. Soprano) ----------
  const guessStaffLabel = (svg, staffEl) => {
    if (!svg || !staffEl) return null;
    const direct = staffEl.getAttribute('label') || staffEl.getAttribute('data-label') || '';
    if (direct && /\S/.test(direct)) return direct.trim();

    let sb; try { sb = staffEl.getBBox(); } catch { sb = null; }
    if (!sb) return null;

    const sTop = sb.y, sBot = sb.y + sb.height, sLeft = sb.x;
    const texts = Array.from(svg.querySelectorAll('text'));
    const candidates = [];

    for (const t of texts) {
      const txt = (t.textContent || '').trim();
      if (!txt || /^\d+$/.test(txt) || txt.length > 32) continue;
      let tb; try { tb = t.getBBox(); } catch { tb = null; }
      if (!tb) continue;
      const verticalOverlap =
        Math.max(0, Math.min(sBot, tb.y + tb.height) - Math.max(sTop, tb.y));
      const overlapRatio = verticalOverlap / Math.min(tb.height || 1, sb.height || 1);
      if (overlapRatio < 0.35) continue;
      const dx = sLeft - (tb.x + tb.width);
      if (!(dx > -5)) continue;
      const scoreBoost = /(piano|voice|soprano|alto|tenor|bass|flute|violin|cello|guitar)/i.test(txt) ? -50 : 0;
      candidates.push({ txt, score: dx + scoreBoost });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].txt;
  };

  // ---------- Time signature extraction ----------
  const extractTimeSigText = (group) => {
    if (!group) return null;
    const count = group.getAttribute('count')
               || group.getAttribute('data-count')
               || group.getAttribute('meter.count')
               || group.getAttribute('data-meter.count');
    const unit  = group.getAttribute('unit')
               || group.getAttribute('data-unit')
               || group.getAttribute('meter.unit')
               || group.getAttribute('data-meter.unit');
    if (count && unit) return `${count}/${unit}`;

    const tAttr = (group.getAttribute('data-sig')
              ||  group.getAttribute('meter')
              ||  group.getAttribute('sig') || '').trim();
    const m1 = tAttr.match(/\d+\s*\/\s*\d+/);
    if (m1) return m1[0];

    const textAll = Array.from(group.querySelectorAll('text,tspan'))
      .map(t => (t.textContent || '').trim())
      .filter(Boolean)
      .join(' ');
    const nums = textAll.match(/\d+/g);
    if (nums && nums.length >= 2) return `${nums[0]}/${nums[1]}`;

    let c2 = null, u2 = null;
    group.querySelectorAll('*').forEach(el => {
      c2 = c2 || el.getAttribute('count') || el.getAttribute('data-count') || el.getAttribute('meter.count');
      u2 = u2 || el.getAttribute('unit')  || el.getAttribute('data-unit')  || el.getAttribute('meter.unit');
    });
    if (c2 && u2) return `${c2}/${u2}`;
    return null;
  };

  // ---------- Κύρια ανάλυση SVG ----------
  NS.analyzeScoreParts = function (state) {
    const container = state.renderEl;
    const svgs = Array.from(container.querySelectorAll('.sp-page > svg'));

    const out = {
      svgs,
      pages:    { count: svgs.length, byIndex: new Map() },
      staffs:   new Map(),
      layers:   new Map(),
      measures: new Map(),
      clefs:    new Map(),
      keySigs:  new Map(),
      timeSigs: new Map(),
      barlines: new Map(),
      mnums:    new Map(),
      notes: { all: [], byId: new Map(), meta: new Map() },
      rests: [],
      beams: [],
      voices: new Map(),
      voicesFlat: [],
      staffLabels: new Map(),
      summary: {
        timeSigText: null,
        voicesCount: 0,
        voicesLabels: [],
        counts: {
          pages: svgs.length, staffs: 0, layers: 0, measures: 0,
          notes: 0, chords: 0, rests: 0, clefs: 0, keySigs: 0,
          timeSigs: 0, barlines: 0, beams: 0
        }
      }
    };

    svgs.forEach((svg, i) => {
      const pageNum = i + 1;
      out.pages.byIndex.set(pageNum, svg);

      const staffs = qAll(svg, 'g.staff');
      const byN = new Map();
      const staffLabelByN = new Map();
      staffs.forEach(st => {
        const n = st.getAttribute('n') || st.getAttribute('data-n');
        if (!n) return;
        byN.set(String(n), st);
        const lbl = guessStaffLabel(svg, st);
        if (lbl) {
          staffLabelByN.set(String(n), lbl);
          if (!out.staffLabels.has(String(n))) out.staffLabels.set(String(n), lbl);
        }
      });
      out.staffs.set(svg, { list: staffs, byN, all: staffs });

      const layers = qAll(svg, 'g.layer');
      const byStaff = new Map();
      layers.forEach(ly => {
        const sn = staffNumberOf(ly);
        if (!byStaff.has(sn)) byStaff.set(sn, []);
        byStaff.get(sn).push(ly);
      });
      out.layers.set(svg, { all: layers, byStaff });

      const measures = qAll(svg, 'g.measure');
      const mBy = new Map();
      measures.forEach(m => {
        const n = m.getAttribute('n') || m.getAttribute('data-n') || m.getAttribute('number');
        if (n) mBy.set(String(n), m);
      });
      out.measures.set(svg, { all: measures, byNum: mBy });

      const clefs    = qAll(svg, 'g.clef, use.clef, g[class*="clef"], use[class*="clef"]');
      const keySigs  = qAll(svg, 'g.keySig, g.keysig, use.keysig');
      const timeSigs = qAll(svg, 'g.timeSig, g.timesig, use.timesig, g.meterSig, use.meterSig');
      const barlines = qAll(svg, 'g.barLine, path.barLine, line.barLine');
      const mnums    = qAll(svg, 'text.mNum, text.measureNumber');

      out.clefs.set(svg, clefs);
      out.keySigs.set(svg, keySigs);
      out.timeSigs.set(svg, timeSigs);
      out.barlines.set(svg, barlines);
      out.mnums.set(svg, mnums);

      out.summary.counts.staffs   += staffs.length;
      out.summary.counts.layers   += layers.length;
      out.summary.counts.measures += measures.length;
      out.summary.counts.clefs    += clefs.length;
      out.summary.counts.keySigs  += keySigs.length;
      out.summary.counts.timeSigs += timeSigs.length;
      out.summary.counts.barlines += barlines.length;

      const noteRoots = qAll(svg, 'g.chord, g.note');
      noteRoots.forEach(root => {
        out.notes.all.push(root);
        const id = root.id || root.getAttribute('id');
        if (id) out.notes.byId.set(id, root);

        const staffN   = staffNumberOf(root);
        const voiceKey = voiceKeyOf(root);
        const { pitch, oct, acc } = readPitchSafe(root);
        out.notes.meta.set(root, { staffN, voiceKey, pitch, oct, acc, page: pageNum });

        if (!out.voices.has(svg)) out.voices.set(svg, new Map());
        const vmap = out.voices.get(svg);
        if (!vmap.has(voiceKey)) vmap.set(voiceKey, { layers: new Set(), notes: [], chords: [], label: null });
        const bucket = vmap.get(voiceKey);
        if (root.matches('g.note'))  { bucket.notes.push(root);  out.summary.counts.notes++; }
        if (root.matches('g.chord')) { bucket.chords.push(root); out.summary.counts.chords++; }
      });

      const rests = qAll(svg, 'g.rest, g.mRest, g.measureRest, g.multiRest');
      const beams = qAll(svg, 'g.beam');
      out.rests.push(...rests);
      out.beams.push(...beams);
      out.summary.counts.rests += rests.length;
      out.summary.counts.beams += beams.length;

      const vmap = out.voices.get(svg) || new Map();
      for (const [vk, bucket] of vmap.entries()) {
        const staffN = vk.split('/')[0] || '1';
        bucket.label = staffLabelByN.get(String(staffN)) || null;
      }
    });

    const flatByKey = new Map();
    out.svgs.forEach(svg => {
      const vmap = out.voices.get(svg) || new Map();
      for (const [vk, bucket] of vmap.entries()) {
        if (!flatByKey.has(vk)) {
          const [staffN, voiceN] = vk.split('/');
          flatByKey.set(vk, {
            key: vk, staffN: staffN || '1', voiceN: voiceN || '1',
            label: bucket.label || null, notes: [], chords: [], pages: new Set()
          });
        }
        const tgt = flatByKey.get(vk);
        tgt.notes.push(...bucket.notes);
        tgt.chords.push(...bucket.chords);
        bucket.notes.concat(bucket.chords).forEach(el => {
          const m = out.notes.meta.get(el);
          if (m?.page) tgt.pages.add(m.page);
        });
        if (!tgt.label && bucket.label) tgt.label = bucket.label;
      }
    });
    out.voicesFlat = Array.from(flatByKey.values());

    for (const svg of out.svgs) {
      const tgs = out.timeSigs.get(svg) || [];
      for (const tg of tgs) {
        const txt = extractTimeSigText(tg);
        if (txt) { out.summary.timeSigText = txt; break; }
      }
      if (out.summary.timeSigText) break;
    }

    out.summary.voicesCount = out.voicesFlat.length;
    out.summary.voicesLabels = out.voicesFlat.map(v =>
      (v.label ? `${v.label} (staff ${v.staffN}/voice ${v.voiceN})` : `staff ${v.staffN}/voice ${v.voiceN}`)
    );

    // Σύντομο log
    (function logSummary() {
      const s = out.summary;
      const partsFound = [];
      if (s.counts.staffs)   partsFound.push('πεντάγραμμα');
      if (s.counts.clefs)    partsFound.push('κλειδιά');
      if (s.counts.keySigs)  partsFound.push('οπλισμός');
      if (s.counts.timeSigs) partsFound.push('μέτρο χρόνου');
      if (s.counts.measures) partsFound.push('μέτρα');
      if (s.counts.notes || s.counts.chords) partsFound.push('νότες/συγχορδίες');
      if (s.counts.rests)    partsFound.push('παύσεις');
      if (s.counts.beams)    partsFound.push('δοκίδες');
      if (s.counts.barlines) partsFound.push('διαστολές');

      const voicesListPretty = s.voicesLabels.length
        ? s.voicesLabels.map((v, i) => `${String.fromCharCode(97 + i)}. ${v}`).join(', ')
        : '—';

      console.log([
        `🎼 Ανάλυση παρτιτούρας:`,
        `• Σελίδες: ${s.counts.pages}`,
        `• Βρέθηκαν ${s.voicesCount} φωνές: ${voicesListPretty}`,
        `• Μέτρο χρόνου: ${out.summary.timeSigText || '—'}`,
        `• Στοιχεία: ${partsFound.join(', ') || '—'}`
      ].join('\n'));
    })();

    return out;
  };

  // ================== Τονικότητα από MusicXML (namespace-safe) ==================
  (function () {
    const NOTE_GR = {
      "C":"Ντο","C#":"Ντο♯","Db":"Ρε♭",
      "D":"Ρε","D#":"Ρε♯","Eb":"Μι♭",
      "E":"Μι","F":"Φα","F#":"Φα♯",
      "Gb":"Σολ♭","G":"Σολ","G#":"Σολ♯",
      "Ab":"Λα♭","A":"Λα","A#":"Λα♯",
      "Bb":"Σι♭","B":"Σι","Cb":"Ντο♭",
      "E#":"Μι♯","B#":"Σι♯"
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
    const toGreek = (note) => NOTE_GR[note] || note;

    function getByLocalName(root, local) {
      const out = [];
      const walk = (node) => {
        if (node.nodeType === 1) {
          if (node.localName === local) out.push(node);
          for (let c = node.firstElementChild; c; c = c.nextElementSibling) walk(c);
        }
      };
      walk(root);
      return out;
    }

    function findFirstKey(xmlDoc) {
      const root = xmlDoc?.documentElement;
      if (!root) return null;
      const keys = getByLocalName(root, 'key');
      for (const k of keys) {
        const fifths = getByLocalName(k, 'fifths')[0];
        if (!fifths || !/\S/.test(fifths.textContent || '')) continue;
        const modeEl = getByLocalName(k, 'mode')[0];
        return {
          fifths: parseInt((fifths.textContent || '').trim(), 10),
          mode: (modeEl?.textContent || '').trim().toLowerCase() || null
        };
      }
      return null;
    }

    window.RepScore.analyzeKeyFromMusicXML = function(xmlDoc){
      try {
        const k = findFirstKey(xmlDoc);
        if (!k || !Number.isFinite(k.fifths) || k.fifths < -7 || k.fifths > 7) {
          console.debug('[sp-tonality] no usable <key>/<fifths> found');
          return null;
        }
        let mode = (k.mode === 'minor' || k.mode === 'major') ? k.mode : 'major';
        const maj = FIFTHS_TO_MAJOR[String(k.fifths)];
        if (!maj) return null;

        let tonic = maj, textQuality = 'ματζόρε';
        if (mode === 'minor') {
          tonic = MAJOR_TO_MINOR[maj] || 'A';
          textQuality = 'μινόρε';
        }
        const pretty = `${toGreek(tonic)} ${textQuality}`;
        console.debug('[sp-tonality] detected:', { fifths: k.fifths, mode, tonic: pretty });
        return pretty;
      } catch (e) {
        console.warn('[sp-tonality] analyzeKeyFromMusicXML error:', e);
        return null;
      }
    };
  })();

})(window);
