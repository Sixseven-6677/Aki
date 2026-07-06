/**
 * patch-fca.js — يُشغَّل بعد npm install (postinstall)
 * يضمن أن Djamel-FCA مثبّت وصالح للتشغيل.
 */
const fs   = require("fs");
const path = require("path");

const fcaIndex = path.resolve(__dirname, "../fca/index.js");

if (!fs.existsSync(fcaIndex)) {
  console.warn("[patch-fca] WARNING: fca/index.js not found. Copy Djamel-FCA into the fca/ directory.");
} else {
  console.log("[patch-fca] OK: Djamel-FCA found at", fcaIndex);
}
