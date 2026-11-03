import * as THREE from 'three';
import { beep, playVoice, sfx } from '../audio/audio';
import { statusMaterials, type Outpost } from '../world/base';
import { heightAt, LAYOUT } from '../world/heightfield';
import { EARTH_DIR } from '../world/sky';
import type { GameMission, GuideTarget, MissionCtx } from './mission';
import { mission, pushComm, screen, unlock, type Step } from './state';

const CAPCOM = 'mc';

const STEPS: Step[] = [
  { id: 'walk', text: 'm1.walk', done: false },
  { id: 'jump', text: 'm1.jump', done: false },
  { id: 'earth', text: 'm1.earth', done: false },
  { id: 'reach', text: 'm1.reach', done: false },
  { id: 'scan', text: 'm1.scan', done: false, progress: '0/3' },
  { id: 'airlock', text: 'm1.airlock', done: false },
];

const LINES: Record<string, { vo: string; text: string }> = {
  start: { vo: 'm1_01', text: 'c.m1.start' },
  walk: { vo: 'm1_02', text: 'c.m1.walk' },
  jump: { vo: 'm1_03', text: 'c.m1.jump' },
  earth: { vo: 'm1_04', text: 'c.m1.earth' },
  reach: { vo: 'm1_05', text: 'c.m1.reach' },
  sensor: { vo: 'm1_06', text: 'c.m1.sensor' },
  scan: { vo: 'm1_07', text: 'c.m1.scan' },
  airlock: { vo: 'm1_08', text: 'c.m1.airlock' },
};

const SENSOR_CARDS = ['temperature', 'radiation', 'regolith'];

export class Mission1 implements GameMission {
  readonly number = 1;
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private scanned = new Set<number>();
  private earthLook = 0;
  /** Called when the mission's last step is done (main.ts plays the ending). */
  onFinished: () => void = () => (screen.value = 'complete');

  private habitat: THREE.Vector3;
  private sensorLights: THREE.Mesh[];
  private marks: { habitat: THREE.Vector3; airlock: THREE.Vector3; sensors: THREE.Vector3[] };

  constructor(outpost: Outpost) {
    this.habitat = outpost.habitatPos;
    this.sensorLights = outpost.sensorLights;
    this.marks = {
      habitat: new THREE.Vector3(LAYOUT.base.x + 2.5, outpost.habitatPos.y + 9.2, LAYOUT.base.z),
      airlock: outpost.airlockPos.clone().add(new THREE.Vector3(0.3, 2, 0)),
      sensors: LAYOUT.sensors.map((sp) => new THREE.Vector3(sp.x, heightAt(sp.x, sp.z) + 1.3, sp.z)),
    };
  }

  begin() {
    this.steps = STEPS.map((s) => ({ ...s }));
    this.scanned.clear();
    this.sensorLights.forEach((l) => (l.material = statusMaterials.amber));
    this.publish();
    this.say('start');
  }

  get current() {
    return this.steps.find((s) => !s.done);
  }

  private say(key: keyof typeof LINES) {
    pushComm(CAPCOM, LINES[key].text);
    void playVoice(LINES[key].vo);
  }

  private publish() {
    mission.value = { title: 'm1.title', steps: this.steps.map((s) => ({ ...s })) };
  }

  private complete(id: string) {
    const s = this.steps.find((x) => x.id === id);
    if (!s || s.done || this.current?.id !== id) return;
    s.done = true;
    beep('ok');
    this.publish();
    if (id === 'walk') unlock('gravity');
    if (id === 'jump') unlock('vacuum');
    if (id === 'earth') unlock('earth');
    if (id === 'reach') unlock('southpole');
    this.say(id as keyof typeof LINES);
    if (id === 'airlock') setTimeout(() => this.onFinished(), 2500);
  }

  update(dt: number, p: MissionCtx) {
    if (!p.playing) return;
    const cur = this.current?.id;
    if (cur === 'walk' && p.distance > 15) this.complete('walk');
    else if (cur === 'jump' && p.jumps > 0) this.complete('jump');
    else if (cur === 'earth') {
      this.earthLook = p.look.dot(EARTH_DIR) > 0.985 ? this.earthLook + dt : 0;
      if (this.earthLook > 0.6) this.complete('earth');
    } else if (cur === 'reach' && Math.hypot(p.feet.x - this.habitat.x, p.feet.z - this.habitat.z) < 20) this.complete('reach');
    // Sensors scanned early still count once the scan step comes up.
    else if (cur === 'scan' && this.scanned.size === 3) this.complete('scan');
  }

  /** Handles E on a mission object. Returns a short reason if it can't be used yet. */
  interact(id: string): string | null {
    if (id.startsWith('sensor-')) {
      const i = Number(id.split('-')[1]);
      if (this.scanned.has(i)) return 'w.alreadyScanned';
      this.scanned.add(i);
      sfx('scan');
      this.sensorLights[i].material = statusMaterials.green;
      unlock(SENSOR_CARDS[i]);
      const scan = this.steps.find((s) => s.id === 'scan')!;
      scan.progress = `${this.scanned.size}/3`;
      this.publish();
      if (this.scanned.size === 3 && this.current?.id === 'scan') this.complete('scan');
      else {
        beep('ok');
        if (this.current?.id === 'scan') this.say('sensor');
      }
      return null;
    }
    if (id === 'airlock') {
      if (this.current?.id !== 'airlock') return 'w.scanFirst';
      sfx('airlock');
      this.complete('airlock');
      return null;
    }
    return null;
  }

  label(id: string) {
    if (id.startsWith('sensor-')) return this.scanned.has(Number(id.split('-')[1])) ? 'p.scanned' : 'p.scan';
    return null;
  }

  guide(p: MissionCtx): GuideTarget | null {
    switch (this.current?.id) {
      case 'earth':
        return { pos: p.eye.clone().addScaledVector(EARTH_DIR, 1000), label: 'wp.earth', sky: true };
      case 'reach':
        return { pos: this.marks.habitat, label: 'wp.habitat' };
      case 'scan': {
        let best: THREE.Vector3 | null = null;
        this.marks.sensors.forEach((sp, i) => {
          if (!this.scanned.has(i) && (!best || sp.distanceToSquared(p.feet) < best.distanceToSquared(p.feet))) best = sp;
        });
        return best ? { pos: best, label: 'wp.sensor' } : null;
      }
      case 'airlock':
        return { pos: this.marks.airlock, label: 'wp.airlock' };
      default:
        return null;
    }
  }
}
