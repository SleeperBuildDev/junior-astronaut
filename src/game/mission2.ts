import * as THREE from 'three';
import { beep, playVoice } from '../audio/audio';
import { statusMaterials } from '../world/base';
import { life, onLifeEvent, replaceFilter, resetLife, SAFE_O2, terminalOpen } from './lifesupport';
import { mission, pushComm, screen, unlock, type Step } from './state';

const CAPCOM = 'Mission Control';
export const MISSION2_TITLE = 'Mission 2: Life Support Activation';

const STEPS: Step[] = [
  { id: 'goto', text: 'Go to the life support unit (east of the habitat)', done: false },
  { id: 'inspect', text: 'Open the life support terminal (E)', done: false },
  { id: 'o2', text: 'Start the oxygen generator (terminal)', done: false, progress: '0/3' },
  { id: 'filter', text: 'Replace the clogged recycler filter (hold E)', done: false },
  { id: 'water', text: 'Start water recovery (terminal)', done: false },
  { id: 'air', text: 'Raise habitat oxygen to 20.9%', done: false },
];

const LINES: Record<string, { vo: string; text: string }> = {
  start: { vo: 'm2_01', text: 'Mission 2. The habitat air is thin and the water tank is low. Head to the life support unit on the east side of the habitat.' },
  goto: { vo: 'm2_02', text: 'Good. Open the life support terminal and check which systems are offline.' },
  inspect: { vo: 'm2_03', text: 'The oxygen generator is offline. Follow the start-up steps on the terminal to bring it online.' },
  o2: { vo: 'm2_04', text: 'Oxygen generator running. It splits water into oxygen and hydrogen. But it needs water, and the water recycler is blocked.' },
  filterHint: { vo: 'm2_05', text: 'The recycler filter is clogged with dust. Go to the filter housing and hold E to replace it.' },
  filter: { vo: 'm2_06', text: 'New filter installed. Now start water recovery from the terminal.' },
  water: { vo: 'm2_07', text: 'Water recovery online. Every drop gets cleaned and used again. Watch the habitat oxygen rise to a safe level.' },
  air: { vo: 'm2_08', text: 'Habitat air is safe to breathe and the water loop is closed. Mission 2 complete. Life support is go.' },
};

export const FILTER_HOLD_SECONDS = 2.5;

export class Mission2 {
  readonly number = 2;
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
        screen.value = 'complete';
      }, 7000);
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
      if (life.value.filterOk) return 'Filter already replaced';
      if (this.current?.id !== 'filter') return 'Check the terminal first';
      return 'Hold E to replace the filter';
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
    if (id === 'ls-filter') return life.value.filterOk ? 'New filter installed' : this.current?.id === 'filter' ? 'Hold E: replace clogged filter' : 'Recycler filter (clogged)';
    return null;
  }
}
