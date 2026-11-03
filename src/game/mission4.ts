import * as THREE from 'three';
import { effect } from '@preact/signals';
import { beep, playVoice } from '../audio/audio';
import type { Outpost } from '../world/base';
import { onBuild } from './construction';
import { crewMovesIn } from './crew';
import { habitat, moveCrewIn, onHabEvent, simulateHabitat, startBuild, startInflate } from './habitat';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { simulatePower } from './power';
import { gameSpeed, mission, NORMAL_SPEED, panel, pushComm, screen, terminal, unlock, type Step } from './state';

// Mission 4: Build a Lunar Habitat. Use the construction planner to build an inflatable
// module, inflate it, pressurise and heat it, fit it out, and move the crew of four in.

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'goto', text: 'm4.goto', done: false },
  { id: 'build', text: 'm4.build', done: false },
  { id: 'inflate', text: 'm4.inflate', done: false },
  { id: 'pressurize', text: 'm4.pressurize', done: false },
  { id: 'heat', text: 'm4.heat', done: false },
  { id: 'outfit', text: 'm4.outfit', done: false, progress: '0/3' },
  { id: 'crew', text: 'm4.crew', done: false },
];

const LINES: Record<string, { vo: string; text: string; from?: string }> = {
  start: { vo: 'm4_01', text: 'c.m4.start' },
  goto: { vo: 'm4_02', text: 'c.m4.goto' },
  build: { vo: 'm4_03', text: 'c.m4.build' },
  inflate: { vo: 'm4_04', text: 'c.m4.inflate' },
  pressurize: { vo: 'm4_05', text: 'c.m4.pressurize' },
  heat: { vo: 'm4_06', text: 'c.m4.heat' },
  outfit: { vo: 'm4_07', text: 'c.m4.outfit' },
  cmdr: { vo: 'cr_cmdr_1', text: 'c.m4.cmdr', from: 'crew.name.cmdr' },
  sci: { vo: 'cr_sci_1', text: 'c.m4.sci', from: 'crew.name.sci' },
  med: { vo: 'cr_med_1', text: 'c.m4.med', from: 'crew.name.med' },
  crewCheck: { vo: 'm4_08', text: 'c.m4.crewCheck' },
  crew: { vo: 'm4_09', text: 'c.m4.crew' },
};

const BUILD_SPEED = 400;

export class Mission4 implements GameMission {
  readonly number = 4;
  readonly holdSeconds = 2;
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private timers: ReturnType<typeof setTimeout>[] = [];
  private crewReady = false;
  private marks: { build: THREE.Vector3; valve: THREE.Vector3; terminal: THREE.Vector3 };

  constructor(outpost: Outpost) {
    const h = outpost.hab2;
    this.marks = { build: h.buildTerminalPos, valve: h.valvePos, terminal: h.terminalPos };
    onBuild((id) => {
      if (id !== 'hab' || this.current?.id !== 'build') return;
      startBuild();
      gameSpeed.value = BUILD_SPEED;
    });
    onHabEvent((e) => {
      if (e === 'built') this.complete('build');
      if (e === 'inflated') this.complete('inflate');
      if (e === 'pressurized') this.complete('pressurize');
      if (e === 'heated') this.complete('heat');
      if (e === 'outfit') this.complete('outfit');
      this.publish();
    });
    // Opening the crew panel (C) once everyone has moved in finishes the mission.
    effect(() => {
      if (panel.value === 'crew' && this.crewReady && this.current?.id === 'crew') this.complete('crew');
    });
  }

  begin() {
    this.clearTimers();
    this.steps = STEPS.map((s) => ({ ...s }));
    this.crewReady = false;
    gameSpeed.value = NORMAL_SPEED;
    this.publish();
    this.say('start');
  }

  end() {
    this.clearTimers();
    this.crewReady = false;
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  get holdId() {
    return this.current?.id === 'inflate' && !habitat.value.inflating ? 'hab2-valve' : null;
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private say(key: keyof typeof LINES) {
    const l = LINES[key];
    pushComm(l.from ?? CAPCOM, l.text);
    void playVoice(l.vo);
  }

  private publish() {
    const h = habitat.value;
    const outfit = this.steps.find((s) => s.id === 'outfit')!;
    outfit.progress = `${[h.lines, h.water, h.beds].filter(Boolean).length}/3`;
    mission.value = { title: 'm4.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done || this.current?.id !== id) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'build') {
      gameSpeed.value = NORMAL_SPEED;
      unlock('inflatable');
    }
    if (id === 'pressurize') unlock('habitat');
    if (id === 'heat') unlock('thermal');
    if (id === 'outfit') {
      unlock('sleep');
      // The crew moves in and reports by radio, one after another.
      this.later(5000, () => {
        moveCrewIn();
        crewMovesIn();
        this.say('cmdr');
        this.say('sci');
        this.say('med');
      });
      this.later(9000, () => {
        this.crewReady = true;
        this.say('crewCheck');
        // The crew panel may already be open.
        if (panel.value === 'crew') this.complete('crew');
      });
    }
    if (id === 'crew') {
      unlock('crew');
      this.later(6000, () => {
        terminal.value = null;
        panel.value = null;
        this.onFinished();
      });
    }
    this.say(id as keyof typeof LINES);
  }

  update(dt: number, p: MissionCtx) {
    simulateHabitat(dt);
    simulatePower(dt, dt * gameSpeed.value);
    if (this.current?.id === 'goto' && Math.hypot(p.feet.x - this.marks.build.x, p.feet.z - this.marks.build.z) < 6) this.complete('goto');
    // Keep the outfit counter live while the player works through the terminal.
    const h = habitat.value;
    const want = `${[h.lines, h.water, h.beds].filter(Boolean).length}/3`;
    if (this.steps.find((s) => s.id === 'outfit')!.progress !== want) this.publish();
  }

  interact(id: string): string | null {
    const h = habitat.value;
    if (id === 'build-terminal') {
      if (this.current?.id === 'goto') this.complete('goto');
      terminal.value = 'build';
      return null;
    }
    if (id === 'hab2-terminal') {
      if (!h.built || h.tunnel < 1) return 'w.buildFirst';
      if (h.inflate < 1) return 'w.inflateFirst';
      terminal.value = 'hab';
      return null;
    }
    if (id === 'hab2-valve') {
      if (h.inflate >= 1) return 'w.inflated';
      if (h.inflating) return 'w.inflating';
      if (!h.built || h.tunnel < 1) return 'w.buildFirst';
      return 'w.holdValve';
    }
    return null;
  }

  holdComplete(id: string) {
    if (id !== 'hab2-valve' || this.current?.id !== 'inflate') return;
    startInflate();
  }

  label(id: string) {
    const h = habitat.value;
    if (id === 'hab2-valve') return h.inflate >= 1 ? 'p.valveDone' : h.inflating ? 'p.valveInflating' : this.current?.id === 'inflate' ? 'p.valveHold' : 'p.valve';
    return null;
  }

  guide(): GuideTarget | null {
    switch (this.current?.id) {
      case 'goto':
      case 'build':
        return { pos: this.marks.build, label: 'wp.buildTerminal' };
      case 'inflate':
        return habitat.value.inflating ? null : { pos: this.marks.valve, label: 'wp.valve' };
      case 'pressurize':
      case 'heat':
      case 'outfit':
        return { pos: this.marks.terminal, label: 'wp.habTerminal' };
      default:
        return null;
    }
  }
}
