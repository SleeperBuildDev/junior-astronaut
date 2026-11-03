import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { setVolume } from '../audio/audio';
import { settings, updateSettings, type Quality } from '../engine/settings';
import { cardFor, CARDS } from '../game/knowledge';
import { life, O2_STEPS, o2Step, SAFE_O2, startWater, terminalOpen, type SysState } from '../game/lifesupport';
import {
  cardPopup,
  cinema,
  clock,
  comms,
  fps,
  heading,
  holdProgress,
  knowledge,
  loadProgress,
  mission,
  missionNumber,
  panel,
  prompt,
  screen,
  suit,
  warning,
  waypoint,
} from '../game/state';
import { num, t } from '../i18n';

export interface Actions {
  start: () => void;
  resume: () => void;
  restart: () => void;
  toMenu: () => void;
  next: () => void;
  closeTerminal: () => void;
  skipCutscene: () => void;
  setQuality: (q: Quality) => void;
}

const CONTROLS: [string, string][] = [
  ['W A S D', 'ctrl.walk'],
  ['key.mouse', 'ctrl.look'],
  ['Space', 'ctrl.jump'],
  ['Shift', 'ctrl.sprint'],
  ['E', 'ctrl.use'],
  ['F', 'ctrl.light'],
  ['K', 'ctrl.kc'],
  ['Esc', 'ctrl.pause'],
  ['↑ ↓ ← →', 'ctrl.arrows'],
];

function Keys({ k }: { k: string }) {
  const label = k.startsWith('key.') ? t(k) : k;
  return (
    <span class="keys">
      {label.split(' ').map((p) => (
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
          <span>{t(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Bar({ label, value, unit, warnAt, critAt }: { label: string; value: number; unit: string; warnAt: number; critAt: number }) {
  const level = value <= critAt ? 'crit' : value <= warnAt ? 'warn' : 'ok';
  return (
    <div class={`vital ${level}`}>
      <div class="vital-row">
        <span class="vital-label">{label}</span>
        <span class="vital-value">
          {value.toFixed(0)}
          <small>{unit}</small>
        </span>
      </div>
      <div class="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
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

/** Points to the current objective: a marker on it, or an arrow at the screen edge. */
function Waypoint() {
  const w = waypoint.value;
  if (!w) return null;
  const dist = w.dist === null ? '' : `${Math.round(w.dist)} ${t('hud.m')}`;
  if (w.onScreen)
    return (
      <div class="wp" style={{ left: `${w.x}px`, top: `${w.y}px` }}>
        <div class="wp-diamond" />
        <div class="wp-label">
          {t(w.label)}
          {dist ? <b> {dist}</b> : null}
        </div>
      </div>
    );
  return (
    <div class="wp edge" style={{ left: `${w.x}px`, top: `${w.y}px` }}>
      <div class="wp-arrow" style={{ transform: `rotate(${w.angle}rad)` }}>
        ➤
      </div>
      <div class="wp-label">
        {t(w.label)}
        {dist ? <b> {dist}</b> : null}
      </div>
    </div>
  );
}

function Hud() {
  const s = suit.value;
  const m = mission.value;
  const c = clock.value;
  const hh = Math.floor(c.minutes / 60) % 24;
  const mm = Math.floor(c.minutes % 60);
  const firstOpen = m.steps.findIndex((x) => !x.done);
  const current = firstOpen >= 0 ? m.steps[firstOpen] : null;
  return (
    <div class="hud">
      <div class="visor-edge" />
      <Compass />
      <Waypoint />
      <div class="panel objective">
        <div class="panel-title">{t(m.title)}</div>
        <ul>
          {m.steps.map((st, i) => {
            const state = st.done ? 'done' : i === firstOpen ? 'current' : 'todo';
            return (
              <li class={state}>
                <span class="tick">{st.done ? '✓' : i === firstOpen ? '▸' : '○'}</span>
                {t(st.text)}
                {st.progress && !st.done ? <em> {st.progress}</em> : null}
              </li>
            );
          })}
        </ul>
        {current ? (
          <div class="todo">
            <span>💡 {t('hud.todo')}</span>
            <p>{t('h.' + current.text)}</p>
          </div>
        ) : null}
      </div>
      <div class="panel clock">
        <span>{t('hud.day')}</span>
        <b>{c.day}</b>
        <span>
          {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')} UTC
        </span>
      </div>
      <div class="comms">
        {comms.value.slice(-2).map((cm) => (
          <div class="comm" key={cm.id}>
            <span class="from">📡 {t(cm.from)}</span>
            <p>{t(cm.text)}</p>
          </div>
        ))}
      </div>
      <div class="panel vitals">
        <div class="panel-title">{t('hud.suit')}</div>
        <Bar label="O₂" value={s.o2} unit="%" warnAt={35} critAt={15} />
        <Bar label={t('hud.power')} value={s.power} unit="%" warnAt={30} critAt={12} />
        <Bar label={t('hud.health')} value={s.health} unit="%" warnAt={50} critAt={25} />
        <div class="vital-mini">
          <span>
            {t('hud.suitTemp')} <b>{s.tempIn.toFixed(0)}°C</b>
          </span>
          <span>
            {t('hud.outside')} <b>{s.tempOut.toFixed(0)}°C</b>
          </span>
          <span>
            {t('hud.dose')} <b>{s.dose.toFixed(2)} mSv</b>
          </span>
          {s.light ? <span class="lamp">{t('hud.lamp')}</span> : null}
        </div>
      </div>
      <div class="crosshair" />
      {prompt.value ? (
        <div class="prompt">
          <kbd>E</kbd> {t(prompt.value)}
          {holdProgress.value !== null ? (
            <div class="bar hold">
              <i style={{ width: `${Math.round(holdProgress.value * 100)}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}
      {warning.value ? <div class="warning">⚠ {t(warning.value)}</div> : null}
      {fps.value ? <div class="fps">{fps.value} fps</div> : null}
    </div>
  );
}

function SysRow({ name, state, children }: { name: string; state: SysState; children?: ComponentChildren }) {
  return (
    <div class={`sys ${state}`}>
      <div class="sys-head">
        <span class="led" />
        <b>{name}</b>
        <span class="sys-state">{t('state.' + state)}</span>
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
          <h2>{t('term.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="gauges">
          <div class="gauge">
            <span>{t('term.habO2')}</span>
            <b class={l.habO2 < 19.5 ? 'low' : 'good'}>{l.habO2.toFixed(1)}%</b>
            <div class="bar">
              <i style={{ width: `${o2pct}%` }} />
            </div>
            <small>{t('term.safe')}</small>
          </div>
          <div class="gauge">
            <span>{t('term.water')}</span>
            <b class={l.waterL < 30 ? 'low' : 'good'}>{l.waterL.toFixed(0)} L</b>
            <div class="bar">
              <i style={{ width: `${(l.waterL / 120) * 100}%` }} />
            </div>
            <small>{t('term.capacity')}</small>
          </div>
        </div>
        <SysRow name={t('term.o2gen')} state={l.o2gen}>
          <ol class="checklist">
            {O2_STEPS.map((st, i) => (
              <li class={i < l.o2Step ? 'done' : i === l.o2Step ? 'next' : ''}>
                <button class="btn small" disabled={i !== l.o2Step || l.o2gen === 'online'} onClick={() => o2Step(i)}>
                  {i < l.o2Step ? '✓' : num(i + 1)}. {t(st.label)}
                </button>
                {i <= l.o2Step ? <small>{t(st.why)}</small> : null}
              </li>
            ))}
          </ol>
        </SysRow>
        <SysRow name={t('term.wrs')} state={l.water}>
          {l.water === 'damaged' ? (
            <p class="fault">{t('term.fault')}</p>
          ) : (
            <button class="btn small" data-action="start-water" disabled={l.water === 'online'} onClick={startWater}>
              {l.water === 'online' ? t('term.recovering') : t('term.startWater')}
            </button>
          )}
        </SysRow>
        <SysRow name={t('term.co2')} state={l.co2}>
          <small>{t('term.co2text')}</small>
        </SysRow>
      </div>
    </div>
  );
}

function CardBody({ id }: { id: string }) {
  const c = cardFor(id, settings.value.lang);
  if (!c) return null;
  return (
    <>
      {c.body.map((p) => (
        <p>{p}</p>
      ))}
      <p class="ingame">
        <b>{t('card.ingame')}</b> {c.inGame}
      </p>
      <p class="source">
        {t('card.source')} {c.source}
      </p>
    </>
  );
}

function KnowledgeCard({ id, onClose }: { id: string; onClose: () => void }) {
  const c = cardFor(id, settings.value.lang);
  if (!c) return null;
  return (
    <div class="card">
      <div class="card-head">
        <span class="card-icon">{c.icon}</span>
        <div>
          <small>{t('card.unlocked')}</small>
          <h3>{c.title}</h3>
        </div>
      </div>
      <CardBody id={id} />
      <button class="btn small" onClick={onClose}>
        {t('card.ok')}
      </button>
    </div>
  );
}

function KnowledgeCenter() {
  const unlocked = knowledge.value;
  const [sel, setSel] = useState<string | null>(unlocked[0] ?? null);
  const lang = settings.value.lang;
  const c = sel ? cardFor(sel, lang) : null;
  return (
    <div class="kc">
      <div class="kc-list">
        {Object.keys(CARDS).map((id) => {
          const open = unlocked.includes(id);
          const card = cardFor(id, lang)!;
          return (
            <button class={`kc-item ${sel === id ? 'sel' : ''}`} disabled={!open} onClick={() => setSel(id)}>
              <span>{open ? card.icon : '🔒'}</span> {open ? card.title : t('kc.locked')}
            </button>
          );
        })}
      </div>
      <div class="kc-body">
        {c && sel ? (
          <>
            <h3>
              {c.icon} {c.title}
            </h3>
            <CardBody id={sel} />
          </>
        ) : (
          <p>{t('kc.empty')}</p>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ actions }: { actions: Actions }) {
  const s = settings.value;
  return (
    <div class="settings">
      <div class="quality">
        {t('set.language')}
        <div class="seg">
          <button class={s.lang === 'en' ? 'on' : ''} onClick={() => updateSettings({ lang: 'en' })}>
            English
          </button>
          <button class={s.lang === 'my' ? 'on' : ''} lang="my" onClick={() => updateSettings({ lang: 'my' })}>
            မြန်မာ
          </button>
        </div>
        <small>{t('set.voiceNote')}</small>
      </div>
      <label>
        {t('set.sens')} <b>{s.sensitivity.toFixed(1)}</b>
        <input type="range" min="0.2" max="3" step="0.1" value={s.sensitivity} onInput={(e) => updateSettings({ sensitivity: +(e.target as HTMLInputElement).value })} />
      </label>
      <label>
        {t('set.fov')} <b>{s.fov}°</b>
        <input type="range" min="60" max="100" step="1" value={s.fov} onInput={(e) => updateSettings({ fov: +(e.target as HTMLInputElement).value })} />
      </label>
      <label>
        {t('set.volume')} <b>{Math.round(s.volume * 100)}%</b>
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
        <input type="checkbox" checked={s.invertY} onChange={(e) => updateSettings({ invertY: (e.target as HTMLInputElement).checked })} /> {t('set.invert')}
      </label>
      <label class="check">
        <input type="checkbox" checked={s.arrowLook} onChange={(e) => updateSettings({ arrowLook: (e.target as HTMLInputElement).checked })} /> {t('set.arrows')}
      </label>
      <div class="quality">
        {t('set.quality')}
        <div class="seg">
          {(['low', 'medium', 'high'] as Quality[]).map((q) => (
            <button class={s.quality === q ? 'on' : ''} onClick={() => actions.setQuality(q)}>
              {t('set.q.' + q)}
            </button>
          ))}
        </div>
        <small>{t('set.qualityHint')}</small>
      </div>
      <button class="btn small" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
        {t('set.fullscreen')}
      </button>
    </div>
  );
}

function Credits() {
  return (
    <div class="credits">
      <p>
        <b>Junior Astronaut: Lunar Survival Mission</b> {t('credits.disclaimer')}
      </p>
      <ul>
        {[1, 2, 3, 4, 5].map((i) => (
          <li>{t('credits.' + i)}</li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ actions }: { actions: Actions }) {
  const p = panel.value;
  if (!p) return null;
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && (panel.value = null)}>
      <div class={`modal ${p}`}>
        <div class="modal-head">
          <h2>{t('panel.' + p)}</h2>
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

function Title() {
  return (
    <h1>
      JUNIOR ASTRONAUT
      <span>{t('menu.subtitle')}</span>
    </h1>
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
        <Title />
        <p class="tagline">{t('menu.tagline')}</p>
        <div class="menu-buttons">
          <button class="btn primary" onClick={actions.start}>
            {t('menu.start')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'controls')}>
            {t('menu.controls')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'settings')}>
            {t('menu.settings')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'knowledge')}>
            {t('menu.knowledge')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'credits')}>
            {t('menu.credits')}
          </button>
        </div>
        <p class="note">{t('menu.note')}</p>
      </div>
    </div>
  );
}

function Briefing({ actions }: { actions: Actions }) {
  return (
    <div class="menu briefing">
      <div class="menu-inner wide">
        <h2>{t(`briefing.m${missionNumber.value}.title`)}</h2>
        <p>{t(`briefing.m${missionNumber.value}.text`)}</p>
        <ControlsCard />
        <button class="btn primary" onClick={actions.resume}>
          {t('briefing.begin')}
        </button>
        <p class="note">{t('briefing.note')}</p>
      </div>
    </div>
  );
}

function Paused({ actions }: { actions: Actions }) {
  return (
    <div class="menu paused">
      <div class="menu-inner">
        <h2>{t('pause.title')}</h2>
        <div class="menu-buttons">
          <button class="btn primary" onClick={actions.resume}>
            {t('pause.resume')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'knowledge')}>
            {t('menu.knowledge')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'settings')}>
            {t('menu.settings')}
          </button>
          <button class="btn" onClick={() => (panel.value = 'controls')}>
            {t('menu.controls')}
          </button>
          <button class="btn" onClick={actions.restart}>
            {t('pause.restart')}
          </button>
          <button class="btn" onClick={actions.toMenu}>
            {t('pause.menu')}
          </button>
        </div>
      </div>
    </div>
  );
}

const NEXT_MISSION: Record<number, string | undefined> = { 1: 'complete.m2.name' };

function Complete({ actions }: { actions: Actions }) {
  const n = missionNumber.value;
  const next = NEXT_MISSION[n];
  return (
    <div class="menu complete">
      <div class="menu-inner wide">
        <small class="kicker">{t('complete.kicker', { n: num(n) })}</small>
        <h2>{t(`complete.m${n}.title`)}</h2>
        <p>
          {t(`complete.m${n}.text`)} {t('complete.facts', { n: num(knowledge.value.length) })}
        </p>
        {next ? null : (
          <p class="next">
            <b>{t('complete.soonTitle')}</b>
            {t('complete.soonRest')}
          </p>
        )}
        <div class="menu-buttons row">
          <button class="btn" onClick={() => (panel.value = 'knowledge')}>
            {t('complete.review')}
          </button>
          <button class="btn" onClick={actions.restart}>
            {t('complete.again')}
          </button>
          {next ? (
            <button class="btn primary" onClick={actions.next}>
              {t('complete.continue', { name: t(next) })}
            </button>
          ) : (
            <button class="btn primary" onClick={actions.toMenu}>
              {t('complete.menu')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Letterbox bars, a location caption and subtitles over the cutscene camera. */
function Cinema({ actions }: { actions: Actions }) {
  const c = cinema.value;
  return (
    <div class="cinema">
      <div class="cine-bar top" />
      <div class="cine-bar bottom">{c.sub ? <p class="cine-sub" key={c.sub}>{t(c.sub)}</p> : null}</div>
      {c.caption ? (
        <div class="cine-caption" key={c.caption}>
          {t(c.caption)}
        </div>
      ) : null}
      <button class="btn small cine-skip" onClick={actions.skipCutscene}>
        {t('cs.skip')} ▶▶ <small>{t('cs.skipHint')}</small>
      </button>
    </div>
  );
}

function Loading() {
  return (
    <div class="menu loading">
      <div class="menu-inner">
        <h1>
          JUNIOR ASTRONAUT<span>{t('loading')}</span>
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
      <Title />
      <p>{t('phone')}</p>
    </div>
  );
}

export function App({ actions }: { actions: Actions }) {
  const [isPhone] = useState(() => matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
  const lang = settings.value.lang;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.classList.toggle('lang-my', lang === 'my');
  }, [lang]);
  useEffect(() => {
    if (cardPopup.value) {
      const timer = setTimeout(() => (cardPopup.value = null), 14000);
      return () => clearTimeout(timer);
    }
  }, [cardPopup.value]);
  if (isPhone) return <PhoneNotice />;
  const sc = screen.value;
  return (
    <>
      {(sc === 'playing' || sc === 'paused') && <Hud />}
      {sc === 'loading' && <Loading />}
      {sc === 'cutscene' && <Cinema actions={actions} />}
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
