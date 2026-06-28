(function () {
  function qs(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function setStatus(message, kind) {
    var el = document.getElementById("repEditorStatus");
    if (!el) return;
    el.textContent = message;
    el.className = "rep-editor-status" + (kind ? " " + kind : "");
  }

  function getAssetId() {
    var id = Number(qs("assetId"));
    if (!Number.isFinite(id) || id <= 0) throw new Error("Λείπει το assetId.");
    return Math.floor(id);
  }

  function getScore() {
    var app = window.repSmoosicApplication || null;
    var instance = window.Smo && window.Smo.SuiApplication ? window.Smo.SuiApplication.instance : null;
    var view = (app && app.view) || (instance && instance.view);
    var score = view && (view.storeScore || view.score);
    if (!score) throw new Error("Δεν βρέθηκε ενεργή παρτιτούρα για εξαγωγή.");
    return score;
  }

  function exportMusicXml() {
    if (!window.Smo || !window.Smo.SmoToXml) {
      throw new Error("Ο exporter MusicXML δεν είναι διαθέσιμος.");
    }
    var dom = window.Smo.SmoToXml.convert(getScore());
    return new XMLSerializer().serializeToString(dom);
  }

  async function loadAssetScore(assetId) {
    var res = await fetch("/api/assets/" + encodeURIComponent(assetId) + "/score-content", {
      cache: "no-store",
      credentials: "same-origin",
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok) throw new Error((data && data.message) || "Αποτυχία φόρτωσης παρτιτούρας.");
    return data;
  }

  async function saveAssetScore(assetId) {
    var saveBtn = document.getElementById("repSaveBtn");
    if (saveBtn) saveBtn.disabled = true;
    setStatus("Αποθήκευση...", "");
    try {
      var xml = exportMusicXml();
      var res = await fetch("/api/assets/" + encodeURIComponent(assetId) + "/score-content", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml: xml }),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok) throw new Error((data && data.message) || "Αποτυχία αποθήκευσης.");
      setStatus("Αποθηκεύτηκε. Δημιουργήθηκε backup.", "ok");
      window.repLastSavedAt = Date.now();
    } catch (error) {
      setStatus(error && error.message ? error.message : "Σφάλμα αποθήκευσης.", "error");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function boot() {
    try {
      var assetId = getAssetId();
      var saveBtn = document.getElementById("repSaveBtn");
      var reloadBtn = document.getElementById("repReloadBtn");
      if (saveBtn) saveBtn.addEventListener("click", function () { void saveAssetScore(assetId); });
      if (reloadBtn) reloadBtn.addEventListener("click", function () { window.location.reload(); });

      setStatus("Φόρτωση MusicXML...", "");
      var data = await loadAssetScore(assetId);
      document.getElementById("repAssetTitle").textContent = data.title || "Παρτιτούρα #" + assetId;
      document.getElementById("repAssetMeta").textContent = (data.sourceFormat || "MusicXML") + " · " + (data.filePath || "");

      setStatus("Άνοιγμα editor...", "");
      var app = await window.Smo.SuiApplication.configure({
        mode: "application",
        domContainer: "smoo",
        language: "en",
        initialScore: data.xml,
      });
      window.repSmoosicApplication = app;
      if (saveBtn) saveBtn.disabled = false;
      setStatus("Έτοιμο για επεξεργασία.", "ok");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Αποτυχία εκκίνησης editor.", "error");
      var root = document.getElementById("smoo");
      if (root) {
        root.innerHTML =
          '<div style="padding:18px;color:#111;font-family:system-ui,sans-serif">' +
          '<h2>Δεν άνοιξε ο επεξεργαστής</h2>' +
          '<p>' + String(error && error.message ? error.message : error).replace(/[<>&]/g, "") + '</p>' +
          '</div>';
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    void boot();
  });
})();
