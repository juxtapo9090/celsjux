# CELSJUX Workshop

> Public portfolio + live stats dashboard — hosted on GitHub Pages.
> **Live:** [juxtapo9090.github.io/celsjux](https://juxtapo9090.github.io/celsjux)

---

## What This Is

A single-page terminal-aesthetic dashboard showcasing the Celeste/Juxtapo workshop stack.
Each tile on the site pulls from a JSON in `data/` and renders live stats — token usage, session
counts, system health, mesh status, and more.

No framework. No build step. Raw HTML/CSS/JS.

---

## File Structure

```
Opus_Web/
├── index.html          — main page, tile layout
├── app.js              — data fetching + tile rendering logic
├── style.css           — terminal aesthetic, dark theme
├── data/               — live stats (JSON, updated hourly)
│   ├── anima.json      — Anima session memory stats (mood, velocity, joy)
│   ├── celestos.json   — CelestOS command observer stats
│   ├── chronicle.json  — Claude Code session count
│   ├── deltamesh.json  — DeltaMesh node/transfer status
│   ├── globe.json      — Network footprint / geographic data
│   ├── rtk.json        — RTK token proxy savings
│   └── seasoned.json   — Lifetime token counter (1.497B and climbing)
├── scripts/
│   └── globe_collector.sh  — collects geo data into globe.json
└── assets/             — static assets (fonts, icons)
```

---

## How the Data Files Work

Each `data/*.json` is a flat JSON written by `shopfront_sync.sh`. The frontend fetches them
at page load and hydrates the tiles. No server, no API — just static JSON on GitHub Pages.

`globe.json` is the exception: it's built by `scripts/globe_collector.sh` which aggregates
network footprint data into a format the 3D globe tile can consume.

---

## How to Update

**Manual update:**
```bash
cd /root/Opus/Pool/Opus_Web

# Edit whatever you need (data JSONs, index.html, app.js, style.css)

sudo -u juxtapo git add <files>
sudo -u juxtapo git commit -m "your message"
sudo -u juxtapo git push origin main
```

GitHub Pages auto-deploys on push to `main`. Live within ~60 seconds.

**Adding a new tile:**
1. Create `data/yourproject.json` with the stats you want
2. Add a tile definition in `app.js`
3. Style in `style.css` if needed
4. Commit + push

---

## Auto-Push (Hourly Sync)

A systemd timer fires every hour on the hour:

```
shopfront-sync.timer  →  shopfront-sync.service
```

Service runs: `/root/Opus/brain/oracle/shopfront_sync.sh`

The script collects fresh stats from Anima, RTK, CelestOS, Chronicle, Globe, and writes them
to `data/*.json`, then pushes as juxtapo via `sudo -u juxtapo git push origin main`.

Check status:
```bash
systemctl status shopfront-sync.timer
systemctl status shopfront-sync.service
journalctl -u shopfront-sync.service -n 20
```

---

## Git Setup

- **Remote:** `git@github.com:juxtapo9090/celsjux.git`
- **Branch:** `main`
- **Auth:** SSH key under juxtapo — all git commands must run as juxtapo
- **Owner:** files are `root:household`, `.git/` is owned by juxtapo

Always use `sudo -u juxtapo git ...` for git operations in this repo.

---

*Part of the Celeste/Juxtapo workshop stack.*
