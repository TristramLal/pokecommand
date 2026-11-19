/* PokéCommand local video appraisal importer — v0.10.0 */
let bulkState={file:null,rows:[],busy:false,cancel:false,videoUrl:null};
function bulkStatus(message){let e=document.getElementById('bulkVideoStatus');if(e)e.textContent=message}
function bulkGuide(){
 let d=document.getElementById('modal');bulkState.cancel=true;
 d.innerHTML='<h2>🎥 Bulk appraisal importer</h2><p class="notice">Record Pokémon GO with iPhone Screen Recording. Keep Appraise open, swipe one Pokémon at a time and pause 2–3 seconds on each. Recordings are processed locally in this browser, not uploaded.</p><details><summary>How to record on iPhone</summary><ol><li>Open Control Centre (swipe down from the top-right).</li><li>Tap Screen Recording (circle icon), then wait 3 seconds. Add it in Control Centre if missing.</li><li>Switch to Pokémon GO, open a Pokémon and tap Appraise.</li><li>Swipe between Pokémon while keeping Appraise open, pausing 2–3 seconds each.</li><li>Stop recording using Control Centre. Return here and select the saved video.</li></ol></details><label>Choose screen recording from Photos<input type="file" id="bulkVideoFile" accept="video/*" onchange="bulkChoose(this)"></label><p class="muted" id="bulkVideoStatus">Choose a video to begin.</p><div class="row"><button type="button" id="bulkAnalyse" disabled onclick="bulkAnalyse()">Analyse video</button><button type="button" class="secondary" id="bulkCancel" onclick="bulkStop()">Cancel / close</button></div><div id="bulkResults"></div>';
 d.showModal()
}
function bulkChoose(input){
 let file=input.files&&input.files[0];if(!file)return;
 if(!file.type.startsWith('video/')&&!/\.(mov|mp4|m4v|webm)$/i.test(file.name)){bulkStatus('Choose a screen recording video.');return}
 bulkState.file=file;bulkState.rows=[];bulkState.cancel=false;
 document.getElementById('bulkAnalyse').disabled=false;
 document.getElementById('bulkResults').innerHTML='';
 bulkStatus('Ready: '+file.name+' ('+(file.size/1048576).toFixed(1)+' MB). Tap Analyse video.')
}
function bulkStop(){bulkState.cancel=true;let d=document.getElementById('modal');if(d.open)d.close()}
async function bulkLoadOCR(){
 if(window.Tesseract)return;
 await new Promise((resolve,reject)=>{let el=document.createElement('script');el.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';el.onload=resolve;el.onerror=()=>reject(Error('OCR library could not load. Check your connection.'));document.head.appendChild(el)})
}
function bulkVideoReady(video,event){return new Promise((resolve,reject)=>{let timer=setTimeout(()=>{cleanup();reject(Error('Video timed out while '+event))},15000);function cleanup(){clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',fail)}function ok(){cleanup();resolve()}function fail(){cleanup();reject(Error('Unable to decode video. Try an MP4 recording.'))}video.addEventListener(event,ok,{once:true});video.addEventListener('error',fail,{once:true})})}
function bulkKnownSpecies(raw){
 let lines=raw.split(/\n/).map(x=>x.replace(/[^A-Za-z0-9 '\-♀♂]/g,' ').trim()).filter(Boolean);
 let names=new Map();
 for(let p of data.pokemon)if(p.name)names.set(p.name.toLowerCase(),p.name);
 for(let r of baseStatsDB?.records||[])if(r.name)names.set(r.name.toLowerCase(),r.name);
 for(let name of Object.keys(dexMap))names.set(name.toLowerCase(),name);
 let hits=[];
 for(let line of lines){
  let normalized=line.toLowerCase().replace(/\s+/g,' ');
  if(names.has(normalized))hits.push(names.get(normalized));
  // Some screenshots contain nickname on top and species near the appraisal text.
 }
 return [...new Set(hits)].length===1?hits[0]:''
}
function bulkParseText(raw){
 let cp=raw.match(/\bC\s*P\s*([1-9][\d,]{1,5})\b/i);
 let hp=raw.match(/\b(\d{1,4})\s*\/\s*\d{1,4}\s*HP\b/i);
 return {name:bulkKnownSpecies(raw),cp:cp?cp[1].replace(/,/g,''):'',currentHP:hp?hp[1]:''}
}
function bulkKey(row){return [String(row.name||'').toLowerCase(),row.cp,row.atk,row.def,row.hp].join('|')}
function bulkFileFromCanvas(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not capture frame')),'image/jpeg',.86))}
async function bulkAnalyse(){
 if(bulkState.busy||!bulkState.file)return;
 let state=bulkState;state.busy=true;state.cancel=false;state.rows=[];
 let button=document.getElementById('bulkAnalyse');if(button)button.disabled=true;
 let video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;
 let url=URL.createObjectURL(state.file);state.videoUrl=url;
 try{
  bulkStatus('Loading OCR engine…');await bulkLoadOCR();
  let ready=bulkVideoReady(video,'loadedmetadata');video.src=url;video.load();await ready;
  if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Video duration unavailable');
  let interval=2.5,count=Math.min(100,Math.ceil(video.duration/interval));
  if(video.duration>250)bulkStatus('Long recording: only the first 250 seconds will be scanned. Split longer recordings into shorter clips.');
  let canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas unavailable');
  let w=video.videoWidth,h=video.videoHeight;if(!w||!h)throw Error('Could not read video dimensions');
  // Scale large iPhone recordings to reduce memory use while retaining enough resolution for IV bars.
  let scale=Math.min(1,1080/w,1920/h);canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  let lastKey='',lastAt=-10,seen=new Map();
  for(let i=0;i<count;i++){
   if(state.cancel)throw Error('Analysis cancelled');
   let t=Math.min(video.duration-.05,i*interval+.7);
   if(t<0)continue;
   let seek=bulkVideoReady(video,'seeked');video.currentTime=t;await seek;
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   let blob=await bulkFileFromCanvas(canvas);
   bulkStatus('Analysing frame '+(i+1)+' / '+count+' ('+Math.round(t)+'s). Found '+state.rows.length+' candidates…');
   let bars;try{bars=await readAppraisalBars(blob)}catch(e){continue}
   let raw='';
   try{let result=await Tesseract.recognize(blob,'eng');raw=result.data.text||''}catch(e){continue}
   let parsed=bulkParseText(raw);
   if(!parsed.name&&!parsed.cp)continue;
   let row={...parsed,...bars,time:t,blob,raw,include:!!parsed.name&&!!parsed.cp};
   let key=bulkKey(row);
   if(key===lastKey&&t-lastAt<8)continue;
   lastKey=key;lastAt=t;
   // Merge repeated consecutive frames only; allow identical species/CP/IV in separate sections.
   let previous=state.rows[state.rows.length-1];
   if(previous&&bulkKey(previous)===key&&t-previous.time<8)continue;
   state.rows.push(row);
   if(state.rows.length>=100)break
  }
  if(state.cancel)throw Error('Analysis cancelled');
  bulkStatus('Scan finished: '+state.rows.length+' candidates. Review every field before importing.');
  bulkReview()
 }catch(e){bulkStatus('Video analysis stopped: '+e.message)}finally{
  video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);state.videoUrl=null;state.busy=false;
  let b=document.getElementById('bulkAnalyse');if(b)b.disabled=false
 }
}
function bulkReview(){
 let root=document.getElementById('bulkResults');if(!root)return;
 let rows=bulkState.rows;
 if(!rows.length){root.innerHTML='<p class="notice">No complete appraisal frames were recognised. Try pausing longer on each Pokémon and ensure the appraisal bars and CP are visible.</p>';return}
 root.innerHTML='<h3>Review '+rows.length+' candidates</h3><p class="notice">Recognition is experimental. Names, CP and IVs may be incorrect. Uncertain entries are unchecked. Review each frame before importing. No existing Pokémon will be overwritten.</p>'+
 rows.map((p,i)=>'<div class="bulk-row"><label><input type="checkbox" data-bulk-include="'+i+'" '+(p.include?'checked':'')+'> Import this Pokémon</label><small>Frame at '+p.time.toFixed(1)+'s</small><div class="bulk-grid">'+
 [['name','Species','text'],['cp','CP','number'],['currentHP','HP','number'],['atk','Attack IV','number'],['def','Defence IV','number'],['hp','HP IV','number']].map(([key,label,type])=>'<label>'+label+'<input data-bulk-row="'+i+'" data-bulk-field="'+key+'" type="'+type+'" '+(key==='atk'||key==='def'||key==='hp'?'min="0" max="15"':'')+' value="'+esc(p[key]??'')+'"></label>').join('')+'</div><button class="secondary" type="button" onclick="bulkFramePreview('+i+')">View captured frame</button></div>').join('')+
 '<div class="row"><button type="button" onclick="bulkCommit()">Import selected Pokémon</button><button type="button" class="secondary" onclick="bulkStop()">Cancel</button></div>'
}
function bulkFramePreview(i){let p=bulkState.rows[i];if(!p)return;let url=URL.createObjectURL(p.blob),win=window.open(url,'_blank');if(!win)alert('Allow pop-ups to view the frame.');setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function bulkCommit(){
 let root=document.getElementById('bulkResults');if(!root||bulkState.busy)return;
 let rows=[],errors=[];
 for(let box of root.querySelectorAll('[data-bulk-include]:checked')){
  let i=Number(box.dataset.bulkInclude),inputs=root.querySelectorAll('[data-bulk-row="'+i+'"]'),p={};
  for(let el of inputs)p[el.dataset.bulkField]=el.value.trim();
  if(!p.name||!Number.isInteger(+p.cp)||+p.cp<10||+p.cp>99999){errors.push('Row '+(i+1)+': valid name and CP required');continue}
  let ivs=['atk','def','hp'];if(ivs.some(k=>p[k]===''||!Number.isInteger(+p[k])||+p[k]<0||+p[k]>15)){errors.push('Row '+(i+1)+': all three IVs must be 0–15');continue}
  rows.push({p,frame:bulkState.rows[i].blob})
 }
 if(errors.length){alert(errors.join('\n'));return}
 if(!rows.length){alert('Select at least one complete Pokémon.');return}
 if(!confirm('Add '+rows.length+' Pokémon to your collection? Existing entries will remain unchanged.'))return;
 bulkState.busy=true;let added=[];
 try{
  for(let {p,frame} of rows){
   let obj={id:uid(),...p,fast:'',charged:'',dexNumber:dexMap[p.name.toLowerCase()]||''};
   data.pokemon.push(obj);added.push(obj);
   try{await savePokemonPhoto(obj.id,frame)}catch(e){console.warn('Frame storage failed',e)}
  }
  save();document.getElementById('modal').close();alert('Imported '+added.length+' Pokémon. Review their details in your collection.')
 }catch(e){alert('Import interrupted: '+e.message+'. '+added.length+' Pokémon added; export a backup.');save()}
 finally{bulkState.busy=false}
}
