#!/usr/bin/env node
/* boot_check.js - the check the handover asks for.
 * `node --check` is not enough: two builds shipped broken because a syntax
 * check passes on code that throws at startup. This boots the real script out
 * of index.html against a fake DOM, localStorage and Image, with no
 * indexedDB, then asserts the cover-fallback and bulk-selection behaviour and
 * the invariant that BUILD and both sw.js cache names moved together.
 *   node boot_check.js      # 0 pass, 1 failure, 2 threw
 * NOTE: this file and .boot_prelude.js / .boot_tests.js are DEV ONLY. They are
 * not in the deploy zip, so unzipping a bundle over this folder deletes them.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HERE = __dirname;
const html = fs.readFileSync(path.join(HERE, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(HERE, "sw.js"), "utf8");

const blocks = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) blocks.push(m[1]);
if (!blocks.length) { console.error("no inline <script> found in index.html"); process.exit(2); }
console.log("index.html: " + html.length + " bytes, " + blocks.length + " inline script block(s)");

const shell = (sw.match(/SHELL\s*=\s*"([^"]+)"/) || [])[1] || "";
const imgs  = (sw.match(/IMGS\s*=\s*"([^"]+)"/) || [])[1] || "";
console.log("sw.js: SHELL=" + shell + "  IMGS=" + imgs);

for (const f of [".boot_prelude.js", ".boot_tests.js"]) {
  if (!fs.existsSync(path.join(HERE, f))) {
    console.error("missing " + f + " - the dev harness files are not in the deploy zip;");
    console.error("restore them from the session that wrote boot_check.js.");
    process.exit(2);
  }
}
const PRELUDE = fs.readFileSync(path.join(HERE, ".boot_prelude.js"), "utf8");
const TESTS   = fs.readFileSync(path.join(HERE, ".boot_tests.js"), "utf8");
const out = path.join(os.tmpdir(), "longbox_boot_" + process.pid + ".js");
fs.writeFileSync(out, PRELUDE + "\n;\n" + blocks.join("\n;\n") + "\n;\n" + TESTS);

const r = spawnSync(process.execPath, [out], {
  stdio: "inherit",
  env: Object.assign({}, process.env, { LB_SW_SHELL: shell, LB_SW_IMGS: imgs,
    LB_HTML: path.join(HERE, "index.html") }),
});
try { fs.unlinkSync(out); } catch (e) {}
process.exit(r.status === null ? 2 : r.status);
