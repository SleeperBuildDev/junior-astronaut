# Junior Astronaut: Lunar Survival Mission — project briefing for Claude

Browser-based, first-person 3D lunar survival / base-building / science-education game for
students (about 10–15). Played on a **desktop PC website with keyboard + mouse** (no mobile).
Owner: **Hein Htet** (Burmese; English is fine for chat; wants plain, friendly explanations).
Full design spec: `docs/SPEC.md` (sections 1–13; section 13 is cut off, ask the owner for the rest).
This is a **test project**, not a real NASA Space Apps entry.

## Status (2026-11-03)

Done and tested (git history has one commit per milestone):
- **Mission 1 — First Steps on the Moon**: walk 15 m, low-gravity jump, find Earth, follow the beacon,
  scan 3 environment sensors (E), enter the airlock.
- **Mission 2 — Life Support Activation**: go to the life-support unit, open its terminal, 3-step
  oxygen-generator start-up, hold-E filter repair, start water recovery, wait for habitat O₂ = 20.9%.
- **Mission 3 — Power Up the Outpost**: power terminal, deploy + aim 3 VSAT solar towers (top-down
  aim dial, cos-law output, lock-on → sun tracking), hold-E main switch, charge batteries to 60% (time
  ×13), power plan (switch off loads until battery ≥ 10 h), Sun sets for real (sunPath), helmet lamp,
  sunrise. BASE POWER HUD panel, battery bank GLB with charge bars, fast-forward badge.
- **Mission 4 — Build a Lunar Habitat**: construction planner (all 10 facility types from the spec,
  costs in kits/kWh/hours, unlock per mission; only the habitat buildable now), tunnel extends from a
  new south port on the node, hold-E inflation valve, inflatable HAB-2 (Blender GLB) grows from packed,
  habitat terminal (choose 101/70 kPa, 30 kPa refused; leak check; thermostat 18–27 °C; air/water
  lines, water walls, sleep stations), crew moves in (3 crew voices), crew panel (C).
- **Mission 5 — Establish Food Production**: greenhouse (Blender GLB, pink-purple grow-light windows)
  built from the planner on pad G-1 at the lab's north hatch; greenhouse terminal: fill nutrient tank
  (30 L), light cycle 12/16/24 h (sets the `gh` power load), choose 3 crops (needs fresh + calories/
  protein), 8-day time-lapse with a pH alarm on day 3 (fix to 5.5–6.5), harvest microgreens (hold E).
  Food in "days of food" on the BASE STATUS panel (with water). The clock jumps day 5 → 13, so
  **Mission 6 should start on day 14** (set `day: 14` in its registry entry).
- **Mission 6 — Radiation Protection** (starts day 14): radiation monitor terminal (surface 1.37 mSv/day,
  space weather), survey 3 wall points, hold-E regolith berms around HAB-2 (rise + colliders), solar
  storm warning (2-min countdown banner), order crew to the shelter from the crew panel (they walk with
  ETAs), enter through the HAB-1 airlock, storm-shelter screen (30 h time-lapse, dose inside vs outside),
  Geiger crackle + extra suit dose if caught outside. Missions can define `canHold(id)` for several
  hold-E targets. Note: opening any panel (K, C) pauses the simulation.
- **Mission 7 — Scientific Exploration** (day 16): drivable rover (`src/player/rover.ts`: Rapier
  kinematic body + character controller that ignores the terrain, terrain-following tilt, seat camera
  with free look, battery; W/S/A/D/Space, E in/out; dashboard HUD), 3 science sites in `LAYOUT.sites`
  (pale anorthosite on a crater rim, ejecta boulder, sunlit rim of a shadowed crater), field-notes
  multiple choice with hints, hold-E sampling, lab sample port + analysis terminal (ISRU).
- **Mission 8 — Emergency Response** (day 19): data-driven emergencies in `src/game/emergency.ts`
  (solar tower hit by cargo-lander plume grit → shed loads, diagnose, hold-E repair; HAB-2 leak →
  close hatch, ultrasonic detector HUD (dB rises near the random leak fitting), hold-E patch,
  repressurise from the O₂ reserve; HAB-1 cooling pump failure → switch to backup pump B, diagnose,
  fit spare motor). Each: alarm (klaxon + banner + auto-opened alert terminal with severity, affected
  systems, live reading and 3 responses; wrong ones cost something real), diagnosis, repair, then an
  after-action report terminal (what/why/prevent + tries, time, worst value). New world objects:
  tower damage overlays, 3 leak fittings on HAB-2, cooling radiator + pump skid east of the
  life-support unit. BASE STATUS shows HAB-2 air, HAB-1 temp and O₂ reserve from Mission 8.
  Mission 8 uses mission-time timers (`after()` in update) so pausing pauses them.
- **Mission 9 — Sustainable Lunar Settlement** (day 20, 30 settlement days): `src/game/settlement.ts`
  links power → life support/heating, O₂ (generator 4 kg/day vs 0.84 kg/person), water (10 L/person,
  93% recovery, 98% with a 2nd recycler), food (greenhouse +0.3 day/day), temperature, equipment
  condition and crew health (fail below 20 → crew called home). T opens the settlement panel
  (`panel` 'colony', pauses): rates, crew, load switches, speed ×1 / 1 day per 30 s / per 15 s.
  Beats: day 4 cargo (+9 kits, water, food, spare blanket → hold E on tower 3), long shadow days 8–10
  (towers at 30% light), storm ~day 20.5 (reuses radiation.ts + the M6 shelter screen), 3 random
  emergencies from leak/thermal/recycler/comms/battery (emergency.ts). Building in the BLD-1 planner
  takes game hours; finished facilities change the numbers and appear in the world. Final report
  terminal ('final') with score and 1–3 stars; `actions.finishSettlement` ends the mission.
  Comms outage silences Mission Control (text-only on the backup antenna).
- **Secret discoveries** (`src/game/discoveries.ts`, 2026-11-04): 22 hidden finds, 2–3 per mission
  (`DISCOVERIES`: id = card id, mission, `egg` = Apollo tribute, `special` cutscene), placed by `SPOTS`
  (fixed x/z, or computed: highest ridge, inside the crater by site C). Only the current mission's finds
  show; a gold glint (within 140 m) and a scanner chirp (`sfx('anomaly')`, within 25 m) give them away.
  E plays a "legendary" cutscene built per find (`shots()`: over-shoulder push-in → gold beam + motes +
  title → visor close-up with a live cube-camera reflection → crane), specials: golf swing + ball flight,
  hammer & feather slow-mo drop, lamp-lit ice glitter, impact flash, laser to Earth, eclipse ring, sun
  peak, Earth zoom. Then screen `discovery` (gold card). Cards are normal Knowledge cards (EN `knowledge.ts`,
  MY `cards-my.ts`), listed separately in the Knowledge Center ("??? Hidden in Mission N") and counted on
  the complete screen. Narration `cs_d_<id>`. QA: `node qa/secrets.mjs [en|my] [ids|all] [quality]`,
  hooks `discoveries()`, `discover(id)`, `closeDiscovery()`.
- **Ground effects** (`src/world/effects.ts`): instanced boot prints every 0.7 m walked, rover track
  marks + rooster-tail dust, ballistic dust on steps/landings (counts scale with quality). Your astronaut
  (`src/world/astronaut.ts`: lathe-shaped suit, hard upper torso, backpack, hoses, bellows joints, gloves,
  overshoes; joints incl. ankles) appears in cutscenes via `pose()`; an invisible low-detail copy follows you
  and casts your long shadow (Medium/High) via `gait()`: stride clock driven by real ground speed (no foot
  sliding), lunar lope when sprinting, tuck in the air, spring squat on landing (`land()`), hips turn when
  strafing. QA: `node qa/groundfx.mjs [quality]`, `node qa/astronaut.mjs` (model + shadow gait), hook `fx()`.
- **Mission registry + save**: missions run from `registry` in main.ts; progress (highest mission +
  cards) saved in localStorage; main menu shows Continue + Mission select once Mission 2 is unlocked.
- World: procedural crater terrain + Poly Haven Moon textures/rocks, low south-pole sun with long
  shadows, stars + Milky Way, Earth (NASA Blue Marble), outpost (Blender GLB hero models + code-built
  parts), rover (parked, not drivable), floodlights, tracks/footprints, landing pad lights.
- PC controls, low-gravity Rapier character controller, suit HUD (O₂/power/health/temp/radiation,
  mission day clock, compass, objective panel + "What to do" hint, Mission Control comms, prompts,
  warnings), waypoint marker + light beam to the current target, knowledge cards + Knowledge Center,
  menus (main, briefing, pause, settings, controls, mission complete; the Credits screen was removed at the owner's request), phone notice.
- **English + Burmese** UI (Settings → Language). Mission Control voice is English with Burmese subtitles.
- Mission Control radio voice lines (Kokoro TTS) + narrator voice for cutscenes.
- Cutscenes: Mission 1 landing intro (descent + ballistic dust), Mission 1 ending, Mission 2 intro + ending.
- Procedural sound effects (Web Audio), machinery hum, ambient music.

**Version 1.0.0: all nine missions are built and the production build is tested** (`npm run build`,
`npm run preview` on port 4173, `node qa/prod.mjs` opens every mission on the built site). `README.md`
explains play/build/hosting; `.github/workflows/pages.yml` deploys `dist/` to GitHub Pages once the repo
is pushed. **Live at https://sleeperbuilddev.github.io/junior-astronaut/** (repo
https://github.com/SleeperBuildDev/junior-astronaut, branch `main`; every push redeploys). Test screenshots (`qa/*.png`) are not committed.

## Run, test, build

```bash
cd C:/Users/MyPC/Projects/junior-astronaut
npm run dev          # Vite dev server on http://localhost:5173 (strict port)
npx tsc --noEmit     # type-check (TypeScript 7)
npm run build        # production build to dist/ (base './', works on any static host)
```
- Claude Code desktop "Browser" pane: `.claude/launch.json` has a `game` config (`npm run dev`, port 5173).
  If the session's working directory is `C:\`, a copy lives in `C:\.claude\launch.json`
  (`npm --prefix C:/Users/MyPC/Projects/junior-astronaut run dev`).
- **The Browser pane throttles rendering when hidden**, so its FPS is meaningless. Measure with
  the Playwright scripts, which drive the installed Chrome on the real GPU (no browser download):
  - `node qa/perf.mjs` — FPS / triangles / draw calls per quality preset (+ console errors).
  - `node qa/mission1.mjs`, `node qa/mission2.mjs`, `node qa/mission3.mjs [en|my]`, `node qa/mission4.mjs [en|my]`, `node qa/mission5.mjs [en|my]`, `node qa/mission6.mjs [en|my]`, `node qa/mission7.mjs [en|my]`, `node qa/mission8.mjs [en|my]`, `node qa/mission9.mjs [en|my]` — automated playthroughs with screenshots.
  - `node qa/cutscenes.mjs [en|my]` — screenshots of every cutscene.
  - `node qa/shots.mjs <prefix>` — eye-level beauty shots of the outpost.
  - `node qa/guide.mjs [en|my]` — guidance marker + language screenshots.
  - `node qa/sfx.mjs` — plays every sound effect, checks the audio engine.
  These rely on **QA hooks** exposed only with `?qa=1` (`window.__qa`): `start, play, next, skip,
  cut(name), teleport(x,z,yaw,pitch), look(yaw,pitch), key(code,ms), holdE(ms), closeTerminal,
  state, info, gpu, show(name,on), shadows(on), quality(q), sfx(name), audio, cutscene,
  mission(n)` (jump to mission n), `goTo(id, dist, angle?)` (stand in front of an interactable),
  `power, habitat, greenhouse, rad, crew, science, emergency, settlement, settleDay(d), rover, roverTo(x,z,yaw), drive(ms), speed, progress`. Add `?unlock=N` to any URL to open missions up to N.
  In QA mode movement works without pointer lock. Extend these hooks for new missions.
- Show the owner previews along the way: screenshot with the QA scripts, then send the PNGs
  (SendUserFile). He asked for previews during development.

## Tech stack (pinned — do not upgrade casually)

three **0.187.0** (WebGLRenderer, not WebGPU) · postprocessing **6.39.6** (requires three < 0.188!) ·
@dimforge/rapier3d-compat 0.21.0 · preact 11 + @preact/signals · vite 8 · typescript 7 ·
playwright-core 1.64.1 (QA only) · fonts via @fontsource (Atkinson Hyperlegible Next, B612 Mono,
Orbitron, Noto Sans Myanmar). Everything is free/open-source; the owner wants **free tools only**
(no paid APIs, keys or subscriptions).

## Code map

| Path | What |
|---|---|
| `src/main.ts` | Boot, world assembly, game loop, actions (start/resume/next/restart/toMenu/closeTerminal/skipCutscene), interaction raycast + hold-E, suit simulation, guidance (`guideTarget()`), floodlights, machine hum, QA hooks |
| `src/engine/renderer.ts` | WebGLRenderer + quality presets (low/medium/high: pixel ratio, shadow map, terrain segments, post on/off) + postprocessing (Bloom, AgX tone mapping, Vignette, SMAA) |
| `src/engine/settings.ts` | Persisted settings signal (sensitivity, invertY, fov, quality, volume, arrowLook, **lang**) |
| `src/world/heightfield.ts` | Deterministic terrain height function, craters, flattened areas, `LAYOUT` (base, lander, sensors, playRadius) |
| `src/world/terrain.ts` | Near (800 m, physics) + far (9 km) terrain meshes; regolith shader (anti-tiling, desaturation, distance-faded normals) |
| `src/world/sky.ts` | Stars, Milky Way, sun disc, Earth shader; `SUN_DIR`, `EARTH_DIR` (sun ≈7° high); `sunPath(k)` moves the Sun through a dark spell, `sunlight()` (main dims lights from it) |
| `src/world/base.ts` | Outpost: places GLB models (`OutpostModels`), code-built parts (airlock, VSAT solar arrays, antenna, O₂ station, life-support unit, lander, sensors, crates), colliders (`ColliderSpec`), interactables, blinkers, status materials |
| `src/world/rocks.ts` | Instanced Poly Haven moon rocks (2 LOD layers) + colliders |
| `src/world/trails.ts` | Rover-track / footprint ribbons (Poly Haven textures) |
| `src/world/assets.ts` | Texture loading |
| `src/player/input.ts` | Keyboard by `event.code` (works with Burmese layout), pointer lock (raw input), blur/visibility clearing |
| `src/player/player.ts` | Rapier kinematic character controller, Moon gravity 1.62, walk/sprint/jump, head bob, landing dip, footstep/jump callbacks, boundary |
| `src/player/physics.ts` | Rapier world: terrain trimesh + collider specs |
| `src/game/state.ts` | Signals: screen, panel, suit, mission, prompt, warning, comms, knowledge, cardPopup, missionNumber, holdProgress, waypoint, cinema, `terminal` ('life'/'power'/'array'/'build'/'hab'/'gh'/'rad'/'shelter'/'notes'/'lab'/'alert'/'diag'/'aar'), `drive` (rover dashboard), `gameSpeed` (game s per real s, normal 30) |
| `src/game/mission.ts` | `GameMission` interface (begin/update/interact/label/guide/hold) every mission implements |
| `src/game/mission1.ts` … `mission3.ts` | Mission classes (pattern below); each owns its guide targets |
| `src/game/save.ts` | `progress` (reached mission, knowledge) in localStorage, `MISSION_COUNT`, `missionDone(n)` |
| `src/game/construction.ts` | `FACILITIES` catalogue (10 types), `kits`, `built`, `blockers()`, `build()` |
| `src/game/habitat.ts` | HAB-2 state: tunnel/inflate/pressure/leak/temperature/outfit, `habitatDone()` for later missions |
| `src/game/crew.ts` | 4 crew (player = flight engineer), location/health/status; `resetCrew(n)` |
| `src/game/greenhouse.ts` | Greenhouse + food: crops, light cycles, pH alarm, growth, harvest, `foodDays`; `greenhouseDone()` |
| `src/game/radiation.ts` | Radiation: survey readings, berms, space weather (warning → storm → clear), shelter doses |
| `src/game/science.ts` | Mission 7 sites (new/noted/sampled), field-notes answers, delivery, analysis |
| `src/game/settlement.ts` | Mission 9: 30-day resource model (rates per game day), construction timing, crew health, score |
| `src/game/emergency.ts` | Mission 8 emergencies: `EMERGENCIES` data, phases alert→diagnose→repair→recover→report, cabin kPa/temp/O₂ reserve, `detector` signal |
| `src/player/rover.ts` | Drivable rover (see Mission 7) |
| `src/game/power.ts` | Power simulation: towers (deploy/aim/track), bus, battery (100 kWh), loads, `confirmPlan`, `arrayPanel` |
| `src/game/lifesupport.ts` | Life-support simulation + terminal actions (`life` signal, `terminalOpen`) |
| `src/game/knowledge.ts` | Knowledge cards (English) + `cardFor(id, lang)` |
| `src/game/cutscenes.ts` | `CutscenePlayer` (shots with camera fn, subtitle key, narration id) + `buildCutscenes()` |
| `src/audio/audio.ts` | Web Audio: radio voice chain + Quindar tones (`playVoice`), narration (`playNarration`), `stopVoices`, `sfx(name)`, hum, ambient music, breathing |
| `src/ui/App.tsx` | All Preact UI: HUD, waypoint, terminal, cards, Knowledge Center, settings, menus, briefing (per mission), complete screen (`SUMMARY`/`NEXT_MISSION`), cutscene overlay |
| `src/i18n/en.ts`, `my.ts`, `cards-my.ts`, `index.ts` | Translation keys + `t(key, vars)` + `num()` (Myanmar digits) |
| `src/style.css` | HUD/menu/terminal/cutscene styles; `body.lang-my` overrides for Burmese |
| `tools/blender/outpost_assets.py` | Headless Blender script that builds hero GLBs (hab/lab/node modules, rover, floodlight, power unit) |
| `tools/fetch_polyhaven.py` | Downloads CC0 Poly Haven textures/models (`python -I tools/fetch_polyhaven.py <asset ids>`) |
| `tools/make_vo.py` | Kokoro TTS → MP3 voice lines (`<kokoro python> tools/make_vo.py <keys>`) |
| `public/assets/` | polyhaven/, nasa/, models/ (gltfpack-compressed GLB), audio/vo/ |

## How to add a mission (follow the existing pattern)

1. **Mission class** `src/game/missionN.ts` like `mission2.ts`: `STEPS` (`{id, text: 'mN.<id>', done}`),
   `LINES` (`{vo: 'mN_0x', text: 'c.mN.<key>'}`), `begin()`, `current`, `update(dt, p)`,
   `interact(id) → warning key | null`, `label(id) → prompt key | null`, optional `holdId` +
   `holdComplete(id)`, `onFinished` (main plays the ending cutscene), `unlock('<cardId>')` on steps.
2. **Text**: every string is a key. Add English to `en.ts` **and Burmese to `my.ts`** (`mN.title`,
   `mN.<step>`, hints `h.mN.<step>`, comms `c.mN.*`, `briefing.mN.title/text`, `complete.mN.title/text`,
   `complete.mN+1.name`, prompts `p.*`, warnings `w.*`, waypoint labels `wp.*`, cutscene subtitles `cs.*`).
   Knowledge cards: English in `knowledge.ts`, Burmese in `cards-my.ts`. Burmese must be natural
   Unicode Myanmar (not Zawgyi); have a Sonnet subagent review new Burmese text, as was done before.
3. **Voice**: add lines to `LINES` in `tools/make_vo.py` (Mission Control = `am_michael`; keys starting
   `cs_` = narrator `af_heart`), run it with the Kokoro venv python. Files land in `public/assets/audio/vo/`.
4. **World objects**: build in `base.ts` (or a new Blender asset in `outpost_assets.py` → gltfpack → load
   in `main.ts`), add colliders + interactables (prompt label = key).
5. **main.ts wiring**: `registry.set(N, { m: new MissionN(outpost), spawn, intro, ending })`, add the
   world state earlier missions leave behind to `setupWorld(n)` (e.g. `lifeOnline()`, `powerOnline()`),
   and bump `MISSION_COUNT` in `save.ts`. Add `mname.N`, `briefing.mN.*`, `complete.mN.*` keys and
   update `complete.soonTitle`. New terminal kinds go in the `terminal` signal + `App` render.
6. **Guidance**: implement `guide(ctx)` in the mission class so the marker + beam point at its targets.
7. **Cutscenes**: intro/ending shots in `cutscenes.ts` (`move`, `orbit` helpers), narration + `cs.*` keys.
8. **QA**: add `qa/missionN.mjs` (copy mission2.mjs), run it, plus `perf.mjs`, before committing.

## Gotchas learned the hard way

- **Vite/oxc dropped an `import` placed above a file's header comment** (knowledge.ts). Keep imports
  below header comments.
- **n8ao 2.0.1 crashes with three r187** render targets — don't use it (AO was removed).
- `PCFSoftShadowMap` is removed in r187 — use `PCFShadowMap`. `THREE.Timer` replaces `Clock`.
- Blender 5.2: engine id is `BLENDER_EEVEE`; apply rotation before selecting vertices by height.
- **Pointer lock**: free the mouse whenever a non-gameplay screen shows (complete, cutscene, terminal,
  panels). A bug where the mission-complete screen kept the mouse captured was fixed via an `effect`
  on `screen`. Esc always frees the mouse (browser rule) → pause.
- Long inline bash heredocs sometimes fail to parse in this environment — write files with the Write
  tool and run them instead.
- GitHub's anonymous API gets rate-limited; download assets via direct URLs.
- `curl` (Windows Schannel) fails TLS on some NASA hosts (svs.gsfc.nasa.gov) — use the Browser pane
  or Python's urllib; never disable certificate checks.
- **Measure smoothness with `node qa/frames.mjs [mission]`** (vsync on: 16.7 ms = 60 fps). `perf.mjs` runs with
  vsync off, so its fps counts CPU submissions and over-reports badly (it said 100+ while the GPU really did 30).
  Rocks 03/05/07 ship only one ~8k-triangle mesh: the scatter uses gltfpack-simplified `_big.glb`/`_small.glb`
  (made with `-si 0.15|0.05 -sa -noq -tr`). Medium = 60 fps after that fix (2.2M triangles).
- Performance target: the dev PC has only an **Intel UHD 770 integrated GPU**. Honest (vsync) numbers 2026-11-04: Medium 60 fps
  (16.7 ms), High median 60 with dips to 30 (p95 33 ms). `node qa/frames.mjs 1 <url> high` measures one preset. Keep draw calls/lights modest; floodlight SpotLights are skipped on Low.
- The other chat's Vite dev server sometimes serves a stale module after many quick edits (a
  ReferenceError for a removed name): `touch` the changed files to force a fresh transform.
- Event hooks: `onBuild`, `onRadEvent`, `onEmEvent` and `onSettleEvent` take several listeners (each
  mission checks `missionNumber` first); the other `on*Event` hooks in power/habitat/greenhouse/crew
  keep ONE listener (one mission each) — use a list if two missions need one.
- Registry entries are added in main.ts; each mission's `end()` clears its timers on restart/leave.
- Terminals opened by a timer (alarms, reports) free the mouse through the `terminal` effect in main.ts.
- Kokoro voices: Mission Control `am_michael`, narrator `af_heart`, crew `cr_cmdr_*` bf_emma,
  `cr_sci_*` am_adam, `cr_med_*` af_sarah (make_vo.py picks by key prefix).
- **Shadow-only meshes**: three.js skips shadows for meshes that don't write depth, so the body shadow
  uses `SHADOW_LAYER` (layer 1), enabled only on `sun.shadow.camera`. Hidden lights (`visible=false`) cost
  nothing; lights at intensity 0 still add shader cost, so cutscene lights stay hidden when unused.
- **Windows 10 can't draw Emoji 13+** (🪶 🫁 🫧 🪨 show as boxes): pick older emoji for card icons.
- Git Bash `sed -i` turns CRLF files into LF: use Python (bytes + CRLF) on the CRLF files.
- Ultracode may be on, but the owner asked to keep multi-agent work to big decisions + one small
  final-check workflow per mission (Burmese review on Sonnet + one bug reviewer).

## Tools installed on this PC (nothing needs reinstalling)

| Tool | Location |
|---|---|
| Node 26 + npm 11 | `C:\Users\MyPC\tools\node` (on PATH) |
| Python 3.12 (main) | `%LOCALAPPDATA%\Programs\Python\Python312`; also `uv` |
| Blender 5.2.3 LTS (portable, not on PATH) | `C:\Users\MyPC\tools\blender-5.2.3-windows-x64\blender.exe` — run `blender.exe -b --factory-startup --python tools/blender/outpost_assets.py -- <out_dir> [asset ...]` (outputs `assets-src/glb/`) |
| gltfpack 1.3 | `C:\Users\MyPC\tools\gltfpack\gltfpack.exe` — `gltfpack -i in.glb -o public/assets/models/x.glb -cc` |
| Kokoro TTS (venv + model) | `C:\Users\MyPC\tools\venvs\kokoro\Scripts\python.exe`; model files in `C:\Users\MyPC\tools\downloads\kokoro\` |
| rasterio venv (NASA DEM tools, unused so far) | `C:\Users\MyPC\tools\venvs\lunar-dem` |
| ffmpeg 9 | `C:\Users\MyPC\tools\ffmpeg\bin` (on PATH) |
| Chrome 156 / Edge 156 | used by the Playwright QA scripts (`channel: 'chrome'`) |

winget is broken on this PC; install things by downloading official zips/installers into
`C:\Users\MyPC\tools\downloads` or via npm/pip/uv. Project `node_modules` is already installed
(run `npm install` only if it goes missing).

## Roadmap (Missions 3–9) — suggested designs, keep the spec as the authority

Shared systems to build first (they unlock several missions):
- **Outpost resource simulation** (`src/game/outpost.ts`): energy (generation, battery %, load),
  water, food, habitat O₂/temperature, radiation, equipment condition, with rates, thresholds and HUD
  "BASE" panel; time acceleration for the 30-day mission. Life support (Mission 2) becomes part of it.
- **Mission registry + save/load** (localStorage: mission reached, knowledge, settings) and a
  "Continue / Mission select" entry on the main menu (unlocked missions only).
- **Construction system** (Mission 4+): construction terminal UI listing the 10 facility types from the
  spec with costs (e.g. "construction materials" + energy + time), placement on marked build pads,
  build animation, and real effects on the simulation.
- **Crew system** (4 crew: commander, engineer, scientist, medical officer) with health/status panel.
- **Events system** (Mission 8+): data-driven emergencies with severity, affected systems, responses,
  and an after-action explanation card.

Mission ideas:
- **M8 Emergency Response**: chain of events (damaged solar array, O₂ leak, recycler failure, comms
  outage, radiation warning) with diagnosis + repair + consequences + explanation.
- **M9 Sustainable Lunar Settlement**: 30-day challenge with time acceleration, all systems + crew,
  random events, end report/score. Win = all crew safe at day 30.

Science must stay accurate and age-appropriate, sourced from NASA (or similar) and each card's
"In this game" line must say what the game simplifies. No NASA logos/insignia anywhere; data sources are credited in README.md
("Built with"). Offline USB copy: tools/usb (see README).

## Working with the owner

- **Keep token use lean** (owner's request): no multi-agent checks while building, only for big
  decisions/final testing; Sonnet helpers for routine jobs (Burmese review, lookups); few, targeted
  test runs; but send preview screenshots after each chunk of progress.

- He tests in Chrome at http://localhost:5173 and sends screenshots of problems; fix root causes.
- Send preview screenshots during big changes.
- Commit after each milestone (`git` is set up locally with his name/email). `origin` is GitHub; pushing `main`
  publishes the live site, so push only when the owner wants an update online.
- Ask before anything costly or outside the project (paid services, deploying/publishing).
- Hosting is not set up yet; when asked, a GitHub Pages deploy of `dist/` is the planned free option.
