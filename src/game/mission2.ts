import * as THREE from 'three';
import { beep, playVoice } from '../audio/audio';
import { statusMaterials } from '../world/base';
import { life, onLifeEvent, replaceFilter, resetLife, SAFE_O2, terminalOpen } from './lifesupport';
import { mission, pushComm, screen, unlock, type Step } from './state';

const CAPCOM = 'mc';
export const MISSION2_TITLE = 'm2.title';

const STEPS: Step[] = [
  { id: 'goto', text: 'm2.goto', done: false },
  { id: 'inspect', text: 'm2.inspect', done: false },
  { id: 'o2', text: 'm2.o2', done: false, progress: '0/3' },
  { id: 'filter', text: 'm2.filter', done: false },
  { id: 'water', text: 'm2.water', done: false },
  { id: 'air', text: 'm2.air', done: false },
];

const LINES: Record<string, { vo: string; text: string }> = {
  start: { vo: 'm2_01', text: 'c.m2.start' },
  goto: { vo: 'm2_02', text: 'c.m2.goto' },
  inspect: { vo: 'm2_03', text: 'c.m2.inspect' },
  o2: { vo: 'm2_04', text: 'c.m2.o2' },
  filterHint: { vo: 'm2_05', text: 'c.m2.filterHint' },
  filter: { vo: 'm2_06', text: 'c.m2.filter' },
  water: { vo: 'm2_07', text: 'c.m2.water' },
  air: { vo: 'm2_08', text: 'c.m2.air' },
};

export const FILTER_HOLD_SECONDS = 2.5;

export class Mission2 {
  readonly number = 2;
  /** Called when the mission's last step is done (main.ts plays the ending). */
  onFinished: () => void = () => (screen.value = 'complete');
  private steps: Step[] = STEPS.map((s) => ({ ...s }));

  constructor(
    private unitPos: THREE.Vector3,
    private lights: { o2: THREE.Mesh; water: THREE.Mesh; co2: THREE.Mesh },
  ) {
    onLifeEvent((e) => {
      if (e === 'o2-online') this.complete('o2');
      if (e === 'water-online') this.complete('water');
      this.syncLights();
      this.publish();
    });
  }

  begin() {
    this.steps = STEPS.map((s) => ({ ...s }));
    resetLife();
    this.syncLights();
    this.publish();
    this.say('start');
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  /** The interactable that needs E held down right now, if any. */
  get holdId() {
    return this.current?.id === 'filter' ? 'ls-filter' : null;
  }

  private say(key: keyof typeof LINES) {
    pushComm(CAPCOM, LINES[key].text);
    void playVoice(LINES[key].vo);
  }

  private syncLights() {
    const l = life.value;
    const mat = (s: string) => (s === 'online' ? statusMaterials.green : s === 'starting' ? statusMaterials.amber : statusMaterials.red);
    this.lights.o2.material = mat(l.o2gen);
    this.lights.water.material = mat(l.water === 'offline' ? 'starting' : l.water);
    this.lights.co2.material = mat(l.co2);
  }

  private publish() {
    const o2 = this.steps.find((s) => s.id === 'o2')!;
    o2.progress = `${life.value.o2Step}/3`;
    mission.value = { title: MISSION2_TITLE, steps: this.steps.map((s) => ({ ...s })) };
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done || this.current?.id !== id) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'inspect') unlock('lifesupport');
    if (id === 'o2') unlock('electrolysis');
    if (id === 'water') unlock('water');
    if (id === 'air') unlock('air');
    this.say(id as keyof typeof LINES);
    if (id === 'o2') setTimeout(() => this.current?.id === 'filter' && this.say('filterHint'), 9000);
    if (id === 'air')
      setTimeout(() => {
        terminalOpen.value = false;
        this.onFinished();
      }, 5000);
  }

  update(_dt: number, p: { feet: THREE.Vector3 }) {
    const cur = this.current?.id;
    if (cur === 'goto' && Math.hypot(p.feet.x - this.unitPos.x, p.feet.z - this.unitPos.z) < 7) this.complete('goto');
    if (cur === 'air' && life.value.habO2 >= SAFE_O2 - 0.01) this.complete('air');
    // Keep the o2 step counter live while the player works through the terminal.
    const o2 = this.steps.find((s) => s.id === 'o2')!;
    if (o2.progress !== `${life.value.o2Step}/3`) this.publish();
  }

  /** Handles E on a mission object. Returns a reason if it can't be used yet. */
  interact(id: string): string | null {
    if (id === 'ls-terminal') {
      if (this.current?.id === 'goto') this.complete('goto');
      terminalOpen.value = true;
      if (this.current?.id === 'inspect') this.complete('inspect');
      return null;
    }
    if (id === 'ls-filter') {
      if (life.value.filterOk) return 'w.filterDone';
      if (this.current?.id !== 'filter') return 'w.terminalFirst';
      return 'w.holdFilter';
    }
    return null;
  }

  /** Called when E has been held on the filter long enough. */
  holdComplete(id: string) {
    if (id !== 'ls-filter' || this.current?.id !== 'filter') return;
    replaceFilter();
    this.complete('filter');
    this.syncLights();
  }

  label(id: string) {
    if (id === 'ls-filter') return life.value.filterOk ? 'p.filterNew' : this.current?.id === 'filter' ? 'p.filterHold' : 'p.filterClogged';
    return null;
  }
}
