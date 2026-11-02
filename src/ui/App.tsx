import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { setVolume } from '../audio/audio';
import { settings, updateSettings, type Quality } from '../engine/settings';
import { CARDS } from '../game/knowledge';
import { life, O2_STEPS, o2Step, SAFE_O2, startWater, terminalOpen, type SysState } from '../game/lifesupport';
import {
  cardPopup,
  clock,
  comms,
  fps,
  heading,
  holdProgress,
  missionNumber,
  knowledge,
  loadProgress,
  mission,
  panel,
  prompt,
  screen,
  suit,
  warning,
} from '../game/state';

export interface Actions {
  start: () => void;
  resume: () => void;
  restart: () => void;
  toMenu: () => void;
  next: () => void;
  closeTerminal: () => void;
  setQuality: (q: Quality) => void;
}

const CONTROLS: [string, string][] = [
  ['W A S D', 'Walk'],
  ['Mouse', 'Look around'],
  ['Space', 'Jump (low gravity!)'],
  ['Shift', 'Hold to sprint (uses more oxygen)'],
  ['E', 'Use / scan / interact'],
  ['F', 'Helmet light'],
  ['K', 'Knowledge Center'],
  ['Esc', 'Free the mouse and pause'],
  ['↑ ↓ ← →', 'Look around (for touchpads)'],
];

function Keys({ k }: { k: string }) {
  return (
    <span class="keys">
      {k.split(' ').map((p) => (
        <kbd>{p}</kbd>
      ))}
    </span>
  );
}

function ControlsCard() {
  return (
    <div class="controls-grid">
      {CONTROLS.map(([k, v]) => (
        <div class="ctrl">
          <Keys k={k} />
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Bar({ label, value, unit, warnAt, critAt, invert }: { label: string; value: number; unit: string; warnAt: number; critAt: number; invert?: boolean }) {
  const level = invert ? (value >= critAt ? 'crit' : value >= warnAt ? 'warn' : 'ok') : value <= critAt ? 'crit' : value <= warnAt ? 'warn' : 'ok';
  const pct = invert ? Math.min(100, (value / (critAt * 1.25)) * 100) : value;
  return (
    <div class={`vital ${level}`}>
      <div class="vital-row">
        <span class="vital-label">{label}</span>
        <span class="vital-value">
          {value.toFixed(unit === 'mSv' ? 2 : 0)}
          <small>{unit}</small>
        </span>
      </div>
      <div class="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function Compass() {
  const h = heading.value;
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  const marks = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const rel = ((deg - h + 540) % 360) - 180; // -180..180, 0 = straight ahead
    if (Math.abs(rel) > 88) continue;
    marks.push(
      <span class={names[deg] ? 'major' : ''} style={{ left: `${50 + rel / 1.8}%` }}>
        {names[deg] ?? '·'}
      </span>,
    );
  }
  return (
    <div class="compass">
      {marks}
      <b>{Math.round(h).toString().padStart(3, '0')}°</b>
    </div>
  );
}

function Hud() {
  const s = suit.value;
  const m = mission.value;
  const c = clock.value;
  const hh = Math.floor(c.minutes / 60) % 24;
  const mm = Math.floor(c.minutes % 60);
  return (
    <div class="hud">
      <div class="visor-edge" />
      <Compass />
      <div class="panel objective">
        <div class="panel-title">{m.title}</div>
        <ul>
          {m.steps.map((st, i) => {
            const firstOpen = m.steps.findIndex((x) => !x.done);
            const state = st.done ? 'done' : i === firstOpen ? 'current' : 'todo';
            return (
              <li class={state}>
                <span class="tick">{st.done ? '✓' : i === firstOpen ? '▸' : '○'}</span>
                {st.text}
                {st.progress && !st.done ? <em> {st.progress}</em> : null}
              </li>
            );
          })}
        </ul>
      </div>
      <div class="panel clock">
        <span>MISSION DAY</span>
        <b>{c.day}</b>
        <span>
          {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')} UTC
        </span>
      </div>
      <div class="comms">
        {comms.value.slice(-2).map((cm) => (
          <div class="comm" key={cm.id}>
            <span class="from">📡 {cm.from}</span>
            <p>{cm.text}</p>
          </div>
        ))}
      </div>
      <div class="panel vitals">
        <div class="panel-title">SUIT STATUS</div>
        <Bar label="O₂" value={s.o2} unit="%" warnAt={35} critAt={15} />
        <Bar label="POWER" value={s.power} unit="%" warnAt={30} critAt={12} />
        <Bar label="HEALTH" value={s.health} unit="%" warnAt={50} critAt={25} />
        <div class="vital-mini">
          <span>
            SUIT <b>{s.tempIn.toFixed(0)}°C</b>
          </span>
          <span>
            OUTSIDE <b>{s.tempOut.toFixed(0)}°C</b>
          </span>
          <span>
            DOSE <b>{s.dose.toFixed(2)} mSv</b>
          </span>
          {s.light ? <span class="lamp">LAMP ON</span> : null}
        </div>
      </div>
      <div class="crosshair" />
      {prompt.value ? (
        <div class="prompt">
          <kbd>E</kbd> {prompt.value}
          {holdProgress.value !== null ? (
            <div class="bar hold">
              <i style={{ width: `${Math.round(holdProgress.value * 100)}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}
      {warning.value ? <div class="warning">⚠ {warning.value}</div> : null}
      {settings.value.quality && fps.value ? <div class="fps">{fps.value} fps</div> : null}
    </div>
  );
}

const STATE_TEXT: Record<SysState, string> = { offline: 'OFFLINE', starting: 'STARTING', online: 'ONLINE', damaged: 'FAULT' };

function SysRow({ name, state, children }: { name: string; state: SysState; children?: ComponentChildren }) {
  return (
    <div class={`sys ${state}`}>
      <div class="sys-head">
        <span class="led" />
        <b>{name}</b>
        <span class="sys-state">{STATE_TEXT[state]}</span>
      </div>
      {children}
    </div>
  );
}

function Terminal({ actions }: { actions: Actions }) {
  const l = life.value;
  const o2pct = Math.max(0, Math.min(100, ((l.habO2 - 12) / (SAFE_O2 - 12)) * 100));
  return (
    <div class="modal-backdrop">
      <div class="modal terminal">
        <div class="modal-head">
          <h2>LSS-1 · Life Support Control</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            Back to suit
          </button>
        </div>
        <div class="gauges">
          <div class="gauge">
            <span>Habitat oxygen</span>
            <b class={l.habO2 < 19.5 ? 'low' : 'good'}>{l.habO2.toFixed(1)}%</b>
            <div class="bar">
              <i style={{ width: `${o2pct}%` }} />
            </div>
            <small>Safe: 19.5–23.5% · Earth's air: 20.9%</small>
          </div>
          <div class="gauge">
            <span>Water tank</span>
            <b class={l.waterL < 30 ? 'low' : 'good'}>{l.waterL.toFixed(0)} L</b>
            <div class="bar">
              <i style={{ width: `${(l.waterL / 120) * 100}%` }} />
            </div>
            <small>Capacity 120 L</small>
          </div>
        </div>
        <SysRow name="Oxygen Generator (electrolysis)" state={l.o2gen}>
          <ol class="checklist">
            {O2_STEPS.map((st, i) => (
              <li class={i < l.o2Step ? 'done' : i === l.o2Step ? 'next' : ''}>
                <button class="btn small" disabled={i !== l.o2Step || l.o2gen === 'online'} onClick={() => o2Step(i)}>
                  {i < l.o2Step ? '✓' : i + 1}. {st.label}
                </button>
                {i <= l.o2Step ? <small>{st.why}</small> : null}
              </li>
            ))}
          </ol>
        </SysRow>
        <SysRow name="Water Recovery System" state={l.water}>
          {l.water === 'damaged' ? (
            <p class="fault">Filter clogged with regolith dust. Flow blocked. Replace the filter at the front of the unit.</p>
          ) : (
            <button class="btn small" disabled={l.water === 'online'} onClick={startWater}>
              {l.water === 'online' ? '✓ Recovering water' : 'Start water recovery'}
            </button>
          )}
        </SysRow>
        <SysRow name="CO₂ Scrubber" state={l.co2}>
          <small>Removing the carbon dioxide the crew breathes out.</small>
        </SysRow>
      </div>
    </div>
  );
}

function KnowledgeCard({ id, onClose }: { id: string; onClose: () => void }) {
  const c = CARDS[id];
  if (!c) return null;
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-icon">{c.icon}</span>
        <div>
          <small>KNOWLEDGE UNLOCKED</small>
          <h3>{c.title}</h3>
        </div>
      </div>
      {c.body.map((p) => (
        <p>{p}</p>
      ))}
      <p class="ingame">
        <b>In this game:</b> {c.inGame}
      </p>
      <p class="source">Source: {c.source}</p>
      <button class="btn small" onClick={onClose}>
        Got it
      </button>
    </div>
  );
}

function KnowledgeCenter() {
  const unlocked = knowledge.value;
  const [sel, setSel] = useState<string | null>(unlocked[0] ?? null);
  const all = Object.values(CARDS);
  const c = sel ? CARDS[sel] : null;
  return (
    <div class="kc">
      <div class="kc-list">
        {all.map((card) => {
          const open = unlocked.includes(card.id);
          return (
            <button class={`kc-item ${sel === card.id ? 'sel' : ''}`} disabled={!open} onClick={() => setSel(card.id)}>
              <span>{open ? card.icon : '🔒'}</span> {open ? card.title : 'Locked'}
            </button>
          );
        })}
      </div>
      <div class="kc-body">
        {c ? (
          <>
            <h3>
              {c.icon} {c.title}
            </h3>
            {c.body.map((p) => (
              <p>{p}</p>
            ))}
            <p class="ingame">
              <b>In this game:</b> {c.inGame}
            </p>
            <p class="source">Source: {c.source}</p>
          </>
        ) : (
          <p>Explore and complete objectives to unlock science facts.</p>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ actions }: { actions: Actions }) {
  const s = settings.value;
  return (
    <div class="settings">
      <label>
        Mouse sensitivity <b>{s.sensitivity.toFixed(1)}</b>
        <input type="range" min="0.2" max="3" step="0.1" value={s.sensitivity} onInput={(e) => updateSettings({ sensitivity: +(e.target as HTMLInputElement).value })} />
      </label>
      <label>
        Field of view <b>{s.fov}°</b>
        <input type="range" min="60" max="100" step="1" value={s.fov} onInput={(e) => updateSettings({ fov: +(e.target as HTMLInputElement).value })} />
      </label>
      <label>
        Volume <b>{Math.round(s.volume * 100)}%</b>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={s.volume}
          onInput={(e) => {
            const v = +(e.target as HTMLInputElement).value;
            updateSettings({ volume: v });
            setVolume(v);
          }}
        />
      </label>
      <label class="check">
        <input type="checkbox" checked={s.invertY} onChange={(e) => updateSettings({ invertY: (e.target as HTMLInputElement).checked })} /> Invert mouse up/down
      </label>
      <label class="check">
        <input type="checkbox" checked={s.arrowLook} onChange={(e) => updateSettings({ arrowLook: (e.target as HTMLInputElement).checked })} /> Look with arrow keys
      </label>
      <div class="quality">
        Graphics quality
        <div class="seg">
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <button class={s.quality === q ? 'on' : ''} onClick={() => actions.setQuality(q)}>
              {q}
            </button>
          ))}
        </div>
        <small>Use Low on older laptops. Terrain detail changes after a restart.</small>
      </div>
      <button class="btn small" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
        Toggle fullscreen
      </button>
    </div>
  );
}

function Credits() {
  return (
    <div class="credits">
      <p>
        <b>Junior Astronaut: Lunar Survival Mission</b> is an educational game. It is not affiliated with or endorsed by NASA.
      </p>
      <ul>
        <li>Moon surface textures and rock scans: Poly Haven "Moon" collection (CC0)</li>
        <li>Earth images: NASA Visible Earth, Blue Marble (NASA Goddard Space Flight Center)</li>
        <li>Mission Control voice: Kokoro-82M text-to-speech (Apache-2.0)</li>
        <li>Fonts: Atkinson Hyperlegible Next, B612 Mono, Orbitron (SIL Open Font License)</li>
        <li>Engine: three.js, Rapier physics, postprocessing, Preact (MIT/Apache/Zlib)</li>
      </ul>
    </div>
  );
}

function Panel({ actions }: { actions: Actions }) {
  const p = panel.value;
  if (!p) return null;
  const titles = { settings: 'Settings', controls: 'Controls', knowledge: 'Knowledge Center', credits: 'Credits & data sources' };
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && (panel.value = null)}>
      <div class={`modal ${p}`}>
        <div class="modal-head">
          <h2>{titles[p]}</h2>
          <button class="close" onClick={() => (panel.value = null)}>
            ✕
          </button>
        </div>
        {p === 'settings' && <SettingsPanel actions={actions} />}
        {p === 'controls' && <ControlsCard />}
        {p === 'knowledge' && <KnowledgeCenter />}
        {p === 'credits' && <Credits />}
      </div>
    </div>
  );
}

function Menu({ actions }: { actions: Actions }) {
  return (
    <div class="menu">
      <div class="menu-inner">
        <div class="patch">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3" />
            <circle cx="50" cy="56" r="22" fill="currentColor" opacity="0.2" />
            <path d="M28 66 Q50 40 72 66" fill="none" stroke="currentColor" stroke-width="3" />
            <circle cx="70" cy="30" r="7" fill="#4fa3ff" />
            <path d="M44 30 l6 -12 l6 12 z" fill="currentColor" />
          </svg>
        </div>
        <h1>
          JUNIOR ASTRONAUT
          <span>Lunar Survival Mission</span>
        </h1>
        <p class="tagline">Build and run a research outpost at the Moon's south pole. Keep your crew alive for 30 days.</p>
        <div class="menu-buttons">
          <button class="btn primary" onClick={actions.start}>
            Start Mission 1
          </button>
          <button class="btn" onClick={() => (panel.value = 'controls')}>
            Controls
          </button>
          <button class="btn" onClick={() => (panel.value = 'settings')}>
            Settings
          </button>
          <button class="btn" onClick={() => (panel.value = 'knowledge')}>
            Knowledge Center
          </button>
          <button class="btn" onClick={() => (panel.value = 'credits')}>
            Credits
          </button>
        </div>
        <p class="note">Best with a keyboard and mouse on a computer, in Chrome or Edge.</p>
      </div>
    </div>
  );
}

function Briefing({ actions }: { actions: Actions }) {
  return (
    <div class="menu briefing">
      <div class="menu-inner wide">
        <h2>Mission 1 · First Steps on the Moon</h2>
        <p>
          You have just landed at the lunar south pole with your crew. Step out of the lander, get used to walking in low gravity, find the outpost and check its
          environment sensors before going inside.
        </p>
        <ControlsCard />
        <button class="btn primary" onClick={actions.resume}>
          Click to begin
        </button>
        <p class="note">The game captures your mouse. Press Esc any time to free it and pause.</p>
      </div>
    </div>
  );
}

function Paused({ actions }: { actions: Actions }) {
  return (
    <div class="menu paused">
      <div class="menu-inner">
        <h2>PAUSED</h2>
        <div class="menu-buttons">
          <button class="btn primary" onClick={actions.resume}>
            Resume
          </button>
          <button class="btn" onClick={() => (panel.value = 'knowledge')}>
            Knowledge Center
          </button>
          <button class="btn" onClick={() => (panel.value = 'settings')}>
            Settings
          </button>
          <button class="btn" onClick={() => (panel.value = 'controls')}>
            Controls
          </button>
          <button class="btn" onClick={actions.restart}>
            Restart mission
          </button>
          <button class="btn" onClick={actions.toMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}

const SUMMARY: Record<number, { title: string; text: string; next?: string }> = {
  1: {
    title: 'First Steps on the Moon',
    text: 'You walked in one-sixth gravity, found Earth, reached the outpost and checked its sensors.',
    next: 'Mission 2 · Life Support Activation',
  },
  2: {
    title: 'Life Support Activation',
    text: 'You started the oxygen generator, fixed the water recycler and made the habitat air safe to breathe.',
  },
};

function Complete({ actions }: { actions: Actions }) {
  const m = SUMMARY[missionNumber.value];
  return (
    <div class="menu complete">
      <div class="menu-inner wide">
        <small class="kicker">MISSION {missionNumber.value} COMPLETE</small>
        <h2>{m.title}</h2>
        <p>
          {m.text} You have unlocked {knowledge.value.length} science facts so far.
        </p>
        {m.next ? null : (
          <p class="next">
            <b>Next: Mission 3 · Power Up the Outpost</b>, coming in the next build.
          </p>
        )}
        <div class="menu-buttons row">
          <button class="btn" onClick={() => (panel.value = 'knowledge')}>
            Review Knowledge Center
          </button>
          <button class="btn" onClick={actions.restart}>
            Play again
          </button>
          {m.next ? (
            <button class="btn primary" onClick={actions.next}>
              Continue: {m.next}
            </button>
          ) : (
            <button class="btn primary" onClick={actions.toMenu}>
              Main menu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div class="menu loading">
      <div class="menu-inner">
        <h1>
          JUNIOR ASTRONAUT<span>Preparing the landing site…</span>
        </h1>
        <div class="bar big">
          <i style={{ width: `${Math.round(loadProgress.value * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function PhoneNotice() {
  return (
    <div class="phone">
      <h1>
        JUNIOR ASTRONAUT<span>Lunar Survival Mission</span>
      </h1>
      <p>This mission needs a computer with a keyboard and mouse. Please open this page on a PC or laptop.</p>
    </div>
  );
}

export function App({ actions }: { actions: Actions }) {
  const [isPhone] = useState(() => matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
  useEffect(() => {
    if (cardPopup.value) {
      const t = setTimeout(() => (cardPopup.value = null), 14000);
      return () => clearTimeout(t);
    }
  }, [cardPopup.value]);
  if (isPhone) return <PhoneNotice />;
  const sc = screen.value;
  return (
    <>
      {(sc === 'playing' || sc === 'paused') && <Hud />}
      {sc === 'loading' && <Loading />}
      {sc === 'menu' && <Menu actions={actions} />}
      {sc === 'briefing' && <Briefing actions={actions} />}
      {sc === 'paused' && !panel.value && <Paused actions={actions} />}
      {sc === 'complete' && <Complete actions={actions} />}
      {sc === 'playing' && terminalOpen.value && <Terminal actions={actions} />}
      {sc === 'playing' && !terminalOpen.value && cardPopup.value && <KnowledgeCard id={cardPopup.value} onClose={() => (cardPopup.value = null)} />}
      <Panel actions={actions} />
    </>
  );
}
