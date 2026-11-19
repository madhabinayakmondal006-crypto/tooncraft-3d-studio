import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Scene from './Scene';
import {
  ANIMS, ANIM_COLORS, locate, totalOf,
  type AnimName, type Clip, type ModelData, type Settings, type Sim, type View,
} from './animations';

type SimRef = React.MutableRefObject<Sim>;
const PPS = 64; // timeline pixels per second

const DEFAULTS: Settings = {
  bg: '#1b1630', floor: '#2d2650', showFloor: true, showGrid: true, light: 1,
  fov: 45, autoRotate: false, rotSpeed: 2, outline: true,
  skin: '#ffcf9f', shirt: '#ff5d8f', pants: '#3a6df0', hair: '#4a2c1a',
};
const BG_PRESETS = ['#1b1630', '#0f172a', '#134e4a', '#7c2d12', '#e0f2fe', '#fde68a'];
const VIEWS: { name: string; pos: [number, number, number] }[] = [
  { name: 'Front', pos: [0, 2, 7.5] }, { name: 'Side', pos: [7.5, 2, 0] },
  { name: 'Back', pos: [0, 2, -7.5] }, { name: 'Top', pos: [0, 9, 2.5] },
  { name: 'Close-up', pos: [0, 2.4, 3.8] }, { name: 'Wide', pos: [6, 4, 10] },
];
const START_CLIPS: Clip[] = [
  { id: 1, anim: 'Idle', dur: 2 }, { id: 2, anim: 'Wave', dur: 3 }, { id: 3, anim: 'Walk', dur: 3 },
  { id: 4, anim: 'Disco', dur: 4 }, { id: 5, anim: 'Jump', dur: 3 }, { id: 6, anim: 'Spin', dur: 2 },
];

const fmt = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

/** Polls the shared playback state a few times per second for display only. */
function useSimClock(sim: SimRef) {
  const [st, set] = useState({ t: 0, p: true });
  useEffect(() => {
    const id = setInterval(() => {
      const t = sim.current.time, p = sim.current.playing;
      set((o) => (o.t === t && o.p === p ? o : { t, p }));
    }, 50);
    return () => clearInterval(id);
  }, [sim]);
  return st;
}

function Transport({ sim, locked }: { sim: SimRef; locked: boolean }) {
  const { t, p } = useSimClock(sim);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const total = totalOf(sim.current.clips);
  const toggle = () => {
    const s = sim.current;
    if (s.playing) s.playing = false;
    else { if (s.time >= total - 0.01) s.time = 0; s.playing = total > 0; }
  };
  const reset = () => { sim.current.time = 0; sim.current.playing = false; };
  return (
    <div className="transport">
      <button className="btn primary" onClick={toggle} disabled={locked || total <= 0}>{p ? 'Pause' : 'Play'}</button>
      <button className="btn" onClick={reset} disabled={locked}>Reset</button>
      <button className={'btn' + (loop ? ' on' : '')} disabled={locked}
        onClick={() => { sim.current.loop = !loop; setLoop(!loop); }}>Loop</button>
      <select className="ctl" value={speed} disabled={locked} aria-label="Playback speed"
        onChange={(e) => { const v = Number(e.target.value); sim.current.speed = v; setSpeed(v); }}>
        {[0.25, 0.5, 1, 1.5, 2].map((v) => <option key={v} value={v}>{v}x</option>)}
      </select>
      <span className="time">{fmt(t)} / {fmt(total)}</span>
    </div>
  );
}

function Timeline({ sim, clips, sel, setSel, locked }: {
  sim: SimRef; clips: Clip[]; sel: number; setSel: (i: number) => void; locked: boolean;
}) {
  const { t, p } = useSimClock(sim);
  const scroller = useRef<HTMLDivElement>(null);
  const total = totalOf(clips);
  const loc = locate(clips, t);
  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    const r = e.currentTarget.getBoundingClientRect();
    sim.current.time = Math.min(total, Math.max(0, (e.clientX - r.left) / PPS));
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el || !p) return;
    const x = t * PPS;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
  }, [t, p]);
  return (
    <div className="timeline">
      <div className="tl-head">
        <span>Timeline</span>
        <span className="muted">{clips.length ? `Now: ${loc?.clip.anim}` : 'Add a clip in the Clips tab'}</span>
      </div>
      <div className="tl-scroll" ref={scroller}>
        <div className="tl-inner" style={{ width: Math.max(total * PPS + 24, 280) }}>
          <div className="ruler" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seek(e); }}
            onPointerMove={(e) => { if (e.buttons) seek(e); }}>
            {Array.from({ length: Math.ceil(total) + 1 }, (_, i) => (
              <span key={i} className="tick" style={{ left: i * PPS }}>{i}s</span>
            ))}
          </div>
          <div className="track">
            {clips.map((c, i) => (
              <button key={c.id} className={'clip' + (i === sel ? ' sel' : '')}
                style={{ width: c.dur * PPS, background: ANIM_COLORS[c.anim] }}
                onClick={() => { setSel(i); if (!locked) sim.current.time = clips.slice(0, i).reduce((s, x) => s + x.dur, 0); }}>
                {c.anim} <small>{c.dur}s</small>
              </button>
            ))}
          </div>
          <div className="playhead" style={{ left: t * PPS }} />
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="row"><span>{label}</span>{children}</label>
);

export default function App() {
  const sim = useRef<Sim>({ time: 0, playing: true, loop: true, speed: 1, exporting: false, clips: START_CLIPS, onFinish: null });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);
  const nextId = useRef(100);

  const [clips, setClips] = useState<Clip[]>(START_CLIPS);
  const [sel, setSel] = useState(0);
  const [newAnim, setNewAnim] = useState<AnimName>('Disco');
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [view, setView] = useState<View>({ pos: VIEWS[0].pos, n: 0 });
  const [tab, setTab] = useState<'clips' | 'scene' | 'camera' | 'look' | 'files'>('clips');
  const [model, setModel] = useState<ModelData | null>(null);
  const [clipIdx, setClipIdx] = useState(-1);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState('');

  sim.current.clips = clips;

  useEffect(() => {
    if (!msg || exporting) return;
    const id = setTimeout(() => setMsg(''), 6000);
    return () => clearTimeout(id);
  }, [msg, exporting]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((o) => ({ ...o, [k]: v }));

  // ---- clip editing ----
  const addClip = () => { setClips((c) => [...c, { id: nextId.current++, anim: newAnim, dur: 3 }]); setSel(clips.length); };
  const patch = (i: number, p: Partial<Clip>) => setClips((c) => c.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= clips.length) return;
    setClips((c) => { const n = [...c]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setSel(j);
  };
  const dup = (i: number) => {
    setClips((c) => { const n = [...c]; n.splice(i + 1, 0, { ...c[i], id: nextId.current++ }); return n; });
    setSel(i + 1);
  };
  const del = (i: number) => {
    setClips((c) => c.filter((_, j) => j !== i));
    setSel(Math.max(0, Math.min(i, clips.length - 2)));
    sim.current.time = Math.min(sim.current.time, Math.max(0, totalOf(clips) - clips[i].dur));
  };
  const cl = clips[sel] as Clip | undefined;

  // ---- GLB / GLTF import ----
  const importModel = async (file: File) => {
    const name = file.name.toLowerCase();
    if (!/\.(glb|gltf)$/.test(name)) { setMsg('Choose a .glb or .gltf file.'); return; }
    setMsg('Loading model…');
    try {
      const data = name.endsWith('.gltf') ? await file.text() : await file.arrayBuffer();
      const gltf = await new Promise<GLTF>((res, rej) => new GLTFLoader().parse(data, '', res, rej));
      gltf.scene.traverse((o) => { o.frustumCulled = false; });
      setModel({ name: file.name, scene: gltf.scene, clips: gltf.animations });
      setClipIdx(gltf.animations.length ? 0 : -1);
      setMsg(`Loaded ${file.name}` + (gltf.animations.length ? ` (${gltf.animations.length} built-in animation${gltf.animations.length > 1 ? 's' : ''})` : ''));
    } catch (e) {
      setMsg('Could not load this model. Use a self-contained .glb (a .gltf must have everything embedded).');
      console.error(e);
    }
  };

  // ---- WebM export ----
  const exportVideo = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined' || !('captureStream' in canvas)) {
      setMsg('This browser cannot record video. Try Chrome or Edge.'); return;
    }
    if (!clips.length) { setMsg('Add at least one clip before exporting.'); return; }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) { setMsg('WebM recording is not supported in this browser.'); return; }
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    discard.current = false;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setExporting(false);
      recRef.current = null;
      if (discard.current) { setMsg('Export cancelled.'); return; }
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'tooncraft-animation.webm';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      setMsg('Saved tooncraft-animation.webm to your downloads.');
    };
    const sm = sim.current;
    sm.time = 0; sm.playing = true; sm.exporting = true;
    sm.onFinish = () => setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 300);
    recRef.current = rec;
    setExporting(true);
    setMsg('Recording… the video plays once in real time.');
    rec.start(250);
  };
  const cancelExport = () => {
    discard.current = true;
    sim.current.exporting = false; sim.current.playing = false;
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">T</span><b>ToonCraft</b> 3D Studio</div>
        {exporting
          ? <button className="btn danger" onClick={cancelExport}>Cancel export</button>
          : <button className="btn primary" onClick={exportVideo}>Export WebM</button>}
      </header>

      <div className="main">
        <section className="stage">
          <div className="preview">
            <div className="viewport">
              <Canvas dpr={[1, 2]} camera={{ position: VIEWS[0].pos, fov: DEFAULTS.fov }}
                gl={{ preserveDrawingBuffer: true, antialias: true }}
                onCreated={({ gl }) => { canvasRef.current = gl.domElement; }}>
                <Scene sim={sim} s={s} model={model} clipIdx={clipIdx} view={view} />
              </Canvas>
              {msg && <div className="toast" role="status">{msg}</div>}
              {exporting && <div className="rec">● REC</div>}
            </div>
            <Transport sim={sim} locked={exporting} />
          </div>
          <Timeline sim={sim} clips={clips} sel={sel} setSel={setSel} locked={exporting} />
        </section>

        <aside className="panel">
          <nav className="tabs">
            {([['clips', 'Clips'], ['scene', 'Scene'], ['camera', 'Camera'], ['look', 'Character'], ['files', 'Import / Export']] as const).map(([k, l]) => (
              <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>

          {tab === 'clips' && (
            <div className="pane">
              <h3>Add a clip</h3>
              <div className="inline">
                <select className="ctl grow" value={newAnim} onChange={(e) => setNewAnim(e.target.value as AnimName)}>
                  {ANIMS.map((a) => <option key={a}>{a}</option>)}
                </select>
                <button className="btn primary" onClick={addClip}>Add to end</button>
              </div>
              <h3>Selected clip</h3>
              {cl ? (
                <>
                  <Row label="Animation">
                    <select className="ctl" value={cl.anim} onChange={(e) => patch(sel, { anim: e.target.value as AnimName })}>
                      {ANIMS.map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </Row>
                  <Row label={`Length: ${cl.dur}s`}>
                    <input type="range" min={0.5} max={12} step={0.5} value={cl.dur}
                      onChange={(e) => patch(sel, { dur: Number(e.target.value) })} />
                  </Row>
                  <div className="grid2">
                    <button className="btn" onClick={() => move(sel, -1)} disabled={sel === 0}>Move earlier</button>
                    <button className="btn" onClick={() => move(sel, 1)} disabled={sel === clips.length - 1}>Move later</button>
                    <button className="btn" onClick={() => dup(sel)}>Duplicate</button>
                    <button className="btn danger" onClick={() => del(sel)}>Delete</button>
                  </div>
                </>
              ) : <p className="muted">No clips yet. Pick an animation above and add it to the timeline.</p>}
              {model && !!model.clips.length && clipIdx >= 0 && (
                <p className="muted">Your model is playing its own built-in animation, so timeline clips only control the time.</p>
              )}
            </div>
          )}

          {tab === 'scene' && (
            <div className="pane">
              <h3>Background</h3>
              <div className="swatches">
                {BG_PRESETS.map((c) => (
                  <button key={c} aria-label={`Background ${c}`} className={'sw' + (s.bg === c ? ' active' : '')}
                    style={{ background: c }} onClick={() => set('bg', c)} />
                ))}
                <input type="color" aria-label="Custom background" value={s.bg} onChange={(e) => set('bg', e.target.value)} />
              </div>
              <h3>Floor and light</h3>
              <Row label="Show floor"><input type="checkbox" checked={s.showFloor} onChange={(e) => set('showFloor', e.target.checked)} /></Row>
              <Row label="Floor color"><input type="color" value={s.floor} onChange={(e) => set('floor', e.target.value)} /></Row>
              <Row label="Show grid"><input type="checkbox" checked={s.showGrid} onChange={(e) => set('showGrid', e.target.checked)} /></Row>
              <Row label={`Light: ${s.light.toFixed(1)}`}>
                <input type="range" min={0.3} max={2} step={0.1} value={s.light} onChange={(e) => set('light', Number(e.target.value))} />
              </Row>
              <button className="btn" onClick={() => setS((o) => ({ ...DEFAULTS, skin: o.skin, shirt: o.shirt, pants: o.pants, hair: o.hair, outline: o.outline }))}>Reset scene</button>
            </div>
          )}

          {tab === 'camera' && (
            <div className="pane">
              <h3>Camera angle</h3>
              <div className="grid3">
                {VIEWS.map((v) => <button key={v.name} className="btn" onClick={() => setView((o) => ({ pos: v.pos, n: o.n + 1 }))}>{v.name}</button>)}
              </div>
              <Row label={`Field of view: ${s.fov}°`}>
                <input type="range" min={25} max={80} step={1} value={s.fov} onChange={(e) => set('fov', Number(e.target.value))} />
              </Row>
              <Row label="Auto-orbit"><input type="checkbox" checked={s.autoRotate} onChange={(e) => set('autoRotate', e.target.checked)} /></Row>
              <Row label={`Orbit speed: ${s.rotSpeed.toFixed(1)}`}>
                <input type="range" min={0.5} max={8} step={0.5} value={s.rotSpeed} onChange={(e) => set('rotSpeed', Number(e.target.value))} />
              </Row>
              <p className="muted">Drag to orbit, pinch to zoom, two fingers to pan. The exported video records the camera as you see it.</p>
            </div>
          )}

          {tab === 'look' && (
            <div className="pane">
              <h3>Built-in character</h3>
              <Row label="Skin"><input type="color" value={s.skin} onChange={(e) => set('skin', e.target.value)} /></Row>
              <Row label="Shirt"><input type="color" value={s.shirt} onChange={(e) => set('shirt', e.target.value)} /></Row>
              <Row label="Pants"><input type="color" value={s.pants} onChange={(e) => set('pants', e.target.value)} /></Row>
              <Row label="Hair"><input type="color" value={s.hair} onChange={(e) => set('hair', e.target.value)} /></Row>
              <Row label="Cartoon outlines"><input type="checkbox" checked={s.outline} onChange={(e) => set('outline', e.target.checked)} /></Row>
              {model && <p className="muted">These colors apply to the built-in character. Remove your imported model in Import / Export to see it.</p>}
            </div>
          )}

          {tab === 'files' && (
            <div className="pane">
              <h3>Import a character</h3>
              <label className="btn primary filebtn">
                Choose .glb or .gltf file
                <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importModel(f); e.target.value = ''; }} />
              </label>
              {model ? (
                <>
                  <p>Loaded: <b>{model.name}</b></p>
                  {model.clips.length > 0 && (
                    <Row label="Built-in animation">
                      <select className="ctl" value={clipIdx} onChange={(e) => setClipIdx(Number(e.target.value))}>
                        <option value={-1}>None (use timeline motion)</option>
                        {model.clips.map((c, i) => <option key={i} value={i}>{c.name || `Clip ${i + 1}`}</option>)}
                      </select>
                    </Row>
                  )}
                  <button className="btn" onClick={() => { setModel(null); setClipIdx(-1); }}>Remove model</button>
                </>
              ) : <p className="muted">The model is scaled and placed on the floor automatically. It moves with the timeline clips (bounce, spin, sway), and plays its own animations if it has any.</p>}
              <h3>Export video</h3>
              <p className="muted">Records the full timeline once, in real time, as a WebM file at the size of the preview.</p>
              {exporting
                ? <button className="btn danger" onClick={cancelExport}>Cancel export</button>
                : <button className="btn primary" onClick={exportVideo}>Export WebM</button>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
