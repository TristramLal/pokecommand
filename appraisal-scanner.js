/* PokéCommand appraisal scanner v2: deterministic, local pixel processing.
   Only report IVs if three matching rails and their full lengths are verified. */
const AppraisalScanner={
 scan(canvas){
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true});
  const p=ctx.getImageData(0,0,w,h).data;
  function pixel(x,y){const i=(y*w+x)*4;return [p[i],p[i+1],p[i+2]]}
  function cls(x,y){
   const [r,g,b]=pixel(x,y);
   if(r>180&&g>120&&g<205&&b>65&&b<175&&r-g>35&&r-b>35)return 'orange';
   if(r>175&&g>90&&g<175&&b>90&&b<175&&r-g>48&&r-b>35)return 'pink';
   if(r>195&&g>195&&b>195&&Math.max(r,g,b)-Math.min(r,g,b)<18&&r<245)return 'grey';
   return '';
  }
  const scanRows=[];
  for(let y=Math.floor(h*.68);y<Math.floor(h*.94);y+=2){
   const samples=[];
   for(let x=Math.floor(w*.07);x<Math.floor(w*.65);x+=2){let c=cls(x,y);if(c)samples.push({x,c})}
   if(samples.length<Math.round(w*.08))continue;
   const warm=samples.filter(s=>s.c!=='grey');
   if(warm.length<Math.round(w*.045))continue;
   // Find contiguous colour+grey rail, allowing the thin white segment dividers.
   let best=null,run=[];
   for(let i=0;i<samples.length;i++){
    if(run.length&&samples[i].x-run[run.length-1].x>Math.max(12,w*.016)){
     const a=run[0],z=run[run.length-1],coloured=run.filter(q=>q.c!=='grey');
     if(z.x-a.x>w*.25&&z.x-a.x<w*.46&&coloured.length>w*.045&&(!best||z.x-a.x>best.width))
      best={y,left:a.x,right:z.x,width:z.x-a.x,fillEnd:coloured[coloured.length-1].x,kind:coloured.filter(q=>q.c==='pink').length>coloured.length*.6?'pink':'orange'};
     run=[];
    }
    run.push(samples[i]);
   }
   if(run.length){
    const a=run[0],z=run[run.length-1],coloured=run.filter(q=>q.c!=='grey');
    if(z.x-a.x>w*.25&&z.x-a.x<w*.46&&coloured.length>w*.045&&(!best||z.x-a.x>best.width))
     best={y,left:a.x,right:z.x,width:z.x-a.x,fillEnd:coloured[coloured.length-1].x,kind:coloured.filter(q=>q.c==='pink').length>coloured.length*.6?'pink':'orange'};
   }
   if(best&&best.left<w*.25)scanRows.push(best);
  }
  const groups=[];
  for(const row of scanRows){
   let g=groups[groups.length-1];
   if(!g||row.y-g.end>8){g={end:row.y,rows:[]};groups.push(g)}
   g.end=row.y;g.rows.push(row);
  }
  const candidates=groups.filter(g=>g.rows.length>=2).map(g=>g.rows[Math.floor(g.rows.length/2)]);
  let best=null;
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++)for(let k=j+1;k<candidates.length;k++){
   const a=[candidates[i],candidates[j],candidates[k]],d1=a[1].y-a[0].y,d2=a[2].y-a[1].y;
   if(d1<h*.023||d1>h*.065||Math.abs(d1-d2)>h*.015)continue;
   if(Math.max(...a.map(q=>q.left))-Math.min(...a.map(q=>q.left))>w*.035)continue;
   if(Math.max(...a.map(q=>q.right))-Math.min(...a.map(q=>q.right))>w*.035)continue;
   if(!best||a.reduce((n,q)=>n+q.width,0)>best.reduce((n,q)=>n+q.width,0))best=a;
  }
  const diagnostic={rows:scanRows.length,candidates:candidates.map(q=>Math.round(q.y/h*100)),width:w,height:h};
  if(!best)return {atk:'',def:'',hp:'',diagnostic,reason:'No three aligned appraisal rails'};
  const ivs=[];
  for(const rail of best){
   const ratio=(rail.fillEnd-rail.left)/rail.width;
   const iv=Math.max(0,Math.min(15,Math.round(ratio*15)));
   if(ratio<.03||ratio>1.025||Math.abs(ratio-iv/15)>.042)
    return {atk:'',def:'',hp:'',diagnostic,reason:'Ambiguous fill length'};
   ivs.push(iv);
  }
  diagnostic.rails=best.map(q=>({y:Math.round(q.y/h*1000)/10,start:Math.round(q.left/w*1000)/10,end:Math.round(q.right/w*1000)/10,fill:Math.round(q.fillEnd/w*1000)/10}));
  return {atk:ivs[0],def:ivs[1],hp:ivs[2],diagnostic,reason:''};
 },
 async fromBlob(blob){
  const image=await createImageBitmap(blob);
  try{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);return this.scan(c)}
  finally{image.close()}
 }
};
