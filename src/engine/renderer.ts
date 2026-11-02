import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Quality } from './settings';

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
  return renderer;
}

export class Pipeline {
  private composer: EffectComposer | null = null;
  quality: Quality = 'medium';

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
      composer.addPass(
        new EffectPass(
          this.camera,
          new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.1, luminanceSmoothing: 0.2, intensity: 0.55, radius: 0.6 }),
          new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
          new VignetteEffect({ offset: 0.32, darkness: 0.55 }),
        ),
      );
      composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
      this.composer = composer;
    } else {
      this.renderer.toneMapping = THREE.AgXToneMapping;
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

  render(dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
