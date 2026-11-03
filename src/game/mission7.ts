import * as THREE from 'three';
import { beep, playVoice } from '../audio/audio';
import type { Outpost } from '../world/base';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { simulatePower } from './power';
import { collect, deliver, onSciEvent, openNotes, samples, science, SITE_NAMES } from './science';
import { drive, gameSpeed, mission, NORMAL_SPEED, pushComm, screen, terminal, unlock, type Step } from './state';

// Mission 7: Scientific Exploration. Drive the rover to three science sites, study each
// one, collect samples, and bring them back to the lab for analysis.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'rover', text: 'm7.rover', done: false },
  { id: 'a', text: 'm7.a', done: false },
  { id: 'b', text: 'm7.b', done: false },
  { id: 'c', text: 'm7.c', done: false },
  { id: 'deliver', text: 'm7.deliver', done: false },
  { id: 'analyze', text: 'm7.analyze', done: false },
];

const LINES: Record<string, { vo: string; text: string; from?: string }> = {
  start: { vo: 'm7_01', text: 'c.m7.start' },
  rover: { vo: 'm7_02', text: 'c.m7.rover' },
  a: { vo: 'm7_03', text: 'c.m7.a' },
  b: { vo: 'm7_04', text: 'c.m7.b' },
  c: { vo: 'm7_05', text: 'c.m7.c' },
  allSamples: { vo: 'm7_06', text: 'c.m7.allSamples' },
  deliver: { vo: 'm7_07', text: 'c.m7.deliver' },
  sci: { vo: 'cr_sci_3', text: 'c.m7.sci', from: 'crew.name.sci' },
  analyze: { vo: 'm7_08', text: 'c.m7.analyze' },
};

const CARDS = ['highlands', 'breccia', 'psr'];

export class Mission7 implements GameMission {
  readonly number = 7;
  readonly holdSeconds = 2;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private timers: ReturnType<typeof setTimeout>[] = [];
  private marks: { rover: THREE.Object3D; sites: THREE.Vector3[]; port: THREE.Vector3 };

  constructor(outpost: Outpost) {
    this.marks = { rover: outpost.rover, sites: outpost.science.sites.map((s) => s.pos), port: outpost.science.labPortPos };
    onSciEvent((e, site) => {
      if (e === 'sampled') {
        unlock(CARDS[site]);
        this.complete(SITE_NAMES[site]);
        if (samples() === 3) this.timers.push(setTimeout(() => this.say('allSamples'), 7000));
      }
      if (e === 'analyzed') this.complete('analyze');
      this.publish();
    });
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

  canHold(id: string) {
    return id.startsWith('site-') && science.value.sites[Number(id.slice(5))] === 'noted';
  }

  private say(key: keyof typeof LINES) {
    const l = LINES[key];
    pushComm(l.from ?? CAPCOM, l.text);
    void playVoice(l.vo);
  }

  private publish() {
    mission.value = { title: 'm7.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  /** The three sites can be studied in any order. */
  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    const anyOrder = id === 'a' || id === 'b' || id === 'c';
    // Walking to the sites instead of driving is allowed: the rover step just gets ticked.
    if (id === 'deliver' || id === 'analyze') this.steps.find((x) => x.id === 'rover')!.done = true;
    if (!s || s.done || (!anyOrder && this.current?.id !== id)) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'rover') unlock('rover');
    if (id === 'analyze') {
      unlock('isru');
      this.timers.push(
        setTimeout(() => {
          terminal.value = null;
          this.onFinished();
        }, 16000),
      );
    }
    this.say(id as keyof typeof LINES);
    if (id === 'analyze') this.say('sci');
  }

  update(dt: number, _p: MissionCtx) {
    simulatePower(dt, dt * gameSpeed.value);
  }

  interact(id: string): string | null {
    const sc = science.value;
    if (id === 'rover') {
      this.complete('rover');
      return null;
    }
    if (id.startsWith('site-')) {
      const i = Number(id.slice(5));
      if (sc.sites[i] === 'sampled') return 'w.siteDone';
      if (sc.sites[i] === 'noted') return 'w.holdSample';
      openNotes(i);
      terminal.value = 'notes';
      return null;
    }
    if (id === 'lab-port') {
      if (sc.delivered) {
        terminal.value = 'lab';
        this.complete('deliver');
        if (sc.analyzed) this.complete('analyze');
        return null;
      }
      if (samples() < 3) return 'w.needSamples';
      deliver();
      terminal.value = 'lab';
      this.complete('deliver');
      return null;
    }
    return null;
  }

  holdComplete(id: string) {
    if (this.canHold(id)) collect(Number(id.slice(5)));
  }

  label(id: string) {
    if (id.startsWith('site-')) {
      const st = science.value.sites[Number(id.slice(5))];
      return st === 'sampled' ? 'p.siteDone' : st === 'noted' ? 'p.siteSample' : 'p.site';
    }
    return null;
  }

  guide(p: MissionCtx): GuideTarget | null {
    const sc = science.value;
    const cur = this.current?.id;
    if (cur === 'rover') return { pos: this.marks.rover.position.clone().add(new THREE.Vector3(0, 1.6, 0)), label: 'wp.rover' };
    if (cur === 'a' || cur === 'b' || cur === 'c') {
      let best: THREE.Vector3 | null = null;
      this.marks.sites.forEach((v, i) => {
        if (sc.sites[i] !== 'sampled' && (!best || v.distanceToSquared(p.feet) < best.distanceToSquared(p.feet))) best = v;
      });
      return best ? { pos: best, label: 'wp.site' } : null;
    }
    if (cur === 'deliver') return { pos: this.marks.port, label: drive.value.driving ? 'wp.labPortDrive' : 'wp.labPort' };
    return null;
  }
}

