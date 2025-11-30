// ============================ score-player-bundle.js ============================
// Απλός αλλά πλήρης score player για Repertorio Next.
//
// - Βρίσκει όλα τα .score-player divs
// - Φορτώνει MusicXML από data-file (ΚΕΙΜΕΝΟ, ΟΧΙ ZIP)
// - Render μέσω OpenSheetMusicDisplay (OSMD) σε SVG
// - Βασικά controls: Zoom +/- και Transpose +/-
//
// ΠΡΟΫΠΟΘΕΣΗ: Το OpenSheetMusicDisplay είναι ήδη φορτωμένο και διαθέσιμο
// ως window.opensheetmusicdisplay.OpenSheetMusicDisplay.
//
// Στο Next.js page πρέπει να έχεις:
//
//   <Script src="https://unpkg.com/opensheetmusicdisplay@1.7.6/build/opensheetmusicdisplay.min.js" strategy="afterInteractive" />
//   <Script src="/score-player/score-player-bundle.js" strategy="afterInteractive" />
//   <Script id="score-player-init" strategy="afterInteractive">
//     {`
//       function tryInitScores() {
//         if (window.RepScore && typeof window.RepScore.initAllScores === 'function') {
//           window.RepScore.initAllScores();
//           return true;
//         }
//         return false;
//       }
//       if (!tryInitScores()) {
//         setTimeout(tryInitScores, 500);
//         setTimeout(tryInitScores, 1500);
//       }
//     `}
//   </Script>

(function (w) {
  if (!w) return;

  var NS = (w.RepScore = w.RepScore || {});

  function log() {
    if (w.console && typeof w.console.log === "function") {
      try {
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[RepScore]");
        w.console.log.apply(w.console, args);
      } catch {}
    }
  }

  function warn() {
    if (w.console && typeof w.console.warn === "function") {
      try {
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[RepScore]");
        w.console.warn.apply(w.console, args);
      } catch {}
    }
  }

  function error() {
    if (w.console && typeof w.console.error === "function") {
      try {
        var args = Array.prototype.slice.call(arguments);
        args.unshift("[RepScore]");
        w.console.error.apply(w.console, args);
      } catch {}
    }
  }

  if (typeof w.CSS === "undefined") {
    w.CSS = {};
  }
  if (typeof w.CSS.escape !== "function") {
    w.CSS.escape = function (value) {
      return String(value).replace(/[^a-zA-Z0-9\-_]/g, "\\$&");
    };
  }

  function hasOSMD() {
    return (
      typeof w.opensheetmusicdisplay !== "undefined" &&
      typeof w.opensheetmusicdisplay.OpenSheetMusicDisplay === "function"
    );
  }

  function createState(container) {
    var fileUrl = container.getAttribute("data-file") || "";
    var transposeAttr = container.getAttribute("data-transpose") || "0";
    var transposeVal = parseInt(transposeAttr, 10);
    if (isNaN(transposeVal)) transposeVal = 0;

    return {
      container: container,
      fileUrl: fileUrl,
      transpose: transposeVal,
      zoom: 1.0,
      osmd: null,
      loaded: false,
      loading: false,
      scoreHost: null,
      _toolbar: null,
      _xmlText: null,
    };
  }

  function buildToolbar(state) {
    var container = state.container;

    var outer = w.document.createElement("div");
    outer.className = "score-player-outer";
    outer.style.display = "flex";
    outer.style.flexDirection = "column";
    outer.style.gap = "8px";

    var toolbar = w.document.createElement("div");
    toolbar.className = "score-player-toolbar";
    toolbar.style.display = "flex";
    toolbar.style.alignItems = "center";
    toolbar.style.justifyContent = "space-between";
    toolbar.style.gap = "8px";
    toolbar.style.fontSize = "14px";

    // Zoom
    var zoomBox = w.document.createElement("div");
    zoomBox.style.display = "flex";
    zoomBox.style.alignItems = "center";
    zoomBox.style.gap = "4px";

    var zoomLabel = w.document.createElement("span");
    zoomLabel.textContent = "Zoom:";

    var btnZoomOut = w.document.createElement("button");
    btnZoomOut.type = "button";
    btnZoomOut.textContent = "-";
    btnZoomOut.style.minWidth = "28px";
    btnZoomOut.style.cursor = "pointer";

    var zoomValueSpan = w.document.createElement("span");
    zoomValueSpan.textContent = "100%";

    var btnZoomIn = w.document.createElement("button");
    btnZoomIn.type = "button";
    btnZoomIn.textContent = "+";
    btnZoomIn.style.minWidth = "28px";
    btnZoomIn.style.cursor = "pointer";

    zoomBox.appendChild(zoomLabel);
    zoomBox.appendChild(btnZoomOut);
    zoomBox.appendChild(zoomValueSpan);
    zoomBox.appendChild(btnZoomIn);

    // Transpose
    var transBox = w.document.createElement("div");
    transBox.style.display = "flex";
    transBox.style.alignItems = "center";
    transBox.style.gap = "4px";

    var transLabel = w.document.createElement("span");
    transLabel.textContent = "Transpose:";

    var btnTransDown = w.document.createElement("button");
    btnTransDown.type = "button";
    btnTransDown.textContent = "−";
    btnTransDown.style.minWidth = "28px";
    btnTransDown.style.cursor = "pointer";

    var transValueSpan = w.document.createElement("span");
    transValueSpan.textContent = "0";

    var btnTransUp = w.document.createElement("button");
    btnTransUp.type = "button";
    btnTransUp.textContent = "+";
    btnTransUp.style.minWidth = "28px";
    btnTransUp.style.cursor = "pointer";

    transBox.appendChild(transLabel);
    transBox.appendChild(btnTransDown);
    transBox.appendChild(transValueSpan);
    transBox.appendChild(btnTransUp);

    toolbar.appendChild(zoomBox);
    toolbar.appendChild(transBox);

    // Host της παρτιτούρας
    var scoreHost = w.document.createElement("div");
    scoreHost.className = "score-player-host";
    scoreHost.style.border = "1px solid #e0e0e0";
    scoreHost.style.borderRadius = "6px";
    scoreHost.style.padding = "8px";
    scoreHost.style.overflow = "auto";
    scoreHost.style.backgroundColor = "#ffffff";

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    outer.appendChild(toolbar);
    outer.appendChild(scoreHost);
    container.appendChild(outer);

    state._toolbar = {
      zoomValueSpan: zoomValueSpan,
      btnZoomIn: btnZoomIn,
      btnZoomOut: btnZoomOut,
      transValueSpan: transValueSpan,
      btnTransUp: btnTransUp,
      btnTransDown: btnTransDown,
    };
    state.scoreHost = scoreHost;

    btnZoomIn.addEventListener("click", function () {
      setZoom(state, state.zoom + 0.1);
    });
    btnZoomOut.addEventListener("click", function () {
      setZoom(state, state.zoom - 0.1);
    });
    btnTransUp.addEventListener("click", function () {
      setTranspose(state, state.transpose + 1);
    });
    btnTransDown.addEventListener("click", function () {
      setTranspose(state, state.transpose - 1);
    });
  }

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function updateToolbarView(state) {
    if (!state._toolbar) return;
    var zoomPercent = Math.round(state.zoom * 100);
    state._toolbar.zoomValueSpan.textContent = zoomPercent + "%";
    state._toolbar.transValueSpan.textContent = String(state.transpose);
  }

  function setZoom(state, zoom) {
    if (!state.osmd) {
      state.zoom = zoom;
      updateToolbarView(state);
      return;
    }
    var newZoom = clamp(zoom, 0.5, 2.5);
    state.zoom = newZoom;
    state.osmd.zoom = newZoom;
    try {
      state.osmd.render();
    } catch (e) {
      warn("Zoom render error", e);
    }
    updateToolbarView(state);
  }

  function setTranspose(state, transpose) {
    if (!state.osmd || !state.osmd.Sheet) {
      state.transpose = transpose;
      updateToolbarView(state);
      return;
    }
    var newTrans = clamp(transpose, -6, 6);
    state.transpose = newTrans;

    try {
      state.osmd.Sheet.Transpose = newTrans;
      state.osmd.render();
    } catch (e) {
      warn("Transpose render error", e);
    }

    updateToolbarView(state);
  }

  // Φόρτωση και render ενός score
  function loadAndRender(state) {
    if (state.loading || state.loaded) return;

    if (!state.fileUrl) {
      warn("Δεν έχει οριστεί data-file στο .score-player", state.container);
      return;
    }

    if (!hasOSMD()) {
      error(
        "Δεν βρέθηκε OpenSheetMusicDisplay. Φόρτωσε πρώτα το opensheetmusicdisplay.min.js."
      );
      return;
    }

    state.loading = true;

    var OpenSheetMusicDisplay = w.opensheetmusicdisplay.OpenSheetMusicDisplay;
    var osmd = new OpenSheetMusicDisplay(state.scoreHost, {
      autoResize: true,
      drawingParameters: "compact",
    });
    state.osmd = osmd;

    // === ΣΗΜΑΝΤΙΚΟ: ΦΕΡΝΟΥΜΕ ΠΑΝΤΑ ΚΕΙΜΕΝΟ (MusicXML), ΟΧΙ ZIP ===
    fetch(state.fileUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP error " + res.status);
        }
        return res.text();
      })
      .then(function (xmlText) {
        state._xmlText = xmlText;
        return osmd.load(xmlText);
      })
      .then(function () {
        return osmd.render();
      })
      .then(function () {
        state.loaded = true;
        state.loading = false;

        setZoom(state, state.zoom);
        setTranspose(state, state.transpose);

        log("Score loaded OK:", state.fileUrl);
      })
      .catch(function (e) {
        state.loading = false;
        error(
          "Σφάλμα φόρτωσης παρτιτούρας:",
          e,
          "\n file:",
          state.fileUrl
        );
        try {
          var msg = w.document.createElement("div");
          msg.style.color = "#b00020";
          msg.style.padding = "8px";
          msg.textContent =
            "Δεν ήταν δυνατή η φόρτωση της παρτιτούρας. (" + e.message + ")";
          state.scoreHost.innerHTML = "";
          state.scoreHost.appendChild(msg);
        } catch (e2) {}
      });
  }

  function initScoreContainer(container) {
    var state = createState(container);
    container.__repScoreState = state;

    buildToolbar(state);
    loadAndRender(state);
  }

  function initAllScores() {
    var doc = w.document;
    if (!doc) return;

    var nodes = doc.querySelectorAll
      ? doc.querySelectorAll(".score-player")
      : [];

    if (!nodes || !nodes.length) {
      log("Δεν βρέθηκαν .score-player στο DOM.");
      return;
    }

    for (var i = 0; i < nodes.length; i++) {
      initScoreContainer(nodes[i]);
    }
  }

  // Δημόσιο API
  NS.initAllScores = initAllScores;
  NS.initScoreContainer = initScoreContainer;

  // ΠΡΟΣΟΧΗ:
  // ΔΕΝ κάνουμε auto-init εδώ (όπως παλιά) για να μη τρέχει πριν φορτωθεί ο OSMD.
  // Το Next.js page πρέπει να καλεί ρητά το init (βλέπε παραπάνω σχόλιο).
})(window);
