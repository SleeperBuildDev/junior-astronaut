import * as THREE from 'three';
import { beep, playVoice, sfx } from '../audio/audio';
import type { Outpost } from '../world/base';
import { sunPath } from '../world/sky';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { arrayPanel, connectBus, onPowerEvent, power, resetPower, setSunlight, simulatePower } from './power';
import { gameSpeed, mission, NORMAL_SPEED, pushComm, screen, terminal, unlock, type Step } from './state';

// Mission 3: Power Up the Outpost. Deploy and aim three solar towers, connect them to
// the outpost, charge the batteries, then plan the power so it lasts through a dark spell.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'goto', text: 'm3.goto', done: false },
  { id: 'inspect', text: 'm3.inspect', done: false },
  { id: 'arrays', text: 'm3.arrays', done: false, progress: '0/3' },
  { id: 'connect', text: 'm3.connect', done: false },
  { id: 'charge', text: 'm3.charge', done: false },
  { id: 'plan', text: 'm3.plan', done: false },
  { id: 'night', text: 'm3.night', done: false },
];

const LINES: Record<string, { vo: string; text: string }> = {
  start: { vo: 'm3_01', text: 'c.m3.start' },
  goto: { vo: 'm3_02', text: 'c.m3.goto' },
  inspect: { vo: 'm3_03', text: 'c.m3.inspect' },
  firstArray: { vo: 'm3_04', text: 'c.m3.firstArray' },
  array: { vo: 'm3_10', text: 'c.m3.array' },
  arrays: { vo: 'm3_05', text: 'c.m3.arrays' },
  connect: { vo: 'm3_06', text: 'c.m3.connect' },
  charge: { vo: 'm3_07', text: 'c.m3.charge' },
  plan: { vo: 'm3_08', text: 'c.m3.plan' },
  night: { vo: 'm3_09', text: 'c.m3.night' },
};

/** Battery level the charge step asks for. */
export const CHARGE_TARGET = 60;
/** Speed-ups (game seconds per real second) for the two long waits. */
const CHARGE_SPEED = 400;
const NIGHT_SPEED = 1440;
/** Real seconds the whole dark spell takes (the Sun is fully down for about 60% of it). */
const NIGHT_SECONDS = 40;

export class Mission3 implements GameMission {
  readonly number = 3;
  readonly holdSeconds = 2;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private nightT = -1;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private marks: { pdu: THREE.Vector3; terminal: THREE.Vector3; bus: THREE.Vector3; battery: THREE.Vector3; boxes: THREE.Vector3[] };
  private pduPos: THREE.Vector3;

  constructor(outpost: Outpost) {
    const pw = outpost.power;
    this.pduPos = pw.pos;
    this.marks = {
      pdu: pw.pos.clone().add(new THREE.Vector3(0, 2.6, 0)),
      terminal: pw.terminalPos,
      bus: pw.busPos,
      battery: pw.batteryPos,
      boxes: outpost.arrays.map((a) => a.box.getWorldPosition(new THREE.Vector3())),
    };
    onPowerEvent((e) => {
      if (e === 'locked') this.onLocked();
      if (e === 'plan') this.complete('plan');
      this.publish();
    });
  }

  end() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.nightT = -1;
  }

  begin() {
    this.end();
    this.steps = STEPS.map((s) => ({ ...s }));
    this.nightT = -1;
    resetPower();
    sunPath(0);
    gameSpeed.value = NORMAL_SPEED;
    this.publish();
    this.say('start');
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  get holdId() {
    return this.current?.id === 'connect' ? 'pw-bus' : null;
  }

  private say(key: keyof typeof LINES) {
    pushComm(CAPCOM, LINES[key].text);
    void playVoice(LINES[key].vo);
  }

  private tracking() {
    return power.value.arrays.filter((a) => a.tracking).length;
  }

  private publish() {
    const arrays = this.steps.find((s) => s.id === 'arrays')!;
    arrays.progress = `${this.tracking()}/3`;
    mission.value = { title: 'm3.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  private onLocked() {
    const n = this.tracking();
    if (n === 1) {
      unlock('vsat');
      this.say('firstArray');
    } else if (n < 3) this.say('array');
    if (n === 3) this.complete('arrays');
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done || this.current?.id !== id) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'inspect') unlock('solar');
    if (id === 'connect') gameSpeed.value = CHARGE_SPEED;
    if (id === 'charge') {
      gameSpeed.value = NORMAL_SPEED;
      unlock('battery');
    }
    if (id === 'plan') {
      unlock('powerbudget');
      this.nightT = 0;
      gameSpeed.value = NIGHT_SPEED;
      this.timers.push(setTimeout(() => sfx('powerdown'), 5000));
    }
    if (id === 'night') {
      gameSpeed.value = NORMAL_SPEED;
      unlock('lunarnight');
      this.timers.push(
        setTimeout(() => {
          terminal.value = null;
          this.onFinished();
        }, 6000),
      );
    }
    this.say(id as keyof typeof LINES);
  }

  update(dt: number, p: MissionCtx) {
    const cur = this.current?.id;
    if (this.nightT >= 0) {
      this.nightT = Math.min(1, this.nightT + dt / NIGHT_SECONDS);
      setSunlight(sunPath(this.nightT));
      // Sunrise: the Sun is fully back above the horizon.
      if (cur === 'night' && this.nightT > 0.93) this.complete('night');
      if (this.nightT >= 1) gameSpeed.value = NORMAL_SPEED;
    }
    simulatePower(dt, dt * gameSpeed.value);
    if (cur === 'goto' && Math.hypot(p.feet.x - this.pduPos.x, p.feet.z - this.pduPos.z) < 7) this.complete('goto');
    if (cur === 'charge' && power.value.batteryKWh >= CHARGE_TARGET) this.complete('charge');
  }

  interact(id: string): string | null {
    const cur = this.current?.id;
    if (id === 'pw-terminal') {
      if (cur === 'goto') this.complete('goto');
      terminal.value = 'power';
      if (this.current?.id === 'inspect') this.complete('inspect');
      return null;
    }
    if (id.startsWith('vsat-')) {
      if (cur === 'goto' || cur === 'inspect') return 'w.pwTerminalFirst';
      arrayPanel.value = Number(id.split('-')[1]);
      terminal.value = 'array';
      return null;
    }
    if (id === 'pw-bus') {
      if (power.value.bus) return 'w.busDone';
      if (cur !== 'connect') return 'w.arraysFirst';
      return 'w.holdBus';
    }
    return null;
  }

  holdComplete(id: string) {
    if (id !== 'pw-bus' || this.current?.id !== 'connect') return;
    connectBus();
    sfx('breaker');
    this.complete('connect');
  }

  label(id: string) {
    if (id === 'pw-bus') return power.value.bus ? 'p.busOn' : this.current?.id === 'connect' ? 'p.busHold' : 'p.busOff';
    if (id.startsWith('vsat-')) {
      const a = power.value.arrays[Number(id.split('-')[1])];
      return a.tracking ? 'p.vsatTracking' : 'p.vsat';
    }
    return null;
  }

  guide(p: MissionCtx): GuideTarget | null {
    switch (this.current?.id) {
      case 'goto':
        return { pos: this.marks.pdu, label: 'wp.power' };
      case 'inspect':
      case 'plan':
        return { pos: this.marks.terminal, label: 'wp.pwTerminal' };
      case 'arrays': {
        let best: THREE.Vector3 | null = null;
        power.value.arrays.forEach((a, i) => {
          const b = this.marks.boxes[i];
          if (!a.tracking && (!best || b.distanceToSquared(p.feet) < best.distanceToSquared(p.feet))) best = b;
        });
        return best ? { pos: best, label: 'wp.vsat' } : null;
      }
      case 'connect':
        return { pos: this.marks.bus, label: 'wp.bus' };
      case 'charge':
        return { pos: this.marks.battery, label: 'wp.battery' };
      default:
        return null;
    }
  }
}
