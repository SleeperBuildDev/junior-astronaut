import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setVolume } from '../audio/audio';
import { settings, updateSettings, type Quality } from '../engine/settings';
import { cardFor, CARDS } from '../game/knowledge';
import { DISCOVERIES, SECRET_IDS } from '../game/discoveries';
import { life, O2_STEPS, o2Step, SAFE_O2, startWater, type SysState } from '../game/lifesupport';
import { capacityKWh, kwOf, aimArray, aimError, arrayKW, arrayPanel, ARRAY_KW, BATTERY_KWH, confirmPlan, deployArray, hoursLeft, LOADS, loadKW, LOCK_DEG, NIGHT_HOURS, power, setLoad, solarKW, sunYaw, type ArrayState, type LoadId } from '../game/power';
import { MISSION_COUNT, progress } from '../game/save';
import { blockers, build, built, FACILITIES, kits, type FacilityId } from '../game/construction';
import { CREW, crew, sendToShelter } from '../game/crew';
import { analyze, answer, CORRECT, science, SITE_NAMES } from '../game/science';
import { has, rates, setSpeed, settlement, SETTLE_DAYS, score, type Speed } from '../game/settlement';
import { closeReport, detector, diagnose, emergency, EMERGENCIES, respond, type EmId } from '../game/emergency';
import { BERMS, bermsDone, rad, SHIELDED_MSV_DAY, STORM_HOURS, STORM_OUTSIDE_MSV_H, STORM_SHELTER_MSV_H, SURFACE_MSV_DAY, SURVEY, type SurveyId } from '../game/radiation';
import { adjustPh, chooseLight, CROPS, fillTank, greenhouse, growth, microGrowth, LIGHT_CYCLES, MICRO_DAYS, PH_OK, plant, TANK_LITRES, toggleTray, TRAYS, trayProblem, type CropId } from '../game/greenhouse';
import { choosePressure, COMFORT, connectLines, fillWaterWalls, habitat, heatersOn, installBeds, nudgeTemp, PRESSURES, WATER_WALL_LITRES } from '../game/habitat';
import {
  cardPopup,
  cinema,
  clock,
  drive,
  airlockKpa,
  fade,
  visorFx,
  habInside,
  habLights,
  comms,
  fps,
  gameSpeed,
  heading,
  holdProgress,
  knowledge,
  legend,
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
import { CREDITS, TOOL_CREDITS } from '../game/credits';

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
  /** Mission 9: the final report's "finish" button. */
  finishSettlement?: () => void;
  /** Closes the gold card shown after a secret discovery. */
  closeDiscovery?: () => void;
  /** The music video after Mission 9 (also from the final complete screen). */
  playMusicVideo?: () => void;
  endMusicVideo?: () => void;
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
  ['T', 'ctrl.settle'],
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
      {warning.value ? (
        warning.value.startsWith('i.') ? (
          <div class="warning info">✓ {t(warning.value)}</div>
        ) : (
          <div class="warning">⚠ {t(warning.value)}</div>
        )
      ) : null}
      {holdProgress.value !== null && !prompt.value ? (
        <div class="prompt">
          {t('p.hab.charging')}
          <div class="bar hold">
            <i style={{ width: `${Math.round(holdProgress.value * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {habInside.value ? <HabBadge /> : null}
      {airlockKpa.value !== null ? <AirlockPanel kpa={airlockKpa.value} /> : null}
      {missionNumber.value === 6 ? <StormBanner /> : null}
      {drive.value.driving ? <RoverDash /> : null}
      {missionNumber.value === 8 ? <EmergencyBanner /> : null}
      {detector.value !== null ? <LeakDetector db={detector.value} /> : null}
      {fps.value ? <div class="fps">{fps.value} fps</div> : null}
    </div>
  );
}

/** Outpost power at a glance: solar input, battery charge and what the base is using. */
function BasePanel() {
  const p = power.value;
  const pct = (p.batteryKWh / capacityKWh(p)) * 100;
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
      {missionNumber.value >= 8 ? <EmergencyRows /> : null}
      {!p.bus ? <small class="base-note">{t('hud.busOff')}</small> : p.sun < 0.05 ? <small class="base-note">{t('hud.dark')}</small> : null}
    </div>
  );
}

function EmergencyRows() {
  const e = emergency.value;
  const warn = (bad: boolean) => (bad ? 'base-row bad' : 'base-row');
  return (
    <>
      <div class={warn(e.kpa < 99)}>
        <span>💨 {t('hud.hab2kpa')}</span>
        <b>{num(e.kpa.toFixed(1))} kPa</b>
      </div>
      <div class={warn(e.tempC > 26)}>
        <span>🌡 {t('hud.hab1temp')}</span>
        <b>{num(e.tempC.toFixed(1))} °C</b>
      </div>
      <div class={warn(e.o2Reserve < 90)}>
        <span>🧪 {t('hud.o2res')}</span>
        <b>{num(Math.round(e.o2Reserve))}%</b>
      </div>
    </>
  );
}

/** The live number that matters for an emergency, as a short line. */
function emReading(id: EmId) {
  const e = emergency.value;
  const p = power.value;
  if (id === 'solar' || id === 'battery') return t('em.read.solar', { kw: num(solarKW(p).toFixed(1)), pct: num(Math.round((p.batteryKWh / capacityKWh(p)) * 100)) });
  if (id === 'leak') return t('em.read.leak', { kpa: num(e.kpa.toFixed(1)) });
  if (id === 'recycler') return t('em.read.recycler', { l: num(Math.round(life.value.waterL)) });
  if (id === 'comms') return t('em.read.comms.' + e.link);
  if (id === 'storm') return rad.value.weather === 'warning' ? t('em.read.storm', { t: mmss(rad.value.countdown) }) : t('rad.banner.storm');
  return t('em.read.thermal', { c: num(e.tempC.toFixed(1)) });
}

/** Red/amber alarm strip at the top while an emergency is open. */
function EmergencyBanner() {
  const e = emergency.value;
  if (!e.active || e.phase === 'report' || terminal.value) return null;
  const sev = EMERGENCIES[e.active].severity;
  const fixing = e.phase === 'recover';
  return (
    <div class={`em-banner ${fixing ? 'fixing' : sev}`}>
      <b>{fixing ? '✓ ' + t('em.recovering') : '🚨 ' + t('em.sev.' + sev)}</b> {t('em.' + e.active + '.title')} · {emReading(e.active)}
    </div>
  );
}

function LeakDetector({ db }: { db: number }) {
  const k = Math.max(0, Math.min(1, (db - 20) / 76));
  return (
    <div class="leak-detector">
      <span>📶 {t('em.detector')}</span>
      <div class="bar">
        <i style={{ width: `${Math.round(k * 100)}%`, background: k > 0.6 ? 'var(--red)' : k > 0.3 ? 'var(--amber)' : 'var(--cyan)' }} />
      </div>
      <b>{num(Math.round(db))} dB</b>
    </div>
  );
}

const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** Solar storm countdown, shown until you are inside. */
function StormBanner() {
  const r = rad.value;
  if (r.sheltered || (r.weather !== 'warning' && r.weather !== 'storm')) return null;
  return (
    <div class={`storm-banner ${r.weather}`}>
      ☢ {r.weather === 'warning' ? t('rad.banner.warning', { t: mmss(r.countdown) }) : t('rad.banner.storm')}
    </div>
  );
}

function RoverDash() {
  const d = drive.value;
  return (
    <div class="rover-dash">
      <div class="rd-speed">
        <b>{num(Math.round(Math.abs(d.speed) * 3.6))}</b>
        <small>km/h{d.speed < -0.05 ? ` · ${t('rd.reverse')}` : ''}</small>
      </div>
      <div class="rd-bat">
        <span>🔋 {t('rd.battery')}</span>
        <div class="bar">
          <i style={{ width: `${d.battery}%` }} />
        </div>
        <b>{num(Math.round(d.battery))}%</b>
        {d.battery < 10 ? <em class="rd-low">{t(d.battery <= 0 ? 'rd.flat' : 'rd.low')}</em> : null}
      </div>
      <div class="rd-keys">
        <span>
          <kbd>W</kbd>
          <kbd>S</kbd> {t('rd.drive')}
        </span>
        <span>
          <kbd>A</kbd>
          <kbd>D</kbd> {t('rd.steer')}
        </span>
        <span>
          <kbd>Space</kbd> {t('rd.brake')}
        </span>
        <span>
          <kbd>E</kbd> {t('rd.exit')}
        </span>
      </div>
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

function RadTerminal({ actions }: { actions: Actions }) {
  const r = rad.value;
  const wx = r.weather;
  const shielded = bermsDone();
  return (
    <div class="modal-backdrop">
      <div class="modal terminal rad-term">
        <div class="modal-head">
          <h2>{t('rt.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="gauges three">
          <div class="gauge">
            <span>☢ {t('rt.surface')}</span>
            <b class="low">{SURFACE_MSV_DAY.toFixed(2)}</b>
            <small>{t('rt.perDay')}</small>
          </div>
          <div class="gauge">
            <span>🧑‍🚀 {t('rt.yourDose')}</span>
            <b>{suit.value.dose.toFixed(2)} mSv</b>
            <small>{t('rt.limit')}</small>
          </div>
          <div class="gauge">
            <span>☀ {t('rt.weather')}</span>
            <b class={wx === 'quiet' || wx === 'clear' ? 'good' : 'low'}>{t('rt.wx.' + wx)}</b>
            <small>{wx === 'warning' ? t('rt.arrives', { t: mmss(r.countdown) }) : t('rt.wxNote')}</small>
          </div>
        </div>
        <div class="sys">
          <div class="sys-head">
            <b>{t('rt.survey')}</b>
            <span class="sys-state">
              {num(r.scans.length)}/{num(3)}
            </span>
          </div>
          <div class="rad-rows">
            <div class="rad-row">
              <span>{t('rt.outside')}</span>
              <div class="bar">
                <i style={{ width: '100%' }} />
              </div>
              <b>{SURFACE_MSV_DAY.toFixed(2)}</b>
            </div>
            {(['hab1', 'hab2', 'gh'] as SurveyId[]).map((id) => {
              const done = r.scans.includes(id);
              const v = id === 'hab2' && shielded ? SHIELDED_MSV_DAY : SURVEY[id];
              return (
                <div class={`rad-row ${done ? '' : 'pending'}`}>
                  <span>{t('rt.at.' + id)}</span>
                  <div class="bar">
                    <i style={{ width: done ? `${(v / SURFACE_MSV_DAY) * 100}%` : '0%' }} />
                  </div>
                  <b>{done ? v.toFixed(2) : '—'}</b>
                </div>
              );
            })}
          </div>
          <small>{shielded ? t('rt.shieldedNote') : t('rt.surveyNote')}</small>
        </div>
        <div class="sys">
          <div class="sys-head">
            <b>{t('rt.berms')}</b>
            <span class="sys-state">
              {num(BERMS.filter((b) => r.berms[b] >= 1).length)}/{num(3)}
            </span>
          </div>
          <small>{t('rt.bermNote')}</small>
        </div>
      </div>
    </div>
  );
}

function ShelterScreen({ actions }: { actions: Actions }) {
  const r = rad.value;
  const hours = r.storm * STORM_HOURS;
  const inside = hours * STORM_SHELTER_MSV_H;
  const outside = hours * STORM_OUTSIDE_MSV_H;
  const clear = r.weather === 'clear';
  return (
    <div class="modal-backdrop shelter-bg">
      <div class="modal terminal shelter">
        <div class="modal-head">
          <h2>{t('sh.title')}</h2>
          {clear ? (
            <button class="btn small" onClick={actions.closeTerminal}>
              {t('term.back')}
            </button>
          ) : null}
        </div>
        <p>{clear ? t('sh.clear') : t('sh.inside')}</p>
        <div class="gauge">
          <span>{t('sh.progress')}</span>
          <b>{t('sh.hours', { n: num(Math.floor(hours)), total: num(STORM_HOURS) })}</b>
          <div class="bar">
            <i style={{ width: `${r.storm * 100}%` }} />
          </div>
        </div>
        <div class="gauges">
          <div class="gauge">
            <span>🛡 {t('sh.doseIn')}</span>
            <b class="good">{inside.toFixed(1)} mSv</b>
            <small>{t('sh.doseInNote')}</small>
          </div>
          <div class="gauge">
            <span>☢ {t('sh.doseOut')}</span>
            <b class="low">{outside.toFixed(0)} mSv</b>
            <small>{t('sh.doseOutNote')}</small>
          </div>
        </div>
        {r.lateDose > 0.05 ? <p class="fault">{t('sh.late', { d: r.lateDose.toFixed(1) })}</p> : null}
        <div class="sh-crew">
          {CREW.map((m) => (
            <span class={crew.value[m.id].where === 'shelter' ? '' : 'arriving'}>
              {m.icon} {t('crew.name.' + m.id)} {crew.value[m.id].where === 'shelter' ? '✓' : `… ${t('sh.arriving')}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotesTerminal({ actions }: { actions: Actions }) {
  const sc = science.value;
  const i = sc.notes;
  const name = SITE_NAMES[i];
  const state = sc.sites[i];
  return (
    <div class="modal-backdrop">
      <div class="modal terminal notes">
        <div class="modal-head">
          <h2>
            📓 {t('fn.title')} · {t('fn.' + name + '.site')}
          </h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <p class="fn-scan">🔎 {t('fn.' + name + '.scan')}</p>
        <p>
          <b>{t('fn.' + name + '.q')}</b>
        </p>
        <div class="fn-options">
          {[0, 1, 2].map((o) => (
            <button
              class={`btn small fn-opt ${state !== 'new' && o === CORRECT[i] ? 'right' : ''} ${sc.wrong === o ? 'wrong' : ''}`}
              data-answer={o}
              disabled={state !== 'new'}
              onClick={() => answer(i, o)}
            >
              {t('fn.' + name + '.' + o)}
            </button>
          ))}
        </div>
        {sc.wrong !== null && state === 'new' ? <p class="fault">💭 {t('fn.' + name + '.' + sc.wrong + '.hint')}</p> : null}
        {state !== 'new' ? (
          <>
            <p class="bt-done">✓ {t('fn.' + name + '.ok')}</p>
            {state === 'noted' ? <p class="fn-next">{t('fn.next')}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function LabTerminal({ actions }: { actions: Actions }) {
  const sc = science.value;
  return (
    <div class="modal-backdrop">
      <div class="modal terminal lab-term">
        <div class="modal-head">
          <h2>{t('lab.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <p>{t('lab.intro')}</p>
        <div class="lab-samples">
          {SITE_NAMES.map((n, i) => (
            <div class="lab-sample">
              <b>
                {['🏔️', '🧱', '🧊'][i]} {t('lab.' + n + '.title')}
              </b>
              <p>{t('lab.' + n + '.text')}</p>
            </div>
          ))}
        </div>
        <p class="ingame">{t('lab.oxygen')}</p>
        {sc.analyzed ? (
          <p class="bt-done">✓ {t('lab.sent')}</p>
        ) : (
          <button class="btn primary small confirm" data-action="send" onClick={analyze}>
            📡 {t('lab.send')}
          </button>
        )}
      </div>
    </div>
  );
}

/** The alarm: what is wrong, how bad, what it affects, and the first-response choice. */
function AlertTerminal({ actions }: { actions: Actions }) {
  const e = emergency.value;
  const id = e.active;
  if (!id) return null;
  const def = EMERGENCIES[id];
  const chosen = e.phase !== 'alert';
  return (
    <div class="modal-backdrop">
      <div class={`modal terminal em-alert ${def.severity}`}>
        <div class="modal-head">
          <h2>
            🚨 {t('em.sev.' + def.severity)} · {t('em.' + id + '.title')}
          </h2>
          {chosen ? (
            <button class="btn small" onClick={actions.closeTerminal}>
              {t('term.back')}
            </button>
          ) : null}
        </div>
        <p>{t('em.' + id + '.desc')}</p>
        <div class="em-chips">
          <span class="em-label">{t('em.affects')}</span>
          {def.systems.map((sy) => (
            <span class="em-chip">{t('em.sys.' + sy)}</span>
          ))}
          <span class="em-read">{emReading(id)}</span>
        </div>
        <p>
          <b>{t('em.q')}</b>
        </p>
        <div class="fn-options">
          {def.order.map((o) => (
            <button
              class={`btn small fn-opt ${chosen && o === def.best ? 'right' : ''} ${e.wrong === o ? 'wrong' : ''}`}
              data-response={o}
              disabled={chosen}
              onClick={() => respond(o)}
            >
              {t('em.' + id + '.r' + o)}
            </button>
          ))}
        </div>
        {e.wrong !== null && !chosen ? <p class="fault">⚠ {t('em.' + id + '.r' + e.wrong + '.why')}</p> : null}
        {chosen ? (
          <>
            <p class="bt-done">✓ {t('em.' + id + '.ok')}</p>
            <button class="btn primary small confirm" data-action="go" onClick={actions.closeTerminal}>
              {t('em.go')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** At the broken equipment: read the evidence, pick the cause. */
function DiagTerminal({ actions }: { actions: Actions }) {
  const e = emergency.value;
  const id = e.active;
  if (!id || id === 'leak') return null;
  const def = EMERGENCIES[id];
  const solved = e.phase !== 'diagnose';
  return (
    <div class="modal-backdrop">
      <div class="modal terminal notes">
        <div class="modal-head">
          <h2>🔍 {t('em.' + id + '.diagTitle')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <ul class="em-evidence">
          {[0, 1, 2, 3].map((k) => (
            <li>{t('em.' + id + '.ev' + k)}</li>
          ))}
        </ul>
        <p>
          <b>{t('em.' + id + '.cq')}</b>
        </p>
        <div class="fn-options">
          {def.order.map((o) => (
            <button
              class={`btn small fn-opt ${solved && o === def.cause ? 'right' : ''} ${e.wrong === o ? 'wrong' : ''}`}
              data-cause={o}
              disabled={solved}
              onClick={() => diagnose(o)}
            >
              {t('em.' + id + '.c' + o)}
            </button>
          ))}
        </div>
        {e.wrong !== null && !solved ? <p class="fault">💭 {t('em.' + id + '.c' + e.wrong + '.hint')}</p> : null}
        {solved ? (
          <>
            <p class="bt-done">✓ {t('em.' + id + '.cok')}</p>
            <p class="fn-next">{t('em.holdNext')}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** After-action report: what happened, why, how to prevent it, and how the response went. */
function ReportTerminal({ actions }: { actions: Actions }) {
  const e = emergency.value;
  const id = e.active;
  if (!id) return null;
  const r = e.reports[id];
  if (!r) return null;
  const total = Math.round(r.minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const worst = id === 'solar' || id === 'battery' || id === 'recycler' ? num(Math.round(r.worst)) : num(r.worst.toFixed(1));
  return (
    <div class="modal-backdrop">
      <div class="modal terminal aar">
        <div class="modal-head">
          <h2>
            📋 {t('aar.title')} · {t('em.' + id + '.title')}
          </h2>
        </div>
        <div class="aar-grid">
          <div>
            <h3>{t('aar.what')}</h3>
            <p>{t('aar.' + id + '.what')}</p>
          </div>
          <div>
            <h3>{t('aar.why')}</h3>
            <p>{t('aar.' + id + '.why')}</p>
          </div>
          <div>
            <h3>{t('aar.prevent')}</h3>
            <p>{t('aar.' + id + '.prevent')}</p>
          </div>
        </div>
        <div class="aar-stats">
          <span>{r.tries <= 1 ? '✓ ' + t('aar.first') : t('aar.tries', { n: num(r.tries) })}</span>
          <span>⏱ {t('aar.time', { h: num(h), m: num(m) })}</span>
          <span>📉 {t('aar.worst.' + id, { v: worst })}</span>
        </div>
        <button
          class="btn primary small confirm"
          data-action="file"
          onClick={() => {
            closeReport();
            actions.closeTerminal();
          }}
        >
          {t('aar.file')}
        </button>
      </div>
    </div>
  );
}

const SPEED_LIST: { id: Speed; icon: string }[] = [
  { id: 'normal', icon: '▶' },
  { id: 'fast', icon: '⏩' },
  { id: 'fastest', icon: '⏭' },
];

/** Mission 9 at a glance: the clock, every resource with its daily rate, crew, power and building. */
function SettlementPanel() {
  const st = settlement.value;
  const e = emergency.value;
  const p = power.value;
  const r = rates();
  const cap = capacityKWh(p);
  const day = Math.min(SETTLE_DAYS, st.day);
  const busy = !!e.active;
  const lasts = (amount: number, rate: number) => (rate < -1e-6 ? t('st.lasts', { n: num((amount / -rate).toFixed(1)) }) : t('st.steady'));
  const sign = (v: number, digits = 1) => (v >= 0 ? '+' : '−') + num(Math.abs(v).toFixed(digits));
  const net = solarKW(p) - loadKW(p);
  const row = (icon: string, name: string, value: string, rate: string, note: string, bad = false) => (
    <div class={`st-row ${bad ? 'bad' : ''}`}>
      <span>
        {icon} {t(name)}
      </span>
      <b>{value}</b>
      <em>{rate}</em>
      <small>{note}</small>
    </div>
  );
  const SWITCH: LoadId[] = ['gh', 'lab', 'rover', 'flood'];
  return (
    <div class="settle">
      <div class="st-top">
        <div class="st-day">
          <span>{t('st.day')}</span>
          <b>
            {num(Math.floor(day))} / {num(SETTLE_DAYS)}
          </b>
          <div class="bar">
            <i style={{ width: `${(day / SETTLE_DAYS) * 100}%` }} />
          </div>
        </div>
        <div class="st-speed">
          <span>{t('st.speed')}</span>
          <div>
            {SPEED_LIST.map((x) => (
              <button class={`btn small ${st.speed === x.id ? 'primary' : ''}`} data-speed={x.id} disabled={busy && x.id !== 'normal'} onClick={() => setSpeed(x.id)}>
                {x.icon} {t('st.speed.' + x.id)}
              </button>
            ))}
          </div>
          {busy ? <small class="fault">{t('st.busy')}</small> : null}
        </div>
      </div>
      <div class="st-cols">
        <div>
          <h3>{t('st.supplies')}</h3>
          {row('⚡', 'st.power', `${num(solarKW(p).toFixed(1))} / ${num(loadKW(p).toFixed(1))} kW`, `${sign(net)} kW`, t('st.powerNote'), net < 0)}
          {row('🔋', 'hud.battery', `${num(Math.round(p.batteryKWh))} / ${num(Math.round(cap))} kWh`, '', net < 0 ? t('st.hours', { n: num((p.batteryKWh / -net).toFixed(1)) }) : t('st.charging'), p.batteryKWh / cap < 0.2)}
          {row('🧪', 'hud.o2res', `${num(Math.round(e.o2Reserve))}%`, `${sign(r.o2Pct)}%/${t('st.perDay')}`, lasts(e.o2Reserve, r.o2Pct), e.o2Reserve < 30)}
          {row('💧', 'hud.water', `${num(Math.round(life.value.waterL))} L`, `${sign(r.water)} L/${t('st.perDay')}`, lasts(life.value.waterL, r.water), life.value.waterL < 20)}
          {row('🍽', 'hud.food', t('hud.days', { n: num(Math.floor(greenhouse.value.foodDays)) }), `${sign(r.food)}/${t('st.perDay')}`, lasts(greenhouse.value.foodDays, r.food), greenhouse.value.foodDays < 3)}
          {row('🌡', 'hud.hab1temp', `${num(e.tempC.toFixed(1))} °C`, '', t('st.tempNote'), e.tempC < 15 || e.tempC > 28)}
          {row('🔧', 'st.condition', `${num(Math.round(st.condition))}%`, '', t(has('workshop') ? 'st.condWorkshop' : 'st.condNote'))}
          <p class="st-explain">{t('st.explain', { breathe: num(r.breathe.toFixed(1)), gen: num(r.gen.toFixed(1)), use: num(Math.round(r.use)), rec: num(Math.round(r.recovery * 100)) })}</p>
        </div>
        <div>
          <h3>{t('st.crew')}</h3>
          {CREW.map((m) => {
            const c = crew.value[m.id];
            return (
              <div class="st-crew">
                <span>
                  {m.icon} {t('crew.name.' + m.id)}
                </span>
                <div class="bar">
                  <i style={{ width: `${c.health}%`, background: c.health > 60 ? 'var(--green)' : c.health > 35 ? 'var(--amber)' : 'var(--red)' }} />
                </div>
                <b>{num(Math.round(c.health))}%</b>
              </div>
            );
          })}
          <h3>{t('st.switches')}</h3>
          <div class="st-switches">
            {SWITCH.map((id) => (
              <button class={`btn small ${p.loads[id] ? 'on' : ''}`} data-load={id} onClick={() => setLoad(id, !p.loads[id])}>
                {p.loads[id] ? '●' : '○'} {t('load.' + id)} · {num(kwOf(id, p).toFixed(1))} kW
              </button>
            ))}
          </div>
          <small class="st-note">{t('st.essential')}</small>
          <h3>{t('st.facilities')}</h3>
          <ul class="st-fac">
            {st.running.map((id) => (
              <li>
                ✓ {t('fac.' + id)}
              </li>
            ))}
            {st.building.map((b) => (
              <li class="todo">
                🏗 {t('fac.' + b.id)} · {t('st.hoursLeft', { n: num(Math.ceil(b.hours)) })}
              </li>
            ))}
            {!st.running.length && !st.building.length ? <li class="todo">{t('st.noneYet')}</li> : null}
          </ul>
          <small class="st-note">{t('st.buildWhere')}</small>
          <h3>{t('st.forecast')}</h3>
          <ul class="st-fac">
            {day < 4 ? <li>📦 {t('st.fc.cargo')}</li> : null}
            {day < 10 ? <li>🌗 {t('st.fc.shadow')}</li> : null}
            <li>☢ {t('st.fc.storm')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Mission 9's end: the settlement report (or why the crew had to leave). */
function FinalReport({ actions }: { actions: Actions }) {
  const st = settlement.value;
  const e = emergency.value;
  const reps = Object.entries(e.reports).filter(([id]) => id !== 'storm');
  const firstTry = reps.filter(([, r]) => r!.tries <= 1).length;
  const sc = score(firstTry);
  if (st.failed) {
    return (
      <div class="modal-backdrop">
        <div class="modal terminal aar">
          <div class="modal-head">
            <h2>🚨 {t('fin.failTitle')}</h2>
          </div>
          <p>{t('fin.failText', { d: num(Math.floor(st.day)) })}</p>
          <ul class="em-evidence">
            {life.value.waterL <= 0 ? <li>{t('fin.why.water')}</li> : null}
            {greenhouse.value.foodDays <= 0 ? <li>{t('fin.why.food')}</li> : null}
            {e.o2Reserve <= 0 ? <li>{t('fin.why.o2')}</li> : null}
            {e.tempC < 12 ? <li>{t('fin.why.cold')}</li> : null}
            {e.tempC > 30 ? <li>{t('fin.why.hot')}</li> : null}
          </ul>
          <p class="st-explain">{t('fin.tips')}</p>
          <div class="menu-buttons row">
            <button class="btn" onClick={actions.toMenu}>
              {t('complete.menu')}
            </button>
            <button class="btn primary" data-action="retry" onClick={actions.restart}>
              {t('complete.again')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="modal-backdrop">
      <div class="modal terminal aar final-report">
        <div class="modal-head">
          <h2>🏁 {t('fin.title')}</h2>
        </div>
        <div class="fin-stars">
          {[1, 2, 3].map((k) => (
            <span class={k <= sc.stars ? 'on' : ''}>★</span>
          ))}
          <b>{t('fin.score', { n: num(sc.total) })}</b>
          <em>{t('fin.rank.' + sc.stars)}</em>
        </div>
        <div class="fin-rows">
          <div>
            <span>👩‍🚀 {t('fin.crew', { h: num(Math.round(sc.avg)) })}</span>
            <b>{num(sc.crewPts)} / {num(40)}</b>
          </div>
          <div>
            <span>💧🍽🧪 {t('fin.supplies', { w: num(Math.round(life.value.waterL)), f: num(Math.floor(greenhouse.value.foodDays)), o: num(Math.round(e.o2Reserve)) })}</span>
            <b>{num(sc.supplyPts)} / {num(30)}</b>
          </div>
          <div>
            <span>🚨 {t('fin.emergencies', { n: num(reps.length), first: num(firstTry) })}</span>
            <b>{num(sc.emPts)} / {num(20)}</b>
          </div>
          <div>
            <span>🏗 {t('fin.built', { list: st.running.map((id) => t('fac.' + id)).join(', ') || '—' })}</span>
            <b>{num(sc.buildPts)} / {num(10)}</b>
          </div>
        </div>
        <p class="st-explain">{t('fin.low', { b: num(Math.round(st.low.battery)), w: num(Math.round(st.low.water)), o: num(Math.round(st.low.o2)) })}</p>
        <p>{t('fin.text')}</p>
        <button class="btn primary small confirm" data-action="finish" onClick={() => actions.finishSettlement?.()}>
          {t('fin.finish')}
        </button>
      </div>
    </div>
  );
}

function CrewPanel() {
  const c = crew.value;
  const h = habitat.value;
  const storm = rad.value.weather === 'warning' || rad.value.weather === 'storm';
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
              <p class={`crew-status ${s.status === 'crew.st.safe' || s.status === 'crew.st.shelter' ? 'good' : 'warn'}`}>
                {t(s.status)}
                {s.where === 'moving' && s.eta ? ` (${num(Math.ceil(s.eta))} s)` : ''}
              </p>
              {storm && m.id !== 'eng' && s.where !== 'shelter' && s.where !== 'moving' ? (
                <button class="btn primary small" data-send={m.id} onClick={() => sendToShelter(m.id)}>
                  {t('crew.send')}
                </button>
              ) : null}
              <small class="crew-job">{t('crew.job.' + m.id)}</small>
            </div>
          );
        })}
      </div>
      <div class="crew-alerts">
        <b>{t('crew.alerts')}</b>
        {storm ? <p class="warn">☢ {t('crew.alert.storm')}</p> : null}
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
        {t('card.ok')} <kbd class="key-hint">Enter</kbd>
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
        {Object.keys(CARDS)
          .filter((id) => !SECRET_IDS.has(id))
          .map((id) => {
            const open = unlocked.includes(id);
            const card = cardFor(id, lang)!;
            return (
              <button class={`kc-item ${sel === id ? 'sel' : ''}`} disabled={!open} onClick={() => setSel(id)}>
                <span>{open ? card.icon : '🔒'}</span> {open ? card.title : t('kc.locked')}
              </button>
            );
          })}
        <div class="kc-secrets">
          {t('kc.secrets', { n: num(DISCOVERIES.filter((d) => unlocked.includes(d.id)).length), total: num(DISCOVERIES.length) })}
        </div>
        {DISCOVERIES.map(({ id, mission: m }) => {
          const open = unlocked.includes(id);
          const card = cardFor(id, lang)!;
          return (
            <button class={`kc-item secret ${sel === id ? 'sel' : ''}`} disabled={!open} onClick={() => setSel(id)}>
              <span>{open ? card.icon : '✦'}</span> {open ? card.title : t('kc.secretLocked', { n: num(m) })}
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
      <div class="quality">
        {t('set.motion')}
        <div class="seg">
          {([1, 0.5, 0] as const).map((m) => (
            <button class={(s.motion ?? 1) === m ? 'on' : ''} onClick={() => updateSettings({ motion: m })}>
              {t('set.motion.' + m * 10)}
            </button>
          ))}
        </div>
        <small>{t('set.motionHint')}</small>
      </div>
      <button class="btn small" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
        {t('set.fullscreen')}
      </button>
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
        {p === 'missions' && <MissionSelect actions={actions} />}
        {p === 'crew' && <CrewPanel />}
        {p === 'colony' && <SettlementPanel />}
        {p === 'credits' && <CreditsList />}
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
        <p class="secret-count">
          ✦ {t('complete.secrets', { n: num(DISCOVERIES.filter((d) => d.mission === n && knowledge.value.includes(d.id)).length), total: num(DISCOVERIES.filter((d) => d.mission === n).length) })}
        </p>
        {next ? null : (
          <p class="next">
            <b>{t('complete.finaleTitle')}</b> {t('complete.finale')}
          </p>
        )}
        <div class="menu-buttons row">
          {n === MISSION_COUNT && !settlement.value.failed ? (
            <button class="btn" onClick={actions.playMusicVideo}>
              ▶ {t('mv.replay')}
            </button>
          ) : null}
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
  const gold = c.gold && legend.value ? cardFor(legend.value, settings.value.lang) : null;
  const egg = DISCOVERIES.find((d) => d.id === legend.value)?.egg;
  return (
    <div class={`cinema ${legend.value ? 'legendary' : ''}`}>
      {gold ? (
        <div class="legend-title">
          <small>{t(egg ? 'disc.egg' : 'disc.legendary')}</small>
          <span class="legend-emoji">{gold.icon}</span>
          <b>{gold.title}</b>
        </div>
      ) : null}
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

/** Inside HAB-1: cabin air and whether your suit is refilling from it. */
function HabBadge() {
  const ok = missionNumber.value >= 3 || life.value.habO2 >= SAFE_O2 - 0.05;
  return (
    <div class={`hab-badge ${ok ? '' : 'bad'}`}>
      🏠 HAB-1 · {num(101)} kPa · O₂ {num(life.value.habO2.toFixed(1))}% · {ok ? t('hab.refill') : t('hab.noAir')}
    </div>
  );
}

/** Airlock cycle: the pressure climbing (or falling) between 0 and 101 kPa. */
function AirlockPanel({ kpa }: { kpa: number }) {
  return (
    <div class="airlock-panel">
      <small>{t('hab.airlock')}</small>
      <b>{num(kpa)} kPa</b>
      <div class="bar">
        <i style={{ width: `${Math.min(100, (kpa / 101) * 100)}%` }} />
      </div>
      <small class="skip">{t('hab.skip')}</small>
    </div>
  );
}

/** HAB-1's console: cabin and base readings, and the habitat lights (day / evening / night). */
function HabConsole({ actions }: { actions: Actions }) {
  const l = life.value;
  const p = power.value;
  const ok = missionNumber.value >= 3 || l.habO2 >= SAFE_O2 - 0.05;
  const modes = ['day', 'evening', 'night'] as const;
  return (
    <div class="modal-backdrop">
      <div class="modal terminal hab-console">
        <div class="modal-head">
          <h2>🏠 {t('hc.title')}</h2>
          <button class="btn small" onClick={actions.closeTerminal}>
            {t('term.back')}
          </button>
        </div>
        <div class="gauges three">
          <div class="gauge">
            <span>{t('hc.pressure')}</span>
            <b class="good">{num(101)} kPa</b>
            <small>{t('hc.pressureNote')}</small>
          </div>
          <div class="gauge">
            <span>{t('hc.o2')}</span>
            <b class={ok ? 'good' : 'low'}>{num(l.habO2.toFixed(1))}%</b>
            <small>{ok ? t('hc.o2ok') : t('hc.o2low')}</small>
          </div>
          <div class="gauge">
            <span>{t('hc.temp')}</span>
            <b>{num(21)}°C</b>
            <small>{t('hc.tempNote')}</small>
          </div>
        </div>
        <div class="sys">
          <div class="sys-head">
            <b>{t('hc.base')}</b>
          </div>
          <div class="hc-rows">
            <span>💧 {t('hc.water')}</span>
            <b>{num(Math.round(l.waterL))} L</b>
            {missionNumber.value >= 3 ? (
              <>
                <span>🔋 {t('hc.battery')}</span>
                <b>
                  {num(Math.round((p.batteryKWh / capacityKWh()) * 100))}% · ☀ {num(solarKW().toFixed(1))} kW
                </b>
              </>
            ) : null}
            {missionNumber.value >= 5 ? (
              <>
                <span>🥗 {t('hc.food')}</span>
                <b>{t('hc.days', { n: num(Math.floor(greenhouse.value.foodDays)) })}</b>
              </>
            ) : null}
            <span>🧑‍🚀 {t('hc.suit')}</span>
            <b>
              O₂ {num(Math.round(suit.value.o2))}% · {t('hud.power')} {num(Math.round(suit.value.power))}%
            </b>
          </div>
        </div>
        <div class="sys">
          <div class="sys-head">
            <b>💡 {t('hc.lights')}</b>
          </div>
          <div class="choice">
            {modes.map((m) => (
              <button class={`btn ${habLights.value === m ? 'on' : ''}`} onClick={() => (habLights.value = m)}>
                {t('hc.light.' + m)}
                <small>{t('hc.light.' + m + '.note')}</small>
              </button>
            ))}
          </div>
          <p class="hc-note">{t('hc.lightsNote')}</p>
        </div>
      </div>
    </div>
  );
}

/** The music video "The Last Orbit" (rendered in this game's engine), after Mission 9's ending.
 *  The button, Enter, Space or Esc skips it; when it ends the complete screen shows. */
function MusicVideo({ actions }: { actions: Actions }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'blocked'>('loading');
  useEffect(() => {
    const v = video.current!;
    v.volume = Math.min(1, settings.value.volume);
    // Browsers may refuse to start a video with sound; then the player presses Play.
    v.play().catch(() => setState('blocked'));
  }, []);
  const end = () => actions.endMusicVideo?.();
  return (
    <div class="mtv">
      <video
        ref={video}
        src="./assets/video/the-last-orbit.mp4"
        playsInline
        preload="auto"
        onPlaying={() => setState('playing')}
        onWaiting={() => setState('loading')}
        onEnded={end}
        onError={end}
      />
      <CreditsRoll video={video} />
      {state === 'loading' ? <div class="mtv-wait">{t('mv.loading')}</div> : null}
      {state === 'blocked' ? (
        <button class="btn primary mtv-play" onClick={() => void video.current?.play()}>
          ▶ {t('mv.play')}
        </button>
      ) : null}
      <button class="btn small cine-skip mtv-skip" onClick={end}>
        {t('cs.skip')} ▶▶ <small>{t('mv.skipHint')}</small>
      </button>
    </div>
  );
}

/** Everyone who made the game, then the tools and assets it is built with. */
function CreditsList() {
  return (
    <div class="credits-list">
      {CREDITS.map(([role, names]) => (
        <div class="credit" key={role}>
          <small>{role}</small>
          {names.map((n) => (
            <b key={n}>{n}</b>
          ))}
        </div>
      ))}
      <h3>{t('credits.tools')}</h3>
      {TOOL_CREDITS.map(([what, names]) => (
        <div class="credit tool" key={what}>
          <small>{what}</small>
          <b>{names.join(' · ')}</b>
        </div>
      ))}
      <p class="credit-note">{t('credits.note')}</p>
    </div>
  );
}

/** The credits rolling up the right side of the music video: they start with the video and
 *  leave the top as it ends (tied to the video's own clock, so they pause when it pauses). */
function CreditsRoll({ video }: { video: { current: HTMLVideoElement | null } }) {
  const roll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const v = video.current;
      const r = roll.current;
      if (v && r) {
        const k = Math.min(1, v.currentTime / (v.duration || 160.75));
        const h = r.offsetHeight;
        const H = r.parentElement!.clientHeight;
        r.style.transform = `translateY(${(H - k * (H + h)).toFixed(1)}px)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div class="mtv-credits">
      <div class="mtv-roll" ref={roll}>
        <h2>JUNIOR ASTRONAUT</h2>
        <p class="mtv-sub">{t('menu.subtitle')}</p>
        <CreditsList />
        <p class="mtv-thanks">{t('credits.thanks')}</p>
      </div>
    </div>
  );
}

/** The gold card after a secret discovery's cutscene. */
function DiscoveryReveal({ actions }: { actions: Actions }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        actions.closeDiscovery?.();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const id = legend.value;
  const c = id ? cardFor(id, settings.value.lang) : null;
  if (!id || !c) return null;
  const egg = DISCOVERIES.find((d) => d.id === id)?.egg;
  const found = DISCOVERIES.filter((d) => knowledge.value.includes(d.id)).length;
  return (
    <div class="legend-screen">
      <div class="legend-card">
        <div class="legend-shine" />
        <small class="legend-kicker">✦ {t(egg ? 'disc.egg' : 'disc.legendary')} ✦</small>
        <div class="legend-icon">{c.icon}</div>
        <h2>{c.title}</h2>
        <div class="legend-body">
          <CardBody id={id} />
        </div>
        <p class="legend-count">{t('disc.count', { n: num(found), total: num(DISCOVERIES.length) })}</p>
        <button class="btn primary" onClick={actions.closeDiscovery}>
          {t('disc.continue')} <kbd class="key-hint">Enter</kbd>
        </button>
      </div>
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
      // While you play, the mouse is captured, so Enter closes the card instead of a click.
      const onKey = (e: KeyboardEvent) => {
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && screen.value === 'playing' && !terminal.value) {
          e.preventDefault();
          cardPopup.value = null;
        }
      };
      addEventListener('keydown', onKey);
      return () => {
        clearTimeout(timer);
        removeEventListener('keydown', onKey);
      };
    }
  }, [cardPopup.value]);
  if (isPhone) return <PhoneNotice />;
  const sc = screen.value;
  return (
    <>
      {visorFx.value.on && (
        <>
          <div class="visor-rim" />
          {visorFx.value.fog > 0 && <div class="visor-fog" style={{ opacity: visorFx.value.fog }} />}
        </>
      )}
      {(sc === 'playing' || sc === 'paused') && <Hud />}
      {sc === 'loading' && <Loading />}
      {sc === 'cutscene' && <Cinema actions={actions} />}
      {sc === 'menu' && <Menu actions={actions} />}
      {sc === 'briefing' && <Briefing actions={actions} />}
      {sc === 'paused' && !panel.value && <Paused actions={actions} />}
      {sc === 'complete' && <Complete actions={actions} />}
      {sc === 'discovery' && <DiscoveryReveal actions={actions} />}
      {sc === 'mtv' && <MusicVideo actions={actions} />}
      {sc === 'playing' && terminal.value === 'life' && <Terminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'power' && <PowerTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'array' && <ArrayPanel actions={actions} />}
      {sc === 'playing' && terminal.value === 'build' && <BuildTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'hab' && <HabTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'gh' && <GreenhouseTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'rad' && <RadTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'shelter' && <ShelterScreen actions={actions} />}
      {sc === 'playing' && terminal.value === 'notes' && <NotesTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'lab' && <LabTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'alert' && <AlertTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'diag' && <DiagTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'aar' && <ReportTerminal actions={actions} />}
      {sc === 'playing' && terminal.value === 'final' && <FinalReport actions={actions} />}
      {sc === 'playing' && terminal.value === 'hab1' && <HabConsole actions={actions} />}
      {fade.value > 0 ? <div class="fade-black" style={{ opacity: fade.value }} /> : null}
      {sc === 'playing' && !terminal.value && cardPopup.value && <KnowledgeCard id={cardPopup.value} onClose={() => (cardPopup.value = null)} />}
      <Panel actions={actions} />
    </>
  );
}
