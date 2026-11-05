import * as THREE from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Quality } from './settings';
import { VisorEffect } from './visor';

export const PRESETS: Record<Quality, { scale: number; shadow: number; terrainSegments: number; post: boolean }> = {
  low: { scale: 0.7, shadow: 1024, terrainSegments: 240, post: false },
  medium: { scale: 0.85, shadow: 2048, terrainSegments: 320, post: true },
  high: { scale: 1, shadow: 4096, terrainSegments: 400, post: true },
};

export function createRenderer(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.info.autoReset = false; // composer renders several passes per frame; count them all
  return renderer;
}

export class Pipeline {
  private composer: EffectComposer | null = null;
  private dofPass: EffectPass | null = null;
  quality: Quality = 'medium';
  /** The helmet's view (visor, glare, fog, blur); null on Low (no post-processing). */
  visor: VisorEffect | null = null;
  /** Depth of field for cutscenes (off in play). */
  dof: DepthOfFieldEffect | null = null;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
  ) {}

  apply(quality: Quality) {
    this.quality = quality;
    const p = PRESETS[quality];
    // Cap at 1x device pixels: Windows laptops at 125-150% scaling would otherwise
    // render up to 2.25x the pixels on an integrated GPU.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * p.scale);
    this.composer?.dispose();
    this.composer = null;
    if (p.post) {
      this.renderer.toneMapping = THREE.NoToneMapping;
      const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
      composer.addPass(new RenderPass(this.scene, this.camera));
      this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 10, focusRange: 6, bokehScale: 2.2, resolutionScale: 0.5 });
      this.dofPass = new EffectPass(this.camera, this.dof);
      this.dofPass.enabled = false;
      composer.addPass(this.dofPass);
      this.visor = new VisorEffect();
      composer.addPass(
        new EffectPass(
          this.camera,
          this.visor,
          new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.1, luminanceSmoothing: 0.2, intensity: 0.55, radius: 0.6 }),
          new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
          new VignetteEffect({ offset: 0.32, darkness: 0.55 }),
        ),
      );
      composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
      this.composer = composer;
    } else {
      this.renderer.toneMapping = THREE.AgXToneMapping;
      this.visor = null;
      this.dof = null;
      this.dofPass = null;
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  /** Depth of field on (cutscenes): the sharp distance and how deep the sharp zone is. */
  setDof(on: boolean, distance = 10, range = 6, bokeh = 2.2) {
    if (!this.dofPass || !this.dof) return;
    this.dofPass.enabled = on;
    if (on) {
      this.dof.cocMaterial.focusDistance = distance;
      this.dof.cocMaterial.focusRange = range;
      this.dof.bokehScale = bokeh;
    }
  }

  /** QA: is the depth-of-field pass on, and where does it focus. */
  dofState() {
    return { enabled: this.dofPass?.enabled ?? null, focus: this.dof?.cocMaterial.focusDistance, range: this.dof?.cocMaterial.focusRange };
  }

  render(dt: number) {
    this.visor?.track(this.camera);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
