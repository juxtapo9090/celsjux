# 🛒 Globe Shopping List — AGI Upgrades

> Scratchpad for future improvements to celsjux globe

## ✅ Done
- [x] AGI icon: ✦ cyan sparkle → 💎 gem stone (cyan)
- [x] Claude icon: 🟣 → ✨ gold sparkle
- [x] Mesh icon: 🔵 → ⦿ circle dot
- [x] Attacker icon: ✕ → ☢ radioactive
- [x] `[antigravity]` → `[AGI]` everywhere
- [x] AGI + Codex node types in globe_collector.sh
- [x] RTK alignment fix in System Pulse

## 🛒 Shopping List (Future)
- [ ] **Attacker entries clickable → plays sound on click**
  - Drop `x.wav` (or any sfx) into `assets/`
  - Debounced: single Audio object, 2s cooldown, no spam overlap
  ```js
  var atkSound = new Audio('assets/x.wav');
  var canPlay = true;
  el.addEventListener('click', function() {
    if (!canPlay) return;
    canPlay = false;
    atkSound.currentTime = 0;
    atkSound.play();
    setTimeout(function() { canPlay = true; }, 2000);
  });
  ```
- [ ] MySpace-era autoplay music? 🔊 (yuri revenge lol)
- [ ] Kirov reporting on click intercepted 🚀
- [ ] 
