import * as THREE from 'three';
import { beep, playVoice, sfx } from '../audio/audio';
import type { Outpost } from '../world/base';
import { allSent, crew, engineerInside, onAllSent, simulateCrew } from './crew';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { simulatePower } from './power';
import { BERMS, enterShelter, markMonitorRead, onRadEvent, rad, scan, simulateRadiation, startPiling, startWarning, STORM_OUTSIDE_MSV_H, type BermId, type SurveyId } from './radiation';
import { gameSpeed, mission, missionNumber, NORMAL_SPEED, pushComm, screen, suit, terminal, unlock, type Step } from './state';

// Mission 6: Radiation Protection. Read the radiation monitor, survey the module walls,
// bury the sleeping module under regolith, then get everyone into the storm shelter
// before a solar particle event arrives.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'monitor', text: 'm6.monitor', done: false },
  { id: 'survey', text: 'm6.survey', done: false, progress: '0/3' },
  { id: 'berm', text: 'm6.berm', done: false, progress: '0/3' },
  { id: 'crew', text: 'm6.crew', done: false, progress: '0/3' },
  { id: 'shelter', text: 'm6.shelter', done: false },
  { id: 'storm', text: 'm6.storm', done: false },
];

const LINES: Record<string, { vo: string; text: string; from?: string }> = {
  start: { vo: 'm6_01', text: 'c.m6.start' },
  monitor: { vo: 'm6_02', text: 'c.m6.monitor' },
  survey: { vo: 'm6_03', text: 'c.m6.survey' },
  berm: { vo: 'm6_04', text: 'c.m6.berm' },
  alert: { vo: 'm6_05', text: 'c.m6.alert' },
  crew: { vo: 'm6_06', text: 'c.m6.crew' },
  arrived: { vo: 'm6_07', text: 'c.m6.arrived' },
  shelter: { vo: 'm6_08', text: 'c.m6.shelter' },
  storm: { vo: 'm6_09', text: 'c.m6.storm' },
  cmdr: { vo: 'cr_cmdr_2', text: 'c.m6.cmdr', from: 'crew.name.cmdr' },
  med: { vo: 'cr_med_3', text: 'c.m6.med', from: 'crew.name.med' },
};

/** 30 storm hours in about 16 real seconds. */
const STORM_SPEED = 6750;

export class Mission6 implements GameMission {
  readonly number = 6;
  readonly holdSeconds = 2;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private timers: ReturnType<typeof setTimeout>[] = [];
  private geiger = 0;
  private marks: { monitor: THREE.Vector3; survey: Record<SurveyId, THREE.Vector3>; berms: Record<BermId, THREE.Vector3>; airlock: THREE.Vector3 };

  constructor(outpost: Outpost) {
    const r = outpost.radiation;
    this.marks = {
      monitor: r.monitorPos,
      survey: { hab1: r.survey.hab1.pos, hab2: r.survey.hab2.pos, gh: r.survey.gh.pos },
      berms: { west: r.berms.west.pos, east: r.berms.east.pos, south: r.berms.south.pos },
      airlock: outpost.airlockPos.clone().add(new THREE.Vector3(0.3, 2, 0)),
    };
    onRadEvent((e) => {
      if (missionNumber.value !== 6) return;
      if (e === 'scanned' && rad.value.scans.length === 3) this.complete('survey');
      if (e === 'bermsDone') this.complete('berm');
      if (e === 'arrived' && !rad.value.sheltered) {
        sfx('alarm');
        this.say('arrived');
      }
      if (e === 'stormOver') this.complete('storm');
      this.publish();
    });
    onAllSent(() => missionNumber.value === 6 && this.complete('crew'));
  }

  end() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  begin() {
    this.end();
    this.steps = STEPS.map((s) => ({ ...s }));
    gameSpeed.value = NORMAL_SPEED;
    this.publish();
    this.say('start');
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  /** Any unbuilt berm marker can be held while the mover is free. */
  canHold(id: string) {
    const r = rad.value;
    return this.current?.id === 'berm' && id.startsWith('berm-') && !r.piling && r.berms[id.slice(5) as BermId] === 0;
  }

  private say(key: keyof typeof LINES) {
    const l = LINES[key];
    pushComm(l.from ?? CAPCOM, l.text);
    void playVoice(l.vo);
  }

  private counts() {
    const r = rad.value;
    const c = crew.value;
    return {
      survey: `${r.scans.length}/3`,
      berm: `${BERMS.filter((b) => r.berms[b] >= 1).length}/3`,
      crew: `${(['cmdr', 'sci', 'med'] as const).filter((id) => c[id].where === 'shelter' || c[id].where === 'moving').length}/3`,
    };
  }

  private publish() {
    const n = this.counts();
    for (const id of ['survey', 'berm', 'crew'] as const) this.steps.find((s) => s.id === id)!.progress = n[id];
    mission.value = { title: 'm6.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done || this.current?.id !== id) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'monitor') unlock('magnetosphere');
    if (id === 'survey') unlock('dose');
    if (id === 'berm') {
      unlock('shielding');
      // A few seconds later, Earth spots a flare.
      this.timers.push(
        setTimeout(() => {
          startWarning();
          unlock('spe');
          this.say('alert');
        }, 7000),
      );
    }
    if (id === 'shelter') {
      unlock('stormshelter');
      gameSpeed.value = STORM_SPEED;
    }
    if (id === 'storm') {
      gameSpeed.value = NORMAL_SPEED;
      this.timers.push(
        setTimeout(() => {
          terminal.value = null;
          this.onFinished();
        }, 22000),
      );
    }
    this.say(id as keyof typeof LINES);
    if (id === 'storm') {
      this.say('cmdr');
      this.say('med');
    }
  }

  update(dt: number, p: MissionCtx) {
    simulateRadiation(dt, dt * gameSpeed.value);
    simulateCrew(dt);
    simulatePower(dt, dt * gameSpeed.value);
    const r = rad.value;
    // Caught outside when the protons arrive: the dose climbs fast and the counter crackles.
    if (r.weather === 'storm' && !r.sheltered) {
      suit.value = { ...suit.value, dose: suit.value.dose + (STORM_OUTSIDE_MSV_H * dt * 30) / 3600 };
      this.geiger -= dt;
      if (this.geiger <= 0) {
        sfx('geiger');
        this.geiger = 0.15 + Math.random() * 0.35;
      }
    }
    void p;
    const n = this.counts();
    if (this.steps.some((s) => s.progress !== undefined && n[s.id as keyof typeof n] !== undefined && s.progress !== n[s.id as keyof typeof n])) this.publish();
  }

  interact(id: string): string | null {
    const cur = this.current?.id;
    const r = rad.value;
    if (id === 'rad-monitor') {
      markMonitorRead();
      terminal.value = 'rad';
      if (cur === 'monitor') this.complete('monitor');
      return null;
    }
    if (id.startsWith('survey-')) {
      if (cur === 'monitor') return 'w.monitorFirst';
      const sid = id.slice(7) as SurveyId;
      if (!scan(sid)) return 'w.surveyed';
      pushComm('scanner', 'c.m6.scan.' + sid);
      return null;
    }
    if (id.startsWith('berm-')) {
      const b = id.slice(5) as BermId;
      if (r.berms[b] >= 1) return 'w.bermDone';
      if (cur === 'monitor' || cur === 'survey') return 'w.surveyFirst';
      if (r.piling) return 'w.moverBusy';
      return 'w.holdBerm';
    }
    if (id === 'airlock') {
      if (cur !== 'shelter') return cur === 'crew' ? 'w.crewFirst' : 'w.notNow';
      if (!allSent()) return 'w.crewFirst';
      enterShelter();
      engineerInside();
      terminal.value = 'shelter';
      this.complete('shelter');
      return null;
    }
    return null;
  }

  holdComplete(id: string) {
    if (id.startsWith('berm-') && this.canHold(id)) startPiling(id.slice(5) as BermId);
  }

  label(id: string) {
    const r = rad.value;
    if (id.startsWith('survey-')) return r.scans.includes(id.slice(7) as SurveyId) ? 'p.surveyed' : 'p.survey';
    if (id.startsWith('berm-')) {
      const b = id.slice(5) as BermId;
      return r.berms[b] >= 1 ? 'p.bermDone' : r.piling === b ? 'p.bermPiling' : this.current?.id === 'berm' ? 'p.bermHold' : 'p.berm';
    }
    if (id === 'airlock' && this.current?.id === 'shelter') return 'p.shelter';
    return null;
  }

  guide(p: MissionCtx): GuideTarget | null {
    const r = rad.value;
    const nearest = (list: [string, THREE.Vector3][]) => {
      let best: THREE.Vector3 | null = null;
      for (const [, v] of list) if (!best || v.distanceToSquared(p.feet) < best.distanceToSquared(p.feet)) best = v;
      return best;
    };
    switch (this.current?.id) {
      case 'monitor':
        return { pos: this.marks.monitor, label: 'wp.radMonitor' };
      case 'survey': {
        const left = (Object.entries(this.marks.survey) as [SurveyId, THREE.Vector3][]).filter(([k]) => !r.scans.includes(k));
        const b = nearest(left);
        return b ? { pos: b, label: 'wp.survey' } : null;
      }
      case 'berm': {
        if (r.piling) return null;
        const left = (Object.entries(this.marks.berms) as [BermId, THREE.Vector3][]).filter(([k]) => r.berms[k] === 0);
        const b = nearest(left);
        return b ? { pos: b, label: 'wp.berm' } : null;
      }
      case 'shelter':
        return { pos: this.marks.airlock, label: 'wp.shelter' };
      default:
        return null;
    }
  }
}

