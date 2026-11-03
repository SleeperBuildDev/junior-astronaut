import * as THREE from 'three';
import { playVoice, sfx } from '../audio/audio';
import type { Outpost } from '../world/base';
import { sunPath } from '../world/sky';
import { kits, onBuild } from './construction';
import { engineerInside, simulateCrew } from './crew';
import { checkFitting, emergency, onEmEvent, openReport, recovered, repair, simulateEmergency, stormDone, stormSheltered, trigger, updateDetector, type EmId } from './emergency';
import { greenhouse } from './greenhouse';
import { life } from './lifesupport';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { power, setArrayHealth, setSunlight, simulatePower } from './power';
import { enterShelter, onRadEvent, rad, simulateRadiation, startWarning } from './radiation';
import { has, onSettleEvent, rates, resetSettlement, setSpeed, settlement, SETTLE_DAYS, simulateSettlement, SPEEDS, startBuilding } from './settlement';
import { gameSpeed, mission, missionNumber, NORMAL_SPEED, panel, pushComm, screen, terminal, unlock, type Step } from './state';

// Mission 9: Sustainable Lunar Settlement. Thirty days with every system linked: plan
// power for a long shadow, build what the outpost needs, ride out a solar storm and
// handle surprise emergencies, and bring the whole crew through safely.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'panel', text: 'm9.panel', done: false },
  { id: 'blanket', text: 'm9.blanket', done: false },
  { id: 'build', text: 'm9.build', done: false },
  { id: 'shadow', text: 'm9.shadow', done: false },
  { id: 'storm', text: 'm9.storm', done: false },
  { id: 'events', text: 'm9.events', done: false },
  { id: 'day30', text: 'm9.day30', done: false },
];

type Line = { vo: string; text: string; from?: string };
const LINES: Record<string, Line> = {
  start: { vo: 'm9_01', text: 'c.m9.start' },
  speed: { vo: 'm9_02', text: 'c.m9.speed' },
  cargo: { vo: 'm9_03', text: 'c.m9.cargo' },
  blanket: { vo: 'm9_04', text: 'c.m9.blanket' },
  built: { vo: 'm9_05', text: 'c.m9.built' },
  waterLow: { vo: 'm9_06', text: 'c.m9.waterLow' },
  shadowSoon: { vo: 'm9_07', text: 'c.m9.shadowSoon' },
  shadow: { vo: 'm9_08', text: 'c.m9.shadow' },
  shadowEnd: { vo: 'm9_09', text: 'c.m9.shadowEnd' },
  batteryLow: { vo: 'm9_10', text: 'c.m9.batteryLow' },
  // Emergencies (the leak and pump lines come from Mission 8)
  leakAlarm: { vo: 'm8_07', text: 'c.m8.leakAlarm' },
  leakResp: { vo: 'm8_08', text: 'c.m8.leakResp' },
  leakFound: { vo: 'm8_09', text: 'c.m8.leakFound' },
  leakFix: { vo: 'm8_10', text: 'c.m8.leakFix' },
  thermalAlarm: { vo: 'm8_11', text: 'c.m8.thermalAlarm' },
  thermalResp: { vo: 'm8_12', text: 'c.m8.thermalResp' },
  thermalDiag: { vo: 'm8_13', text: 'c.m8.thermalDiag' },
  thermalFix: { vo: 'm8_14', text: 'c.m8.thermalFix' },
  recyclerAlarm: { vo: 'm9_11', text: 'c.m9.recyclerAlarm' },
  recyclerResp: { vo: 'm9_12', text: 'c.m9.recyclerResp' },
  recyclerDiag: { vo: 'm9_13', text: 'c.m9.recyclerDiag' },
  recyclerFix: { vo: 'm9_14', text: 'c.m9.recyclerFix' },
  commsAlarm: { vo: 'cr_cmdr_4', text: 'c.m9.commsAlarm', from: 'crew.name.cmdr' },
  commsResp: { vo: 'cr_cmdr_5', text: 'c.m9.commsResp', from: 'crew.name.cmdr' },
  commsDiag: { vo: 'cr_cmdr_6', text: 'c.m9.commsDiag', from: 'crew.name.cmdr' },
  commsFix: { vo: 'm9_15', text: 'c.m9.commsFix' },
  batteryAlarm: { vo: 'm9_16', text: 'c.m9.batteryAlarm' },
  batteryResp: { vo: 'm9_17', text: 'c.m9.batteryResp' },
  batteryDiag: { vo: 'm9_18', text: 'c.m9.batteryDiag' },
  batteryFix: { vo: 'm9_19', text: 'c.m9.batteryFix' },
  stormAlarm: { vo: 'm9_20', text: 'c.m9.stormAlarm' },
  stormResp: { vo: 'm9_21', text: 'c.m9.stormResp' },
  stormFix: { vo: 'm9_22', text: 'c.m9.stormFix' },
  report: { vo: 'm8_06', text: 'c.m8.report' },
  sci: { vo: 'cr_sci_4', text: 'c.m9.sci', from: 'crew.name.sci' },
  day30: { vo: 'm9_23', text: 'c.m9.day30' },
  failed: { vo: 'm9_24', text: 'c.m9.failed' },
};

const POOL: EmId[] = ['leak', 'thermal', 'recycler', 'comms', 'battery'];
const CARDS: Partial<Record<EmId, string>> = { recycler: 'filters', comms: 'relay', battery: 'liion' };
/** Settlement days of the three surprise emergencies and the storm. */
const EVENT_DAYS = [12, 16.5, 24.5];
const STORM_DAY = 20.5;
/** The long shadow: the Sun slips low behind the ridge and only a little light reaches the towers. */
const SHADOW = { start: 8, end: 10, sun: 0.3 };
/** 30 storm hours in about 16 real seconds (like Mission 6). */
const STORM_SPEED = 6750;

export class Mission9 implements GameMission {
  readonly number = 9;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private timers: { at: number; fn: () => void }[] = [];
  private time = 0;
  private reportAt = 0;
  /** Things that happen once, by name. */
  private flags = new Set<string>();
  /** The surprise emergencies for this play, in order. */
  private plan: EmId[] = [];
  private handled = 0;
  private sunK = 0;
  private marks: { tower3: THREE.Object3D; leaks: THREE.Vector3[]; pump: THREE.Vector3; filter: THREE.Vector3; antenna: THREE.Vector3; battery: THREE.Vector3; airlock: THREE.Vector3; build: THREE.Vector3 };

  constructor(outpost: Outpost) {
    this.marks = {
      tower3: outpost.arrays[2].box,
      leaks: outpost.emergency.leaks,
      pump: outpost.emergency.pumpPos,
      filter: outpost.settlement.filterPos,
      antenna: outpost.settlement.antennaPos,
      battery: outpost.settlement.batteryPos,
      airlock: outpost.airlockPos.clone().add(new THREE.Vector3(0.3, 2, 0)),
      build: outpost.hab2.buildTerminalPos,
    };
    const mine = () => missionNumber.value === 9;
    onEmEvent((e, id) => {
      if (!mine()) return;
      if (e === 'alarm') {
        setSpeed('normal');
        this.say((id + 'Alarm') as keyof typeof LINES);
        this.after(1.5, () => {
          panel.value = null;
          terminal.value = 'alert';
        });
      }
      if (e === 'responded') this.say((id + 'Resp') as keyof typeof LINES);
      if (e === 'diagnosed' || e === 'found') this.say(id === 'leak' ? 'leakFound' : ((id + 'Diag') as keyof typeof LINES));
      if (e === 'repaired') {
        this.reportAt = this.time + 6;
        this.say((id + 'Fix') as keyof typeof LINES);
        settlement.value = { ...settlement.value, condition: Math.min(100, settlement.value.condition + 10) };
      }
      if (e === 'closed') {
        if (CARDS[id]) unlock(CARDS[id]!);
        if (id === 'storm') this.complete('storm');
        else {
          this.handled++;
          this.progress('events', `${this.handled}/3`);
          if (this.handled >= 3) this.complete('events');
        }
      }
      this.publish();
    });
    onRadEvent((e) => {
      if (!mine()) return;
      if (e === 'stormOver') stormDone();
    });
    onBuild((id) => mine() && startBuilding(id));
    onSettleEvent((e) => {
      if (!mine()) return;
      if (e === 'built') {
        this.complete('build');
        this.say('built');
      }
      if (e === 'failed') {
        setSpeed('normal');
        this.say('failed');
        panel.value = null;
        terminal.value = 'final';
      }
    });
  }

  private after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  end() {
    this.timers = [];
    updateDetector(0, null);
    sunPath(0);
    setSunlight(1);
  }

  get holdSeconds() {
    return has('workshop') ? 1.5 : 3;
  }

  begin() {
    this.end();
    this.time = 0;
    this.handled = 0;
    this.flags.clear();
    this.steps = STEPS.map((s) => ({ ...s }));
    this.progress('events', '0/3');
    this.progress('day30', `0/${SETTLE_DAYS}`);
    resetSettlement();
    gameSpeed.value = NORMAL_SPEED;
    // Three of the five possible emergencies, in a random order.
    this.plan = [...POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    this.publish();
    this.say('start');
    this.after(9, () => this.say('speed'));
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  /** Mission Control is silent while the link is down, and text-only on the backup antenna. */
  private say(key: keyof typeof LINES) {
    const l = LINES[key];
    const link = emergency.value.link;
    const fromEarth = !l.from;
    if (fromEarth && link === 'none' && key !== 'commsFix') return;
    pushComm(l.from ?? CAPCOM, l.text);
    if (!(fromEarth && link === 'backup')) void playVoice(l.vo);
  }

  private publish() {
    mission.value = { title: 'm9.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  /** Sets a step's progress text; true if it changed. */
  private progress(id: string, text: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.progress === text) return false;
    s.progress = text;
    return true;
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done) return;
    s.done = true;
    this.publish();
  }

  private once(name: string) {
    if (this.flags.has(name)) return false;
    this.flags.add(name);
    return true;
  }

  /** Day-by-day story beats. */
  private beats(day: number) {
    const st = settlement.value;
    if (day >= 4 && this.once('cargo')) {
      // The cargo lander brings kits, water, food and the spare blanket for tower 3.
      kits.value += 9;
      life.value = { ...life.value, waterL: Math.min(150, life.value.waterL + 60) };
      greenhouse.value = { ...greenhouse.value, foodDays: greenhouse.value.foodDays + 8 };
      setSpeed('normal');
      sfx('powerup');
      this.say('cargo');
    }
    if (day >= 5 && this.once('water')) {
      const r = rates();
      if (r.water < 0 && day + life.value.waterL / -r.water < SETTLE_DAYS) this.say('waterLow');
    }
    if (day >= SHADOW.start - 1.5 && this.once('shadowSoon')) {
      setSpeed('normal');
      this.say('shadowSoon');
    }
    if (day >= SHADOW.start && this.once('shadow')) this.say('shadow');
    if (day >= SHADOW.end && this.once('shadowEnd')) {
      this.complete('shadow');
      this.say('shadowEnd');
    }
    if (day >= SHADOW.start && day < SHADOW.end && power.value.batteryKWh < 15 && this.once('batteryLow')) {
      setSpeed('normal');
      this.say('batteryLow');
    }
    // Surprise emergencies (one at a time; a busy outpost waits for the next one).
    const free = !emergency.value.active;
    EVENT_DAYS.forEach((d, i) => {
      if (free && day >= d && !emergency.value.active && this.once('event' + i)) {
        // A backup radio link means an antenna fault is no emergency: pick another.
        let id = this.plan[i];
        if (id === 'comms' && has('comms')) id = POOL.find((x) => !this.plan.includes(x) && x !== 'comms') ?? 'leak';
        trigger(id);
      }
    });
    if (free && day >= STORM_DAY && !emergency.value.active && this.once('storm')) {
      rad.value = { ...rad.value, sheltered: false, storm: 0, lateDose: 0 };
      startWarning();
      if (has('shelter')) rad.value = { ...rad.value, countdown: rad.value.countdown + 30 };
      trigger('storm');
    }
    const moved = this.progress('day30', `${Math.floor(day)}/${SETTLE_DAYS}`);
    if (st.day >= SETTLE_DAYS && !st.finished && this.once('end')) {
      settlement.value = { ...settlement.value, finished: true };
      this.complete('day30');
      setSpeed('normal');
      this.say('day30');
      this.after(3, () => this.say('sci'));
      this.after(6, () => {
        panel.value = null;
        terminal.value = 'final';
      });
    }
    if (moved) this.publish();
  }

  /** Called by the final report's button. */
  finish() {
    terminal.value = null;
    unlock('closedloop');
    this.onFinished();
  }

  update(dt: number, p: MissionCtx) {
    this.time += dt;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
    const e = emergency.value;
    const r = rad.value;
    // Time runs at the chosen speed, except during emergencies (normal) and the storm wait.
    const sheltered = e.active === 'storm' && r.sheltered && r.weather === 'storm';
    gameSpeed.value = sheltered ? STORM_SPEED : e.active ? NORMAL_SPEED : SPEEDS[settlement.value.speed];
    const game = dt * gameSpeed.value;
    simulatePower(dt, game);
    simulateSettlement(game);
    simulateRadiation(dt, game);
    simulateCrew(dt);
    simulateEmergency(game);
    this.beats(settlement.value.day);

    // The long shadow: the Sun sinks low and the towers get only a little light.
    const day = settlement.value.day;
    const inShadow = THREE.MathUtils.smoothstep(day, SHADOW.start - 0.3, SHADOW.start) * (1 - THREE.MathUtils.smoothstep(day, SHADOW.end, SHADOW.end + 0.3));
    const targetK = inShadow * 0.164;
    if (Math.abs(targetK - this.sunK) > 1e-4) {
      this.sunK = targetK;
      const light = sunPath(targetK);
      setSunlight(Math.max(light, 1 - inShadow * (1 - SHADOW.sun)));
    }

    if (recovered(emergency.value) && this.time >= this.reportAt && terminal.value !== 'aar') {
      openReport();
      terminal.value = 'aar';
    }
    if (e.active === 'storm' && e.phase === 'diagnose' && r.weather === 'storm' && !r.sheltered && this.once('stormLate')) pushComm(CAPCOM, 'c.m9.stormLate');
    updateDetector(dt, p.playing ? p.eye.distanceTo(this.marks.leaks[e.leak]) : null);
    if (!this.steps[0].done && settlement.value.speed !== 'normal') this.complete('panel');
  }

  /** Repair targets for each emergency. */
  private target(id: EmId): string | null {
    const s = emergency.value;
    if (id === 'leak') return 'leak-' + s.leak;
    return ({ thermal: 'pump-a', recycler: 'ls-filter', comms: 'antenna-box', battery: 'battery-cab' } as Partial<Record<EmId, string>>)[id] ?? null;
  }

  canHold(id: string) {
    const s = emergency.value;
    if (id === 'vsat-2') return this.flags.has('cargo') && !this.steps[1].done;
    return s.phase === 'repair' && !!s.active && this.target(s.active) === id;
  }

  holdComplete(id: string) {
    if (id === 'vsat-2' && this.canHold(id)) {
      setArrayHealth(2, 1);
      sfx('powerup');
      this.complete('blanket');
      this.say('blanket');
      return;
    }
    if (this.canHold(id)) repair();
  }

  interact(id: string): string | null {
    const s = emergency.value;
    if (id === 'build-terminal') {
      terminal.value = 'build';
      return null;
    }
    if (id === 'vsat-2' && !this.steps[1].done) return this.flags.has('cargo') ? 'w.holdRepair' : 'w.noBlanket';
    if (id === 'airlock' && s.active === 'storm' && s.phase === 'diagnose') {
      stormSheltered();
      enterShelter();
      engineerInside();
      terminal.value = 'shelter';
      return null;
    }
    if (id === 'airlock' && s.active === 'storm' && s.phase === 'repair') {
      terminal.value = 'shelter';
      return null;
    }
    if (id.startsWith('leak-')) {
      if (s.active !== 'leak' || s.phase === 'alert') return 'w.fittingOk';
      if (s.phase === 'diagnose') return checkFitting(Number(id.slice(5))) ? null : 'w.noLeakHere';
      if (s.phase === 'repair') return 'w.holdRepair';
      return null;
    }
    const active = s.active && this.target(s.active) === id ? s.active : null;
    if (active) {
      if (s.phase === 'diagnose') {
        sfx('scan');
        terminal.value = 'diag';
        return null;
      }
      if (s.phase === 'repair') return 'w.holdRepair';
      return null;
    }
    if (id === 'pump-a') return 'w.pumpOk';
    return null;
  }

  label(id: string) {
    const s = emergency.value;
    if (id === 'vsat-2' && this.flags.has('cargo') && !this.steps[1].done) return 'p.blanketFit';
    if (id === 'airlock' && s.active === 'storm' && (s.phase === 'diagnose' || s.phase === 'repair')) return 'p.shelter';
    if (s.active && this.target(s.active) === id) {
      if (s.active === 'leak') return s.phase === 'repair' ? 'p.leakPatch' : null;
      if (s.phase === 'diagnose') return 'p.em.' + s.active + '.inspect';
      if (s.phase === 'repair') return 'p.em.' + s.active + '.repair';
    }
    return null;
  }

  guide(p: MissionCtx): GuideTarget | null {
    const s = emergency.value;
    if (s.active && (s.phase === 'diagnose' || s.phase === 'repair')) {
      if (s.active === 'storm') return s.phase === 'diagnose' ? { pos: this.marks.airlock, label: 'wp.shelter' } : null;
      if (s.active === 'leak') {
        if (s.phase === 'repair') return { pos: this.marks.leaks[s.leak], label: 'wp.leak' };
        const c = this.marks.leaks[1];
        return Math.hypot(p.feet.x - c.x, p.feet.z - c.z) > 12 ? { pos: c, label: 'wp.hab2Leak' } : null;
      }
      const pos = { thermal: this.marks.pump, recycler: this.marks.filter, comms: this.marks.antenna, battery: this.marks.battery }[s.active as 'thermal'];
      return pos ? { pos, label: 'wp.em.' + s.active } : null;
    }
    if (this.flags.has('cargo') && !this.steps[1].done) return { pos: this.marks.tower3.getWorldPosition(new THREE.Vector3()), label: 'wp.tower3' };
    if (!this.steps[2].done && kits.value >= 2 && this.flags.has('cargo')) return { pos: this.marks.build, label: 'wp.build' };
    return null;
  }
}
