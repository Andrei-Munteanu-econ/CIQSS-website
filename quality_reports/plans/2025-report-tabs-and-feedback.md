# Plan — 2025 report, year-tabbed stats, director feedback, git push

**Date:** 2026-06-12

## Context
The CIQSS–UQAM landing page (block pasted into ciqss.uqam.ca) currently shows a single
2024 "Recherche" stats block + a cumulative Publications recension. The director (Catherine
Blanchard Gougeon's report) added the **2025** activity report and gave feedback:
remove the (suspended) scholarship mention, and fix several broken hyperlinks. We also push
the project to GitHub.

## Source of 2025 numbers (UQAM_CIQSS_2025.pdf)
- Lab (UQAM-INRS) totals: **48 projets / 85 personnes**.
- UQAM community: **34 projets / 51 personnes**.
- Institutional usage: UQAM **54 %**, INRS **22 %**.
- New publications (13): 2 articles, 3 mémoires (2 new), 1 thèse de doctorat (new group),
  5 documents de travail, 2 rapports de recherche.

## Changes (master `output/wordpress/ciqss-uqam-landing.html`, FR + EN)
1. **Year tabs** in "Recherche": buttons 2025 (default/active) + 2024. Tabs switch the
   stat cards + subtext + the PDF download button only (`ciqssYear()` JS).
2. **One cumulative Publications list** stays below the tabs; merge 13 new 2025 entries
   into the existing groups, bump counts (Articles 20, Mémoires 7, Documents 23), add a new
   **Thèses de doctorat (1)** group.
3. Two report placeholders: `__REPORT_2025_URL__`, `__REPORT_2024_URL__`.
4. **Remove scholarship**: delete the "Programme de bourses" / "Scholarships" card; drop
   "et de bourses" / "and scholarship" from the About paragraph.
5. **Fix links** (FR / EN):
   - Access button → `ciqss.org/acces-aux-donnees/` · `ciqss.org/en/access-to-data/`
   - Midis-webinaires → `ciqss.org/evenements/midis-webinaires/` · `.../en/events/brownbag-webinars/`
   - Formations (École + Ateliers both) → `ciqss.org/evenements/formations/` · `.../en/events/training/`
   - Newsletter (domain `umontreal`→`ciqss`, and the two ids were swapped): FR id `4874df9329`, EN id `61fa12a024`
   - X (Twitter) → **Bluesky** `https://bsky.app/profile/ciqss-qicss.bsky.social`

## Build & deliverables
- Master holds placeholders. Generate `ciqss-uqam-landing-FINAL.html` (live WP URLs) and
  `preview.html` (local asset paths) via string replacement.
- Delete stale `ciqss-uqam-landing-READY-TO-PASTE.html`.
- Copy `UQAM_CIQSS_2025.pdf` into `output/wordpress/` (done).

## Git
- `git init`, `.gitignore` (ignore `.claude/settings.local.json`), `README.md`, commit,
  `git remote add origin https://github.com/Andrei-Munteanu-econ/CIQSS-website.git`.
- User runs `! gh auth login`; then `git push -u origin main`.

## Verify
- No `__…__` placeholder left in FINAL/preview; details counts match (20/1/7/1/23).
- Tabs default to 2025; clicking 2024 swaps stats + PDF. Language toggle still works.
- All updated hrefs resolve to the director-supplied URLs.
