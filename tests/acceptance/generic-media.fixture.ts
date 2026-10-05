import type { MediaMetadata } from '../../src/artifacts/types.ts';

/** Synthetic canvas/WebAudio fixture; all counters come from actual loading/display/start. */
export function genericMediaFixture(media: MediaMetadata, files = false): string {
  return `<link rel="icon" href="data:,"><button id="star">Play</button><p id="result">ready</p><canvas id="stage" width="256" height="128"></canvas><script>
    const fault = new URLSearchParams(location.search).get('fault'), media = ${JSON.stringify(media)}, files = ${JSON.stringify(files)};
    const uri = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="blue"/></svg>');
    const images = media.characters.map((item,i) => item.manifest.states.map((state,j) => state.frames.map((frame,k) => {const image=new Image();
      if(!(fault==='incomplete' && i===0 && j===item.manifest.states.length-1 && k===0))image.src=files?'/'+item.directory.replace('public/','')+'/'+frame:uri;return image;})));
    const seen = media.characters.map(() => new Set()), decoded = [], started = []; const audio = new AudioContext();
    Object.defineProperty(window, 'cosmosDebug', { configurable:false, get() { const characters = media.characters.map((item,i) => Object.freeze({
      id:item.manifest.id, loadedFrames:images[i].flat().filter(image=>image.complete && image.naturalWidth).length,
      states:Object.freeze(item.manifest.states.map((state,j) => {const value={name:state.name,seen:seen[i].has(j)};
        if(fault==='getter' && i===0 && j===0)Object.defineProperty(value,'name',{get(){throw Error('must never invoke nested getter');}});return Object.freeze(value);})) }));
      return Object.freeze({media:Object.freeze({characters:Object.freeze(characters),audio:Object.freeze(media.audio.map((item,i) => Object.freeze({id:item.manifest.id,decoded:!!decoded[i],started:!!started[i]})))})}); } });
    document.querySelector('#star').onclick = async () => { document.querySelector('#result').textContent='胜利'; await audio.resume();
      await new Promise(resolve => setTimeout(resolve,250));
      await Promise.all(images.flat(2).filter(image=>image.src).map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve;})));
      const tone=files?null:await(await fetch('/tone.wav')).arrayBuffer();
      await Promise.all(media.audio.map(async (item,i)=>{if(fault==='incomplete' && i===0)return;
        const bytes=tone?tone.slice(0):await(await fetch('/'+item.directory.replace('public/','')+'/'+item.manifest.file)).arrayBuffer();
        const buffer=await audio.decodeAudioData(bytes); decoded[i]=true;
        const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination); source.start();started[i]=true;}));
      let state=0; const draw=()=>{ const context=document.querySelector('#stage').getContext('2d');
        for(let i=0;i<media.characters.length;i++){const frames=images[i][state];if(!frames)continue;
          for(const image of frames)if(image.complete && image.naturalWidth){context.drawImage(image,(i%32)*8,Math.floor(i/32)*8);seen[i].add(state);}}
        if(++state<Math.max(...media.characters.map(item=>item.manifest.states.length)))requestAnimationFrame(draw);}; requestAnimationFrame(draw); };
    </script>`;
}
