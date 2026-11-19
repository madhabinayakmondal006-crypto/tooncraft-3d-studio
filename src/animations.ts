import type { AnimationClip, Group } from 'three';

export const ANIMS = ['Idle', 'Walk', 'Wave', 'Jump', 'Disco', 'Robot', 'Groove', 'Spin'] as const;
export type AnimName = (typeof ANIMS)[number];

export const ANIM_COLORS: Record<AnimName, string> = {
  Idle: '#64748b', Walk: '#22c55e', Wave: '#06b6d4', Jump: '#f59e0b',
  Disco: '#ec4899', Robot: '#8b5cf6', Groove: '#f97316', Spin: '#3b82f6',
};

export interface Clip { id: number; anim: AnimName; dur: number }

/** Mutable playback state shared between the UI and the 3D scene (never triggers React renders). */
export interface Sim {
  time: number; playing: boolean; loop: boolean; speed: number;
  exporting: boolean; clips: Clip[]; onFinish: (() => void) | null;
}

export interface Settings {
  bg: string; floor: string; showFloor: boolean; showGrid: boolean; light: number;
  fov: number; autoRotate: boolean; rotSpeed: number; outline: boolean;
  skin: string; shirt: string; pants: string; hair: string;
}

export interface ModelData { name: string; scene: Group; clips: AnimationClip[] }
export interface View { pos: [number, number, number]; n: number }

export interface Pose {
  y: number; ry: number; rz: number; hx: number; hz: number;
  aX: number; aZ: number; bX: number; bZ: number; lA: number; lB: number; sq: number;
}

export const basePose = (): Pose => ({
  y: 0, ry: 0, rz: 0, hx: 0, hz: 0, aX: 0, aZ: -0.15, bX: 0, bZ: 0.15, lA: 0, lB: 0, sq: 1,
});

export const totalOf = (c: Clip[]) => c.reduce((s, x) => s + x.dur, 0);

export function locate(clips: Clip[], t: number) {
  let start = 0;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (t < start + clip.dur || i === clips.length - 1) {
      return { i, clip, local: Math.max(0, t - start), start };
    }
    start += clip.dur;
  }
  return null;
}

export function getPose(name: AnimName, t: number): Pose {
  const p = basePose();
  const s = Math.sin, c = Math.cos;
  switch (name) {
    case 'Idle': {
      const b = s(t * 2);
      p.y = b * 0.03; p.hz = s(t) * 0.06; p.aZ = -0.15 - b * 0.05; p.bZ = 0.15 + b * 0.05; p.sq = 1 + b * 0.012;
      break;
    }
    case 'Walk': {
      const w = s(t * 6);
      p.y = Math.abs(w) * 0.08; p.lA = w * 0.7; p.lB = -w * 0.7; p.aX = -w * 0.6; p.bX = w * 0.6;
      p.rz = w * 0.04; p.ry = w * 0.1; p.hz = w * 0.04;
      break;
    }
    case 'Wave':
      p.bZ = 2.5 + s(t * 9) * 0.35; p.hz = -0.1; p.y = s(t * 2) * 0.02;
      break;
    case 'Jump': {
      const j = Math.abs(s(t * 3));
      p.y = j * 1.1; p.aZ = -(0.6 + j * 2.2); p.bZ = 0.6 + j * 2.2; p.lA = -j * 0.6; p.lB = j * 0.6; p.sq = 0.9 + 0.2 * j;
      break;
    }
    case 'Disco': {
      const d = s(t * 5), e = c(t * 5);
      p.bZ = 1.5 + d * 1.1; p.aZ = -(1.5 - d * 1.1); p.rz = d * 0.1; p.ry = d * 0.5;
      p.y = Math.abs(e) * 0.06; p.lA = e * 0.35; p.lB = -e * 0.35; p.hz = d * 0.15;
      break;
    }
    case 'Robot': {
      const k = Math.floor(t * 3) % 4;
      p.ry = [0, 0.6, 0, -0.6][k]; p.hz = [0, 0.3, 0, -0.3][k];
      p.aZ = -[0.3, 1.57, 0.3, 1.0][k]; p.bZ = [1.0, 0.3, 1.57, 0.3][k];
      p.lA = [0, 0.3, 0, -0.3][k]; p.lB = -p.lA;
      break;
    }
    case 'Groove': {
      const g = s(t * 6);
      p.y = Math.abs(g) * 0.12; p.rz = s(t * 3) * 0.12; p.ry = s(t * 3) * 0.3;
      p.aX = -0.9; p.bX = -0.9; p.aZ = -0.5 + g * 0.3; p.bZ = 0.5 - g * 0.3;
      p.hx = g * 0.1; p.lA = g * 0.45; p.lB = -g * 0.45;
      break;
    }
    case 'Spin':
      p.ry = t * 7; p.aZ = -1.6; p.bZ = 1.6; p.y = 0.05; p.lA = 0.2; p.lB = -0.2;
      break;
  }
  return p;
}

export function poseAt(sim: Sim): Pose {
  const loc = locate(sim.clips, sim.time);
  return loc ? getPose(loc.clip.anim, loc.local) : getPose('Idle', sim.time);
}

/** Smoothly move the current pose toward the target pose. */
export function blendPose(cur: Pose, target: Pose, dt: number) {
  const k = 1 - Math.exp(-Math.min(dt, 0.1) * 16);
  (Object.keys(target) as (keyof Pose)[]).forEach((key) => {
    if (key === 'ry') {
      let d = (target.ry - cur.ry) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      cur.ry += d * k;
    } else {
      cur[key] += (target[key] - cur[key]) * k;
    }
  });
}
