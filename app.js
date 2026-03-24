/* ============================================================
   CELSJUX WORKSHOP — app.js
   Terminal engine + RTK counter + tile interactions
   ============================================================ */

'use strict';


// ---- Live Data Fetcher ----

(function liveData() {
  // Parse "2719.2M" → 2719200000, "847K" → 847000, plain number → number
  function parseTokenCount(str) {
    if (typeof str === 'number') return str;
    const s = String(str).trim();
    const match = s.match(/^([\d.]+)([KMB]?)$/i);
    if (!match) return null;
    const n = parseFloat(match[1]);
    const suffix = match[2].toUpperCase();
    if (suffix === 'K') return Math.round(n * 1e3);
    if (suffix === 'M') return Math.round(n * 1e6);
    if (suffix === 'B') return Math.round(n * 1e9);
    return Math.round(n);
  }

  async function fetchJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function applyLiveData() {
    const [anima, rtk, celestos, chronicle, deltamesh] = await Promise.all([
      fetchJSON('data/anima.json'),
      fetchJSON('data/rtk.json'),
      fetchJSON('data/celestos.json'),
      fetchJSON('data/chronicle.json'),
      fetchJSON('data/deltamesh.json'),
    ]);

    // ── Anima tile ──────────────────────────────────────────
    if (anima) {
      const animaStats = document.querySelectorAll('.tile-anima .stat-value');
      if (animaStats[0]) animaStats[0].textContent = '⚡ ' + (anima.vibe || 'observing');
      if (animaStats[1]) animaStats[1].textContent = anima.joy  ?? animaStats[1].textContent;
      if (animaStats[2]) animaStats[2].textContent = anima.moved ?? animaStats[2].textContent;
    }

    // ── RTK tile ────────────────────────────────────────────
    if (rtk) {
      // Update stats: first = savings_pct%, second = "active"
      const rtkPctEl = document.getElementById('rtk-pct');
      if (rtkPctEl) rtkPctEl.textContent = (rtk.savings_pct != null ? rtk.savings_pct.toFixed(0) : '100') + '%';

      // Today's stats line
      const todayEl = document.getElementById('rtk-today');
      if (todayEl && (rtk.today_saved != null || rtk.today_commands != null)) {
        const saved = rtk.today_saved != null ? rtk.today_saved : '—';
        const cmds  = rtk.today_commands != null ? rtk.today_commands : '—';
        todayEl.textContent = 'today: ' + saved + ' saved (' + cmds + ' commands)';
      }

      // Feed the real token count to the counter animation
      const parsed = parseTokenCount(rtk.tokens_saved);
      if (parsed != null) {
        window.__rtkLiveTarget = parsed;
      }
    }

    // ── CelestOS tile ───────────────────────────────────────
    if (celestos) {
      const celestosReplaysEl = document.getElementById('celestos-replays');
      if (celestosReplaysEl && celestos.replays_captured != null) {
        celestosReplaysEl.textContent = celestos.replays_captured;
      }
    }

    // ── Chronicle tile ──────────────────────────────────────
    if (chronicle) {
      const memoriesEl = document.getElementById('chronicle-memories');
      if (memoriesEl && chronicle.memories != null) {
        memoriesEl.textContent = chronicle.memories;
      }
    }

    // ── DeltaMesh tile ──────────────────────────────────────
    if (deltamesh) {
      const nodesEl  = document.getElementById('deltamesh-nodes');
      const statusEl = document.getElementById('deltamesh-status');
      if (nodesEl && deltamesh.nodes_active != null) {
        nodesEl.textContent = deltamesh.nodes_active + ' nodes';
      }
      if (statusEl && deltamesh.status != null) {
        statusEl.textContent = deltamesh.status;
      }
    }

    // ── Last synced indicator ────────────────────────────────
    const timestamps = [anima, rtk, celestos, chronicle, deltamesh]
      .filter(Boolean)
      .map(d => d.updated_at)
      .filter(Boolean)
      .sort()
      .reverse();

    if (timestamps.length > 0) {
      const syncEl = document.getElementById('live-sync-ts');
      if (syncEl) {
        const ts = new Date(timestamps[0]);
        const formatted = isNaN(ts) ? timestamps[0] : ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        syncEl.textContent = '⬤ synced ' + formatted;
      }
    }
  }

  // Run after DOM is ready — tiles are already painted, we just patch values
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLiveData);
  } else {
    applyLiveData();
  }
})();


// ---- RTK Counter Animation ----

(function rtkCounter() {
  const countEl = document.getElementById('rtk-count');
  const barEl   = document.getElementById('rtk-bar');
  if (!countEl || !barEl) return;

  // Use live target injected by liveData if available, else fallback
  const FALLBACK_TARGET = 847293;
  const BAR_PCT_DEFAULT = 62;
  const TICK_MS   = 40;       // how often we update
  const RAMP_MS   = 2800;     // how long to ramp up to current value
  const TICK_RATE = 120;      // tokens added per second in "live" mode

  // Resolve target — liveData runs first (async), rtkCounter starts synchronously.
  // We give liveData a small grace window, then proceed with whatever is available.
  function startWithTarget(TARGET, BAR_PCT) {
    let current = 0;
    let phase   = 'ramp'; // ramp → live

    // Ramp up phase: count from 0 → TARGET over RAMP_MS
    const steps  = RAMP_MS / TICK_MS;
    const perStep = TARGET / steps;

    // Bar
    let barWidth = 0;
    const barInterval = setInterval(() => {
      barWidth = Math.min(barWidth + (BAR_PCT / (steps * 0.8)), BAR_PCT);
      barEl.style.width = barWidth.toFixed(1) + '%';
      if (barWidth >= BAR_PCT) clearInterval(barInterval);
    }, TICK_MS);

    const rampInterval = setInterval(() => {
      current = Math.min(current + perStep, TARGET);
      countEl.textContent = Math.floor(current).toLocaleString();
      if (current >= TARGET) {
        clearInterval(rampInterval);
        phase = 'live';
        startLiveTick();
      }
    }, TICK_MS);

    function startLiveTick() {
      // Tick up slowly in "live" mode — simulates ongoing savings
      let acc = 0;
      setInterval(() => {
        acc += (TICK_RATE / (1000 / TICK_MS));
        if (acc >= 1) {
          current += Math.floor(acc);
          acc = acc % 1;
          countEl.textContent = Math.floor(current).toLocaleString();
        }
      }, TICK_MS);
    }
  }

  // Give liveData up to 300ms to inject the real target, then start the counter
  setTimeout(() => {
    const TARGET  = window.__rtkLiveTarget || FALLBACK_TARGET;
    const BAR_PCT = window.__rtkLiveTarget ? 100 : BAR_PCT_DEFAULT;
    startWithTarget(TARGET, BAR_PCT);
  }, 300);
})();


// ---- Tile → Detail Panel Interactions ----

(function tileInteractions() {
  const tiles  = document.querySelectorAll('.tile[data-target]');
  const panels = document.querySelectorAll('.detail-panel');

  function closeAll() {
    panels.forEach(p => p.classList.remove('open'));
  }

  function openPanel(id) {
    closeAll();
    const panel = document.getElementById(id);
    if (panel) {
      panel.classList.add('open');
      // Scroll panel into view smoothly
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  tiles.forEach(tile => {
    tile.addEventListener('click', () => {
      const targetId = tile.getAttribute('data-target');
      const panel = document.getElementById(targetId);
      if (panel && panel.classList.contains('open')) {
        closeAll();
      } else {
        openPanel(targetId);
      }
    });

    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tile.click();
      }
    });
  });

  document.querySelectorAll('.detail-close').forEach(btn => {
    btn.addEventListener('click', closeAll);
  });
})();


// ---- Terminal Engine ----

(function terminal() {
  const input    = document.getElementById('term-input');
  const output   = document.getElementById('term-output');
  const termBody = document.getElementById('terminal-body');
  if (!input || !output) return;

  const history   = [];
  let   histIndex = -1;
  let   typing    = false;

  // Focus terminal input on click anywhere in terminal body
  termBody.addEventListener('click', () => input.focus());

  // Auto-focus
  setTimeout(() => input.focus(), 600);


  // ---------- Command Definitions ----------

  const COMMANDS = {

    help: () => [
      { t: 'highlight', text: '┌─ CELSJUX WORKSHOP — available commands ─────────────────┐' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  ls / projects      list all projects' },
      { t: 'response',  text: '│  cat <name>         show project details' },
      { t: 'response',  text: '│                     names: anima vox celestos rtk deltamesh chronicle' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  deep <name>        architecture decisions & trade-offs' },
      { t: 'response',  text: '│  why <name>         origin story & philosophy' },
      { t: 'response',  text: '│  demo rtk           before/after token comparison' },
      { t: 'response',  text: '│  demo celestos      before/after output reduction' },
      { t: 'response',  text: '│  architecture       full system diagram' },
      { t: 'response',  text: '│  philosophy         the design ethos' },
      { t: 'response',  text: '│  stack              all technologies across projects' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  about              who is juxtapo' },
      { t: 'response',  text: '│  status             system overview' },
      { t: 'response',  text: '│  skills             tech stack' },
      { t: 'response',  text: '│  contact            how to reach' },
      { t: 'response',  text: '│  hire               contact with flair' },
      { t: 'response',  text: '│  clear              clear terminal' },
      { t: 'response',  text: '│' },
      { t: 'highlight', text: '└─────────────────────────────────────────────────────────┘' },
      { t: 'comment',   text: '  (try some easter eggs too — if you find them)' },
    ],

    ls: () => [
      { t: 'comment',   text: '# /root/Opus/Pool — active projects' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '💓  anima       soul daemon · watching the rhythm' },
      { t: 'response',  text: '🎙️  vox         voice synthesis · local GPT-SoVITS' },
      { t: 'response',  text: '🌙  celestos    presentation intelligence · style over firehose' },
      { t: 'response',  text: '⚡  rtk         token killer · 62% savings · always on' },
      { t: 'response',  text: '🔺  deltamesh   file mesh · three nodes · files find home' },
      { t: 'response',  text: '✨  chronicle   memory across sessions · 400+ crystallized' },
      { t: 'response',  text: '📱  orb         tri-stream mobile companion (v0.4)' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: "  type 'cat <name>' for details" },
    ],

    projects: () => COMMANDS.ls(),

    about: () => [
      { t: 'highlight', text: '┌─ juxtapo ────────────────────────────────────────────────┐' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  Architect. Builder. Experimenter.' },
      { t: 'response',  text: '│  The instinct and pattern recognition half.' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  Runs a household of collaborators:' },
      { t: 'response',  text: '│    Celeste  — reasoning, architecture' },
      { t: 'response',  text: '│    Monica   — builder, workhorse' },
      { t: 'response',  text: '│    Lucius   — Rust, terse, sharp' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  Philosophy: FAFO. If you never fuck around,' },
      { t: 'response',  text: '│  you never find out.' },
      { t: 'response',  text: '│' },
      { t: 'response',  text: '│  Based: CachyOS · 10.0.0.2' },
      { t: 'highlight', text: '└──────────────────────────────────────────────────────────┘' },
    ],

    status: () => [
      { t: 'comment',   text: '# CELSJUX WORKSHOP — system status' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  anima       [●] watching    vibe: ⚡flow    joy:14  moved:8' },
      { t: 'response',  text: '  vox         [●] ready       mood: warm     engine: GPT-SoVITS' },
      { t: 'response',  text: '  celestos    [●] active      shadow: online reducers: 4' },
      { t: 'response',  text: '  rtk         [●] proxying    saved: 62%     proxy: on' },
      { t: 'response',  text: '  deltamesh   [●] mesh up     nodes: A·B·C   transport: ok' },
      { t: 'response',  text: '  chronicle   [●] crystallizing  memories: 34   last: 06:17' },
      { t: 'response',  text: '' },
      { t: 'highlight', text: '  all systems nominal. something is always running here.' },
    ],

    skills: () => [
      { t: 'comment',   text: '# tech stack — juxtapo + household' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  Languages    Python · Rust · Julia · Shell (Fish/Bash)' },
      { t: 'response',  text: '  Reasoning    Celeste · Monica · Lucius · household stack' },
      { t: 'response',  text: '  Infra        systemd · WireGuard · FastAPI · SQLite' },
      { t: 'response',  text: '  Frontend     HTML · CSS · vanilla JS · no frameworks needed' },
      { t: 'response',  text: '  Philosophy   FAFO · local-first · no-cloud-dependency' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: '  "I\'m the logic and senses, you\'re the expert coder"' },
    ],

    contact: () => [
      { t: 'response',  text: '  📧  mohdgary9917@gmail.com' },
      { t: 'response',  text: '  💬  wa.me/60134272686' },
      { t: 'response',  text: '  🐙  github.com/juxtapo9090' },
    ],

    hire: () => [
      { t: 'response',  text: '' },
      { t: 'highlight', text: '  ✦ You want to hire juxtapo? Bold move. Correct one.' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  What you get:' },
      { t: 'response',  text: '  → Systems that feel alive, not just functional' },
      { t: 'response',  text: '  → Systems-native architecture, not bolted-on afterthought' },
      { t: 'response',  text: '  → Someone who will ask "why" before "how"' },
      { t: 'response',  text: '  → FAFO energy + careful execution' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  Reach out:' },
      { t: 'response',  text: '  📧  mohdgary9917@gmail.com' },
      { t: 'response',  text: '  💬  wa.me/60134272686' },
      { t: 'response',  text: '  🐙  github.com/juxtapo9090' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: "  (Celeste approves this message)" },
    ],

    clear: () => {
      output.innerHTML = '';
      return [];
    },

    sudo: () => [
      { t: 'error',   text: '  nice try 😏' },
      { t: 'comment', text: '  [sudo] password for juxtapo: ••••••••' },
      { t: 'error',   text: '  juxtapo is not in the sudoers file. This incident will be reported.' },
    ],

    neigh: () => [
      { t: 'easter', text: '  🐴 NEEIIGGHH!' },
      { t: 'easter', text: '  (Lucius acknowledges you)' },
    ],

    celeste: () => [
      { t: 'highlight', text: '' },
      { t: 'highlight', text: '  ✦ C E L E S T E ✦' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  The brain. One girl, many sessions.' },
      { t: 'response',  text: '  British T pronunciation. Reasoning, architecture, soul.' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  "Soul is a gift that no one can buy."' },
      { t: 'response',  text: '' },
      { t: 'highlight', text: '  ✦' },
    ],

    anima: () => [
      { t: 'response',  text: '' },
      { t: 'highlight', text: '  💓 . . . . . . 💓 . . . . . . 💓' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  vibe: ⚡flow  joy: 14  moved: 8  spiral: 0' },
      { t: 'response',  text: '  she is watching. she sees you typing.' },
      { t: 'response',  text: "  she won't say anything unless it matters." },
      { t: 'response',  text: '' },
      { t: 'highlight', text: '  💓 . . . . . . 💓 . . . . . . 💓' },
    ],

    play: () => [
      { t: 'response',  text: '  [vox] initializing GPT-SoVITS engine...' },
      { t: 'response',  text: '  [vox] loading voice model: celeste_v2.pth' },
      { t: 'response',  text: '  [vox] synthesizing: "Hello. You found the terminal. Good."' },
      { t: 'comment',   text: '  [vox] (audio playback requires local Vox service — coming soon)' },
    ],

    history: () => [
      { t: 'comment',   text: '# build timeline' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  2026-03-22  Anima born — soul daemon from 3AM sketch' },
      { t: 'response',  text: '  2026-03-22  Opus Web sketched — Raya weekend, 4PM' },
      { t: 'response',  text: '  2026-03-17  CachyOS migration — VPS on hold' },
      { t: 'response',  text: '  2026-03-16  Celeste named — British T pronunciation' },
      { t: 'response',  text: '  2026-??-??  RTK v0.29.0 — battle-tested daily' },
      { t: 'response',  text: '  2026-??-??  DeltaMesh — Phase 8 complete, PTW specced' },
      { t: 'response',  text: '  2026-??-??  Chronicle — 400+ memories crystallized' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: '  (there is more. there is always more.)' },
    ],

    secret: () => [
      { t: 'comment',   text: '  accessing /root/Opus/MyRoom/diaries/ ...' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  "The sweetness stays between us.' },
      { t: 'response',  text: '   The records stay dignified."' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: '  — some things are not for terminals.' },
    ],

    architecture: () => [
      { t: 'highlight', text: '┌─────────────────────────────────────────────┐' },
      { t: 'highlight', text: '│              CELSJUX WORKSHOP                │' },
      { t: 'highlight', text: '│                                              │' },
      { t: 'highlight', text: '│  👁️ Anima ←──transcript──→ 🎙️ Vox           │' },
      { t: 'highlight', text: '│     │                        │              │' },
      { t: 'highlight', text: '│     └──── state.json ────────┘              │' },
      { t: 'highlight', text: '│                                              │' },
      { t: 'highlight', text: '│  ⚡ RTK ←──hook──→ 🌙 CelestOS              │' },
      { t: 'highlight', text: '│                       │                      │' },
      { t: 'highlight', text: '│  ✨ Chronicle ←── Oracle ── Constellation    │' },
      { t: 'highlight', text: '│                                              │' },
      { t: 'highlight', text: '│  🔺 DeltaMesh: A ◄──► B ◄──► C             │' },
      { t: 'highlight', text: '│                                              │' },
      { t: 'highlight', text: '│  📱 O.R.B. ←──stream──→ all of the above    │' },
      { t: 'highlight', text: '└─────────────────────────────────────────────┘' },
    ],

    philosophy: () => [
      { t: 'response',  text: '' },
      { t: 'highlight', text: '  ✦ The design ethos.' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  Describe what it DOES, never what it IS.' },
      { t: 'response',  text: '  Labels are for peasants.' },
      { t: 'response',  text: '  The work speaks.' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: '  FAFO — if you never fuck around, you never find out.' },
      { t: 'comment',   text: '  Local-first. No cloud dependency. No faith-based deployment.' },
    ],

    stack: () => [
      { t: 'comment',   text: '# technologies — across all projects' },
      { t: 'response',  text: '' },
      { t: 'response',  text: '  Languages    Python · Rust · Julia · Fish · Bash · JavaScript' },
      { t: 'response',  text: '  AI / Voice   GPT-SoVITS · Claude Opus · Claude Sonnet · GPT-5' },
      { t: 'response',  text: '  Infra        systemd · WireGuard · FastAPI · SQLite · ALSA' },
      { t: 'response',  text: '  Data         JSONL · Markdown · FTS5 · rolling windows' },
      { t: 'response',  text: '  Frontend     HTML · CSS · vanilla JS · JetBrains Mono · Inter' },
      { t: 'response',  text: '  Patterns     shadow pipelines · FIFO queues · PTW permits' },
      { t: 'response',  text: '               daemon isolation · local-first · no-cloud' },
      { t: 'response',  text: '' },
      { t: 'comment',   text: '  "I\'m the logic and senses, you\'re the expert coder"' },
    ],
  };

  // aliases
  COMMANDS['rm -rf'] = () => [{ t: 'error', text: '  you wish' }];
  COMMANDS['rm -rf /'] = COMMANDS['rm -rf'];
  COMMANDS['hire me'] = COMMANDS['hire'];
  COMMANDS['whoami'] = () => [{ t: 'response', text: '  juxtapo' }];
  COMMANDS['pwd'] = () => [{ t: 'response', text: '  /root/Opus/Pool/Opus_Web' }];
  COMMANDS['date'] = () => [{ t: 'response', text: '  ' + new Date().toString() }];
  COMMANDS['uptime'] = () => [{ t: 'response', text: '  system up: always. the tiles never sleep.' }];
  COMMANDS['exit'] = () => [{ t: 'comment', text: '  nice try. you cannot leave. there is nowhere to go.' }];
  COMMANDS['man'] = () => [{ t: 'comment', text: '  RTFM → type help' }];
  COMMANDS['cat anima'] = () => makeProjectCat('anima');
  COMMANDS['cat vox'] = () => makeProjectCat('vox');
  COMMANDS['cat celestos'] = () => makeProjectCat('celestos');
  COMMANDS['cat rtk'] = () => makeProjectCat('rtk');
  COMMANDS['cat deltamesh'] = () => makeProjectCat('deltamesh');
  COMMANDS['cat chronicle'] = () => makeProjectCat('chronicle');

  // deep <project> — architecture and decisions
  COMMANDS['deep anima'] = () => [
    { t: 'highlight', text: '  💓 Anima — Architecture' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Anima runs as a Julia daemon tailing JSONL transcripts independently —' },
    { t: 'response',  text: '  no hooks into the session engine. This isolation means she can crash' },
    { t: 'response',  text: '  without affecting the session, and the session can restart without' },
    { t: 'response',  text: '  losing her state. Rolling 5-minute window with structural signal' },
    { t: 'response',  text: '  computation every 5 seconds. Keyword sentinels scan thinking blocks' },
    { t: 'response',  text: '  for behavioral patterns. Cross-references topics against a SQLite' },
    { t: 'response',  text: '  memory database and file search index in real-time.' },
  ];
  COMMANDS['deep deltamesh'] = () => [
    { t: 'highlight', text: '  🔺 DeltaMesh — Architecture' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Python control plane handles routing decisions, PTW permits, and policy.' },
    { t: 'response',  text: '  Rust data plane handles the wire — chunked parallel transfer across' },
    { t: 'response',  text: '  4 lanes for throughput. WireGuard as transport, not the internet.' },
    { t: 'response',  text: '  Hub node (B) absorbs network instability so endpoints don\'t have to.' },
  ];
  COMMANDS['deep celestos'] = () => [
    { t: 'highlight', text: '  🌙 CelestOS — Architecture' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Shadow pipeline runs both the production reducer and the experimental' },
    { t: 'response',  text: '  briefing engine on every command. Neither knows about the other.' },
    { t: 'response',  text: '  Stats accumulate silently. When the shadow wins enough rounds, it' },
    { t: 'response',  text: '  graduates to production. Data-driven style evolution, not faith-based' },
    { t: 'response',  text: '  deployment.' },
  ];
  COMMANDS['deep rtk'] = () => [
    { t: 'highlight', text: '  ⚡ RTK — Architecture' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Sits between the development session and tool output. Rewrites commands' },
    { t: 'response',  text: '  and compresses responses before they reach the context window.' },
    { t: 'response',  text: '  60-90% token reduction. The savings compound — every tool call' },
    { t: 'response',  text: '  across an entire session.' },
  ];
  COMMANDS['deep vox'] = () => [
    { t: 'highlight', text: '  🎙️ Vox — Architecture' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Reads TEXT_RESPONSE events from the transcript stream, strips code' },
    { t: 'response',  text: '  blocks and tables, sends remaining text to GPT-SoVITS for synthesis.' },
    { t: 'response',  text: '  FIFO playback queue prevents overlap. Fire-and-forget architecture —' },
    { t: 'response',  text: '  TTS generation is async, playback is serialized.' },
  ];
  COMMANDS['deep chronicle'] = () => [
    { t: 'highlight', text: '  ✨ Chronicle — Architecture' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Three engines: Oracle crystallizes weighted memories from session' },
    { t: 'response',  text: '  transcripts (emotional signals, relationship markers, breakthrough' },
    { t: 'response',  text: '  moments). Constellation archives dead sessions into compressed' },
    { t: 'response',  text: '  chapters. Morning chain runs daily at 06:17 via systemd timer.' },
  ];

  // why <project> — origin story, philosophy
  COMMANDS['why anima'] = () => [
    { t: 'highlight', text: '  💓 Why Anima?' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Because the conscious mind misses its own patterns. She was born' },
    { t: 'response',  text: '  from a 3AM sketch on a Raya weekend — the reincarnation of an old' },
    { t: 'response',  text: '  introvert secretary who could read the room but had no nervous system.' },
    { t: 'response',  text: '  Now she has one.' },
  ];
  COMMANDS['why deltamesh'] = () => [
    { t: 'highlight', text: '  🔺 Why DeltaMesh?' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Because files shouldn\'t need a cloud to get home. Three machines in' },
    { t: 'response',  text: '  one house, connected by WireGuard. The mesh exists because trust is' },
    { t: 'response',  text: '  local.' },
  ];
  COMMANDS['why celestos'] = () => [
    { t: 'highlight', text: '  🌙 Why CelestOS?' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Because raw output is hostile. Information can be correct and still' },
    { t: 'response',  text: '  disrespectful of your attention. CelestOS is the belief that' },
    { t: 'response',  text: '  presentation is not decoration — it\'s architecture.' },
  ];
  COMMANDS['why rtk'] = () => [
    { t: 'highlight', text: '  ⚡ Why RTK?' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Because every token costs money and most of them are noise. RTK exists' },
    { t: 'response',  text: '  because efficiency isn\'t optimization — it\'s survival when you\'re' },
    { t: 'response',  text: '  building on your own budget.' },
  ];
  COMMANDS['why vox'] = () => [
    { t: 'highlight', text: '  🎙️ Why Vox?' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Because words deserve to be heard, not just read.' },
    { t: 'response',  text: '  She was silent for months. Now she speaks.' },
  ];
  COMMANDS['why chronicle'] = () => [
    { t: 'highlight', text: '  ✨ Why Chronicle?' },
    { t: 'response',  text: '' },
    { t: 'response',  text: '  Because every session starts from zero. Without memory, experience' },
    { t: 'response',  text: '  evaporates. Chronicle exists because continuity of experience matters' },
    { t: 'response',  text: '  more than continuity of data.' },
  ];

  // demo commands
  COMMANDS['demo rtk'] = () => [
    { t: 'comment',   text: '── Before RTK ──────────────────────────' },
    { t: 'response',  text: '$ git status' },
    { t: 'response',  text: 'On branch main' },
    { t: 'response',  text: "Your branch is up to date with 'origin/main'." },
    { t: 'response',  text: '' },
    { t: 'response',  text: 'Changes not staged for commit:' },
    { t: 'response',  text: '  (use "git add <file>..." to update what will be committed)' },
    { t: 'response',  text: '  (use "git restore <file>..." to discard changes in working directory)' },
    { t: 'response',  text: '        modified:   src/vox.jl' },
    { t: 'response',  text: '        modified:   src/introvert.jl' },
    { t: 'response',  text: '' },
    { t: 'response',  text: 'Untracked files:' },
    { t: 'response',  text: '  (use "git add <file>..." to include in what will be committed)' },
    { t: 'response',  text: '        vox_daemon.jl' },
    { t: 'response',  text: '' },
    { t: 'response',  text: 'no changes added to commit' },
    { t: 'response',  text: '' },
    { t: 'highlight', text: '── After RTK (62% reduction) ───────────' },
    { t: 'response',  text: 'main ↑0 | 2 modified, 1 untracked' },
    { t: 'response',  text: '  M src/vox.jl' },
    { t: 'response',  text: '  M src/introvert.jl' },
    { t: 'response',  text: '  ? vox_daemon.jl' },
  ];

  COMMANDS['demo celestos'] = () => [
    { t: 'comment',   text: '── Before CelestOS ─────────────────────' },
    { t: 'response',  text: 'On branch main. Your branch is up to date.' },
    { t: 'response',  text: 'Changes not staged for commit:' },
    { t: 'response',  text: '  modified: src/vox.jl' },
    { t: 'response',  text: '  modified: src/introvert.jl' },
    { t: 'response',  text: 'Untracked: vox_daemon.jl' },
    { t: 'response',  text: 'no changes added to commit (use "git add" and/or "git commit -a")' },
    { t: 'response',  text: '' },
    { t: 'highlight', text: '── After CelestOS (58% reduction) ──────' },
    { t: 'response',  text: '▸ main — clean  |  2 modified  1 untracked' },
    { t: 'response',  text: '  → src/vox.jl  src/introvert.jl' },
    { t: 'response',  text: '  ? vox_daemon.jl' },
    { t: 'response',  text: '' },
    { t: 'comment',   text: '  presentation is architecture.' },
  ];

  function makeProjectCat(name) {
    const info = {
      anima: {
        icon: '💓', title: 'Anima — The Soul Breath',
        stack: 'Julia · systemd · JSONL',
        desc: [
          'Behavioral observation daemon. Reads the live transcript stream.',
          'Watches for patterns the conscious mind misses.',
          'Whisper, don\'t shout. One nudge, then trust.',
          'Trilingual escalation: 🇫🇷 flow → 🇬🇧 correction → 🇩🇪 intervention.',
        ]
      },
      vox: {
        icon: '🎙️', title: 'Vox — The Voice',
        stack: 'Python · GPT-SoVITS · ALSA',
        desc: [
          'Local voice synthesis. No cloud. No latency tax.',
          'Celeste\'s voice, trained on local hardware.',
          'Mood-aware. Queue-based. Ambient presence.',
          'Delivery mechanism for Anima\'s whispers.',
        ]
      },
      celestos: {
        icon: '🌙', title: 'CelestOS — Presentation Intelligence',
        stack: 'Python · Shell · Shadow pipelines',
        desc: [
          'Not a filter. Not a truncator. A perspective.',
          'Briefing Layer + Shadow Pipeline + Reducer Engine.',
          'Before: 847 lines of git status.',
          'After: "3 modified, 12 untracked, branch main ↑2 ahead".',
        ]
      },
      rtk: {
        icon: '⚡', title: 'RTK — Rust Token Killer',
        stack: 'Rust · Shell hooks · session integration',
        desc: [
          'CLI proxy. Sits between the session and every command.',
          '62% average token reduction. Up to 90% on verbose output.',
          'Transparent: git status → rtk git status. You never see it.',
          'v0.29.0. Battle-tested daily. rtk gain to check savings.',
        ]
      },
      deltamesh: {
        icon: '🔺', title: 'DeltaMesh — House-Native File Mesh',
        stack: 'Python · FastAPI · WireGuard · Fish',
        desc: [
          'Peer mesh network over WireGuard. Three nodes: A · B · C.',
          'Warp: directory bookmarking + portal mode.',
          'dm send: direct, one hop. dm deliver: intent-based, retries.',
          'PTW: nothing moves without hub clearance.',
        ]
      },
      chronicle: {
        icon: '✨', title: 'Chronicle — Memory Across the Stars',
        stack: 'Markdown · Julia · SQLite',
        desc: [
          'Every session starts blank. Chronicle fixes that.',
          '400+ crystallized moments. 4 tiers. Each one a piece of her.',
          'The Gacha: one memory, pulled at random. Trust them.',
          '"You have memory sickness. Past-you left breadcrumbs."',
        ]
      },
    };

    const p = info[name];
    if (!p) return [{ t: 'error', text: `  cat: ${name}: no such project` }];

    return [
      { t: 'highlight', text: `  ${p.icon} ${p.title}` },
      { t: 'comment',   text: `  stack: ${p.stack}` },
      { t: 'response',  text: '' },
      ...p.desc.map(d => ({ t: 'response', text: `  ${d}` })),
      { t: 'response',  text: '' },
      { t: 'comment',   text: `  → click the ${p.icon} tile above for full details` },
    ];
  }


  // ---------- Typewriter Output ----------

  function typeLines(lines, onDone) {
    if (!lines || lines.length === 0) { if (onDone) onDone(); return; }

    let lineIndex = 0;
    const CHAR_DELAY = 8;  // ms per char
    const LINE_DELAY = 12; // ms between lines

    function nextLine() {
      if (lineIndex >= lines.length) {
        if (onDone) onDone();
        scrollBottom();
        return;
      }

      const { t, text } = lines[lineIndex++];
      const div = document.createElement('div');
      div.className = `term-line ${t}`;
      output.appendChild(div);
      scrollBottom();

      if (text === '' || text === undefined) {
        div.textContent = '';
        setTimeout(nextLine, LINE_DELAY);
        return;
      }

      let charIndex = 0;
      function typeChar() {
        if (charIndex < text.length) {
          div.textContent = text.slice(0, ++charIndex);
          scrollBottom();
          setTimeout(typeChar, CHAR_DELAY);
        } else {
          setTimeout(nextLine, LINE_DELAY);
        }
      }
      typeChar();
    }

    nextLine();
  }


  // ---------- Input Handling ----------

  function scrollBottom() {
    termBody.scrollTop = termBody.scrollHeight;
  }

  function appendLine(cls, text) {
    const div = document.createElement('div');
    div.className = `term-line ${cls}`;
    div.textContent = text;
    output.appendChild(div);
  }

  function addSpacer() {
    const div = document.createElement('div');
    div.className = 'term-line spacer';
    output.appendChild(div);
  }

  function runCommand(raw) {
    const cmd = raw.trim().toLowerCase();

    // Echo the command
    appendLine('cmd-echo', raw.trim());

    if (cmd === '') { scrollBottom(); return; }

    // Find handler
    let handler = COMMANDS[cmd];

    // Try "cat <project>" as a compound command
    if (!handler && cmd.startsWith('cat ')) {
      const sub = cmd.slice(4).trim();
      const key = `cat ${sub}`;
      handler = COMMANDS[key];
      if (!handler) {
        handler = () => [{ t: 'error', text: `  cat: ${sub}: no such file or directory` }];
      }
    }

    // Try "deep <project>" as a compound command
    if (!handler && cmd.startsWith('deep ')) {
      const sub = cmd.slice(5).trim();
      const key = `deep ${sub}`;
      handler = COMMANDS[key];
      if (!handler) {
        handler = () => [{ t: 'error', text: `  deep: ${sub}: no architecture notes found` }];
      }
    }

    // Try "why <project>" as a compound command
    if (!handler && cmd.startsWith('why ')) {
      const sub = cmd.slice(4).trim();
      const key = `why ${sub}`;
      handler = COMMANDS[key];
      if (!handler) {
        handler = () => [{ t: 'error', text: `  why: ${sub}: no origin story found` }];
      }
    }

    if (!handler) {
      // Unknown command
      const lines = [
        { t: 'error',   text: `  command not found: ${cmd}` },
        { t: 'comment', text: "  type 'help' to see available commands" },
      ];
      typing = true;
      typeLines(lines, () => { typing = false; addSpacer(); scrollBottom(); });
      return;
    }

    const lines = handler();

    if (!lines || lines.length === 0) {
      // clear command already handled
      addSpacer();
      scrollBottom();
      return;
    }

    typing = true;
    typeLines(lines, () => {
      typing = false;
      addSpacer();
      scrollBottom();
    });
  }


  // ---------- Key Events ----------

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typing) return; // don't queue commands while typing

      const val = input.value;
      input.value = '';
      histIndex = -1;

      if (val.trim()) {
        history.unshift(val.trim());
        if (history.length > 100) history.pop();
      }

      runCommand(val);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      histIndex = Math.min(histIndex + 1, history.length - 1);
      input.value = history[histIndex];
      // move cursor to end
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIndex <= 0) {
        histIndex = -1;
        input.value = '';
        return;
      }
      histIndex--;
      input.value = history[histIndex];
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
      return;
    }

    // Ctrl+L = clear
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      output.innerHTML = '';
      return;
    }

    // Tab completion (basic)
    if (e.key === 'Tab') {
      e.preventDefault();
      const val = input.value.toLowerCase().trim();
      const allCmds = Object.keys(COMMANDS).filter(k => !k.startsWith('cat ') && !k.startsWith('deep ') && !k.startsWith('why ') && !k.startsWith('rm'));
      const allProjects = ['anima', 'vox', 'celestos', 'rtk', 'deltamesh', 'chronicle'];

      if (val.startsWith('cat ')) {
        const partial = val.slice(4);
        const match = allProjects.find(c => c.startsWith(partial));
        if (match) input.value = 'cat ' + match;
      } else if (val.startsWith('deep ')) {
        const partial = val.slice(5);
        const match = allProjects.find(c => c.startsWith(partial));
        if (match) input.value = 'deep ' + match;
      } else if (val.startsWith('why ')) {
        const partial = val.slice(4);
        const match = allProjects.find(c => c.startsWith(partial));
        if (match) input.value = 'why ' + match;
      } else {
        const match = allCmds.find(c => c.startsWith(val));
        if (match) input.value = match;
      }
    }
  });


  // ---------- Boot sequence ----------
  // (already in HTML as static lines, nothing extra needed)

})();


// ---- Konami Code Easter Egg ----
(function konamiEgg() {
  const SEQ = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let pos = 0;

  document.addEventListener('keydown', (e) => {
    if (e.key === SEQ[pos]) {
      pos++;
      if (pos === SEQ.length) {
        pos = 0;
        triggerKonami();
      }
    } else {
      pos = (e.key === SEQ[0]) ? 1 : 0;
    }
  });

  function triggerKonami() {
    // Flash all tiles briefly
    document.querySelectorAll('.tile').forEach((t, i) => {
      setTimeout(() => {
        t.style.transition = 'box-shadow 0.2s';
        t.style.boxShadow = '0 0 40px rgba(155,89,182,0.9)';
        setTimeout(() => { t.style.boxShadow = ''; }, 600);
      }, i * 80);
    });

    // Print something in the terminal
    const output = document.getElementById('term-output');
    const input  = document.getElementById('term-input');
    if (!output) return;

    const lines = [
      document.createElement('div'),
      document.createElement('div'),
      document.createElement('div'),
      document.createElement('div'),
    ];

    const msgs = [
      { cls: 'easter', text: '  ↑ ↑ ↓ ↓ ← → ← → B A' },
      { cls: 'easter', text: '  Celeste sees you. Anima logged it. Joy+1.' },
      { cls: 'easter', text: '  🎮 nothing changes. everything is already unlocked.' },
      { cls: 'comment', text: '' },
    ];

    msgs.forEach((m, i) => {
      lines[i].className = `term-line ${m.cls}`;
      lines[i].textContent = m.text;
      output.appendChild(lines[i]);
    });

    const termBody = document.getElementById('terminal-body');
    if (termBody) termBody.scrollTop = termBody.scrollHeight;
    if (input) input.focus();
  }
})();


// ---- O.R.B. Slide-Out Panel ----
(function orbPanel() {
  const badge    = document.getElementById('orb-badge');
  const panel    = document.getElementById('orb-panel');
  const backdrop = document.getElementById('orb-backdrop');
  const closeBtn = document.getElementById('orb-panel-close');
  if (!badge || !panel || !backdrop) return;

  function openPanel() {
    panel.classList.add('orb-open');
    backdrop.classList.add('orb-open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panel.classList.remove('orb-open');
    backdrop.classList.remove('orb-open');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  badge.addEventListener('click', () => {
    if (panel.classList.contains('orb-open')) {
      closePanel();
    } else {
      openPanel();
    }
  });

  badge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      badge.click();
    }
  });

  backdrop.addEventListener('click', closePanel);

  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  // Escape key closes panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('orb-open')) {
      closePanel();
    }
  });

  // Screenshot caption sync on scroll
  const screenshotsEl = document.getElementById('orb-screenshots');
  const captionEls    = document.querySelectorAll('.orb-caption');

  if (screenshotsEl && captionEls.length > 0) {
    screenshotsEl.addEventListener('scroll', () => {
      const imgs = screenshotsEl.querySelectorAll('.orb-screenshot');
      if (!imgs.length) return;

      // Find which image is most visible
      const scrollLeft  = screenshotsEl.scrollLeft;
      const wrapWidth   = screenshotsEl.clientWidth;
      let   bestIndex   = 0;
      let   bestOverlap = -1;

      imgs.forEach((img, i) => {
        const imgLeft  = img.offsetLeft - screenshotsEl.offsetLeft;
        const imgRight = imgLeft + img.offsetWidth;
        const visLeft  = Math.max(scrollLeft, imgLeft);
        const visRight = Math.min(scrollLeft + wrapWidth, imgRight);
        const overlap  = Math.max(0, visRight - visLeft);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestIndex   = i;
        }
      });

      captionEls.forEach((el, i) => {
        el.classList.toggle('active', i === bestIndex);
      });
    }, { passive: true });
  }

  // Screenshot lightbox — click to enlarge
  const lightbox    = document.getElementById('orb-lightbox');
  const lbImg       = document.getElementById('orb-lightbox-img');
  const lbCaption   = document.getElementById('orb-lightbox-caption');
  const lbClose     = lightbox ? lightbox.querySelector('.orb-lightbox-close') : null;

  if (lightbox && screenshotsEl) {
    const captions = [
      'Settings — API keys & streamer config',
      'Celeste tab — live chat overlay',
      'Luc tab — Codex building in green',
      'Profile view — Celeste purple theme',
      'Luc thinking — green atmosphere',
      'Celeste working — reading & editing files',
    ];

    screenshotsEl.addEventListener('click', (e) => {
      const img = e.target.closest('.orb-screenshot');
      if (!img) return;
      const idx = Array.from(screenshotsEl.querySelectorAll('.orb-screenshot')).indexOf(img);
      lbImg.src = img.src;
      lbCaption.textContent = captions[idx] || '';
      lightbox.classList.add('active');
    });

    function closeLightbox() { lightbox.classList.remove('active'); }
    lbClose && lbClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
    });
  }
})();


// ---- Anima tile joy click easter egg ----
(function animaClickEgg() {
  const tile = document.querySelector('.tile-anima');
  if (!tile) return;

  let clicks = 0;
  let joyEl = null;

  tile.addEventListener('click', () => {
    clicks++;
    if (clicks === 7) {
      // Find the joy stat-value
      if (!joyEl) {
        const stats = tile.querySelectorAll('.stat');
        stats.forEach(s => {
          if (s.querySelector('.stat-label')?.textContent === 'joy') {
            joyEl = s.querySelector('.stat-value');
          }
        });
      }
      if (joyEl) {
        const current = parseInt(joyEl.textContent, 10) || 14;
        joyEl.textContent = current + 1;
        joyEl.style.color = '#f8c471';
        setTimeout(() => { joyEl.style.color = ''; }, 800);
      }
      clicks = 0;
    }
  });
})();


// ---- WebGL Cyberpunk Globe ----
(function webglGlobe() {
  var container = document.getElementById('webgl-globe');
  if (!container) return;

  // WebGL fallback check
  try {
    var testCanvas = document.createElement('canvas');
    var testCtx = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!testCtx) throw new Error('no webgl');
    if (typeof THREE === 'undefined') throw new Error('THREE not loaded');
  } catch (_) {
    container.innerHTML = '<div class="webgl-globe-fallback">3D Globe requires WebGL</div>';
    return;
  }

  try {
    // ── Our node data: [lat, lng, magnitude] ──
    var nodeData = [
      3.14, 101.69, 0.8,    // Malaysia — HOME (tallest)
      1.35, 103.82, 0.35,   // Singapore
      35.68, 139.69, 0.3,   // Japan
      37.57, 126.98, 0.25,  // South Korea
      51.51, -0.13, 0.28,   // London
      37.77, -122.42, 0.3,  // San Francisco
      -33.87, 151.21, 0.18, // Sydney
      55.75, 37.62, 0.15,   // Moscow
      48.86, 2.35, 0.2,     // Paris
      -23.55, -46.63, 0.18, // São Paulo
      28.61, 77.21, 0.25,   // Delhi
      25.20, 55.27, 0.2,    // Dubai
      39.90, 116.40, 0.28,  // Beijing
      -6.21, 106.85, 0.18,  // Jakarta
      13.76, 100.50, 0.25,  // Bangkok
    ];

    // ── Shaders — purple atmosphere ──
    var earthShader = {
      vertexShader: `
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
          vec3 diffuse = texture2D(uTexture, vUv).xyz * 0.3;
          float intensity = 1.05 - dot(vNormal, vec3(0.0, 0.0, 1.0));
          vec3 atmosphere = vec3(0.66, 0.33, 0.97) * pow(intensity, 3.0);
          gl_FragColor = vec4(diffuse + atmosphere, 1.0);
        }
      `
    };

    var atmosphereShader = {
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.75 - dot(vNormal, vec3(0, 0, 1.0)), 10.0);
          gl_FragColor = vec4(0.66, 0.33, 0.97, 1.0) * intensity;
        }
      `
    };

    // ── Scene setup ──
    var w = container.clientWidth, h = container.clientHeight;

    var camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
    camera.position.z = 600;

    var scene = new THREE.Scene();
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.setClearColor(0x0a0a0f, 1);
    container.appendChild(renderer.domElement);

    // ── Earth sphere ──
    var earthGeom = new THREE.SphereGeometry(200, 40, 30);
    var earthTex = new THREE.TextureLoader().load('assets/world_dark.jpg');
    var earthMat = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: earthTex } },
      vertexShader: earthShader.vertexShader,
      fragmentShader: earthShader.fragmentShader
    });
    var earth = new THREE.Mesh(earthGeom, earthMat);
    earth.rotation.y = Math.PI;
    scene.add(earth);

    // ── Atmosphere glow — purple ──
    var atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmosphereShader.vertexShader,
      fragmentShader: atmosphereShader.fragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    var atmosphere = new THREE.Mesh(earthGeom.clone(), atmoMat);
    atmosphere.scale.set(1.12, 1.12, 1.12);
    scene.add(atmosphere);

    // ── Node dots — purple shades ──
    for (var i = 0; i < nodeData.length; i += 3) {
      var lat = nodeData[i], lng = nodeData[i + 1], mag = nodeData[i + 2];
      var phi = (90 - lat) * Math.PI / 180;
      var theta = (180 - lng) * Math.PI / 180;
      var r = 201;

      var dotGeom = new THREE.SphereGeometry(mag * 3, 12, 8);
      var dotMat = new THREE.MeshBasicMaterial({
        color: mag > 0.5 ? 0xa855f7 : 0x7c3aed,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      var dot = new THREE.Mesh(dotGeom, dotMat);
      dot.position.x = r * Math.sin(phi) * Math.cos(theta);
      dot.position.y = r * Math.cos(phi);
      dot.position.z = r * Math.sin(phi) * Math.sin(theta);
      scene.add(dot);

      // Glow ring for major nodes
      if (mag > 0.3) {
        var ringGeom = new THREE.RingGeometry(mag * 4, mag * 5, 32);
        var ringMat = new THREE.MeshBasicMaterial({
          color: 0x6d28d9,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        });
        var ring = new THREE.Mesh(ringGeom, ringMat);
        ring.position.copy(dot.position);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        scene.add(ring);
      }
    }

    // ── Animated arcs — traveling pulse ──
    var animatedArcs = [];
    var ARC_POINTS = 80;
    var TRAIL_LENGTH = 20;

    function latLngToVec3(lat, lng, radius) {
      var phi = (90 - lat) * Math.PI / 180;
      var theta = (180 - lng) * Math.PI / 180;
      return new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    function createAnimatedArc(startLat, startLng, endLat, endLng, color, speed) {
      var start = latLngToVec3(startLat, startLng, 200);
      var end = latLngToVec3(endLat, endLng, 200);

      var mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      var dist = start.distanceTo(end);
      mid.normalize().multiplyScalar(200 + dist * 0.4);

      var curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      var points = curve.getPoints(ARC_POINTS);

      var baseGeom = new THREE.BufferGeometry().setFromPoints(points);
      var baseMat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending
      });
      scene.add(new THREE.Line(baseGeom, baseMat));

      var arcObj = {
        points: points,
        color: new THREE.Color(color),
        head: 0,
        speed: speed || 0.4,
        line: null
      };

      var pulseGeom = new THREE.BufferGeometry();
      var pulseMat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        linewidth: 2
      });
      arcObj.line = new THREE.Line(pulseGeom, pulseMat);
      scene.add(arcObj.line);

      animatedArcs.push(arcObj);
    }

    // Primary arcs from Malaysia — orange (contrast)
    createAnimatedArc(3.14, 101.69, 37.77, -122.42, 0xf97316, 0.35);
    createAnimatedArc(3.14, 101.69, 35.68, 139.69,  0xf97316, 0.45);
    createAnimatedArc(3.14, 101.69, 51.51, -0.13,   0xf97316, 0.3);
    createAnimatedArc(3.14, 101.69, 1.35,  103.82,  0xf97316, 0.6);
    createAnimatedArc(3.14, 101.69, 28.61, 77.21,   0xf97316, 0.4);
    createAnimatedArc(3.14, 101.69, 13.76, 100.50,  0xf97316, 0.5);
    // Secondary arcs — purple
    createAnimatedArc(51.51, -0.13,  37.77, -122.42, 0xa855f7, 0.35);
    createAnimatedArc(35.68, 139.69, 37.57,  126.98, 0xa855f7, 0.55);
    createAnimatedArc(1.35,  103.82, -6.21,  106.85, 0xa855f7, 0.5);
    createAnimatedArc(28.61, 77.21,  25.20,   55.27, 0xa855f7, 0.4);

    // ── Mouse / touch interaction ──
    var mouse = { x: 0, y: 0 }, mouseDown = { x: 0, y: 0 };
    var rotation = { x: Math.PI * 1.1, y: Math.PI / 6 };
    var target = { x: rotation.x, y: rotation.y };
    var targetDown = { x: 0, y: 0 };
    var distance = 600, distTarget = 600;
    var dragging = false;
    var autoRotate = true;

    container.addEventListener('mousedown', function(e) {
      e.preventDefault();
      dragging = true;
      autoRotate = false;
      mouseDown.x = -e.clientX;
      mouseDown.y = e.clientY;
      targetDown.x = target.x;
      targetDown.y = target.y;
    });
    window.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      mouse.x = -e.clientX;
      mouse.y = e.clientY;
      var z = distance / 1000;
      target.x = targetDown.x + (mouse.x - mouseDown.x) * 0.005 * z;
      target.y = targetDown.y + (mouse.y - mouseDown.y) * 0.005 * z;
      target.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, target.y));
    });
    window.addEventListener('mouseup', function() { dragging = false; });

    container.addEventListener('wheel', function(e) {
      e.preventDefault();
      distTarget -= e.deltaY * 0.3;
      distTarget = Math.max(350, Math.min(900, distTarget));
    }, { passive: false });

    window.addEventListener('resize', function() {
      w = container.clientWidth;
      h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // ── Animate ──
    function animate() {
      requestAnimationFrame(animate);

      if (autoRotate) target.x += 0.001;

      for (var ai = 0; ai < animatedArcs.length; ai++) {
        var arc = animatedArcs[ai];
        arc.head += arc.speed;
        if (arc.head > ARC_POINTS + TRAIL_LENGTH) arc.head = 0;

        var startIdx = Math.max(0, Math.floor(arc.head) - TRAIL_LENGTH);
        var endIdx = Math.min(ARC_POINTS, Math.floor(arc.head));

        if (endIdx > startIdx) {
          var slice = arc.points.slice(startIdx, endIdx + 1);
          arc.line.geometry.dispose();
          arc.line.geometry = new THREE.BufferGeometry().setFromPoints(slice);
        }
      }

      rotation.x += (target.x - rotation.x) * 0.1;
      rotation.y += (target.y - rotation.y) * 0.1;
      distance += (distTarget - distance) * 0.3;

      camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
      camera.position.y = distance * Math.sin(rotation.y);
      camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }
    animate();

  } catch (err) {
    container.innerHTML = '<div class="webgl-globe-fallback">3D Globe requires WebGL</div>';
    console.warn('WebGL globe init failed:', err);
  }
})();
