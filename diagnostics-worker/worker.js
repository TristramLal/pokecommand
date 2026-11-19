// Cloudflare Worker for PokéCommand diagnostics.
// Deploy privately with wrangler; set GITHUB_TOKEN and TURNSTILE_SECRET as Worker secrets.
// Configure GITHUB_OWNER, GITHUB_REPO, ALLOWED_ORIGIN and TURNSTILE_SITE_KEY in wrangler.toml.
// Logs must go to a PRIVATE repository, never to the public PokéCommand repo.
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const headers={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||'https://tristramlal.github.io','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST'||origin!==env.ALLOWED_ORIGIN)return new Response('Forbidden',{status:403,headers});
  if(Number(request.headers.get('Content-Length')||0)>60000)return new Response('Payload too large',{status:413,headers});
  let body;try{body=await request.json()}catch{return new Response('Invalid JSON',{status:400,headers})}
  if(!body||!Array.isArray(body.events)||body.events.length>300||JSON.stringify(body).length>60000)return new Response('Invalid payload',{status:400,headers});
  if(!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO||!env.TURNSTILE_SECRET)return new Response('Not configured',{status:503,headers});
  // Turnstile prevents a public GitHub Pages app from exposing an unrestricted GitHub write endpoint.
  const verify=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:body.turnstileToken,remoteip:request.headers.get('CF-Connecting-IP')})});
  const verdict=await verify.json();if(!verdict.success)return new Response('Verification failed',{status:403,headers});
  const scrub=body.events.map(e=>({time:String(e.time||'').slice(0,40),stage:String(e.stage||'').slice(0,60),frame:Number.isInteger(e.frame)?e.frame:undefined,seconds:Number.isFinite(e.seconds)?e.seconds:undefined,error:String(e.error||e.barError||'').slice(0,300),parsed:e.parsed&&typeof e.parsed==='object'?{name:String(e.parsed.name||'').slice(0,70),cp:String(e.parsed.cp||'').slice(0,10),currentHP:String(e.parsed.currentHP||'').slice(0,10)}:undefined,confidence:e.regions?.map(r=>({region:String(r.region||'').slice(0,30),confidence:Number(r.confidence)||0}))}));
  // Intentionally omit raw OCR text, video frames, filenames, nicknames and device identifiers.
  const id=crypto.randomUUID(),date=new Date().toISOString().slice(0,10),path='diagnostics/'+date+'/'+id+'.json';
  const content=btoa(unescape(encodeURIComponent(JSON.stringify({created:new Date().toISOString(),appVersion:String(body.version||'').slice(0,20),events:scrub}))));
  const result=await fetch('https://api.github.com/repos/'+encodeURIComponent(env.GITHUB_OWNER)+'/'+encodeURIComponent(env.GITHUB_REPO)+'/contents/'+path,{method:'PUT',headers:{'Authorization':'Bearer '+env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'pokecommand-diagnostics','Content-Type':'application/json'},body:JSON.stringify({message:'Add anonymised diagnostic report '+id,content})});
  if(!result.ok)return new Response('Storage failed',{status:502,headers});
  return new Response(JSON.stringify({ok:true,reportId:id}),{status:201,headers:{...headers,'Content-Type':'application/json'}})
 }
};