import type * as THREE from 'three';
import type { Step } from './state';

// The shape every mission class follows, so main.ts can run any of them from the registry.

export interface MissionCtx {
  feet: THREE.Vector3;
  look: THREE.Vector3;
  eye: THREE.Vector3;
  distance: number;
  jumps: number;
  /** False while a terminal is open: the mission still updates, but the player is not walking. */
  playing: boolean;
}

export interface GuideTarget {
  pos: THREE.Vector3;
  label: string;
  /** A direction in the sky (no distance, no beam). */
  sky?: boolean;
}

export interface GameMission {
  readonly number: number;
  /** Called when the mission's last step is done (main.ts plays the ending). */
  onFinished: () => void;
  readonly current: Step | undefined;
  /** The interactable that needs E held down right now, if any. */
  readonly holdId?: string | null;
  readonly holdSeconds?: number;
  begin(): void;
  /** Every frame while the mission is on screen, including while a terminal is open. */
  update(dt: number, p: MissionCtx): void;
  /** Handles E on an object. Returns a warning key if it can't be used yet. */
  interact(id: string): string | null;
  /** Prompt key for an object, or null to use the object's default label. */
  label(id: string): string | null;
  holdComplete?(id: string): void;
  /** Called when the mission is left or restarted: cancel timers so nothing fires later. */
  end?(): void;
  /** Where the guide marker should point for the current step. */
  guide(p: MissionCtx): GuideTarget | null;
}
