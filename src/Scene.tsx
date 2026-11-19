import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls, Outlines } from '@react-three/drei';
import { basePose, blendPose, poseAt, totalOf, type ModelData, type Settings, type Sim, type View } from './animations';

type SimRef = MutableRefObject<Sim>;
type MeshProps = JSX.IntrinsicElements['mesh'];

/** Advances the shared timeline clock once per rendered frame. */
function Ticker({ sim }: { sim: SimRef }) {
  useFrame((_, dt) => {
    const s = sim.current;
    if (!s.playing) return;
    const total = totalOf(s.clips);
    if (total <= 0) { s.playing = false; return; }
    s.time += Math.min(dt, 0.1) * (s.exporting ? 1 : s.speed);
    if (s.time >= total) {
      if (s.exporting) {
        s.time = total; s.playing = false; s.exporting = false;
        s.onFinish?.();
      } else if (s.loop) {
        s.time = s.time % total;
      } else {
        s.time = total; s.playing = false;
      }
    }
  });
  return null;
}

function CameraRig({ view, fov }: { view: View; fov: number }) {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const controls = useThree((st) => st.controls) as any;
  useEffect(() => {
    camera.position.set(view.pos[0], view.pos[1], view.pos[2]);
    if (controls) { controls.target.set(0, 1.2, 0); controls.update(); } else camera.lookAt(0, 1.2, 0);
  }, [view.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { camera.fov = fov; camera.updateProjectionMatrix(); }, [fov, camera]);
  return null;
}

function Part({ color, outline, children, ...rest }: MeshProps & { color: string; outline: boolean }) {
  return (
    <mesh {...rest}>
      {children}
      <meshToonMaterial color={color} />
      {outline && <Outlines thickness={0.03} color="#15121f" />}
    </mesh>
  );
}

function Character({ sim, s }: { sim: SimRef; s: Settings }) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const armA = useRef<THREE.Group>(null);
  const armB = useRef<THREE.Group>(null);
  const legA = useRef<THREE.Group>(null);
  const legB = useRef<THREE.Group>(null);
  const cur = useRef(basePose());
  const o = s.outline;

  useFrame((st, dt) => {
    const c = cur.current;
    blendPose(c, poseAt(sim.current), dt);
    const r = root.current!;
    r.position.y = c.y; r.rotation.y = c.ry; r.rotation.z = c.rz;
    r.scale.set(1 + (1 - c.sq) * 0.5, c.sq, 1 + (1 - c.sq) * 0.5);
    head.current!.rotation.set(c.hx, 0, c.hz);
    armA.current!.rotation.set(c.aX, 0, c.aZ);
    armB.current!.rotation.set(c.bX, 0, c.bZ);
    legA.current!.rotation.x = c.lA;
    legB.current!.rotation.x = c.lB;
    eyes.current!.scale.y = st.clock.elapsedTime % 3.4 < 0.12 ? 0.1 : 1;
  });

  const arm = (ref: MutableRefObject<THREE.Group | null>, x: number) => (
    <group ref={ref as any} position={[x, 2.05, 0]}>
      <Part color={s.shirt} outline={o} position={[0, -0.35, 0]}><capsuleGeometry args={[0.12, 0.45, 6, 12]} /></Part>
      <Part color={s.skin} outline={o} position={[0, -0.78, 0]}><sphereGeometry args={[0.16, 16, 12]} /></Part>
    </group>
  );
  const leg = (ref: MutableRefObject<THREE.Group | null>, x: number) => (
    <group ref={ref as any} position={[x, 1.05, 0]}>
      <Part color={s.pants} outline={o} position={[0, -0.45, 0]}><capsuleGeometry args={[0.17, 0.5, 6, 14]} /></Part>
      <Part color="#26233a" outline={o} position={[0, -0.92, 0.1]} scale={[1, 0.6, 1.5]}><sphereGeometry args={[0.2, 16, 12]} /></Part>
    </group>
  );

  return (
    <group ref={root}>
      {leg(legA, -0.28)}
      {leg(legB, 0.28)}
      <Part color={s.shirt} outline={o} position={[0, 1.65, 0]}><capsuleGeometry args={[0.4, 0.45, 8, 16]} /></Part>
      {arm(armA, -0.62)}
      {arm(armB, 0.62)}
      <group ref={head} position={[0, 2.3, 0]}>
        <Part color={s.skin} outline={o} position={[0, 0.55, 0]}><sphereGeometry args={[0.6, 32, 24]} /></Part>
        <Part color={s.hair} outline={o} position={[0, 0.62, -0.03]} rotation={[-0.25, 0, 0]}>
          <sphereGeometry args={[0.64, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
        </Part>
        <Part color={s.skin} outline={o} position={[-0.6, 0.5, 0]}><sphereGeometry args={[0.12, 12, 12]} /></Part>
        <Part color={s.skin} outline={o} position={[0.6, 0.5, 0]}><sphereGeometry args={[0.12, 12, 12]} /></Part>
        <Part color={s.skin} outline={false} position={[0, 0.4, 0.58]}><sphereGeometry args={[0.06, 12, 12]} /></Part>
        <group ref={eyes} position={[0, 0.5, 0]}>
          {[-0.22, 0.22].map((x) => (
            <group key={x}>
              <Part color="#ffffff" outline={false} position={[x, 0, 0.47]} scale={[1, 1.2, 0.6]}><sphereGeometry args={[0.15, 16, 12]} /></Part>
              <Part color="#15121f" outline={false} position={[x, 0, 0.55]}><sphereGeometry args={[0.07, 12, 12]} /></Part>
            </group>
          ))}
        </group>
        <Part color="#15121f" outline={false} position={[0, 0.3, 0.52]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.1, 0.025, 8, 16, Math.PI]} />
        </Part>
      </group>
    </group>
  );
}

function Imported({ sim, model, clipIdx }: { sim: SimRef; model: ModelData; clipIdx: number }) {
  const motion = useRef<THREE.Group>(null);
  const cur = useRef(basePose());
  const { k, pos, mixer } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model.scene);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const k = size.y > 0 ? 2.4 / size.y : 1;
    return {
      k, mixer: new THREE.AnimationMixer(model.scene),
      pos: [-ctr.x * k, -box.min.y * k, -ctr.z * k] as [number, number, number],
    };
  }, [model]);

  useEffect(() => {
    mixer.stopAllAction();
    const clip = model.clips[clipIdx];
    if (clip) mixer.clipAction(clip).play();
    return () => { mixer.stopAllAction(); };
  }, [mixer, model, clipIdx]);

  useFrame((_, dt) => {
    const m = motion.current!;
    if (model.clips[clipIdx]) {
      mixer.setTime(sim.current.time);
      m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    } else {
      const c = cur.current;
      blendPose(c, poseAt(sim.current), dt);
      m.position.y = c.y; m.rotation.set(0, c.ry, c.rz);
      m.scale.set(1 + (1 - c.sq) * 0.5, c.sq, 1 + (1 - c.sq) * 0.5);
    }
  });

  return (
    <group ref={motion}>
      <group scale={k} position={pos}><primitive object={model.scene} /></group>
    </group>
  );
}

export interface SceneProps { sim: SimRef; s: Settings; model: ModelData | null; clipIdx: number; view: View }

export default function Scene({ sim, s, model, clipIdx, view }: SceneProps) {
  return (
    <>
      <color attach="background" args={[s.bg]} />
      <Ticker sim={sim} />
      <ambientLight intensity={0.7 * s.light} />
      <directionalLight position={[4, 8, 6]} intensity={2.2 * s.light} />
      <directionalLight position={[-5, 3, -4]} intensity={0.9 * s.light} color="#9db8ff" />
      {model ? <Imported sim={sim} model={model} clipIdx={clipIdx} /> : <Character sim={sim} s={s} />}
      {s.showFloor && (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
          <circleGeometry args={[9, 64]} />
          <meshToonMaterial color={s.floor} />
        </mesh>
      )}
      {s.showGrid && <gridHelper args={[18, 18, '#6b6f8d', '#3b3a58']} position-y={0.003} />}
      <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={10} blur={2.4} far={4} />
      <CameraRig view={view} fov={s.fov} />
      <OrbitControls
        makeDefault target={[0, 1.2, 0]} enableDamping
        maxPolarAngle={Math.PI / 2.02} minDistance={2} maxDistance={22}
        autoRotate={s.autoRotate} autoRotateSpeed={s.rotSpeed}
      />
    </>
  );
}
