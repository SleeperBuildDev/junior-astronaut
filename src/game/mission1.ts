import * as THREE from 'three';
import { beep, playVoice } from '../audio/audio';
import { statusMaterials } from '../world/base';
import { EARTH_DIR } from '../world/sky';
import { mission, pushComm, screen, unlock, type Step } from './state';

const CAPCOM = 'Mission Control';

const STEPS: Step[] = [
  { id: 'walk', text: 'Take your first steps (walk 15 m)', done: false },
  { id: 'jump', text: 'Try a low-gravity jump (Space)', done: false },
  { id: 'earth', text: 'Find Earth in the sky', done: false },
  { id: 'reach', text: 'Follow the green beacon to the habitat', done: false },
  { id: 'scan', text: 'Scan the 3 environment sensors (E)', done: false, progress: '0/3' },
  { id: 'airlock', text: 'Enter the habitat airlock (E)', done: false },
];

const LINES: Record<string, { vo: string; text: string }> = {
  start: { vo: 'm1_01', text: 'Junior Astronaut, this is Mission Control. Welcome to the lunar south pole. Take your first steps away from the lander.' },
  walk: { vo: 'm1_02', text: "Good steps. Gravity here is only one sixth of Earth's. Press Space and try a jump." },
  jump: { vo: 'm1_03', text: 'Nice and floaty. Now look out toward the horizon. Can you find Earth?' },
  earth: { vo: 'm1_04', text: 'There it is. Home, about 380,000 km away. Follow the flashing green beacon to the habitat.' },
  reach: { vo: 'm1_05', text: 'You have reached the outpost. Before you go inside, scan the three environment sensors around the base.' },
  sensor: { vo: 'm1_06', text: 'Sensor data received. Keep going.' },
  scan: { vo: 'm1_07', text: 'All sensors scanned. Great work. Head to the airlock on the west end of the habitat.' },
  airlock: { vo: 'm1_08', text: 'Airlock pressurising. Mission 1 complete. Welcome to your new home, Junior Astronaut.' },
};

const SENSOR_CARDS = ['temperature', 'radiation', 'regolith'];

export class Mission1 {
  private steps: Step[] = STEPS.map((s) => ({ ...s }));
  private scanned = new Set<number>();
  private earthLook = 0;

  constructor(
    private habitat: THREE.Vector3,
    private sensorLights: THREE.Mesh[],
  ) {}

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
    mission.value = { title: 'Mission 1: First Steps on the Moon', steps: this.steps.map((s) => ({ ...s })) };
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
    if (id === 'airlock') setTimeout(() => (screen.value = 'complete'), 6500);
  }

  update(dt: number, p: { distance: number; jumps: number; feet: THREE.Vector3; look: THREE.Vector3 }) {
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
      if (this.scanned.has(i)) return 'Already scanned';
      this.scanned.add(i);
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
      if (this.current?.id !== 'airlock') return 'Finish the sensor scans first';
      this.complete('airlock');
      return null;
    }
    return null;
  }

  sensorLabel(i: number) {
    return this.scanned.has(i) ? 'Sensor scanned' : 'Scan sensor station';
  }
}
