#!/usr/bin/env node
// Post-deploy smoke check for downloads/-class content.
//
// Why this exists: downloads/ is gitignored (see .gitignore), so nothing about
// it is visible to any git-based check -- a clean `git status` says nothing
// about whether the installers made it into the deployed asset manifest. On
// 2026-08-24 every file under /downloads/ 404d in production while every other
// asset served fine and the working tree was clean. The only way to know is to
// ask the live origin, which is what this does.
//
//   node scripts/smoke-downloads.mjs
//
// Two tiers, because the installers are ~10MB each and there are 16 of them:
//   * every file in downloads/ gets a HEAD -- must return 200. This is what
//     actually catches the whole-directory-missing failure mode.
//   * every file referenced by a /downloads/... link in index.html gets a full
//     GET with a byte count compared against disk. These are the ones a real
//     user hits, so they get real verification, not just a status code.
//
// Note: Cloudflare's asset responses omit Content-Length on HEAD and ignore
// Range (a ranged request returns the entire body), so a full GET is the only
// way to confirm byte count. Hence the two tiers rather than one.
//
// Exits non-zero on any failure, so it can gate a deploy script.

import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOWNLOADS_DIR = path.join(ROOT, "downloads");

const HOSTS = ["aimazze.com", "www.aimazze.com"];

const failures = [];
const fail = (msg) => {
  console.log(`FAIL  ${msg}`);
  failures.push(msg);
};
const ok = (msg) => console.log(`ok    ${msg}`);

// --- what is on disk ---------------------------------------------------------

const entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();

if (files.length === 0) {
  console.error(
    "FAIL  downloads/ is empty on disk. A fresh clone starts this way because\n" +
      "      downloads/ is gitignored -- rebuild or copy the installers in before\n" +
      "      deploying, or the public download links will 404."
  );
  process.exit(1);
}

const sizeOnDisk = new Map();
for (const f of files) {
  sizeOnDisk.set(f, (await stat(path.join(DOWNLOADS_DIR, f))).size);
}

// --- what the homepage actually links ---------------------------------------

const html = await readFile(path.join(ROOT, "index.html"), "utf8");
const linked = [
  ...new Set(
    [...html.matchAll(/\/downloads\/([A-Za-z0-9._-]+)/g)].map((m) => m[1])
  ),
].sort();

if (linked.length === 0) {
  fail("index.html contains no /downloads/ link -- the download CTA is gone?");
}
for (const f of linked) {
  if (!sizeOnDisk.has(f)) {
    fail(`index.html links /downloads/${f} but that file is not on disk`);
  }
}

// --- tier 1: every file must return 200 on every host ------------------------

console.log(`\n== status check: ${files.length} file(s) x ${HOSTS.length} host(s) ==`);
for (const host of HOSTS) {
  for (const f of files) {
    const url = `https://${host}/downloads/${f}`;
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (res.status !== 200) fail(`${url} -- HTTP ${res.status}, expected 200`);
      else ok(`${url} -- 200`);
    } catch (err) {
      fail(`${url} -- request failed: ${err.message}`);
    }
  }
}

// --- tier 2: byte-exact check on the linked release ---------------------------

console.log(`\n== byte check: ${linked.length} linked file(s) x ${HOSTS.length} host(s) ==`);
for (const host of HOSTS) {
  for (const f of linked) {
    const url = `https://${host}/downloads/${f}`;
    const want = sizeOnDisk.get(f);
    if (want === undefined) continue; // already reported above
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.status !== 200) {
        fail(`${url} -- HTTP ${res.status}, expected 200`);
        continue;
      }
      const got = (await res.arrayBuffer()).byteLength;
      if (got !== want) fail(`${url} -- served ${got} bytes, on disk ${want}`);
      else ok(`${url} -- 200, ${got} bytes (matches disk)`);
    } catch (err) {
      fail(`${url} -- request failed: ${err.message}`);
    }
  }
}

console.log();
if (failures.length > 0) {
  console.error(
    `${failures.length} check(s) FAILED -- downloads/ is not correctly deployed.`
  );
  process.exit(1);
}
console.log("All downloads/ checks passed.");
