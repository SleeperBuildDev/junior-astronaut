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
- **Mission registry + save**: missions run from `registry` in main.ts; progress (highest mission +
  cards) saved in localStorage; main menu shows Continue + Mission select once Mission 2 is unlocked.
- World: procedural crater terrain + Poly Haven Moon textures/rocks, low south-pole sun with long
  shadows, stars + Milky Way, Earth (NASA Blue Marble), outpost (Blender GLB hero models + code-built
  parts), rover (parked, not drivable), floodlights, tracks/footprints, landing pad lights.
- PC controls, low-gravity Rapier character controller, suit HUD (O₂/power/health/temp/radiation,
  mission day clock, compass, objective panel + "What to do" hint, Mission Control comms, prompts,
  warnings), waypoint marker + light beam to the current target, knowledge cards + Knowledge Center,
  menus (main, briefing, pause, settings, controls, credits, mission complete), phone notice.
- **English + Burmese** UI (Settings → Language). Mission Control voice is English with Burmese subtitles.
- Mission Control radio voice lines (Kokoro TTS) + narrator voice for cutscenes.
- Cutscenes: Mission 1 landing intro (descent + ballistic dust), Mission 1 ending, Mission 2 intro + ending.
- Procedural sound effects (Web Audio), machinery hum, ambient music.

**Remaining (the main job): Missions 4–9** plus the systems they need — see "Roadmap" below.

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
  - `node qa/mission1.mjs`, `node qa/mission2.mjs`, `node qa/mission3.mjs [en|my]` — automated playthroughs with screenshots.
  - `node qa/cutscenes.mjs [en|my]` — screenshots of every cutscene.
  - `node qa/shots.mjs <prefix>` — eye-level beauty shots of the outpost.
  - `node qa/guide.mjs [en|my]` — guidance marker + language screenshots.
  - `node qa/sfx.mjs` — plays every sound effect, checks the audio engine.
  These rely on **QA hooks** exposed only with `?qa=1` (`window.__qa`): `start, play, next, skip,
  cut(name), teleport(x,z,yaw,pitch), look(yaw,pitch), key(code,ms), holdE(ms), closeTerminal,
  state, info, gpu, show(name,on), shadows(on), quality(q), sfx(name), audio, cutscene,
  mission(n)` (jump to mission n), `goTo(id, dist, angle?)` (stand in front of an interactable),
  `power, speed, progress`.
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
| `src/game/state.ts` | Signals: screen, panel, suit, mission, prompt, warning, comms, knowledge, cardPopup, missionNumber, holdProgress, waypoint, cinema, `terminal` ('life'/'power'/'array'), `gameSpeed` (game s per real s, normal 30) |
| `src/game/mission.ts` | `GameMission` interface (begin/update/interact/label/guide/hold) every mission implements |
| `src/game/mission1.ts` … `mission3.ts` | Mission classes (pattern below); each owns its guide targets |
| `src/game/save.ts` | `progress` (reached mission, knowledge) in localStorage, `MISSION_COUNT`, `missionDone(n)` |
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
- Performance target: the dev PC has only an **Intel UHD 770 integrated GPU**. Current: Medium ≈ 95–110 fps,
  High ≈ 70+, Low ≈ 200+ at 1600×900 (after Mission 3: Medium ≈ 100 fps, 386 draw calls). Keep draw calls/lights modest; floodlight SpotLights are skipped on Low.

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
- **M4 Build a Lunar Habitat**: introduce the construction terminal; build a sleep module and connect it
  to the node; pressurise it, set temperature. Cards: pressurised habitats, thermal control.
- **M5 Establish Food Production**: build/activate a greenhouse module (LED growing lights, hydroponics),
  balance its water + energy, plant and monitor growth. Cards: controlled-environment agriculture,
  NASA Veggie experiments on the ISS.
- **M6 Radiation Protection**: read the radiation monitor, find exposed areas, pile regolith shielding
  over the habitat with a small excavator/rover attachment, then a solar particle event drill (get the
  crew into the shelter in time). Cards: solar particle events, regolith shielding.
- **M7 Scientific Exploration**: make the parked rover drivable (Rapier `DynamicRayCastVehicleController`,
  E to enter/exit), drive to sample sites beyond the base (expand play area), collect soil/rock samples
  (scan + scoop), log observations, return them to the lab. Cards: lunar geology, water ice in shadowed
  craters, ISRU (oxygen from regolith).
- **M8 Emergency Response**: chain of events (damaged solar array, O₂ leak, recycler failure, comms
  outage, radiation warning) with diagnosis + repair + consequences + explanation.
- **M9 Sustainable Lunar Settlement**: 30-day challenge with time acceleration, all systems + crew,
  random events, end report/score. Win = all crew safe at day 30.

Science must stay accurate and age-appropriate, sourced from NASA (or similar) and each card's
"In this game" line must say what the game simplifies. No NASA logos/insignia anywhere; credits list
data sources (see the Credits screen).

## Working with the owner

- **Keep token use lean** (owner's request): no multi-agent checks while building, only for big
  decisions/final testing; Sonnet helpers for routine jobs (Burmese review, lookups); few, targeted
  test runs; but send preview screenshots after each chunk of progress.

- He tests in Chrome at http://localhost:5173 and sends screenshots of problems; fix root causes.
- Send preview screenshots during big changes.
- Commit after each milestone (`git` is set up locally with his name/email; no remote yet).
- Ask before anything costly or outside the project (paid services, deploying/publishing).
- Hosting is not set up yet; when asked, a GitHub Pages deploy of `dist/` is the planned free option.
