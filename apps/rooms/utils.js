// apps/rooms/utils.js
const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

module.exports = {
  nowIso,
  randomId,
};
