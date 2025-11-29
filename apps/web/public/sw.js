// public/sw.js

self.addEventListener("install", (event) => {
  // Προαιρετικά: caching κ.λπ.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Για να ελέγξει άμεσα όλες τις καρτέλες
  event.waitUntil(self.clients.claim());
});

// Προαιρετικά, για απλό offline fallback:
// self.addEventListener("fetch", (event) => {
//   // Προς το παρόν δεν κάνουμε κάτι ιδιαίτερο
// });
