# Junior Astronaut: Lunar Survival Mission

A first-person 3D browser game about building and running a base on the Moon, for students
aged about 10–15. Nine missions take you from your first steps at the lunar south pole to
keeping a four-person crew alive for 30 days. Every system is based on real NASA science,
and every science card says what the game simplifies.

Plays in English and Burmese (Myanmar), on a desktop PC with keyboard and mouse.

## The missions

1. **First Steps on the Moon**: low-gravity walking, the suit, the first inspection
2. **Life Support Activation**: oxygen generator and water recycling
3. **Power Up the Outpost**: solar towers, batteries and the dark hours
4. **Build a Lunar Habitat**: an inflatable module, pressure and temperature
5. **Establish Food Production**: a greenhouse with LED light and hydroponics
6. **Radiation Protection**: regolith shielding and a solar storm shelter
7. **Scientific Exploration**: drive the rover to three science sites
8. **Emergency Response**: a damaged solar tower, an air leak, a failed cooling pump
9. **Sustainable Lunar Settlement**: 30 days with every system linked

## Secrets

Every mission hides 2–3 secret discoveries off the guided path: an iron meteorite, ice in a
shadowed crater, an old robot lander, a lava-tube skylight, and tributes to real Apollo moments
(a golf ball, a hammer and feather, a family photo). Look for a gold glint and listen for the suit
scanner's chirp. Each one plays its own cutscene and unlocks a bonus science card (22 in all).

## Controls

W A S D move · mouse look · Space jump · Shift run · E use (hold E to repair) · F helmet lamp ·
K Knowledge Center · C crew · T settlement panel (Mission 9) · Esc pause.
In the rover: W/S drive, A/D steer, Space brake, E get out.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build at http://localhost:4173
```

`dist/` is a plain static website (relative paths), so it can be hosted anywhere: GitHub
Pages, Netlify, Cloudflare Pages, or a school web server. The included workflow
`.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main`.

Tip for teachers: add `?unlock=9` to the address to open every mission in Mission select.

## Performance

Tested on an Intel UHD 770 integrated GPU at 1600×900: Medium quality holds a smooth 60 fps;
High adds boot prints, more dust and a sharper visor reflection, and dips below 60 at times. Quality (Low / Medium / High) can be changed in Settings.

## Built with

All free and open-source: three.js, postprocessing, Rapier physics, Preact, Vite and TypeScript.
Models were made with Blender and compressed with gltfpack. Voices were made with Kokoro TTS.
Rock models and textures are from Poly Haven (CC0). The Earth image is NASA's Blue Marble.
No NASA logos or insignia are used. The game is an educational project, not affiliated with or
endorsed by NASA. The team and these tools are listed in the game's Credits (main menu, and over the music video).

## Offline copy (USB)

`npm run build`, then copy `dist/` to `release/Junior Astronaut/game/` next to the files in `tools/usb/`
(`Play Junior Astronaut.bat`, `server.ps1`, `README.txt`). On another Windows PC, double-clicking the .bat
starts a tiny local web server (Windows' built-in HttpListener, ports 8765+) and opens the game: no
internet or installs. `release/` is git-ignored.

## Development

See `CLAUDE.md` for the code map, how missions are built, and the automated tests in `qa/`.
