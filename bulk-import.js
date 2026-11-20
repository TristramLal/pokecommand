/* PokéCommand local video appraisal importer — v0.10.0 */
let bulkState={file:null,rows:[],busy:false,cancel:false,videoUrl:null,logs:[]};
function bulkLog(stage,details={}){bulkState.logs.push({time:new Date().toISOString(),stage,...details});if(bulkState.logs.length>1200)bulkState.logs.shift()}
function bulkDownloadLogs(){let payload={app:'PokéCommand',version:'0.11.1',created:new Date().toISOString(),file:{name:bulkState.file?.name,size:bulkState.file?.size},events:bulkState.logs};let blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pokecommand-ocr-debug-'+Date.now()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)}
function bulkLogButton(){return '<button type="button" class="secondary" onclick="bulkDownloadLogs()">⬇ Export OCR diagnostic logs</button>'}
const BULK_DIAG_ENDPOINT='https://pokecommand-diagnostics.tristram-b30.workers.dev/';
const BULK_TURNSTILE_SITE_KEY='0x4AAAAAAGIMd12eVBssR0IZ';
let bulkTurnstilePromise=null;
function bulkLoadTurnstile(){
 if(window.turnstile)return Promise.resolve();
 if(bulkTurnstilePromise)return bulkTurnstilePromise;
 bulkTurnstilePromise=new Promise((resolve,reject)=>{
  let script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=resolve;script.onerror=()=>reject(Error('Turnstile unavailable'));document.head.appendChild(script)
 });return bulkTurnstilePromise
}
async function bulkTurnstileToken(){
 await bulkLoadTurnstile();
 let holder=document.getElementById('bulkTurnstile');
 if(!holder)throw Error('Verification container missing');
 holder.style.display='block';
 return await new Promise((resolve,reject)=>{
  let done=false,timer=setTimeout(()=>{if(!done){done=true;reject(Error('Verification timed out'))}},60000);
  try{window.turnstile.render(holder,{sitekey:BULK_TURNSTILE_SITE_KEY,appearance:'interaction-only',callback:token=>{if(!done){done=true;clearTimeout(timer);resolve(token)}},'error-callback':()=>{if(!done){done=true;clearTimeout(timer);reject(Error('Verification failed'))}}})}catch(e){clearTimeout(timer);reject(e)}
 })
}
async function bulkAutoReport(){
 let indicator=document.getElementById('bulkDiagStatus');
 if(indicator)indicator.textContent='Sending anonymised diagnostic report…';else bulkStatus('Sending anonymised diagnostic report…');
 try{
  let token=await bulkTurnstileToken();
  let events=bulkState.logs.filter(e=>e.stage==='frame'||e.stage==='scan-error'||e.stage==='scan-finished'||e.stage==='video-metadata'||e.stage==='scan-summary').slice(0,120).map(e=>({time:e.time,stage:e.stage,frame:e.frame,seconds:e.seconds,error:e.error||e.barError,parsed:e.parsed,accepted:e.accepted,bars:e.bars,summary:e.stage==='scan-summary'?{samples:e.samples,ocrAttempts:e.ocrAttempts,skippedMotion:e.skippedMotion,candidates:e.candidates}:undefined,regions:e.regions?.map(r=>({region:r.region,confidence:r.confidence,error:r.error}))}));
  let response=await fetch(BULK_DIAG_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:'0.11.1',turnstileToken:token,events})});
  if(!response.ok)throw Error('Server returned '+response.status);
  if(indicator)indicator.textContent='Diagnostic report sent securely.';else bulkStatus('Diagnostic report sent securely.');
 }catch(e){if(indicator)indicator.textContent='Automatic diagnostics not sent: '+e.message+'. Your scan results remain on this device.';else bulkStatus('Automatic diagnostics not sent: '+e.message)}
}
function bulkStatus(message){let e=document.getElementById('bulkVideoStatus');if(e)e.textContent=message}
function bulkGuide(){
 let d=document.getElementById('modal');bulkState.cancel=true;bulkState.logs=[];bulkLog('guide-opened');
 d.innerHTML='<h2>🎥 Bulk appraisal importer</h2><p class="notice">Record Pokémon GO with iPhone Screen Recording. Keep Appraise open, swipe one Pokémon at a time and pause 2–3 seconds on each. Recordings are processed locally; original videos and frames are not uploaded. Anonymised recognition diagnostics are automatically submitted to private storage after scanning (verification may be required).</p><details><summary>How to record on iPhone</summary><ol><li>Open Control Centre (swipe down from the top-right).</li><li>Tap Screen Recording (circle icon), then wait 3 seconds. Add it in Control Centre if missing.</li><li>Switch to Pokémon GO, open a Pokémon and tap Appraise.</li><li>Swipe between Pokémon while keeping Appraise open, pausing 2–3 seconds each.</li><li>Stop recording using Control Centre. Return here and select the saved video.</li></ol></details><label>Choose screen recording from Photos<input type="file" id="bulkVideoFile" accept="video/*" onchange="bulkChoose(this)"></label><p class="muted" id="bulkVideoStatus">Choose a video to begin.</p><div class="row"><button type="button" id="bulkAnalyse" disabled onclick="bulkAnalyse()">Analyse video</button><button type="button" class="secondary" id="bulkCancel" onclick="bulkStop()">Cancel / close</button></div><p id="bulkDiagStatus" class="notice" role="status" aria-live="polite">Diagnostic reporting will start after analysis.</p><div id="bulkTurnstile"></div><div id="bulkResults"></div>';
 d.showModal()
}
function bulkChoose(input){
 let file=input.files&&input.files[0];if(!file)return;
 if(!file.type.startsWith('video/')&&!/\.(mov|mp4|m4v|webm)$/i.test(file.name)){bulkStatus('Choose a screen recording video.');return}
 bulkState.file=file;bulkState.rows=[];bulkState.cancel=false;bulkLog('video-selected',{name:file.name,size:file.size,type:file.type});
 document.getElementById('bulkAnalyse').disabled=false;
 document.getElementById('bulkResults').innerHTML='';
 bulkStatus('Ready: '+file.name+' ('+(file.size/1048576).toFixed(1)+' MB). Tap Analyse video.')
}
function bulkStop(){bulkLog('user-closed');bulkState.cancel=true;let d=document.getElementById('modal');if(d.open)d.close()}
async function bulkLoadOCR(){
 if(window.Tesseract)return;
 await new Promise((resolve,reject)=>{let el=document.createElement('script');el.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';el.onload=resolve;el.onerror=()=>reject(Error('OCR library could not load. Check your connection.'));document.head.appendChild(el)})
}
function bulkVideoReady(video,event){return new Promise((resolve,reject)=>{let timer=setTimeout(()=>{cleanup();reject(Error('Video timed out while '+event))},15000);function cleanup(){clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',fail)}function ok(){cleanup();resolve()}function fail(){cleanup();reject(Error('Unable to decode video. Try an MP4 recording.'))}video.addEventListener(event,ok,{once:true});video.addEventListener('error',fail,{once:true})})}
function bulkKnownSpecies(raw){
 let lines=raw.split(/\n/).map(x=>x.replace(/[^A-Za-z0-9 '\-♀♂]/g,' ').trim()).filter(Boolean);
 let names=new Map();
 for(let p of data.pokemon){if(p.name)names.set(p.name.toLowerCase(),p.name);if(p.nickname&&p.name)names.set(p.nickname.toLowerCase(),p.name)}
 for(let r of baseStatsDB?.records||[])if(r.name)names.set(r.name.toLowerCase(),r.name);
 for(let name of Object.keys(dexMap))names.set(name.toLowerCase(),name);
 let hits=[];
 for(let line of lines){
  let normalized=line.toLowerCase().replace(/\s+/g,' ');
  if(names.has(normalized))hits.push(names.get(normalized));for(let [key,species] of names){if(key.length>=4&&(normalized.includes('your '+key)||normalized.includes('the '+key)||normalized===' '+key))hits.push(species)}
  // Some screenshots contain nickname on top and species near the appraisal text.
 }
 return [...new Set(hits)].length===1?hits[0]:''
}
function bulkParseText(raw){
 let cp=raw.match(/\bC\s*P\s*([1-9][\d,]{1,5})\b/i)||raw.match(/\bCP\s*([1-9][\d,]{1,5})/i);
 let hp=raw.match(/\b(\d{1,4})\s*\/\s*\d{1,4}\s*HP\b/i);
 return {name:bulkKnownSpecies(raw),cp:cp?cp[1].replace(/,/g,''):'',currentHP:hp?hp[1]:''}
}
async function bulkOCRRegions(canvas){
 let w=canvas.width,h=canvas.height,regions=[['full',0,0,w,h],['header',0,Math.round(h*.035),w,Math.round(h*.27)],['appraisal',0,Math.round(h*.48),w,Math.round(h*.45)]],out=[];
 for(let [label,x,y,cw,ch] of regions){let c=document.createElement('canvas');c.width=Math.min(1200,Math.round(cw*1.5));c.height=Math.round(ch*c.width/cw);let ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(canvas,x,y,cw,ch,0,0,c.width,c.height);try{let result=await Tesseract.recognize(c,'eng');out.push({region:label,text:result.data.text||'',confidence:result.data.confidence})}catch(e){out.push({region:label,error:e.message})}}
 return out
}
async function bulkReadCPHeader(canvas){
 let w=canvas.width,h=canvas.height,c=document.createElement('canvas');
 c.width=Math.round(w*1.5);c.height=Math.round(h*.17*1.5);
 let ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(canvas,Math.round(w*.12),Math.round(h*.015),Math.round(w*.76),Math.round(h*.17),0,0,c.width,c.height);
 let result=await Tesseract.recognize(c,'eng');
 let raw=result.data.text||'';
 let m=raw.match(/C\s*P\s*([1-9][\d,]{2,5})/i);
 return m?m[1].replace(/,/g,''):'';
}
function bulkKey(row){return [String(row.name||'').toLowerCase(),row.cp].join('|')}
function bulkFileFromCanvas(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not capture frame')),'image/jpeg',.86))}
async function bulkAnalyse(){
 if(bulkState.busy||!bulkState.file)return;
 let state=bulkState;state.busy=true;state.cancel=false;state.rows=[];bulkLog('scan-start',{filename:state.file.name});
 let button=document.getElementById('bulkAnalyse');if(button)button.disabled=true;
 let video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;
 let url=URL.createObjectURL(state.file);state.videoUrl=url;
 try{
  bulkStatus('Loading OCR engine…');await bulkLoadOCR();
  let ready=bulkVideoReady(video,'loadedmetadata');video.src=url;video.load();await ready;
  if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Video duration unavailable');bulkLog('video-metadata',{duration:video.duration,width:video.videoWidth,height:video.videoHeight});
  // Examine the video densely, but run expensive OCR only when the picture settles.
  const interval=.4,count=Math.min(900,Math.ceil(video.duration/interval));
  if(video.duration>360)bulkStatus('Long recording: scanning the first six minutes. Split longer recordings.');
  let canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas unavailable');
  let w=video.videoWidth,h=video.videoHeight;if(!w||!h)throw Error('Could not read video dimensions');
  let scale=Math.min(1,1080/w,1920/h);canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  let probe=document.createElement('canvas');probe.width=32;probe.height=56;
  let probeCtx=probe.getContext('2d',{willReadFrequently:true});
  let previousPixels=null,stableFrames=0,lastOCR=-10,lastKey='',lastAt=-10,ocrAttempts=0,skippedMotion=0;
  for(let i=0;i<count;i++){
   if(state.cancel)throw Error('Analysis cancelled');
   let t=Math.min(video.duration-.05,i*interval+.1);
   if(t<0)continue;
   let seek=bulkVideoReady(video,'seeked');video.currentTime=t;await seek;
   ctx.drawImage(video,0,0,canvas.width,canvas.height);
   probeCtx.drawImage(canvas,0,0,probe.width,probe.height);
   let pixels=probeCtx.getImageData(0,0,probe.width,probe.height).data;
   let change=0;
   if(previousPixels){for(let p=0;p<pixels.length;p+=16){change+=Math.abs(pixels[p]-previousPixels[p])+Math.abs(pixels[p+1]-previousPixels[p+1])+Math.abs(pixels[p+2]-previousPixels[p+2])}change/=Math.ceil(pixels.length/16)*3}
   let still=previousPixels&&change<10;
   stableFrames=still?stableFrames+1:0;
   previousPixels=new Uint8ClampedArray(pixels);
   bulkStatus('Checking video '+Math.round(t)+'s / '+Math.round(Math.min(video.duration,360))+'s · '+state.rows.length+' recognised · '+ocrAttempts+' OCR checks');
   if(stableFrames<1){skippedMotion++;continue}
   // Check shortly after a stable screen appears; retry periodically if it stays visible.
   if(t-lastOCR<2.2)continue;
   lastOCR=t;ocrAttempts++;
   let blob=await bulkFileFromCanvas(canvas);
   let bars={atk:'',def:'',hp:''},barError='';
   try{bars=await readAppraisalBars(blob)}catch(e){barError=e.message}
   let raw='',regions=[];
   try{regions=await bulkOCRRegions(canvas);raw=regions.map(x=>x.text||'').join('\n')}catch(e){bulkLog('ocr-error',{frame:i,seconds:t,error:e.message});continue}
   let parsed=bulkParseText(raw);
   if(!parsed.cp){try{parsed.cp=await bulkReadCPHeader(canvas)}catch(e){bulkLog('cp-ocr-error',{frame:i,error:e.message})}}
   let validBars=['atk','def','hp'].filter(k=>bars[k]!==''&&bars[k]!==null&&bars[k]!==undefined).length;
   let confident=!!parsed.name||validBars>=2;
   bulkLog('frame',{frame:i,seconds:t,stable:true,change:+change.toFixed(2),accepted:confident,barError,bars,parsed,regions:regions.map(x=>({region:x.region,confidence:x.confidence,error:x.error,text:(x.text||'').slice(0,1400)}))});
   if(!confident)continue;
   let row={...parsed,...bars,time:t,blob,raw,include:false};
   let key=bulkKey(row);
   if(key===lastKey&&t-lastAt<12)continue;
   let previous=state.rows[state.rows.length-1];
   if(previous&&previous.name===row.name&&t-previous.time<3&&(!previous.cp||!row.cp||previous.cp===row.cp)){if(!previous.cp&&row.cp)previous.cp=row.cp;if(!previous.currentHP&&row.currentHP)previous.currentHP=row.currentHP;continue;}
   lastKey=key;lastAt=t;
   state.rows.push(row);bulkLog('candidate-kept',{frame:i,seconds:t,name:row.name,cp:row.cp,ivs:[row.atk,row.def,row.hp]});
   if(state.rows.length>=100)break
  }
  bulkLog('scan-summary',{samples:count,ocrAttempts,skippedMotion,candidates:state.rows.length});
  if(state.cancel)throw Error('Analysis cancelled');
  bulkLog('scan-finished',{frames:count,candidates:state.rows.length});bulkStatus('Scan finished: '+state.rows.length+' possible Pokémon. Select and correct entries before importing.');
  bulkReview();void bulkAutoReport()
 }catch(e){bulkLog('scan-error',{error:e.message});bulkStatus('Video analysis stopped: '+e.message);void bulkAutoReport()}finally{
  video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);state.videoUrl=null;state.busy=false;
  let b=document.getElementById('bulkAnalyse');if(b)b.disabled=false
 }
}
function bulkReview(){
 let root=document.getElementById('bulkResults');if(!root)return;
 let rows=bulkState.rows;
 if(!rows.length){root.innerHTML='<p class="notice">No Pokémon names or appraisal bars were recognised. Try a clearer recording.</p>';return}
 root.innerHTML='<h3>Review '+rows.length+' candidates</h3><p class="notice">Recognition is experimental. Names, CP and IVs may be incorrect or blank. All entries are unchecked until you review them. Review each frame before importing. No existing Pokémon will be overwritten.</p>'+
 rows.map((p,i)=>'<div class="bulk-row"><label><input type="checkbox" data-bulk-include="'+i+'" '+(p.include?'checked':'')+'> Import this Pokémon</label><small>Frame at '+p.time.toFixed(1)+'s</small><div class="bulk-grid">'+
 [['name','Species','text'],['cp','CP','number'],['currentHP','HP','number'],['atk','Attack IV','number'],['def','Defence IV','number'],['hp','HP IV','number']].map(([key,label,type])=>'<label>'+label+'<input data-bulk-row="'+i+'" data-bulk-field="'+key+'" type="'+type+'" '+(key==='atk'||key==='def'||key==='hp'?'min="0" max="15"':'')+' value="'+esc(p[key]??'')+'"></label>').join('')+'</div><button class="secondary" type="button" onclick="bulkFramePreview('+i+')">View captured frame</button></div>').join('')+
 '<div class="row"><button type="button" onclick="bulkCommit()">Import selected Pokémon</button><button type="button" class="secondary" onclick="bulkStop()">Cancel</button></div>'
}
function bulkFramePreview(i){let p=bulkState.rows[i];if(!p)return;let row=document.querySelector('[data-bulk-include="'+i+'"]')?.closest('.bulk-row');if(!row)return;let old=row.querySelector('.bulk-frame');if(old){old.remove();return}let img=document.createElement('img');img.className='bulk-frame';img.alt='Captured Pokémon appraisal frame';img.style.cssText='width:100%;max-height:550px;object-fit:contain;margin-top:10px;border-radius:10px';let url=URL.createObjectURL(p.blob);img.src=url;img.onload=()=>URL.revokeObjectURL(url);row.appendChild(img)}
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
 if(!confirm('Add '+rows.length+' Pokémon to your collection? Existing entries will remain unchanged.'))return;bulkLog('import-confirmed',{count:rows.length});
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
