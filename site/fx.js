(()=>{const $=s=>document.querySelector(s),R=(a,b)=>a+Math.random()*(b-a),M=matchMedia('(prefers-reduced-motion:reduce)').matches;
function box(w,h,d,c,y){const e=document.createElement('div');e.className='bx '+c;e.style.cssText='width:'+w+'px;height:'+h+'px;left:'+-w/2+'px;top:'+(y-h/2)+'px';
 [['f','translateZ('+d/2+'px)',w,h],['k','rotateY(180deg) translateZ('+d/2+'px)',w,h],['r','rotateY(90deg) translateZ('+w/2+'px)',d,h],['l','rotateY(-90deg) translateZ('+w/2+'px)',d,h],['t','rotateX(90deg) translateZ('+h/2+'px)',w,d],['u','rotateX(-90deg) translateZ('+h/2+'px)',w,d]].forEach(([k,tr,fw,fh])=>{const f=document.createElement('div');f.className=k;f.style.cssText='width:'+fw+'px;height:'+fh+'px;left:'+(w-fw)/2+'px;top:'+(h-fh)/2+'px;transform:'+tr;e.appendChild(f)});return e}
const stk=$('#stk'),bd=box(128,208,38,'bd',0),cn=box(70,80,16,'cn',-138);bd.querySelector('.f').innerHTML='MarcaSom<i></i>';stk.append(cn,bd);
const ring=$('#ring');for(let i=0;i<72;i++){const b=document.createElement('b');b.style.setProperty('--i',i);b.innerHTML='<i style="--h:'+R(.15,1).toFixed(2)+';--d:'+(i*-.09).toFixed(2)+'s"></i>';ring.appendChild(b)}
document.querySelectorAll('.wf').forEach(x=>{let h='';for(let i=0;i<70;i++)h+='<i style="height:'+Math.round(R(18,100))+'%"></i>';x.insertAdjacentHTML('afterbegin',h)});
function cnt(el){const n=+el.dataset.n,s=el.dataset.s||'',t0=performance.now();(function f(t){const p=Math.min(1,(t-t0)/1400);el.textContent=Math.round(n*(1-Math.pow(1-p,3)))+s;if(p<1)requestAnimationFrame(f)})(t0)}
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);if(e.target.dataset.n)cnt(e.target)}}),{threshold:.15});
document.querySelectorAll('.rv,#pcw,[data-n]').forEach(e=>io.observe(e));
new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){libs().catch(()=>{})}}),{rootMargin:'500px'}).observe($('#ferramenta'));
$('#logo').addEventListener('click',e=>{if(location.pathname==='/'||location.pathname.endsWith('index.html')){e.preventDefault();scrollTo({top:0,behavior:M?'auto':'smooth'})}});
if(!M)document.querySelectorAll('.feat .card,.plan').forEach(c=>{c.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform='perspective(800px) rotateX('+-y*9+'deg) rotateY('+x*11+'deg) translateY(-4px)'});c.addEventListener('pointerleave',()=>{c.style.transform=''})});
/* palco 3D: o pendrive muda de pose conforme a seção na tela */
const P=[['topo'],['como'],['ferramenta'],['planos']].map(a=>$('#'+a[0])),st=$('#stage'),po=$('#pose'),rg=$('#rig');let mx=0,my=0,pend=0;
const D=[[.25,0,1.3,-24,8,1],[.3,.05,.8,30,4,.55],[.32,0,.6,70,0,.1],[0,.02,1,180,6,.6]],Mo=[[0,-.2,.8,-24,8,1],[0,-.28,.5,30,4,.35],[0,-.3,.4,70,0,.08],[0,-.18,.65,180,6,.5]];
function draw(){pend=0;const W=innerWidth,H=innerHeight,k=W>820?D:Mo,y=scrollY+H*.45,t=P.map(e=>e.offsetTop);let i=0;while(i<3&&y>=t[i+1])i++;
 const n=Math.min(3,i+1),u=n===i?0:Math.min(1,Math.max(0,(y-t[i])/(t[n]-t[i]))),e=u*u*(3-2*u),A=k[i],B=k[n],l=j=>A[j]+(B[j]-A[j])*e,o=l(5);
 po.style.cssText='--x:'+l(0)*W+'px;--y:'+l(1)*H+'px;--s:'+l(2)*Math.min(1,W/900+.3)+';--o:'+o.toFixed(3);
 rg.style.cssText='--rx:'+(l(4)-my*10)+'deg;--ry:'+(l(3)+mx*22+scrollY*.04)+'deg';ring.style.setProperty('--rr',scrollY*-.06+'deg');st.classList.toggle('off',o<.05)}
const req=()=>{if(!pend){pend=1;requestAnimationFrame(draw)}};
addEventListener('scroll',req,{passive:true});addEventListener('resize',req);
if(!M)addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5;req()},{passive:true});
$('#topo').addEventListener('pointerdown',e=>{if(e.target.closest('a,button'))return;const r=stk.getBoundingClientRect(),c=Math.hypot(e.clientX-(r.left+r.width/2),e.clientY-(r.top+r.height/2));if(c<Math.max(r.width,r.height)*.6&&!M){ring.classList.remove('hit');void ring.offsetWidth;ring.classList.add('hit')}});
draw()})();
