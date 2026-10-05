import type { AcceptancePlan } from '../../src/acceptance/plan.ts';

export const savedText = 'level=2;coins=7;item=lamp;unlocked=yes';
export const checkpoint = { expected: savedText, snapshot: { kind: 'text' as const, selector: '#progress' }, savedSnapshot: { kind: 'text' as const, selector: '#saved' } };
const click = (id: string, selector: string): AcceptancePlan['steps'][number] => ({ id, kind: 'locator-click', selector, timeoutMs: 1000 });
const check = (id: string, acceptanceId: string, selector: string, expected: string): AcceptancePlan['steps'][number] =>
  ({ id, kind: 'wait-for', acceptanceId, observation: { kind: 'text', selector }, expected, timeoutMs: 1000 });
export function genericPersistentDraft() {
  return { brief: '跨关解锁、购买并保存，重开后继续', questions: [{ id: 'save', prompt: '继续时恢复哪些状态？' }], answers: { save: savedText }, unsupported: [],
    acceptance: [
      { acceptanceId: 'save', description: '正常跨关购买保存', steps: ['开始、跨关解锁、购买并保存'], expected: savedText, evidenceKinds: ['test_report' as const] },
      { acceptanceId: 'resume', description: '重开后继续', steps: ['点击继续'], expected: savedText, evidenceKinds: ['test_report' as const] },
    ], scenario: { viewport: { width: 1280, height: 720 }, steps: [click('play', '#play'), click('next', '#next'), click('buy', '#buy'), check('purchased', 'save', '#progress', savedText), click('save', '#save'),
      check('progress', 'save', '#progress', savedText), check('saved', 'save', '#saved', savedText)],
      reopen: { steps: [click('continue', '#continue'), check('progress', 'resume', '#progress', savedText), check('saved', 'resume', '#saved', savedText)], checkpoint: structuredClone(checkpoint) } } };
}
export const genericDesign = { summary: '存档夹具', implementationNotes: ['正常界面操作'], acceptanceMapping: { save: '跨关解锁购买保存', resume: '继续恢复状态' },
  characters: [{ id: 'marker', purpose: '阶段标记', states: ['play', 'resume'] }], audio: [{ id: 'purchase', trigger: '购买', loop: false }, { id: 'continue', trigger: '继续', loop: false }] };
export const genericArt = { characters: [{ id: 'marker', width: 32, height: 32, anchor: { x: 16, y: 16 },
  layers: [{ id: 'body', shape: 'ellipse', x: 2, y: 2, width: 28, height: 28, fill: '#ffee22', stroke: '#222222', strokeWidth: 1 }],
  states: ['play', 'resume'].map(name => ({ name, fps: 1, loop: true, frames: [{}] })) }],
  audio: ['purchase', 'continue'].map(id => ({ id, loop: false, sampleRate: 22050, duration: 0.02,
    notes: [{ midi: 72, start: 0, duration: 0.02, gain: 0.2, wave: 'sine', attack: 0.002, release: 0.002 }] })) };

/** Small authored harness data, with real resource decoding and normal UI storage only. */
export function genericPersistentHtml(manifest: any) {
  return `<!doctype html><meta charset="utf-8"><title>Generic save fixture</title>
<button id="play">开始</button><button id="next">跨关并解锁</button><button id="buy">购买灯</button><button id="save">保存</button><button id="continue">继续</button>
<p id="progress">等待开始</p><p id="saved">没有存档</p><img id="marker" width="32" height="32" alt="阶段标记">
<script>
const manifest=${JSON.stringify(manifest)}, expected=${JSON.stringify(savedText)};
let state={level:1,coins:10,item:'none',unlocked:false}, images=new Map(), seen=new Set(), decoded=new Set(), started=new Set();
const audio=new AudioContext();
const show=()=>{document.querySelector('#progress').textContent='level='+state.level+';coins='+state.coins+';item='+state.item+';unlocked='+(state.unlocked?'yes':'no');};
const ready=Promise.all(manifest.characters[0].manifest.states.flatMap(s=>s.frames.map(async file=>{const image=new Image();image.src='/'+manifest.characters[0].directory.replace(/^public\\//,'')+'/'+file;await image.decode();images.set(file,image);}))).then(()=>true);
async function display(name){await ready; const state=manifest.characters[0].manifest.states.find(s=>s.name===name);document.querySelector('#marker').src=images.get(state.frames[0]).src;await document.querySelector('#marker').decode();seen.add(name);}
async function sound(id){await audio.resume();const clip=manifest.audio.find(c=>c.manifest.id===id);const buffer=await audio.decodeAudioData(await(await fetch('/'+clip.directory.replace(/^public\\//,'')+'/'+clip.manifest.file)).arrayBuffer());decoded.add(id);const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);source.start();started.add(id);}
document.querySelector('#play').onclick=async()=>{await display('play');show();};
document.querySelector('#next').onclick=()=>{state.level=2;state.unlocked=true;show();};
document.querySelector('#buy').onclick=async()=>{if(!state.unlocked||state.coins<3)return;state.coins-=3;state.item='lamp';await sound('purchase');show();};
document.querySelector('#save').onclick=()=>{if(document.querySelector('#progress').textContent!==expected)return;localStorage.setItem('generic-save',JSON.stringify(state));document.querySelector('#saved').textContent=expected;};
document.querySelector('#continue').onclick=async()=>{const stored=localStorage.getItem('generic-save');if(!stored)return;state=JSON.parse(stored);await display('resume');await sound('continue');show();document.querySelector('#saved').textContent=document.querySelector('#progress').textContent;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
Object.defineProperty(window,'cosmosDebug',{get:()=>freeze({media:{characters:[{id:manifest.characters[0].manifest.id,loadedFrames:images.size,states:manifest.characters[0].manifest.states.map(s=>({name:s.name,seen:seen.has(s.name)}))}],audio:manifest.audio.map(c=>({id:c.manifest.id,decoded:decoded.has(c.manifest.id),started:started.has(c.manifest.id)}))}})});
</script>`;
}
