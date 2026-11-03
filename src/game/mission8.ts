import * as THREE from 'three';
import { playVoice, sfx } from '../audio/audio';
import type { Outpost } from '../world/base';
import { checkFitting, detector, emergency, updateDetector, EM_ORDER, onEmEvent, openReport, recovered, repair, resetEmergency, simulateEmergency, trigger, type EmId } from './emergency';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { power, simulatePower } from './power';
import { gameSpeed, mission, missionNumber, NORMAL_SPEED, pushComm, screen, terminal, unlock, type Step } from './state';

// Mission 8: Emergency Response. Three emergencies arrive one after another: plume grit
// knocks out a solar tower, HAB-2 springs a leak, and HAB-1's cooling pump fails. For each,
// choose the first response, find the cause, repair it, and read the after-action report.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'r1', text: 'm8.r1', done: false },
  { id: 'd1', text: 'm8.d1', done: false },
  { id: 'f1', text: 'm8.f1', done: false },
  { id: 'r2', text: 'm8.r2', done: false },
  { id: 'd2', text: 'm8.d2', done: false },
  { id: 'f2', text: 'm8.f2', done: false },
  { id: 'r3', text: 'm8.r3', done: false },
  { id: 'd3', text: 'm8.d3', done: false },
  { id: 'f3', text: 'm8.f3', done: false },
];

const LINES: Record<string, { vo: string; text: string; from?: string }> = {
  start: { vo: 'm8_01', text: 'c.m8.start' },
  solarAlarm: { vo: 'm8_02', text: 'c.m8.solarAlarm' },
  solarResp: { vo: 'm8_03', text: 'c.m8.solarResp' },
  solarDiag: { vo: 'm8_04', text: 'c.m8.solarDiag' },
  solarFix: { vo: 'm8_05', text: 'c.m8.solarFix' },
  report: { vo: 'm8_06', text: 'c.m8.report' },
  leakAlarm: { vo: 'm8_07', text: 'c.m8.leakAlarm' },
  leakResp: { vo: 'm8_08', text: 'c.m8.leakResp' },
  cmdr: { vo: 'cr_cmdr_3', text: 'c.m8.cmdr', from: 'crew.name.cmdr' },
  leakFound: { vo: 'm8_09', text: 'c.m8.leakFound' },
  leakFix: { vo: 'm8_10', text: 'c.m8.leakFix' },
  thermalAlarm: { vo: 'm8_11', text: 'c.m8.thermalAlarm' },
  med: { vo: 'cr_med_4', text: 'c.m8.med', from: 'crew.name.med' },
  thermalResp: { vo: 'm8_12', text: 'c.m8.thermalResp' },
  thermalDiag: { vo: 'm8_13', text: 'c.m8.thermalDiag' },
  thermalFix: { vo: 'm8_14', text: 'c.m8.thermalFix' },
  allClear: { vo: 'm8_15', text: 'c.m8.allClear' },
};

const CARDS: Partial<Record<EmId, string>> = { solar: 'plume', leak: 'leaks', thermal: 'cooling' };
const STEP_NO: Partial<Record<EmId, number>> = { solar: 1, leak: 2, thermal: 3 };

export class Mission8 implements GameMission {
  readonly number = 8;
  readonly holdSeconds = 3;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  /** Timers that run on mission time, so pausing the game pauses them too. */
  private timers: { at: number; fn: () => void }[] = [];
  private time = 0;
  /** The report waits a few seconds after a repair, so Mission Control can finish talking. */
  private reportAt = 0;
  private marks: { tower: THREE.Object3D; leaks: THREE.Vector3[]; hab2: THREE.Vector3; pump: THREE.Vector3 };

  constructor(outpost: Outpost) {
    this.marks = { tower: outpost.arrays[1].box, leaks: outpost.emergency.leaks, hab2: outpost.hab2.center, pump: outpost.emergency.pumpPos };
    onEmEvent((e, id) => {
      if (missionNumber.value !== 8) return;
      const n = STEP_NO[id]!;
      if (e === 'alarm') {
        this.say((id + 'Alarm') as keyof typeof LINES);
        this.after(1.5, () => (terminal.value = 'alert'));
        if (id === 'thermal') this.after(14, () => emergency.value.active === 'thermal' && emergency.value.phase === 'alert' && this.say('med'));
      }
      if (e === 'responded') {
        this.complete('r' + n);
        this.say((id + 'Resp') as keyof typeof LINES);
        if (id === 'leak') this.after(9, () => this.say('cmdr'));
      }
      if (e === 'diagnosed' || e === 'found') {
        this.complete('d' + n);
        this.say(id === 'leak' ? 'leakFound' : ((id + 'Diag') as keyof typeof LINES));
        if (id === 'leak') detector.value = null;
      }
      if (e === 'repaired') {
        this.complete('f' + n);
        this.reportAt = this.time + 6;
        this.say((id + 'Fix') as keyof typeof LINES);
      }
      if (e === 'closed') {
        unlock(CARDS[id]!);
        const next = EM_ORDER[EM_ORDER.indexOf(id) + 1];
        if (next) {
          if (id === 'solar') this.say('report');
          this.after(next === 'leak' ? 16 : 20, () => trigger(next));
        } else {
          this.say('allClear');
          this.after(14, () => {
            terminal.value = null;
            this.onFinished();
          });
        }
      }
      this.publish();
    });
  }

  private after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  end() {
    this.timers = [];
    detector.value = null;
  }

  begin() {
    this.end();
    this.time = 0;
    this.steps = STEPS.map((s) => ({ ...s }));
    gameSpeed.value = NORMAL_SPEED;
    resetEmergency();
    // A long shadowed spell has left the battery part-charged.
    power.value = { ...power.value, batteryKWh: 62 };
    this.publish();
    this.say('start');
    this.after(18, () => trigger('solar'));
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  canHold(id: string) {
    const s = emergency.value;
    if (s.phase !== 'repair') return false;
    return (s.active === 'solar' && id === 'vsat-1') || (s.active === 'leak' && id === 'leak-' + s.leak) || (s.active === 'thermal' && id === 'pump-a');
  }

  private say(key: keyof typeof LINES) {
    const l = LINES[key];
    pushComm(l.from ?? CAPCOM, l.text);
    void playVoice(l.vo);
  }

  private publish() {
    mission.value = { title: 'm8.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done) return;
    s.done = true;
    this.publish();
  }

  update(dt: number, p: MissionCtx) {
    this.time += dt;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
    const game = dt * gameSpeed.value;
    simulatePower(dt, game);
    simulateEmergency(game);
    const s = emergency.value;
    if (recovered(s) && this.time >= this.reportAt && terminal.value !== 'aar') {
      openReport();
      terminal.value = 'aar';
    }
    updateDetector(dt, p.playing ? p.eye.distanceTo(this.marks.leaks[s.leak]) : null);
  }

  interact(id: string): string | null {
    const s = emergency.value;
    if (id === 'vsat-1' && s.active === 'solar') {
      if (s.phase === 'diagnose') {
        sfx('scan');
        terminal.value = 'diag';
        return null;
      }
      if (s.phase === 'repair') return 'w.holdRepair';
    }
    if (id === 'pump-a') {
      if (s.active !== 'thermal') return 'w.pumpOk';
      if (s.phase === 'alert') return null;
      if (s.phase === 'diagnose') {
        sfx('scan');
        terminal.value = 'diag';
        return null;
      }
      if (s.phase === 'repair') return 'w.holdRepair';
    }
    if (id.startsWith('leak-')) {
      if (s.active !== 'leak' || s.phase === 'alert') return 'w.fittingOk';
      if (s.phase === 'diagnose') return checkFitting(Number(id.slice(5))) ? null : 'w.noLeakHere';
      if (s.phase === 'repair') return 'w.holdRepair';
    }
    return null;
  }

  holdComplete(id: string) {
    if (this.canHold(id)) repair();
  }

  label(id: string) {
    const s = emergency.value;
    if (id === 'vsat-1' && s.active === 'solar') return s.phase === 'repair' ? 'p.towerRepair' : s.phase === 'diagnose' ? 'p.towerInspect' : null;
    if (id === 'pump-a') return s.active === 'thermal' && s.phase === 'repair' ? 'p.pumpRepair' : s.active === 'thermal' && s.phase === 'diagnose' ? 'p.pumpInspect' : null;
    if (id.startsWith('leak-')) return s.active === 'leak' && s.phase === 'repair' && id === 'leak-' + s.leak ? 'p.leakPatch' : null;
    return null;
  }

  guide(p: MissionCtx): GuideTarget | null {
    const s = emergency.value;
    if (s.phase !== 'diagnose' && s.phase !== 'repair') return null;
    if (s.active === 'solar') return { pos: this.marks.tower.getWorldPosition(new THREE.Vector3()), label: 'wp.tower2' };
    if (s.active === 'thermal') return { pos: this.marks.pump, label: 'wp.pump' };
    if (s.active === 'leak') {
      if (s.phase === 'repair') return { pos: this.marks.leaks[s.leak], label: 'wp.leak' };
      // Point at the module until you are close; then the detector does the finding.
      const c = this.marks.hab2.clone().setY(this.marks.hab2.y + 2.5);
      return Math.hypot(p.feet.x - c.x, p.feet.z - c.z) > 12 ? { pos: c, label: 'wp.hab2Leak' } : null;
    }
    return null;
  }
}
