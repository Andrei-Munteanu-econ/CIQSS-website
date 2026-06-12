# CIQSS – UQAM landing page

Bilingual (FR/EN) landing page for **ciqss.uqam.ca**, the UQAM-INRS branch of the
Centre interuniversitaire québécois de statistiques sociales (CIQSS / QICSS). It is a
single self-contained WordPress **Custom HTML** block, styled to match the official
[ciqss.org](https://www.ciqss.org/) (Roboto, CIQSS blue `#234470` + orange `#F4911D`)
with a UQAM campus-banner hero.

## Deliverables — `output/wordpress/`

| File | Purpose |
|------|---------|
| `ciqss-uqam-landing.html` | **Master.** Holds `__LOGO_URL__`, `__BANNER_URL__`, `__REPORT_2025_URL__`, `__REPORT_2024_URL__` placeholders. Edit this one. |
| `ciqss-uqam-landing-FINAL.html` | Generated from the master with the **live WordPress media URLs**. This is the block to paste into WordPress. |
| `preview.html` | Generated from the master with **local asset paths** — open in a browser to preview offline. |

`FINAL` and `preview` are produced from the master by simple find-and-replace of the four
placeholders; never hand-edit them — edit the master and regenerate.

## Features

- **Language toggle** (FR / EN) in the hero — `ciqssLang()`.
- **Year tabs** in the *Recherche / Research* section — `ciqssYear()`. Tabs switch the
  lab stat cards and the activity-report PDF download, defaulting to the most recent year (2025).
- **Publications recension** — one cumulative, grouped list (2020–2025), collapsible by type.
- Contact card with map, opening hours, datasets/access links, and a social/newsletter band.

## Source material (repo root)

- `UQAM_CIQSS_2025.pdf`, `UQAM_CIQSS_2024.pdf` — annual activity reports (stats + publications).
- `WEB_Landing page Web (Universités partenaires).docx` — original content brief.
- `site_*.html`, `uqam_main.css`, `uqam_logo.svg` — reference scrapes/assets used for styling.

## Deploying an update

1. Edit `output/wordpress/ciqss-uqam-landing.html`.
2. Regenerate `FINAL` (live URLs) and `preview` (local paths) from it.
3. In WordPress: upload any new PDFs to Media, paste `FINAL` into the homepage Custom HTML
   block, then **Purge All** (the site runs LiteSpeed cache).
