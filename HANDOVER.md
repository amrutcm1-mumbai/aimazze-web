# Handover — aimazze-web

_Last updated: 2026-08-24. Supersedes the 2026-08-20 revision, several of whose
claims were verified false today — see "Corrections" below before trusting
anything you remember from an earlier session. Every claim in this file was
re-checked against live state (git, disk, and https://aimazze.com) on the date
above; none of it is carried forward on memory._

Static-assets site (no `package.json`, no npm dependency tree) deployed as a
Cloudflare **Worker** via `wrangler.jsonc`, not Cloudflare Pages. `src/index.js`
runs on every request (`run_worker_first: true`), sets the `aimazze_region` /
`aimazze_compliance` cookies from `CF-IPCountry`, then defers to the `ASSETS`
binding. `.html` URLs 301 to extensionless paths (`/terms.html` → `/terms`), so
when diffing production against local files, follow redirects (`curl -sL`) or
you will compare against a redirect stub and see spurious differences.

## 🔴 Open production defect — the public download button 404s

**Verified live on 24 Aug 2026, both hosts. Real visitors hit this now.**

```
https://aimazze.com/downloads/AIMAZZE-Setup-0.1.31.msi          -> 404
https://www.aimazze.com/downloads/AIMAZZE-Setup-0.1.31.msi      -> 404
https://aimazze.com/downloads/AIMAZZE-Setup-0.1.30.msi          -> 404
https://aimazze.com/downloads/AIMAZZE-Setup-0.1.31-updater.exe  -> 404
```

The homepage hero button points at `/downloads/AIMAZZE-Setup-0.1.31.msi`
(`index.html:956`) and **nothing under `/downloads/` is being served at all** —
not the current version, not the previous one, not the updater.

What is *not* the cause, checked rather than assumed:

- The artifacts exist on disk: `downloads/AIMAZZE-Setup-0.1.31.msi`
  (10,760,192 bytes) and `-updater.exe` (8,166,813 bytes), both dated
  23 Aug 18:35 local — byte-sizes matching those recorded in `03a8092`.
- They were on disk **before** both of today's deploys (08:13 and 08:16 UTC),
  so this is not a "built after the last deploy" race.
- `.assetsignore` does not exclude `downloads/`, and `assets.directory` is `"."`.
- Every *other* asset from the same deploy is live and correct (see below), so
  the deploy itself succeeded.

Cause is therefore **not yet established** and this is the top open item. Note
this is the same class of failure `a7f31fd` fixed on 20 Aug ("0.1.31 was linked
while its MSI 404'd in production, so the hero download button led nowhere") —
it is back, and this time repointing the link will not help, since 0.1.30 404s
too. Worth checking Cloudflare Workers asset limits (file count / total bundle
size / per-file cap) against a `downloads/` folder holding ~143MB of installers.

## Current state (verified 24 Aug 2026)

- `main` is **fully pushed**. `git rev-list --left-right --count
  origin/main...HEAD` returns `0 0`. HEAD and `origin/main` are both
  `f3b4ed3c2382dc24e350f445b90db0a3355bd905`.
- Working tree is **clean** apart from this file, which is untracked. `*.md` is
  in `.assetsignore`, so this file never ships to production.
- **Production matches git HEAD.** All 10 site files (`index`, `terms`,
  `privacy-policy`, `refund-policy`, `security`, `shipping-policy`, `activate`,
  `join`, `chambers.css`, `brand-loader.js`) fetched from aimazze.com today are
  byte-identical to `git show HEAD:<file>`. Zero drift — *except* `downloads/`,
  which is gitignored and covered above.
- Last deployment: **24 Aug 2026 08:16:59 UTC** (today). Six deploys have
  landed since the 20 Aug revision was written: 21 Aug x2, 23 Aug x2, 24 Aug x2.

## Corrections to the 20 Aug revision

Recorded explicitly, because the 20 Aug revision itself existed to correct the
14 Aug revision, and the same failure mode recurred: point-in-time state written
down as standing fact, then read later as if still true.

1. **"`main` is fully pushed except one commit, `28081e8`."** False. `28081e8`
   was pushed, and five further commits landed and were pushed on top of it:
   `cbdb97e`, `a7f31fd`, `03a8092`, `e064931`, `f3b4ed3`. Nothing is unpushed.

2. **"Production == `9e90f92`; HEAD is exactly one commit ahead of
   production."** False. Production is now `f3b4ed3` — i.e. current HEAD —
   verified file-by-file today. The *conclusion* ("zero drift") happens to still
   hold, but the stated reason and the named commit were both wrong.

3. **"Last deployment 18 Aug 2026 05:11:33 UTC (10 deployments total)."** False
   on both halves. Latest is 24 Aug 08:16:59 UTC. And "10 total" was a
   misreading: `wrangler deployments list` returns a rolling window of the 10
   most recent, so it still reads 10 today. It is not a lifetime count and
   should not be used as one.

4. **"No favicon anywhere — not one of the 9 pages declares a `rel="icon"`."**
   False. Fixed in `e064931`, which added `favicon.ico`, `favicon-16x16.png`,
   `favicon-32x32.png`, `apple-touch-icon.png`, the two `android-chrome-*.png`
   sizes and `site.webmanifest`, and wired the five-line `<link>` block into all
   9 pages. Live: `/favicon.ico` returns 200, `/site.webmanifest` returns 200.
   ⚠️ **The same stale claim also lives in code**, as defect #3 of the comment
   block at the end of `chambers.css`. That block is otherwise still accurate;
   only #3 is closed. Left in place rather than silently edited — fixing it is a
   one-line deletion, flagged here so it is a decision rather than a surprise.

5. **"Brand system: overwrite the two files under `assets/brand/` … the mark
   doubles as the fill mask … placeholder SVG headers."** Stale. `cbdb97e`
   dropped the SVG placeholders and swapped in final raster assets; the folder
   now holds `logo-mark.png` and `logo-wordmark.png`, and `chambers.css:141-142`
   points `--brand-mark` / `--brand-wordmark` at the `.png` files. The swap
   point and the CSS-mask mechanic are unchanged and still correct.
   The "XML comment cannot contain two consecutive hyphens" gotcha **no longer
   applies to anything in this repo** — there are no SVGs left. Keep it only as
   history if the placeholders are ever revived.

## Closed since the 20 Aug revision

| Item | Evidence |
| --- | --- |
| Push `28081e8` (brand loading transition + top-left mark) | Pushed; ancestor of `origin/main` |
| Deploy the brand work | Live; `chambers.css` + `brand-loader.js` byte-identical to HEAD in production |
| Swap in final logo assets | `cbdb97e` — SVG placeholders dropped, PNGs in `assets/brand/` |
| Favicon (was defect #3 in `chambers.css`) | `e064931`; `/favicon.ico` returns 200 live |
| Homepage download link version | `a7f31fd` moved it to 0.1.30, then `03a8092` to 0.1.31 once signed artifacts existed. **Link is correct; the file it points at 404s — see top of file.** |
| Keep `scripts/` out of the deployed bundle | `f3b4ed3` — `scripts/**` added to `.assetsignore` |
| `diff_review.txt` anomaly in this repo | Confirmed absent from the working tree today. A copy reportedly remains in `aimazze-app`; unverified from here. |

## The deploy mechanism — re-verified 24 Aug, still true

- **There is no CI and no automation in this repo.** No `.github/`, no workflow
  files, no deploy script (no Makefile / `.sh` / `.ps1` / `.cmd`, no
  `package.json`), no scheduled job. Nothing deploys on its own.
- The one active git hook, `.git/hooks/pre-push`, is a **release-version
  consistency gate** that shells out to `aimazze-app/scripts/sync-release.mjs
  --check`. It blocks pushes on version mismatch and never deploys. It is
  untracked by git and will not survive a fresh clone.
- All deployments are CLI uploads attributed to a human account
  (`amrutcm1@gmail.com`, `Source: Unknown (deployment)`) — not Workers Builds.
- **Deploys come from the local working tree, not from git.** Established
  15 Aug: two deploys landed ~3 min and ~1 min after two local commits that had
  not been pushed, and the origin reflog shows no push that day. A git-connected
  build cannot deploy code origin does not have.

**The still-open gap**: `wrangler deploy` uploads whatever is on disk in
`assets.directory: "."` at that moment, and **nothing guards against deploying a
dirty tree** — no clean-tree check, no hook, no CI gate. Exposure is precisely:
*the next time a human runs `wrangler deploy` here, whatever is uncommitted
ships alongside whatever they intended.* Committing does not reduce this, since
the files are on disk either way. The inverse also bites — see the `downloads/`
404 above: gitignored content that only exists on disk is invisible to every
git-based check, so nothing catches it going missing.

## Known defects, flagged not fixed

Six logo/image sizing items are recorded in a comment block at the end of
`chambers.css`, next to the tokens they concern. Status re-verified today:

- **#1 HIGH — still open.** `.nav-brand` is `1.25rem` in `index.html:111` but
  `1.1rem` in each of privacy-policy / refund-policy / security /
  shipping-policy / terms (line 58-59 of each, own `<style>` block). Navigating
  home to any policy page visibly shrinks the wordmark; the adjacent
  `.brand-mark` is a single token and does not shrink, making the mismatch more
  obvious, not less.
- **#2 MEDIUM — still open.** `.top-banner-logo` (`index.html:83`) uses
  `clamp(1.3rem, 3.2vw, 2.4rem)` while `.nav-brand` sits at a fixed `1.25rem`,
  so the same wordmark appears twice on first paint at different scales.
- **#3 MEDIUM — CLOSED**, see correction 4. The comment text is now stale.
- **#4 MEDIUM — still open.** `professional-04.png` is 1168x896 (1.30:1) where
  the other four are square; all five render in the same 44px `object-fit:
  cover` circle, so -04 is framed noticeably tighter than its neighbours.
- **#5 LOW — still open.** `.avatar-badge.lg` (56px) is defined but used by no
  page. Confirmed today: zero HTML references. Dead size step.
- **#6 LOW — still open.** Confirmed today: **0 of 6** `<img>` tags on the site
  carry `width`/`height`, so nothing reserves layout space. Payloads under
  `assets/images/` remain 20-30x their render size; `banner-hero.png` is
  full-width and `loading="eager"`, the largest CLS contributor on the homepage.

Counterpart list for the desktop app lives in `aimazze-app/src/config/brand.ts`
(`ASSET_DEFECTS`) — `logo-square-dark.png` being a JPEG with a `.png` extension,
the two "horizontal" lockups differing 2.82:1 vs 1.50:1, no light-theme mark,
~3.3MB of unreferenced duplicates in `src/assets/`. **Not verified from this
repo** — treat as a pointer, not as fact, until checked in `aimazze-app`.

## Brand system

Single swap point for the logo assets: `--brand-mark` and `--brand-wordmark` at
`chambers.css:141-142`, currently pointing at `logo-mark.png` /
`logo-wordmark.png`. Overwrite those two files and no code changes are needed.
The mark doubles as the fill mask (CSS masks read alpha), so a multi-colour
asset needs no companion silhouette. Favicons are **not** part of this swap:
they are generated from `assets/brand/logo-mark.png` by
`scripts/build-favicons.py` and must be regenerated separately if the mark
changes (`scripts/` is excluded from the deployed bundle by `.assetsignore`).

Transition timing is deliberately identical to `BRAND_TRANSITION` in
`aimazze-app/src/config/brand.ts`; that file is the source of truth, and
`brand-loader.js` plus the `:root` block in `chambers.css` mirror it. Change all
three together.

## Next steps

- [ ] **Fix the `/downloads/` 404.** Highest priority — the primary conversion
      path on the homepage is dead. Establish the cause before repointing
      anything; the link is already correct.
- [ ] Consider a post-deploy smoke check that fetches the live download URL.
      Every git-based safeguard is blind to `downloads/` by design.
- [ ] Close or delete defect #3 in the `chambers.css` comment block (favicon —
      now shipped).
- [ ] Consider closing the dirty-tree deploy gap (clean-tree check before
      `wrangler deploy`). Not urgent; nothing deploys automatically.
- [ ] Defect #1 (wordmark 1.25rem vs 1.1rem) is the highest-impact cosmetic
      item and is a five-line change across five files.
- [ ] Resolve the `diff_review.txt` anomaly reportedly still in `aimazze-app`.
