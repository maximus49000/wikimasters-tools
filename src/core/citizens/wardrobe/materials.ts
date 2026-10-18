// Matériau « cellulo » de la garde-robe : ombrage toon à deux tons (rampe en DataTexture, sans canvas), et motifs du
// tissu dessinés par shader à partir de la position du sommet sur le corps au repos (attribut `bindPos`), pour que les
// rayures restent collées au tissu quand le personnage bouge.
import * as THREE from 'three';
import type { Pattern } from '../catalogue';

// Bande horizontale (bande réfléchissante du gilet) : deuxième couleur entre deux hauteurs du corps au repos.
export type Band = { kind: 'bande'; color: string; lo: number; hi: number };
export type Motif = Pattern | Band;

const GRAD = new THREE.DataTexture(new Uint8Array([150, 150, 160, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter;
GRAD.needsUpdate = true;

export function toon(color: string, side: THREE.Side = THREE.DoubleSide, pattern: Motif | null = null): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: GRAD, side, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (pattern) {
    // Rayures horizontales (marinière) ou carreaux : deuxième couleur selon la position du tissu sur le corps au repos.
    const c2 = new THREE.Color(pattern.color);
    const band = pattern.kind === 'bande' ? pattern : null;
    const freq = pattern.kind === 'bande' ? 0 : pattern.freq ?? 70;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uC2 = { value: c2 };
      sh.uniforms.uFreq = { value: freq };
      sh.uniforms.uLo = { value: band?.lo ?? 0 };
      sh.uniforms.uHi = { value: band?.hi ?? 0 };
      sh.vertexShader = 'attribute vec3 bindPos;\nvarying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = bindPos;');
      const rule = pattern.kind === 'carreaux'
        ? 'float pat = max(step(0.62, fract(vBind.y * uFreq)), step(0.62, fract((vBind.x + vBind.z) * uFreq)));'
        : pattern.kind === 'bande'
          ? 'float pat = step(uLo, vBind.y) * step(vBind.y, uHi);'
          : 'float pat = step(0.55, fract(vBind.y * uFreq));';
      sh.fragmentShader = 'uniform vec3 uC2;\nuniform float uFreq;\nuniform float uLo;\nuniform float uHi;\nvarying vec3 vBind;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + rule + '\ndiffuseColor.rgb = mix(diffuseColor.rgb, uC2, pat);');
    };
    m.customProgramCacheKey = () => (band ? `bande${band.color}${band.lo.toFixed(4)}${band.hi.toFixed(4)}` : pattern.kind + pattern.color + freq);
  }
  return m;
}
