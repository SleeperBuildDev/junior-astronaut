import * as THREE from 'three';
import { beep, playVoice, sfx } from '../audio/audio';
import type { Outpost } from '../world/base';
import { onBuild } from './construction';
import { greenhouse, harvest, microGrowth, MICRO_DAYS, onGhEvent, simulateGreenhouse, startAssembly } from './greenhouse';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { simulatePower } from './power';
import { gameSpeed, mission, NORMAL_SPEED, pushComm, screen, terminal, unlock, type Step } from './state';

// Mission 5: Establish Food Production. Build the greenhouse, set up hydroponics,
// choose crops, keep the nutrient solution healthy through a time-lapse, harvest.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'build', text: 'm5.build', done: false },
  { id: 'goto', text: 'm5.goto', done: false },
  { id: 'setup', text: 'm5.setup', done: false, progress: '0/2' },
  { id: 'plant', text: 'm5.plant', done: false },
  { id: 'grow', text: 'm5.grow', done: false, progress: '0/8' },
  { id: 'harvest', text: 'm5.harvest', done: false },
];

const LINES: Record<string, { vo: string; text: string; from?: string }> = {
  start: { vo: 'm5_01', text: 'c.m5.start' },
  build: { vo: 'm5_02', text: 'c.m5.build' },
  goto: { vo: 'm5_03', text: 'c.m5.goto' },
  setup: { vo: 'm5_04', text: 'c.m5.setup' },
  plant: { vo: 'm5_05', text: 'c.m5.plant' },
  alarm: { vo: 'm5_06', text: 'c.m5.alarm' },
  fixed: { vo: 'm5_07', text: 'c.m5.fixed' },
  grow: { vo: 'm5_08', text: 'c.m5.grow' },
  sci: { vo: 'cr_sci_2', text: 'c.m5.sci', from: 'crew.name.sci' },
  med: { vo: 'cr_med_2', text: 'c.m5.med', from: 'crew.name.med' },
  harvest: { vo: 'm5_09', text: 'c.m5.harvest' },
};

/** Game seconds per real second while the plants grow (8 days in about half a minute). */
const GROW_SPEED = 24000;
const BUILD_SPEED = 400;

export class Mission5 implements GameMission {
  readonly number = 5;
  readonly holdSeconds = 2;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private timers: ReturnType<typeof setTimeout>[] = [];
  private marks: { build: THREE.Vector3; terminal: THREE.Vector3; hatch: THREE.Vector3; center: THREE.Vector3 };

  constructor(outpost: Outpost) {
    const g = outpost.greenhouse;
    this.marks = { build: outpost.hab2.buildTerminalPos, terminal: g.terminalPos, hatch: g.hatchPos, center: g.center };
    onBuild((id) => {
      if (id !== 'greenhouse' || this.current?.id !== 'build') return;
      startAssembly();
      gameSpeed.value = BUILD_SPEED;
      this.complete('build');
    });
    onGhEvent((e) => {
      if (e === 'assembled') gameSpeed.value = NORMAL_SPEED;
      if (e === 'setup') this.complete('setup');
      if (e === 'planted') this.complete('plant');
      if (e === 'alarm') {
        gameSpeed.value = NORMAL_SPEED;
        sfx('alarm');
        this.say('alarm');
      }
      if (e === 'fixed') {
        unlock('ph');
        this.say('fixed');
        gameSpeed.value = GROW_SPEED;
      }
      if (e === 'grown') this.complete('grow');
      if (e === 'harvested') this.complete('harvest');
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

  get holdId() {
    return this.current?.id === 'harvest' ? 'gh-hatch' : null;
  }

  private say(key: keyof typeof LINES) {
    const l = LINES[key];
    pushComm(l.from ?? CAPCOM, l.text);
    void playVoice(l.vo);
  }

  private progress() {
    const g = greenhouse.value;
    return {
      setup: `${[g.tank, g.light > 0].filter(Boolean).length}/2`,
      grow: `${Math.min(MICRO_DAYS, Math.floor(g.day))}/${MICRO_DAYS}`,
    };
  }

  private publish() {
    const pr = this.progress();
    this.steps.find((s) => s.id === 'setup')!.progress = pr.setup;
    this.steps.find((s) => s.id === 'grow')!.progress = pr.grow;
    mission.value = { title: 'm5.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done || this.current?.id !== id) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'setup') unlock('cea');
    if (id === 'plant') {
      unlock('light');
      gameSpeed.value = GROW_SPEED;
    }
    if (id === 'grow') {
      gameSpeed.value = NORMAL_SPEED;
      unlock('veggie');
    }
    if (id === 'harvest') {
      unlock('foodsystem');
      this.timers.push(
        setTimeout(() => {
          terminal.value = null;
          this.onFinished();
        }, 20000),
      );
    }
    this.say(id as keyof typeof LINES);
    if (id === 'harvest') {
      this.say('sci');
      this.say('med');
    }
  }

  update(dt: number, p: MissionCtx) {
    simulateGreenhouse(dt, dt * gameSpeed.value);
    simulatePower(dt, dt * gameSpeed.value);
    const g = greenhouse.value;
    if (this.current?.id === 'goto' && g.assemble >= 1 && Math.hypot(p.feet.x - this.marks.center.x, p.feet.z - this.marks.center.z) < 10) this.complete('goto');
    const pr = this.progress();
    const st = (id: string) => this.steps.find((s) => s.id === id)!.progress;
    if (st('setup') !== pr.setup || st('grow') !== pr.grow) this.publish();
  }

  interact(id: string): string | null {
    const g = greenhouse.value;
    if (id === 'build-terminal') {
      terminal.value = 'build';
      return null;
    }
    if (id === 'gh-terminal') {
      if (g.assemble < 1) return 'w.ghNotReady';
      if (this.current?.id === 'goto') this.complete('goto');
      terminal.value = 'gh';
      return null;
    }
    if (id === 'gh-hatch') {
      if (g.assemble < 1) return 'w.ghNotReady';
      if (g.harvested) return 'w.harvested';
      if (microGrowth() < 1) return 'w.notRipe';
      return 'w.holdHarvest';
    }
    return null;
  }

  holdComplete(id: string) {
    if (id === 'gh-hatch' && this.current?.id === 'harvest') harvest();
  }

  label(id: string) {
    const g = greenhouse.value;
    if (id === 'gh-hatch') return g.harvested ? 'p.ghHarvested' : this.current?.id === 'harvest' ? 'p.ghHarvest' : 'p.ghHatch';
    return null;
  }

  guide(): GuideTarget | null {
    switch (this.current?.id) {
      case 'build':
        return { pos: this.marks.build, label: 'wp.buildTerminal' };
      case 'goto':
      case 'setup':
      case 'plant':
        return { pos: this.marks.terminal, label: 'wp.ghTerminal' };
      case 'grow':
        return greenhouse.value.phAlarm ? { pos: this.marks.terminal, label: 'wp.ghTerminal' } : null;
      case 'harvest':
        return { pos: this.marks.hatch, label: 'wp.ghHatch' };
      default:
        return null;
    }
  }
}
