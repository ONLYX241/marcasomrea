/* ===== CONFIGURAÇÃO DE PAGAMENTO: edite só este bloco =====
 checkout: link de pagamento de cada plano (Hotmart, Kiwify, Eduzz, AtenasPay, Stripe...).
 licenseEndpoint: URL da sua API. Recebe POST {"key":"..."} e responde {"valid":true,"plan":"trimestral"}.
   Sua API cria a chave quando o gateway avisa (webhook) que o pagamento foi aprovado.
 testKeys: chaves para testar sem backend. Deixe vazio em produção. */
const CONFIG={freeLimit:3,api:'',turnstile:''}; /* turnstile: cole aqui a SITE KEY do Cloudflare Turnstile (opcional, anti-robô) */ /* '' = mesmo endereço do site (as funções Netlify respondem em /api/...) */
let libP;const libs=()=>libP||(libP=Promise.all(['/vendor/jszip.min.js','/vendor/lame.min.js'].map(u=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=u;s.onload=ok;s.onerror=()=>{libP=null;no()};document.head.appendChild(s)}))));
const WEEKLY={mensal:100,trimestral:70}; /* só exibição; quem aplica o limite é o servidor (PLANS em netlify/lib/common.mts) */
document.querySelectorAll('[data-wk]').forEach(e=>{e.textContent='Até '+WEEKLY[e.dataset.wk]+' músicas por semana'});
const PRICES={mensal:'R$ 29,90',trimestral:'R$ 59,90',vitalicio:'R$ 129,90'}; /* só exibição; o valor cobrado é o do servidor */
const devId=()=>{try{let d=localStorage.getItem('ms_dev');if(!/^[a-f0-9]{32}$/.test(d||'')){d=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('ms_dev',d)}return d}catch(e){return '0'.repeat(32)}};
async function checkKey(k){k=(k||'').trim().toUpperCase();if(!k)return null;
 const r=await fetch(CONFIG.api+'/api/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,device:devId()})});
 const j=await r.json();if(j&&j.valid){W=j.weekly||null;return j}if(j&&j.reason==='device-limit')throw new Error('device-limit');return null}
const $=s=>document.querySelector(s),FREE=CONFIG.freeLimit,tick=()=>new Promise(r=>setTimeout(r));
let ctx,songs=[],vin=null,o={pos:'auto',vol:100,fi:0,fo:0,gap:0},zipBlob=null,src=null,stop=false,paid=false,KEY='',W=null;
const ac=()=>ctx||(ctx=new(window.AudioContext||window.webkitAudioContext)());
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.remove('hide');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hide'),3500)};
const dec=async f=>ac().decodeAudioData(await f.arrayBuffer());

function seg(id,k,num){document.querySelectorAll(id+' button').forEach(b=>b.onclick=()=>{document.querySelectorAll(id+' button').forEach(x=>x.setAttribute('aria-pressed',x===b));o[k]=num?parseFloat(b.dataset.v):b.dataset.v})}
seg('#pos','pos');seg('#fi','fi',1);seg('#fo','fo',1);
const setVol=v=>{v=Math.max(0,Math.min(200,Math.round((+v||0)/5)*5));o.vol=v;$('#vol').value=v;$('#voln').value=v};
$('#vol').oninput=e=>setVol(e.target.value);$('#voln').onchange=e=>setVol(e.target.value);

/* Uploads: confere tamanho e assinatura do arquivo (precisa parecer áudio de verdade) antes de aceitar */
const MAXF=200*1048576,MAXN=2000;
async function sniff(f){try{const b=new Uint8Array(await f.slice(0,12).arrayBuffer()),s=String.fromCharCode(...b);
 return s.startsWith('ID3')||(s.startsWith('RIFF')&&s.slice(8,12)==='WAVE')||s.startsWith('fLaC')||s.startsWith('OggS')||s.slice(4,8)==='ftyp'||s.startsWith('FORM')||(b[0]===0xFF&&(b[1]&0xE0)===0xE0)}catch(e){return false}}
async function vet(fs){const ok=[];let bad=Math.max(0,fs.length-MAXN);for(const f of fs.slice(0,MAXN)){if(f.size>0&&f.size<=MAXF&&await sniff(f))ok.push(f);else bad++}
 if(bad)toast(bad+' arquivo(s) ignorado(s): não parecem áudio válido ou passam de 200 MB.');return ok}
function zone(d,b,f,cb){b.onclick=()=>f.click();f.onchange=()=>vet([...f.files]).then(cb);
 d.ondragover=e=>{e.preventDefault();d.classList.add('on')};d.ondragleave=()=>d.classList.remove('on');
 d.ondrop=e=>{e.preventDefault();d.classList.remove('on');vet([...e.dataTransfer.files]).then(cb)}}
zone($('#d1'),$('#b1'),$('#f1'),fs=>{songs=fs;libs().catch(()=>{});$('#o1').textContent=fs.length?fs.length+' música(s) selecionada(s)':'';manFill();upd()});
zone($('#d2'),$('#b2'),$('#f2'),async fs=>{if(!fs[0])return;$('#o2').textContent='Lendo vinheta…';try{vin=await dec(fs[0]);if(vin.duration>30)toast('Essa vinheta tem mais de 30 segundos. Confira se é o arquivo certo.');$('#o2').textContent='Vinheta: '+fs[0].name+' ('+vin.duration.toFixed(1).replace('.',',')+' s)'}catch(e){vin=null;$('#o2').textContent='Não consegui ler esse arquivo. Tente MP3 ou WAV.'}upd()});

function upd(){const ok=songs.length&&vin;$('#go').disabled=!ok;$('#pv').disabled=!ok;$('#mpv').disabled=!ok;if(ed.dur){render();manCount()}
 $('#gom').textContent=ok?songs.length+' música(s) prontas para processar':'Envie as músicas e a vinheta para começar';
 $('#fr').classList.toggle('hide',paid);showWeekly()}
function showWeekly(){const e=$('#wk');if(!paid||!W){e.textContent='';return}
 const left=Math.max(0,W.limit-W.used),reset='O limite renova toda segunda-feira às 00:00 (horário de Brasília).';
 let t=left?'Esta semana: '+W.used+' de '+W.limit+' músicas usadas (restam '+left+'). '+reset:'Você já usou as '+W.limit+' músicas desta semana. '+reset;
 if(left&&songs.length>left)t+=' Você escolheu '+songs.length+': só as '+left+' primeiras serão processadas.';
 e.textContent=t}
async function usage(action,extra){const r=await fetch(CONFIG.api+'/api/usage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({key:KEY,device:devId(),action},extra))});
 if(!r.ok)throw new Error('http '+r.status);return r.json()}
function setW(j){W=j&&j.limit!=null?{limit:j.limit,used:j.used,resetsAt:j.resetsAt}:null;showWeekly()}

function positions(buf,L,m){
 const sr=buf.sampleRate,n=buf.length;
 if(m==='start')return[0];if(m==='end')return[Math.max(0,n-L)];if(m==='both')return[0,Math.max(0,n-L)];
 const dur=n/sr,hop=Math.floor(sr*.1),d=buf.getChannelData(0),env=[];
 for(let i=0;i+hop<=n;i+=hop){let s=0;for(let j=0;j<hop;j+=8)s+=d[i+j]*d[i+j];env.push(s)}
 const w=Math.max(1,Math.ceil(L/hop)),regs=dur<90?[[.4,.6]]:[[.15,.3],[.42,.58],[.7,.85]];
 return regs.map(([a,b])=>{const lo=Math.floor(env.length*a),hi=Math.floor(env.length*b)-w;let best=lo,bs=Infinity;
  for(let s=lo;s<=hi;s++){let t=0;for(let k=0;k<w;k++)t+=env[s+k];if(t<bs){bs=t;best=s}}return best*hop})}

function pickPoints(buf,L,m){
 const sr=buf.sampleRate,n=buf.length,last=Math.max(0,n-L);
 if(m==='start')return[0];if(m==='end')return[last];if(m==='both')return[0,last];
 const dur=n/sr,hop=Math.floor(sr*.05),a=buf.getChannelData(0),b=buf.numberOfChannels>1?buf.getChannelData(1):a,env=[];
 const hp=Math.exp(-2*Math.PI*300/sr),lp=Math.exp(-2*Math.PI*3400/sr);
 let l1=0,l2=0,s=0,k=0;
 for(let i=0;i<n;i++){const x=(a[i]+b[i])*.5;l1=(1-hp)*x+hp*l1;l2=(1-lp)*(x-l1)+lp*l2;s+=l2*l2;if(++k===hop){env.push(s/hop);s=0;k=0}}
 const w=Math.max(1,Math.ceil(L/hop)),edge=Math.floor(10/.05);
 if(dur<60||env.length<w+2*edge){ /* música curta: 2 pontos fixos se couberem sem encostar; senão 1 no meio */
  const p1=Math.max(0,Math.min(last,Math.floor(n*.25-L/2))),p2=Math.max(0,Math.min(last,Math.floor(n*.7-L/2)));
  return p2-p1>=L*1.2?[p1,p2]:[Math.max(0,Math.floor(n/2-L/2))]}
 const regs=[[.15,.4],[.55,.85]]; /* 2 vinhetas por música: uma na primeira metade e outra na segunda */
 return regs.map(([x,y])=>{const lo=Math.max(edge,Math.floor(env.length*x)),hi=Math.min(env.length-w-edge,Math.floor(env.length*y)-w);let best=Math.min(lo,hi),bs=Infinity;
  for(let t=lo;t<=hi;t++){let sum=0,mx=0;for(let q=0;q<w;q++){const e=env[t+q];sum+=e;if(e>mx)mx=e}const sc=sum/w+.5*mx;if(sc<bs){bs=sc;best=t}}
  return Math.max(0,best*hop)})}

function mix(buf,v,file){
 const sr=buf.sampleRate,n=buf.length,L=v.length,ch=(b,c)=>b.getChannelData(Math.min(c,b.numberOfChannels-1));
 const out=[new Float32Array(ch(buf,0)),new Float32Array(ch(buf,1))],vc=[ch(v,0),ch(v,1)];
 if($('#norm').checked){let s=0,p=0;const d=out[0];for(let i=0;i<n;i+=4){s+=d[i]*d[i];const a=Math.abs(d[i]);if(a>p)p=a}
  const g=Math.min(.14/(Math.sqrt(s/(n/4))||.1),.98/(p||1));out.forEach(c=>{for(let i=0;i<n;i++)c[i]*=g})}
 const pts=o.pos==='manual'?manPts(file,buf,L):pickPoints(buf,L,o.pos),vg=o.vol/100,fi=o.fi*sr,fo=o.fo*sr;let cl=0;
 /* A vinheta é SOMADA por cima da música. A música não abaixa em nenhum momento. */
 for(const p of pts){for(let k=0;k<L&&p+k<n;k++){let f=1;if(fi&&k<fi)f=k/fi;if(fo&&L-k<fo)f=Math.min(f,(L-k)/fo);const g=f*vg,i=p+k;
   for(let c=0;c<2;c++){out[c][i]+=vc[c][k]*g;if(out[c][i]>.95||out[c][i]<-.95)cl++}}}
 /* Se a soma passar de 0 dB, só o pico é suavizado (limitador). O resto da música fica com o volume original. */
 const TH=.95,R=1-TH;for(const c of out)for(let i=0;i<n;i++){const x=c[i],a=x<0?-x:x;if(a>TH)c[i]=(x<0?-1:1)*(TH+R*Math.tanh((a-TH)/R))}
 return{out,pts,sr,clip:cl/(pts.length*L*2||1)}}

async function encode(out,sr){
 const n=out[0].length,cv=c=>{const a=new Int16Array(n);for(let i=0;i<n;i++){const s=Math.max(-1,Math.min(1,out[c][i]));a[i]=s<0?s*32768:s*32767}return a},l=cv(0),r=cv(1);
 if($('#wav').checked){const b=new ArrayBuffer(44+n*4),dv=new DataView(b),w=(o,s)=>[...s].forEach((c,i)=>dv.setUint8(o+i,c.charCodeAt(0)));
  w(0,'RIFF');dv.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,2,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*4,true);dv.setUint16(32,4,true);dv.setUint16(34,16,true);w(36,'data');dv.setUint32(40,n*4,true);
  for(let i=0;i<n;i++){dv.setInt16(44+i*4,l[i],true);dv.setInt16(46+i*4,r[i],true)}return new Blob([b],{type:'audio/wav'})}
 const enc=new lamejs.Mp3Encoder(2,sr,192),parts=[];
 for(let i=0,k=0;i<n;i+=1152,k++){const a=enc.encodeBuffer(l.subarray(i,i+1152),r.subarray(i,i+1152));if(a.length)parts.push(new Int8Array(a));if(k%300===0)await tick()}
 const e=enc.flush();if(e.length)parts.push(new Int8Array(e));return new Blob(parts,{type:'audio/mpeg'})}

const setPv=t=>{$('#pv').textContent=t;$('#mpv').textContent=t==='Testar vinheta'?'Ouvir com a vinheta':t};
async function preview(f,at){
 if(src){src.stop();src=null;setPv('Testar vinheta');return}
 $('#pvm').textContent='Preparando…';await tick();
 try{const buf=await dec(f),m=mix(buf,vin,f),ab=ac().createBuffer(2,m.out[0].length,m.sr);
  ab.copyToChannel(m.out[0],0);ab.copyToChannel(m.out[1],1);
  await ctx.resume();src=ctx.createBufferSource();src.buffer=ab;src.connect(ctx.destination);
  const t=Math.max(0,(at==null?m.pts[0]/m.sr:at)-6);src.start(0,t,Math.min(20,ab.duration-t));
  src.onended=()=>{src=null;setPv('Testar vinheta')};
  setPv('Parar');$('#pvm').textContent='Tocando o trecho da vinheta em “'+f.name+'”'+(m.clip>.02?'. Atenção: essa música já é muito alta e a soma com a vinheta passou do limite (pico suavizado). Se notar distorção, diminua o volume da vinheta.':'. ✓ música no volume original')}
 catch(e){$('#pvm').textContent='Não consegui processar essa música.'}}
$('#pv').onclick=()=>{const sel=o.pos==='manual'&&ed.f;preview(sel?ed.f:songs[0],sel&&ed.act>=0?mks()[ed.act]:null)};
$('#mpv').onclick=()=>$('#pv').onclick();

/* ===== Posição manual: o cliente marca onde a vinheta entra, música por música ===== */
const MAXV=2,fkey=f=>f.name+'|'+f.size+'|'+f.lastModified,man={},ed={i:-1,f:null,buf:null,dur:0,act:-1,tok:0,sw:0};
const mks=()=>ed.f?(man[fkey(ed.f)]||(man[fkey(ed.f)]=[])):[];
const vinL=()=>vin?vin.duration:0,maxT=()=>Math.max(0,ed.dur-vinL());
const clampT=t=>Math.min(maxT(),Math.max(0,Math.round(t*10)/10));
const fmt=t=>{const d=Math.round(t*10),m=Math.floor(d/600),s=Math.floor((d%600)/10);return m+':'+String(s).padStart(2,'0')+','+(d%10)};
const parseT=v=>{v=String(v).trim().replace(',','.');if(!v)return NaN;const p=v.split(':');if(p.length>2)return NaN;const n=p.map(Number);if(n.some(x=>!isFinite(x)||x<0))return NaN;return p.length===2?n[0]*60+n[1]:n[0]};
function sortKeep(v){const a=mks();a.sort((x,y)=>x-y);ed.act=a.indexOf(v)}
/* pontos (em amostras) usados na mixagem; música sem marca usa o automático; pontos que se sobrepõem são ignorados */
function manPts(f,buf,L){const sr=buf.sampleRate,last=Math.max(0,buf.length-L),a=f?(man[fkey(f)]||[]):[];
 if(!a.length)return pickPoints(buf,L,'auto');
 const gp=Math.floor(o.gap*sr),out=[];
 for(const s of [...a].sort((x,y)=>x-y)){const p=Math.min(last,Math.max(0,Math.round(s*sr)));if(!out.length||p>=out[out.length-1]+L+gp)out.push(p)}
 return out.slice(0,MAXV)}
function manFill(){const s=$('#msong');s.innerHTML='';
 songs.forEach((f,i)=>{const op=document.createElement('option');op.value=i;op.textContent=(i+1)+'. '+f.name;s.appendChild(op)});
 ed.f=null;ed.buf=null;ed.i=-1;ed.dur=0;ed.act=-1;ed.tok++;manShow()}
function manShow(){const on=o.pos==='manual';$('#man').classList.toggle('hide',!on);
 if(!on)return;
 if(!songs.length){$('#mmsg').textContent='Envie as músicas na etapa 1 para marcar os pontos.';return}
 if(ed.i<0)edLoad(0);else{render();manCount()}}
async function edLoad(i){if(!songs[i])return;const tk=++ed.tok;ed.i=i;ed.f=songs[i];ed.buf=null;ed.dur=0;ed.act=-1;$('#msong').value=i;
 $('#mmsg').textContent='Lendo a música…';draw(null);render();
 try{const b=await dec(ed.f);if(tk!==ed.tok)return;ed.buf=b;ed.dur=b.duration;draw(b);render();manCount()}
 catch(e){if(tk===ed.tok)$('#mmsg').textContent='Não consegui ler essa música. Tente outra.'}}
function draw(b){const cv=$('#wcv'),W=cv.width,H=cv.height,g=cv.getContext('2d');g.clearRect(0,0,W,H);if(!b)return;
 const d=b.getChannelData(0),n=d.length;g.fillStyle='#8fe3cc';g.globalAlpha=.85;
 for(let x=0;x<W;x++){const s=Math.floor(x*n/W),e=Math.min(n,Math.floor((x+1)*n/W)),st=Math.max(1,Math.floor((e-s)/48));let mx=0;
  for(let j=s;j<e;j+=st){const a=Math.abs(d[j]);if(a>mx)mx=a}
  const h=Math.max(2,Math.min(1,mx*1.6)*H*.92);g.fillRect(x,(H-h)/2,1,h)}g.globalAlpha=1}
function render(){const wm=$('#wmk'),ls=$('#mlist'),a=mks();wm.innerHTML='';ls.innerHTML='';if(!ed.dur)return;const L=vinL();
 a.forEach((t,i)=>{
  const d=document.createElement('div');d.className='mk'+(i===ed.act?' act':'');d.style.left=(t/ed.dur*100)+'%';d.style.width=(L/ed.dur*100)+'%';
  const nb=document.createElement('b');nb.textContent=i+1;d.appendChild(nb);wm.appendChild(d);
  d.onclick=e=>e.stopPropagation();
  d.onpointerdown=e=>{e.preventDefault();e.stopPropagation();ed.act=i;try{d.setPointerCapture(e.pointerId)}catch(_){}
   const rc=$('#wfx').getBoundingClientRect(),off=e.clientX-d.getBoundingClientRect().left;
   d.onpointermove=ev=>{const v=clampT((ev.clientX-off-rc.left)/rc.width*ed.dur);a[i]=v;d.style.left=(v/ed.dur*100)+'%'};
   d.onpointerup=d.onpointercancel=()=>{d.onpointermove=d.onpointerup=d.onpointercancel=null;ed.sw=Date.now();sortKeep(a[i]);render();manCount()}};
  const r=document.createElement('div');r.className='mli'+(i===ed.act?' act':'');
  const sp=document.createElement('span');sp.textContent='Ponto '+(i+1);
  const inp=document.createElement('input');inp.className='tin';inp.type='text';inp.inputMode='decimal';inp.value=fmt(t);inp.setAttribute('aria-label','Tempo do ponto '+(i+1));
  inp.onchange=()=>{const v=parseT(inp.value);if(isNaN(v)){toast('Tempo inválido. Use o formato 1:05 ou 65.');render();return}const c=clampT(v);a[i]=c;sortKeep(c);render();manCount()};
  const hear=document.createElement('button');hear.type='button';hear.className='btn';hear.textContent='Ouvir';hear.disabled=!(vin&&songs.length);
  hear.onclick=()=>{ed.act=i;render();preview(ed.f,a[i])};
  const del=document.createElement('button');del.type='button';del.className='btn';del.textContent='Remover';
  del.onclick=()=>{a.splice(i,1);ed.act=-1;render();manCount()};
  r.append(sp,inp,hear,del);ls.appendChild(r)})}
function manCount(){const L=vinL(),a=mks(),close=a.some((x,i)=>i&&x-a[i-1]<L+o.gap);let n=0;
 [...$('#msong').options].forEach((op,i)=>{const k=songs[i]&&(man[fkey(songs[i])]||[]).length>0;if(k)n++;op.textContent=(k?'✓ ':'')+(i+1)+'. '+songs[i].name});
 if(songs[ed.i])$('#msong').value=ed.i;
 $('#mmsg').textContent=(close?'Atenção: dois pontos estão mais perto que o tamanho da vinheta; o segundo será ignorado. ':'')+n+' de '+songs.length+' música(s) com ponto marcado. As outras usam o automático.'}
$('#wfx').onclick=e=>{if(!ed.dur||Date.now()-ed.sw<400)return; /* ignora o clique que o navegador dispara ao soltar uma marca */
 const rc=e.currentTarget.getBoundingClientRect(),v=clampT((e.clientX-rc.left)/rc.width*ed.dur),a=mks();
 if(a.length>=MAXV){toast('Máximo de '+MAXV+' vinhetas por música. Remova um ponto para marcar outro.');return}
 if(vin&&a.some(x=>Math.abs(x-v)<vin.duration)){toast('Já existe um ponto aqui perto. Mova o outro ou escolha outro trecho.');return}
 a.push(v);sortKeep(v);render();manCount()};
$('#madd').onclick=()=>{if(!ed.dur)return;const v=parseT($('#mtime').value);if(isNaN(v)){toast('Digite o tempo no formato 1:05 ou 65.');return}
 const c=clampT(v),a=mks();if(a.length>=MAXV){toast('Máximo de '+MAXV+' vinhetas por música. Remova um ponto para marcar outro.');return}if(vin&&a.some(x=>Math.abs(x-c)<vin.duration)){toast('Já existe um ponto aqui perto.');return}
 a.push(c);sortKeep(c);$('#mtime').value='';render();manCount()};
$('#mtime').onkeydown=e=>{if(e.key==='Enter')$('#madd').click()};
$('#mauto').onclick=()=>{if(!ed.buf||!vin){toast('Envie a vinheta e espere a música abrir.');return}
 const a=[...new Set(pickPoints(ed.buf,vin.length,'auto').map(p=>clampT(p/ed.buf.sampleRate)))].sort((x,y)=>x-y).slice(0,MAXV);man[fkey(ed.f)]=a;ed.act=-1;render();manCount()};
$('#mclr').onclick=()=>{if(!ed.f)return;man[fkey(ed.f)]=[];ed.act=-1;render();manCount()};
$('#mcopy').onclick=()=>{const a=mks();if(!a.length){toast('Marque pelo menos um ponto nesta música primeiro.');return}
 songs.forEach(f=>{man[fkey(f)]=[...a]});manCount();toast('Pontos copiados para '+songs.length+' música(s). Em música mais curta o ponto é ajustado para caber.')};
$('#msong').onchange=e=>edLoad(+e.target.value);
$('#mprev').onclick=()=>edLoad(ed.i-1);$('#mnext').onclick=()=>edLoad(ed.i+1);
document.querySelectorAll('#pos button').forEach(b=>b.addEventListener('click',manShow));

$('#go').onclick=async()=>{
 try{await libs()}catch(e){toast('Não consegui carregar os recursos de áudio. Verifique a internet e tente de novo.');return}
 let list=paid?songs:songs.slice(0,FREE),ticket=null;
 if(paid){ /* limite semanal: o servidor reserva as músicas ANTES de processar */
  let g;try{g=await usage('reserve',{count:list.length})}catch(e){toast('Não consegui confirmar seu limite semanal. Verifique a internet e tente de novo.');return}
  setW(g);
  if(!g.granted){toast('Você já usou as '+g.limit+' músicas desta semana. O limite renova segunda-feira às 00:00 (horário de Brasília).');return}
  if(g.granted<list.length)toast('Limite semanal: vão ser processadas as primeiras '+g.granted+' de '+list.length+' músicas.');
  list=list.slice(0,g.granted);ticket=g.ticket||null}
 const zip=new JSZip(),wav=$('#wav').checked;zipBlob=null;
 stop=false;$('#cx').textContent='Cancelar';$('#pb').style.width='0';$('#act').classList.add('hide');$('#rs').classList.add('hide');$('#prc').classList.remove('hide');
 const pl=$('#pl');pl.innerHTML='';const rows=list.map((f,i)=>{const d=document.createElement('div');d.innerHTML='<span></span><em>Na fila</em>';d.firstChild.textContent=(i+1)+'. '+f.name;pl.appendChild(d);return d});
 $('#prc').scrollIntoView({behavior:'smooth',block:'center'});let done=0,fail=0,hot=0;
 for(let i=0;i<list.length;i++){if(stop)break;
  $('#pn').textContent='Música '+(i+1)+' de '+list.length;rows[i].lastChild.textContent='Processando…';await tick();
  try{const buf=await dec(list[i]),m=mix(buf,vin,list[i]),blob=paid?await encode(m.out,m.sr):null;if(m.clip>.02)hot++;
   if(paid){const base=list[i].name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,120),ext=wav?'.wav':'.mp3';let nm=base,q=1;while(zip.file(nm+ext))nm=base+' ('+(++q)+')';zip.file(nm+ext,blob)}rows[i].className='d';rows[i].lastChild.textContent='Concluída';done++}
  catch(e){rows[i].lastChild.textContent='Erro';fail++}
  $('#pb').style.width=Math.round((i+1)/list.length*100)+'%';rows[i].scrollIntoView({block:'nearest'})}
 if(ticket&&list.length>done){try{setW(await usage('settle',{ticket,count:list.length-done}))}catch(e){}} /* devolve ao limite as que não foram processadas */
 if(stop){$('#prc').classList.add('hide');$('#act').classList.remove('hide');toast('Processamento cancelado.');return}
 if(!done){$('#pn').textContent='Nenhuma música foi processada. Confira os arquivos.';$('#act').classList.remove('hide');return}
 if(paid)zipBlob=await zip.generateAsync({type:'blob'});
 $('#prc').classList.add('hide');$('#rs').classList.remove('hide');
 $('#rs h3').textContent=paid?'Pronto! Repertório com vinheta.':'Teste concluído!';$('#dl').textContent=paid?'Baixar ZIP':'Assinar para baixar';$('#rm').textContent=(hot?'Atenção: em '+hot+' música(s) a música original já é muito alta e a soma com a vinheta passou do limite (o pico foi suavizado). Se notar distorção, diminua o volume da vinheta. ':'✓ Música mantida no volume original durante a vinheta. ')+(paid?done+' música(s) prontas'+(fail?', '+fail+' com erro':'')+'. O ZIP tem '+(zipBlob.size/1048576).toFixed(1).replace('.',',')+' MB.':'A vinheta funcionou em '+done+' música(s). No modo teste o download fica bloqueado: assine para baixar o ZIP.');
 $('#rs').scrollIntoView({behavior:'smooth',block:'center'});$('#act').classList.remove('hide')};

$('#dl').onclick=async()=>{if(!paid){$('#planos').scrollIntoView({behavior:'smooth'});return}if(!zipBlob)return;const name='repertorio-com-vinheta.zip';
 try{const d=await claude.use('downloads');
  if(d){await d.save({filename:name,data:zipBlob});$('#dlm').textContent='';return}}
 catch(e){if(e&&e.code==='declined')return}
 const a=document.createElement('a');a.href=URL.createObjectURL(zipBlob);a.download=name;a.click();$('#dlm').textContent='Se o download não começou, abra a página direto no navegador.'};

$('#cx').onclick=()=>{stop=true;$('#cx').textContent='Cancelando…'};
/* ===== Pagamento Pix ===== */
let pay={plan:null,order:null,timer:null,until:0};
let tsId=null,tsReady=null;
function tsLoad(){if(!CONFIG.turnstile)return Promise.resolve();if(tsReady)return tsReady;
 tsReady=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=ok;s.onerror=no;document.head.appendChild(s)}).then(()=>{tsId=window.turnstile.render('#pts',{sitekey:CONFIG.turnstile,theme:'dark'})}).catch(()=>{tsReady=null});return tsReady}
function tsToken(){return(CONFIG.turnstile&&window.turnstile&&tsId!==null)?window.turnstile.getResponse(tsId):''}
function tsReset(){if(CONFIG.turnstile&&window.turnstile&&tsId!==null)window.turnstile.reset(tsId)}
const pm=$('#pmod'),pEl=id=>$('#'+id);
function pClose(){clearInterval(pay.timer);pay.timer=null;pm.classList.add('hide');document.body.style.overflow=''}
function pStep(n){['p1','p2','p3'].forEach((id,i)=>pEl(id).classList.toggle('hide',i+1!==n))}
document.querySelectorAll('[data-plan]').forEach(a=>a.onclick=e=>{e.preventDefault();pay.plan=a.dataset.id;
 pEl('pt').textContent='Plano '+a.dataset.plan+': '+PRICES[pay.plan];pEl('pe').textContent='';pStep(1);pm.classList.remove('hide');document.body.style.overflow='hidden';pEl('pname').focus();tsLoad()});
$('#px').onclick=pClose;pm.addEventListener('click',e=>{if(e.target===pm)pClose()});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!pm.classList.contains('hide'))pClose()});
$('#pgo').onclick=async()=>{const email=pEl('pmail').value.trim(),err=pEl('pe');err.textContent='';
 const name=pEl('pname').value.trim().replace(/\s+/g,' '),phone=pEl('pphone').value.trim();
 if(name.length<2){err.textContent='Digite seu nome.';return}
 if(!/^\S+@\S+\.\S{2,}$/.test(email)){err.textContent='Digite um e-mail válido.';return}
 const ts=tsToken();if(CONFIG.turnstile&&!ts){err.textContent='Confirme que você não é um robô.';return}
 const b=$('#pgo');b.disabled=true;b.textContent='Gerando Pix…';
 try{const r=await fetch(CONFIG.api+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:pay.plan,email,name,phone,ts,website:pEl('pweb').value})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||'Erro ao gerar o Pix.');
  pay.order=j.orderId;pay.until=Date.now()+j.expiresInMin*60000;
  pEl('pqr').src=j.qrImage;pEl('pcode').value=j.qr;pEl('pamt').textContent=PRICES[pay.plan];pStep(2);
  try{sessionStorage.setItem('ms_order',pay.order)}catch(_){}
  pPoll()}
 catch(x){const net=x instanceof TypeError;
  if(net)console.error('Falha de rede ao chamar '+CONFIG.api+'/api/checkout. Confira se o site foi publicado pelo Git/CLI (arrastar a pasta nao publica as funcoes) e abra /health no seu site.',x);
  err.textContent=net?'Não consegui falar com o servidor de pagamentos. Tente de novo em instantes.':(x.message||'Erro ao gerar o Pix.')}
 tsReset();b.disabled=false;b.textContent='Gerar Pix'};
$('#pcp').onclick=async()=>{const c=pEl('pcode');try{await navigator.clipboard.writeText(c.value)}catch(_){c.select();document.execCommand('copy')}toast('Código Pix copiado. Cole no app do seu banco.')};
function pPoll(){clearInterval(pay.timer);let busy=false;
 pay.timer=setInterval(async()=>{if(busy)return;busy=true;
  try{const r=await fetch(CONFIG.api+'/api/order/'+pay.order,{cache:'no-store'}),j=await r.json();
   if(j.status==='approved'&&j.key){clearInterval(pay.timer);pEl('pkey').textContent=j.key;pStep(3);
    try{if(await checkKey(j.key))setPaid(j.key,1)}catch(e){toast('Pagamento aprovado, mas esta chave já atingiu o limite de aparelhos.')}}
   else if(['cancelled','rejected','expired','flagged'].includes(j.status)){clearInterval(pay.timer);pEl('pe').textContent='';pStep(1);pEl('pe').textContent='Esse Pix não foi concluído. Gere outro.'}
   else if(Date.now()>pay.until+60000){clearInterval(pay.timer);pStep(1);pEl('pe').textContent='O Pix expirou. Gere um novo.'}}
  catch(_){}
  busy=false},3000)}
$('#pck').onclick=async()=>{try{await navigator.clipboard.writeText(pEl('pkey').textContent);toast('Chave copiada. Guarde em local seguro.')}catch(_){}};
$('#pdone').onclick=pClose;
function setPaid(k,q){paid=true;KEY=k.trim().toUpperCase();try{localStorage.setItem('ms_lic',JSON.stringify({key:k}))}catch(e){}$('#lic').textContent='Assinatura ativa ✓ (trocar chave)';upd();if(!q)toast('Assinatura ativada. Download liberado!')}
$('#lic').onclick=e=>{e.preventDefault();$('#licbox').classList.toggle('hide')};
$('#lic2').onclick=e=>{e.preventDefault();$('#licbox').classList.remove('hide');$('#planos').scrollIntoView({behavior:'smooth'});$('#lk').focus()};
$('#lkb').onclick=async()=>{const k=$('#lk').value.trim();$('#lkm').textContent='Verificando…';try{if(await checkKey(k)){setPaid(k);$('#lkm').textContent='';$('#licbox').classList.add('hide')}else $('#lkm').textContent='Chave inválida. Confira e tente de novo.'}catch(e){$('#lkm').textContent=e&&e.message==='device-limit'?'Essa chave já está em 2 aparelhos. Fale com o suporte para liberar outro.':'Não consegui verificar agora. Tente de novo em instantes.'}};
(async()=>{let v=null;try{v=JSON.parse(localStorage.getItem('ms_lic')||'null')}catch(e){}
 if(v&&v.key){let ok;try{ok=await checkKey(v.key)}catch(e){ok=true}if(ok)setPaid(v.key,1);else try{localStorage.removeItem('ms_lic')}catch(e){}}upd()})();
