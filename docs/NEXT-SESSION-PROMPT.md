Hi Claude. You're taking over my game project from another Claude session. Please continue building it.

PROJECT
- Game: "Junior Astronaut: Lunar Survival Mission", a first-person 3D Moon survival and base-building
  game that teaches space science to students (about 10–15 years old). It runs as a website on a
  desktop PC (keyboard + mouse), built with three.js, Rapier physics, Preact and Vite.
- Folder: C:\Users\MyPC\Projects\junior-astronaut (a local git repo, one commit per milestone).
- Read these first, they have everything you need:
  1. CLAUDE.md in the project folder: status, how to run and test, code map, how to add a mission,
     gotchas, installed tools, roadmap.
  2. docs/SPEC.md: my full original design spec (section 13 got cut off; ask me if you need it).

WHAT'S DONE
Missions 1 (First Steps on the Moon) and 2 (Life Support Activation) are fully playable, with
cutscenes, Mission Control voice, sound effects, a suit HUD, a waypoint guide, knowledge cards,
English + Burmese language, and quality settings for weak laptops. All tests pass.

WHAT I WANT NOW
Build the remaining missions 3 to 9 from the spec, one at a time, in the same style and quality
as missions 1 and 2:
  3 Power Up the Outpost · 4 Build a Lunar Habitat · 5 Establish Food Production ·
  6 Radiation Protection · 7 Scientific Exploration (with a drivable rover) ·
  8 Emergency Response · 9 Sustainable Lunar Settlement (the 30-day challenge)
Also build the systems they need (outpost resource simulation, construction, 4-person crew,
emergency events, save/load with mission select). CLAUDE.md has suggested designs; the spec wins
if they disagree.

For every mission, include:
- objectives with "What to do" hints and waypoint targets
- Mission Control voice lines (Kokoro, free and local) and an intro + ending cutscene with narration
- new science cards (accurate, NASA-based, saying what the game simplifies)
- ALL new text in English AND natural Burmese (Unicode); have a helper review the Burmese
- sound effects, and detailed models (Blender script → gltfpack) where it helps
- an automated Playwright test (qa/missionN.mjs) and a speed check (qa/perf.mjs); the game must
  stay smooth on my Intel UHD 770 integrated graphics

HOW I LIKE TO WORK
- Free tools only: no paid APIs, keys or subscriptions.
- Show me preview screenshots along the way, and explain things simply.
- The controls must stay correct for a PC with keyboard and mouse. Always free the mouse on menus,
  cutscenes, terminals and mission-complete screens (that was a bug we fixed).
- Commit to git after each mission.
- Before starting, refactor main.ts so missions come from a registry instead of being hard-wired
  as mission 1 / 2 (CLAUDE.md explains this).

SETUP NOTES
- Everything is already installed on this PC (Node, Python, Blender 5.2.3, gltfpack, the Kokoro
  voice venv, ffmpeg, Chrome). Nothing needs reinstalling. CLAUDE.md lists the paths.
- Run the game with `npm run dev` in the project folder, then open http://localhost:5173.

Start by reading CLAUDE.md and docs/SPEC.md, run the game and the existing tests to check
everything works, then tell me your plan for Mission 3 and begin.
