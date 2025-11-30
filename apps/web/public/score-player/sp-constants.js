(function (w) {
  const NS = w.RepScore = w.RepScore || {};

  NS.consts = {
    HIGHLIGHT_MS_WINDOW: 10,    // 8–15 αν «χάνει» πρώτες νότες
    X_TOL: 18,                  // px ανοχή «ίδιος χρόνος» στο x
    TRANSPOSE_MIN: -6,
    TRANSPOSE_MAX: +6,

    STAFF_COLORS: { '1':'#000000ff' },

    VOICE_PALETTE: [
      '#000000ff'
    ]
  };
})(window);
