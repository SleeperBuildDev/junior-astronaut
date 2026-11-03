import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { setVolume } from '../audio/audio';
import { settings, updateSettings, type Quality } from '../engine/settings';
import { cardFor, CARDS } from '../game/knowledge';
import { life, O2_STEPS, o2Step, SAFE_O2, startWater, type SysState } from '../game/lifesupport';
import { kwOf, aimArray, aimError, arrayKW, arrayPanel, ARRAY_KW, BATTERY_KWH, confirmPlan, deployArray, hoursLeft, LOADS, loadKW, LOCK_DEG, NIGHT_HOURS, power, setLoad, solarKW, sunYaw, type ArrayState } from '../game/power';
import { MISSION_COUNT, progress } from '../game/save';
import { blockers, build, built, FACILITIES, kits, type FacilityId } from '../game/construction';
import { CREW, crew } from '../game/crew';
import { adjustPh, chooseLight, CROPS, fillTank, greenhouse, growth, microGrowth, LIGHT_CYCLES, MICRO_DAYS, PH_OK, plant, TANK_LITRES, toggleTray, TRAYS, trayProblem, type CropId } from '../game/greenhouse';
import { choosePressure, COMFORT, connectLines, fillWaterWalls, habitat, heatersOn, installBeds, nudgeTemp, PRESSURES, WATER_WALL_LITRES } from '../game/habitat';
import {
  cardPopup,
  cinema,
  clock,
  comms,
  fps,
  gameSpeed,
  heading,
  holdProgress,
  knowledge,
  loadProgress,
  mission,
  missionNumber,
  NORMAL_SPEED,
  panel,
  prompt,
  screen,
  suit,
  terminal,
  warning,
  waypoint,
} from '../game/state';
import { num, t } from '../i18n';

export interface Actions {
  start: () => void;
  /** Opens mission n (from Continue or Mission select). */
  play: (n: number) => void;
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
  ['C', 'ctrl.crew'],
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
        {gameSpeed.value > NORMAL_SPEED ? (
          <span class="ff">
            ⏩ {t('hud.fast')} ×{num(Math.round(gameSpeed.value / NORMAL_SPEED))}
          </span>
        ) : null}
      </div>
      {missionNumber.value >= 3 ? <BasePanel /> : null}
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

/** Outpost power at a glance: solar input, battery charge and what the base is using. */
function BasePanel() {
  const p = power.value;
  const pct = (p.batteryKWh / BATTERY_KWH) * 100;
  return (
    <div class="panel base">
      <div class="panel-title">{t('hud.base')}</div>
      <div class="base-row">
        <span>☀ {t('hud.solar')}</span>
        <b>{solarKW(p).toFixed(1)} kW</b>
      </div>
      <Bar label={'🔋 ' + t('hud.battery')} value={pct} unit="%" warnAt={30} critAt={12} />
      <div class="base-row">
        <span>⚡ {t('hud.load')}</span>
        <b>{loadKW(p).toFixed(1)} kW</b>
      </div>
      {missionNumber.value >= 5 ? (
        <>
          <div class="base-row">
            <span>🍽 {t('hud.food')}</span>
            <b>{t('hud.days', { n: num(Math.floor(greenhouse.value.foodDays)) })}</b>
          </div>
          <div class="base-row">
            <span>💧 {t('hud.water')}</span>
            <b>{num(Math.round(life.value.waterL))} L</b>
          </div>
        </>
      ) : null}
      {!p.bus ? <small class="base-note">{t('hud.busOff')}</small> : p.sun < 0.05 ? <small class="base-note">{t('hud.dark')}</small> : null}
    </div>
  );
}

function SysRow({ name, state, label, children }: { name: string; state: SysState; label?: string; children?: ComponentChildren }) {
  return (
    <div class={`sys ${state}`}>
      <div class="sys-head">
        <span class="led" />
        <b>{name}</b>
        <span class="sys-state">{label ?? t('state.' + state)}</span>
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

type TowerState = 'stowed' | 'deploying' | 'deployed' | 'tracking';
const towerState = (a: ArrayState): TowerState => (a.tracking ? 'tracking' : a.deploy >= 1 ? 'deployed' : a.deploying ? 'deploying' : 'stowed');
const towerSys: Record<TowerState, SysState> = { stowed: 'offline', deploying: 'starting', deployed: 'starting', tracking: 'online' };

function PowerTerminal({ actions }: { actions: Actions }) {
  const p = power.value;
  const solar = solarKW(p);
  const load = loadKW(p);
  const hours = hoursLeft(p);
  const enough = hours >= NIGHT_HOURS;
  const planStep = mission.value.steps.find((st) => !st.done)?.id === 'plan' && missionNumber.value === 3;
  const hoursText = Number.isFinite(hours) ? num(Math.floor(hours * 10) / 10) : '∞';
  return (
    <div class="modal-backdrop">
      <div class="modal terminal power-term">
        <div class="modal-head">
          <h2>{t('pw.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="gauges three">
          <div class="gauge">
            <span>☀ {t('pw.solar')}</span>
            <b class={solar > 1 ? 'good' : 'low'}>{solar.toFixed(1)} kW</b>
            <small>{p.sun < 0.05 ? t('pw.sunDown') : t('pw.sunUp')}</small>
          </div>
          <div class="gauge">
            <span>🔋 {t('pw.battery')}</span>
            <b class={p.batteryKWh < 30 ? 'low' : 'good'}>{Math.round((p.batteryKWh / BATTERY_KWH) * 100)}%</b>
            <div class="bar">
              <i style={{ width: `${(p.batteryKWh / BATTERY_KWH) * 100}%` }} />
            </div>
            <small>{t('pw.stored', { kwh: num(Math.round(p.batteryKWh)), cap: num(BATTERY_KWH) })}</small>
          </div>
          <div class="gauge">
            <span>⚡ {t('pw.load')}</span>
            <b>{load.toFixed(1)} kW</b>
            <small>{p.bus ? (solar >= load ? t('pw.charging') : t('pw.draining')) : t('pw.notConnected')}</small>
          </div>
        </div>
        <div class="towers">
          {p.arrays.map((a, i) => {
            const st = towerState(a);
            return (
              <div class={`sys ${towerSys[st]}`}>
                <div class="sys-head">
                  <span class="led" />
                  <b>{t('pw.tower', { n: num(i + 1) })}</b>
                  <span class="sys-state">{t('arr.state.' + st)}</span>
                </div>
                <small>{arrayKW(a, p.sun).toFixed(1)} kW</small>
              </div>
            );
          })}
        </div>
        <SysRow name={t('pw.bus')} state={p.bus ? 'online' : 'offline'}>
          <small>{p.bus ? t('pw.busOn') : t('pw.busOff')}</small>
        </SysRow>
        <div class={`sys loads ${planStep ? 'focus' : ''}`}>
          <div class="sys-head">
            <b>{t('pw.loads')}</b>
            <span class="sys-state">{p.planLocked ? t('pw.locked') : ''}</span>
          </div>
          <div class="load-list">
            {LOADS.filter((l) => !l.extra || p.loads[l.id]).map((l) => (
              <button class={`load ${p.loads[l.id] ? 'on' : 'off'}`} disabled={l.essential || p.planLocked} onClick={() => setLoad(l.id, !p.loads[l.id])}>
                <span class="sw">{p.loads[l.id] ? t('pw.on') : t('pw.off')}</span>
                <span class="nm">{t('load.' + l.id)}</span>
                {l.essential ? <em>{t('pw.essential')}</em> : null}
                <b>{kwOf(l.id, p).toFixed(1)} kW</b>
              </button>
            ))}
          </div>
          <p class={`budget ${enough ? 'good' : 'low'}`}>
            {t('pw.lasts', { h: hoursText })} <span>{t('pw.night', { h: num(NIGHT_HOURS) })}</span>
          </p>
          <small>{t('pw.explain')}</small>
          {planStep ? (
            <button class="btn primary small confirm" disabled={!enough} onClick={() => confirmPlan() && actions.closeTerminal()}>
              {enough ? t('pw.confirm') : t('pw.notEnough')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Top-down view of a tower: where the Sun is and which way the panels face. */
function AimDial({ a }: { a: ArrayState }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const sy = rad(sunYaw());
  const ay = rad(a.yaw);
  const sun = [Math.sin(sy) * 78, Math.cos(sy) * 78];
  const face = [Math.sin(ay), Math.cos(ay)];
  const side = [face[1], -face[0]];
  const locked = Math.abs(aimError(a)) < LOCK_DEG;
  const col = a.tracking || locked ? '#5cf29a' : '#5fd4ff';
  return (
    <svg class="dial" viewBox="-100 -100 200 200" aria-hidden="true">
      <circle r="88" fill="rgba(255,255,255,0.03)" stroke="rgba(120,200,255,0.3)" />
      <text x="0" y="-74" text-anchor="middle" class="dial-n">N</text>
      <line x1="0" y1="0" x2={sun[0] * 0.85} y2={sun[1] * 0.85} stroke="rgba(255,200,80,0.35)" stroke-dasharray="4 4" />
      <circle cx={sun[0]} cy={sun[1]} r="11" fill="#ffd36a" />
      <circle cx={sun[0]} cy={sun[1]} r="17" fill="none" stroke="#ffd36a" stroke-opacity="0.4" />
      <line x1={-side[0] * 44} y1={-side[1] * 44} x2={side[0] * 44} y2={side[1] * 44} stroke={col} stroke-width="8" stroke-linecap="round" />
      <line x1="0" y1="0" x2={face[0] * 46} y2={face[1] * 46} stroke={col} stroke-width="2.5" />
      <circle cx={face[0] * 50} cy={face[1] * 50} r="4" fill={col} />
      <circle r="5" fill="#cfd8e0" />
    </svg>
  );
}

function ArrayPanel({ actions }: { actions: Actions }) {
  const i = arrayPanel.value;
  const a = power.value.arrays[i];
  const st = towerState(a);
  const err = aimError(a);
  const kw = arrayKW(a, 1);
  const yaw = Math.round((((a.yaw % 360) + 360) % 360) * 10) / 10;
  const turn = (d: number) => aimArray(i, a.yaw + d);
  const canAim = a.deploy >= 1 && !a.tracking;
  return (
    <div class="side-panel terminal">
      <div class="modal-head">
        <h2>{t('arr.title', { n: num(i + 1) })}</h2>
        <button class="btn small" onClick={actions.closeTerminal}>
          {t('term.back')}
        </button>
      </div>
      <SysRow name={t('arr.status')} state={towerSys[st]} label={t('arr.state.' + st)} />
      <ol class="checklist">
        <li class={a.deploy > 0 ? 'done' : 'next'}>
          <button class="btn small" data-action="deploy" disabled={a.deploy > 0 || a.deploying} onClick={() => deployArray(i)}>
            {a.deploy > 0 ? '✓' : num(1)}. {a.deploying ? t('arr.deploying') : t('arr.deploy')}
          </button>
          <small>{t('arr.deployWhy')}</small>
          {a.deploying ? (
            <div class="bar hold">
              <i style={{ width: `${Math.round(a.deploy * 100)}%` }} />
            </div>
          ) : null}
        </li>
        <li class={a.tracking ? 'done' : a.deploy >= 1 ? 'next' : ''}>
          <b class="step-label">
            {a.tracking ? '✓' : num(2)}. {t('arr.aim')}
          </b>
          <div class="aim">
            <AimDial a={a} />
            <div class="aim-read">
              <span>{t('arr.angle')}</span>
              <b class={Math.abs(err) < LOCK_DEG ? 'good' : Math.abs(err) < 30 ? '' : 'low'}>{num(Math.round(Math.abs(err)))}°</b>
              <span>{t('arr.output')}</span>
              <b>
                {kw.toFixed(1)} <small>/ {num(ARRAY_KW)} kW</small>
              </b>
              <div class="bar">
                <i style={{ width: `${(kw / ARRAY_KW) * 100}%` }} />
              </div>
            </div>
          </div>
          <input
            type="range"
            class="aim-slider"
            min="0"
            max="359.9"
            step="0.5"
            value={yaw}
            disabled={!canAim}
            onInput={(e) => aimArray(i, +(e.target as HTMLInputElement).value)}
          />
          <div class="aim-btns">
            {[-10, -2, 2, 10].map((d) => (
              <button class="btn small" disabled={!canAim} onClick={() => turn(d)}>
                {d < 0 ? (d === -10 ? '◀◀' : '◀') : d === 10 ? '▶▶' : '▶'}
              </button>
            ))}
          </div>
          <small>{a.tracking ? t('arr.tracking') : t('arr.cos')}</small>
        </li>
      </ol>
    </div>
  );
}

function BuildTerminal({ actions }: { actions: Actions }) {
  const [sel, setSel] = useState<FacilityId>('hab');
  const n = missionNumber.value;
  const f = FACILITIES.find((x) => x.id === sel)!;
  const why = blockers(f, n);
  const battery = power.value.batteryKWh;
  const check = (ok: boolean, text: string) => (
    <li class={ok ? 'ok' : 'bad'}>
      {ok ? '✓' : '✗'} {text}
    </li>
  );
  return (
    <div class="modal-backdrop">
      <div class="modal terminal build-term">
        <div class="modal-head">
          <h2>{t('bt.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="bt-res">
          <span>
            📦 {t('bt.kits')} <b>{num(kits.value)}</b>
          </span>
          <span>
            🔋 {t('bt.energy')} <b>{num(Math.round(battery))} kWh</b>
          </span>
        </div>
        <div class="bt-grid">
          <div class="bt-list">
            {FACILITIES.map((x) => {
              const locked = n < x.unlock;
              const done = built.value.includes(x.id);
              return (
                <button class={`bt-item ${sel === x.id ? 'sel' : ''} ${locked ? 'locked' : ''}`} onClick={() => setSel(x.id)}>
                  <span class="bt-icon">{locked ? '🔒' : x.icon}</span>
                  <span class="bt-name">{t('fac.' + x.id)}</span>
                  <small>{done ? t('bt.built') : locked ? t('bt.unlocks', { n: num(x.unlock) }) : `${num(x.kits)} 📦`}</small>
                </button>
              );
            })}
          </div>
          <div class="bt-detail">
            <h3>
              {f.icon} {t('fac.' + f.id)}
            </h3>
            <p>{t('fac.' + f.id + '.desc')}</p>
            <table class="bt-cost">
              <tbody>
              <tr>
                <td>{t('bt.costKits')}</td>
                <td>{num(f.kits)} 📦</td>
              </tr>
              <tr>
                <td>{t('bt.costEnergy')}</td>
                <td>{num(f.kwh)} kWh</td>
              </tr>
              <tr>
                <td>{t('bt.time')}</td>
                <td>{t('bt.hours', { n: num(f.hours) })}</td>
              </tr>
              <tr>
                <td>{t('bt.run')}</td>
                <td>{f.runKW < 0 ? t('bt.makes', { kw: num(-f.runKW) }) : `${f.runKW.toFixed(1)} kW`}</td>
              </tr>
              </tbody>
            </table>
            <p class="bt-effect">
              <b>{t('bt.effect')}</b> {t('fac.' + f.id + '.effect')}
            </p>
            <ul class="bt-checks">
              {n < f.unlock ? check(false, t('bt.lockedWhy', { n: num(f.unlock) })) : null}
              {check(kits.value >= f.kits, t('bt.needKits', { need: num(f.kits), have: num(kits.value) }))}
              {check(battery >= f.kwh, t('bt.needEnergy', { need: num(f.kwh), have: num(Math.round(battery)) }))}
            </ul>
            {built.value.includes(f.id) ? (
              <p class="bt-done">✓ {t('bt.built')}</p>
            ) : (
              <button class="btn primary small" data-action="build" disabled={why.length > 0} onClick={() => build(f.id, n) && actions.closeTerminal()}>
                {t('bt.build', { name: t('fac.' + f.id) })}
              </button>
            )}
            <small class="bt-note">{t('bt.note')}</small>
          </div>
        </div>
      </div>
    </div>
  );
}

function HabTerminal({ actions }: { actions: Actions }) {
  const h = habitat.value;
  const comfy = h.setTemp >= COMFORT.min && h.setTemp <= COMFORT.max;
  const heated = h.heaters && Math.abs(h.tempC - h.setTemp) < 0.6;
  const [msg, setMsg] = useState<string | null>(null);
  const pState = h.pressurized ? 'online' : h.targetKPa ? 'starting' : 'offline';
  const tState = heated ? 'online' : h.heaters ? 'starting' : 'offline';
  return (
    <div class="modal-backdrop">
      <div class="modal terminal hab-term">
        <div class="modal-head">
          <h2>{t('ht.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="gauges three">
          <div class="gauge">
            <span>{t('ht.pressure')}</span>
            <b class={h.pressurized ? 'good' : 'low'}>{h.kpa.toFixed(0)} kPa</b>
            <div class="bar">
              <i style={{ width: `${Math.min(100, (h.kpa / 101.3) * 100)}%` }} />
            </div>
            <small>{t('ht.earth')}</small>
          </div>
          <div class="gauge">
            <span>{t('ht.temp')}</span>
            <b class={heated ? 'good' : 'low'}>{h.tempC.toFixed(0)} °C</b>
            <small>{t('ht.comfort', { a: num(COMFORT.min), b: num(COMFORT.max) })}</small>
          </div>
          <div class="gauge">
            <span>{t('ht.beds')}</span>
            <b class={h.beds ? 'good' : 'low'}>{h.beds ? num(4) : num(0)} / {num(4)}</b>
            <small>{t('ht.crew4')}</small>
          </div>
        </div>
        <SysRow name={'1. ' + t('ht.pTitle')} state={pState} label={t('ht.state.' + pState)}>
          {h.pressurized ? (
            <small>{t('ht.pDone', { kpa: num(h.targetKPa) })}</small>
          ) : h.targetKPa ? (
            <>
              <small>{h.kpa < h.targetKPa ? t('ht.filling') : t('ht.leakTest')}</small>
              <div class="bar hold">
                <i style={{ width: `${Math.round((h.kpa < h.targetKPa ? h.kpa / h.targetKPa : h.leak) * 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              <small>{t('ht.pAsk')}</small>
              <div class="choice">
                {PRESSURES.map((o) => (
                  <button
                    class="btn small"
                    data-kpa={o.kpa}
                    onClick={() => {
                      const ok = choosePressure(o.kpa);
                      setMsg(ok ? null : 'ht.pBad');
                    }}
                  >
                    <b>{num(o.kpa)} kPa</b>
                    <small>{t('ht.p.' + o.id)}</small>
                  </button>
                ))}
              </div>
              {msg ? <p class="fault">{t(msg)}</p> : null}
            </>
          )}
        </SysRow>
        <SysRow name={'2. ' + t('ht.tTitle')} state={tState} label={t('ht.state.' + tState)}>
          {!h.pressurized ? (
            <small>{t('ht.tWait')}</small>
          ) : (
            <div class="thermo">
              <button class="btn small" disabled={h.heaters} onClick={() => nudgeTemp(-1)}>
                −
              </button>
              <b class={comfy ? 'good' : 'low'}>{num(h.setTemp)} °C</b>
              <button class="btn small" disabled={h.heaters} onClick={() => nudgeTemp(1)}>
                +
              </button>
              <button class="btn small primary" data-action="heaters" disabled={h.heaters || !comfy} onClick={heatersOn}>
                {h.heaters ? t('ht.heating') : t('ht.heatOn')}
              </button>
              <small>{comfy ? t('ht.tWhy') : t('ht.tBad', { a: num(COMFORT.min), b: num(COMFORT.max) })}</small>
            </div>
          )}
        </SysRow>
        <div class={`sys ${heated && h.lines && h.water && h.beds ? 'online' : heated ? 'starting' : 'offline'}`}>
          <div class="sys-head">
            <span class="led" />
            <b>3. {t('ht.oTitle')}</b>
          </div>
          <ol class="checklist">
            {(
              [
                ['lines', h.lines, connectLines, 'ht.lines', 'ht.lines.why'],
                ['water', h.water, fillWaterWalls, 'ht.water', 'ht.water.why'],
                ['beds', h.beds, installBeds, 'ht.bedsDo', 'ht.beds.why'],
              ] as const
            ).map(([id, done, fn, label, why]) => (
              <li class={done ? 'done' : heated ? 'next' : ''}>
                <button class="btn small" data-action={id} disabled={done || !heated} onClick={fn}>
                  {done ? '✓' : '○'} {t(label, { l: num(WATER_WALL_LITRES) })}
                </button>
                {heated ? <small>{t(why)}</small> : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

const CROP_COLOR: Record<CropId | 'micro', string> = { lettuce: '#7ed957', radish: '#c2f06b', tomato: '#e5533d', wheat: '#e8c35a', potato: '#8fbf5a', soy: '#5fae4e', micro: '#9be86b' };

/** Side view of a hydroponic tray: plants sized by how far they have grown. */
function Tray({ crop, g, label }: { crop: CropId | 'micro'; g: number; label: string }) {
  const col = CROP_COLOR[crop];
  const plants = [14, 34, 54, 74, 94];
  return (
    <div class="tray">
      <svg viewBox="0 0 108 60" aria-hidden="true">
        <rect x="2" y="48" width="104" height="9" rx="2" fill="#3a5f88" />
        <rect x="2" y="46" width="104" height="3" fill="#2a3a4c" />
        {g > 0
          ? plants.map((x) => {
              const hgt = 4 + g * 34;
              const leaf = 2 + g * 7;
              return (
                <g>
                  <line x1={x} y1="46" x2={x} y2={46 - hgt} stroke="#4f8a3a" stroke-width="1.6" />
                  <ellipse cx={x - leaf * 0.6} cy={46 - hgt * 0.6} rx={leaf} ry={leaf * 0.45} fill={col} opacity="0.9" />
                  <ellipse cx={x + leaf * 0.6} cy={46 - hgt * 0.8} rx={leaf} ry={leaf * 0.45} fill={col} />
                  {crop === 'tomato' && g > 0.6 ? <circle cx={x} cy={46 - hgt * 0.5} r="2.6" fill="#e5533d" /> : null}
                </g>
              );
            })
          : null}
      </svg>
      <span>{label}</span>
      <div class="bar">
        <i style={{ width: `${Math.round(g * 100)}%` }} />
      </div>
    </div>
  );
}

function GreenhouseTerminal({ actions }: { actions: Actions }) {
  const g = greenhouse.value;
  const problem = trayProblem();
  const phOk = g.ph >= PH_OK.min && g.ph <= PH_OK.max;
  const crop = (id: CropId) => CROPS.find((c) => c.id === id)!;
  return (
    <div class="modal-backdrop">
      <div class="modal terminal gh-term">
        <div class="modal-head">
          <h2>{t('gh.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="gauges four">
          <div class="gauge">
            <span>💧 {t('gh.tank')}</span>
            <b class={g.tank ? 'good' : 'low'}>{g.tank ? `${num(TANK_LITRES)} L` : t('gh.empty')}</b>
          </div>
          <div class="gauge">
            <span>💡 {t('gh.lights')}</span>
            <b class={g.light ? 'good' : 'low'}>{g.light ? `${num(g.light)} h` : '—'}</b>
            <small>{g.light ? `${power.value.ghKW.toFixed(1)} kW` : t('gh.notSet')}</small>
          </div>
          <div class="gauge">
            <span>⚗️ pH</span>
            <b class={phOk ? 'good' : 'low'}>{g.ph.toFixed(1)}</b>
            <small>{t('gh.phRange', { a: num(PH_OK.min), b: num(PH_OK.max) })}</small>
          </div>
          <div class="gauge">
            <span>🍽 {t('gh.food')}</span>
            <b>{t('hud.days', { n: num(Math.floor(g.foodDays)) })}</b>
            <small>{t('gh.foodNote')}</small>
          </div>
        </div>

        {g.planted ? (
          <p class="gh-summary">
            ✓ {t('gh.summary', { l: num(TANK_LITRES), h: num(g.light) })} {g.trays.map((id) => crop(id).icon + ' ' + t('crop.' + id)).join(' · ')} · 🌿 {t('crop.micro')}
          </p>
        ) : (
          <>
          <div class={`sys ${g.tank && g.light ? 'online' : 'starting'}`}>
            <div class="sys-head">
              <span class="led" />
              <b>1. {t('gh.setupTitle')}</b>
            </div>
            <div class="gh-setup">
              <button class="btn small" data-action="tank" disabled={g.tank} onClick={fillTank}>
                {g.tank ? '✓' : '○'} {t('gh.fill', { l: num(TANK_LITRES) })}
              </button>
              <small>{t('gh.fillWhy')}</small>
              <b class="step-label">{t('gh.lightAsk')}</b>
              <div class="choice">
                {LIGHT_CYCLES.map((c) => (
                  <button class={`btn small ${g.light === c.h ? 'on' : ''}`} data-light={c.h} disabled={g.planted} onClick={() => chooseLight(c.h)}>
                    <b>
                      {num(c.h)} h · {c.kw.toFixed(1)} kW
                    </b>
                    <small>{t('gh.light.' + c.h)}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div class={`sys ${g.planted ? 'online' : g.tank && g.light ? 'starting' : 'offline'}`}>
            <div class="sys-head">
              <span class="led" />
              <b>2. {t('gh.plantTitle')}</b>
              <span class="sys-state">
                {num(g.trays.length)}/{num(TRAYS)}
              </span>
            </div>
            <div class="crops">
              {CROPS.map((c) => (
                <button class={`crop ${g.trays.includes(c.id) ? 'on' : ''}`} data-crop={c.id} disabled={g.planted || !g.tank || !g.light} onClick={() => toggleTray(c.id)}>
                  <span class="crop-icon">{c.icon}</span>
                  <b>{t('crop.' + c.id)}</b>
                  <small>
                    {t('gh.daysToHarvest', { n: num(c.days) })} · {t('role.' + c.role)}
                  </small>
                </button>
              ))}
            </div>
            <small>{t('gh.microNote', { n: num(MICRO_DAYS) })}</small>
            {!g.planted ? (
              <>
                {g.tank && g.light && problem ? <p class="fault">{t(problem)}</p> : null}
                <button class="btn primary small confirm" data-action="plant" disabled={!g.tank || !g.light || !!problem} onClick={plant}>
                  {t('gh.plant')}
                </button>
              </>
            ) : null}
          </div>
          </>
        )}

        {g.planted ? (
          <div class={`sys ${g.phAlarm ? 'damaged' : 'online'}`}>
            <div class="sys-head">
              <span class="led" />
              <b>3. {t('gh.growTitle')}</b>
              <span class="sys-state">{t('gh.day', { n: num(Math.min(Math.floor(g.day), 99)) })}</span>
            </div>
            <div class="trays">
              {g.trays.map((id) => (
                <Tray crop={id} g={growth(crop(id).days)} label={`${crop(id).icon} ${t('crop.' + id)}`} />
              ))}
              <Tray crop="micro" g={microGrowth()} label={`🌿 ${t('crop.micro')}`} />
            </div>
            {g.phAlarm ? (
              <div class="ph-alarm">
                <p class="fault">{t('gh.phAlarm', { ph: g.ph.toFixed(1) })}</p>
                <div class="thermo">
                  <button class="btn small" data-action="ph-down" onClick={() => adjustPh(-0.3)}>
                    {t('gh.phDown')}
                  </button>
                  <b class={phOk ? 'good' : 'low'}>pH {g.ph.toFixed(1)}</b>
                  <button class="btn small" data-action="ph-up" onClick={() => adjustPh(0.3)}>
                    {t('gh.phUp')}
                  </button>
                  <small>{t('gh.phWhy')}</small>
                </div>
              </div>
            ) : microGrowth() >= 1 ? (
              <p class="bt-done">✓ {t('gh.ready')}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CrewPanel() {
  const c = crew.value;
  const h = habitat.value;
  return (
    <div class="crew">
      <div class="crew-grid">
        {CREW.map((m) => {
          const s = c[m.id];
          return (
            <div class={`crew-card ${m.id === 'eng' ? 'you' : ''}`}>
              <div class="crew-head">
                <span class="crew-icon">{m.icon}</span>
                <div>
                  <b>{t('crew.name.' + m.id)}</b>
                  <small>{t('crew.role.' + m.id)}</small>
                </div>
              </div>
              <div class="crew-row">
                <span>{t('crew.where')}</span>
                <b>{t('crew.at.' + s.where)}</b>
              </div>
              <Bar label={t('hud.health')} value={s.health} unit="%" warnAt={60} critAt={30} />
              <p class={`crew-status ${s.status === 'crew.st.safe' ? 'good' : 'warn'}`}>{t(s.status)}</p>
              <small class="crew-job">{t('crew.job.' + m.id)}</small>
            </div>
          );
        })}
      </div>
      <div class="crew-alerts">
        <b>{t('crew.alerts')}</b>
        {h.crewIn ? <p class="good">✓ {t('crew.alert.ok')}</p> : <p class="warn">⚠ {t('crew.alert.cramped')}</p>}
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

function MissionSelect({ actions }: { actions: Actions }) {
  const reached = progress.value.reached;
  return (
    <div class="ms-list">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const open = n <= reached && n <= MISSION_COUNT;
        const tag = n > MISSION_COUNT ? t('ms.soon') : !open ? t('ms.locked') : n < reached ? t('ms.done') : t('ms.next');
        return (
          <button class={`ms-item ${open ? '' : 'locked'}`} disabled={!open} onClick={() => actions.play(n)}>
            <b>{num(n)}</b>
            <span>{t('mname.' + n)}</span>
            <small>{open ? tag : '🔒 ' + tag}</small>
          </button>
        );
      })}
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
        {p === 'missions' && <MissionSelect actions={actions} />}
        {p === 'crew' && <CrewPanel />}
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
          {progress.value.reached > 1 ? (
            <>
              <button class="btn primary" onClick={() => actions.play(progress.value.reached)}>
                {t('menu.continue', { name: t('mname.' + progress.value.reached) })}
              </button>
              <button class="btn" onClick={() => (panel.value = 'missions')}>
                {t('menu.select')}
              </button>
            </>
          ) : (
            <button class="btn primary" onClick={actions.start}>
              {t('menu.start')}
            </button>
          )}
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

function Complete({ actions }: { actions: Actions }) {
  const n = missionNumber.value;
  const next = n < MISSION_COUNT ? 'mname.' + (n + 1) : undefined;
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
      {sc === 'playing' && terminal.value === 'life' && <Terminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'power' && <PowerTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'array' && <ArrayPanel actions={actions} />}
      {sc === 'playing' && terminal.value === 'build' && <BuildTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'hab' && <HabTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'gh' && <GreenhouseTerminal actions={actions} />}
      {sc === 'playing' && !terminal.value && cardPopup.value && <KnowledgeCard id={cardPopup.value} onClose={() => (cardPopup.value = null)} />}
      <Panel actions={actions} />
    </>
  );
}
