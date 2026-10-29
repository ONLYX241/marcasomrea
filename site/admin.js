const $=s=>document.querySelector(s);
let DATA=null,ORDERS=null,MAXDEV=2;
const PLAN={admin:'Administrador',mensal:'Mensal',trimestral:'Trimestral',vitalicio:'Vitalício'};
const dt=ms=>ms?new Date(ms).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'sem dado';
const dd=ms=>ms?new Date(ms).toLocaleDateString('pt-BR'):'sem dado';
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.remove('hide');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hide'),3500)};
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};

async function api(path,method,body){
 const r=await fetch(path,{method:method||'GET',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:body?JSON.stringify(body):undefined,cache:'no-store'});
 if(r.status===401){const e=new Error('401');e.code=401;throw e}
 if(r.status===429){const e=new Error('Muitas tentativas. Espere um minuto.');e.code=429;throw e}
 if(!r.ok)throw new Error('Erro '+r.status);
 return r.json()}

function status(p){if(p.revoked)return['Revogada','bad'];if(p.expires_at&&p.expires_at<Date.now())return['Expirada','warn'];return[p.expires_at?'Ativa':'Ativa, vitalício','ok']}
const digits=s=>String(s||'').replace(/\D/g,'');
function waLink(phone){let d=digits(phone);if(!d)return null;if(!String(phone).trim().startsWith('+')&&d.length<=11)d='55'+d;return 'https://wa.me/'+d}

async function load(){
 DATA=await api('/api/admin/customers');MAXDEV=DATA.maxDevices||2;ORDERS=null;
 $('#login').classList.add('hide');$('#app').classList.remove('hide');draw()}

function draw(){
 const q=$('#q').value.trim().toLowerCase(),all=DATA.customers;
 const list=all.filter(c=>!q||(c.name+' '+c.email+' '+c.phone).toLowerCase().includes(q));
 const act=all.reduce((n,c)=>n+c.purchases.filter(p=>status(p)[1]==='ok').length,0);
 const st=$('#stats');st.innerHTML='';
 [[all.length,'clientes'],[act,'assinaturas ativas'],[all.reduce((n,c)=>n+c.purchases.length,0),'compras no total']].forEach(([n,l])=>{const d=el('div','card');d.append(el('b','',n),el('span','',l));st.appendChild(d)});
 const v=$('#v1');v.innerHTML='';
 if(!list.length){v.appendChild(el('div','empty',all.length?'Ninguém encontrado nessa busca.':'Ainda não há compras aprovadas.'));return}
 list.forEach(c=>{
  const card=el('div','card cu'),top=el('div','ct'),l=el('div');
  l.append(el('h2','',c.name||'(sem nome, compra antiga)'),el('div','em',c.email));
  const w=waLink(c.phone);
  if(c.phone){const p=el('div','em',c.phone+' ');if(w){const a=el('a','','Chamar no WhatsApp');a.href=w;a.target='_blank';a.rel='noopener noreferrer';p.appendChild(a)}l.appendChild(p)}
  const ac=el('div','ac'),b0=el('button','btn','Zerar limite da semana'),b1=el('button','btn','Zerar aparelhos'),b2=el('button','btn dng','Revogar chaves');
  b0.type=b1.type=b2.type='button';
  b0.onclick=()=>act1('reset-week',c,'Devolver as músicas desta semana de '+c.email+'? O contador volta para zero.');
  b1.onclick=()=>act1('reset-devices',c,'Zerar os aparelhos de '+c.email+'? Ele poderá entrar em novos aparelhos.');
  b2.onclick=()=>act1('revoke',c,'Revogar TODAS as chaves de '+c.email+'? Use em caso de reembolso. Não dá para desfazer por aqui.');
  ac.append(b0,b1,b2);top.append(l,ac);card.appendChild(top);
  c.purchases.slice().reverse().forEach(p=>{
   const [txt,cls]=status(p),row=el('div','pu');
   const a=el('div');a.append(el('b','',PLAN[p.plan]||p.plan),el('small','','Comprou em '+dt(p.created_at)));
   const b=el('div');b.append(el('span','tg '+cls,txt),el('small','',p.expires_at?'Vence em '+dd(p.expires_at):'Sem vencimento'),el('small','',p.week?'Esta semana: '+p.week.used+' de '+p.week.limit+' músicas':'Sem limite semanal'));
   const cc=el('div');cc.append(el('b','',p.devices+' de '+(p.max||MAXDEV)),el('small','','aparelhos em uso'));
   const d=el('div');d.append(el('b','',p.hint?'…'+p.hint:'sem dado'),el('small','','final da chave'));
   row.append(a,b,cc,d);card.appendChild(row)});
  v.appendChild(card)})}

async function act1(kind,c,msg){
 if(!confirm(msg))return;
 try{const r=await api('/api/admin/'+kind,'POST',{email:c.email});
  toast(kind==='revoke'?r.revoked+' chave(s) revogada(s).':kind==='reset-week'?'Limite da semana zerado.':r.cleared+' aparelho(s) liberado(s).');await load()}
 catch(e){toast(e.message||'Não consegui concluir.')}}

async function showOrders(){
 const v=$('#v2');v.innerHTML='';v.appendChild(el('div','empty','Carregando…'));
 try{ORDERS=ORDERS||await api('/api/admin/orders')}catch(e){v.innerHTML='';v.appendChild(el('div','empty',e.message));return}
 const q=$('#q').value.trim().toLowerCase(),rows=ORDERS.filter(o=>!q||((o.name||'')+' '+o.email+' '+(o.phone||'')).toLowerCase().includes(q));
 v.innerHTML='';if(!rows.length){v.appendChild(el('div','empty','Nenhum pedido.'));return}
 const ST={approved:['Pago','ok'],pending:['Aguardando Pix','mu'],expired:['Expirado','warn'],flagged:['Suspeito (não liberado)','bad'],refunded:['Reembolsado','bad']};
 const t=el('table','ord'),h=el('tr');['Data','Cliente','Plano','Valor','Situação'].forEach(x=>h.appendChild(el('th','',x)));t.appendChild(h);
 rows.forEach(o=>{const r=el('tr'),s=ST[o.status]||[o.status,'mu'];
  const c=el('td');c.append(el('b','',o.name||'(sem nome)'),el('div','',o.email));if(o.phone)c.appendChild(el('div','',o.phone));
  const sd=el('td');sd.appendChild(el('span','tg '+s[1],s[0]));
  r.append(el('td','',dt(o.created_at)),c,el('td','',PLAN[o.plan]||o.plan),el('td','','R$ '+Number(o.amount).toFixed(2).replace('.',',')),sd);t.appendChild(r)});
 v.appendChild(t)}

function tab(n){$('#t1').setAttribute('aria-pressed',n===1);$('#t2').setAttribute('aria-pressed',n===2);$('#v1').classList.toggle('hide',n!==1);$('#v2').classList.toggle('hide',n!==2);if(n===2)showOrders();else if(DATA)draw()}
$('#t1').onclick=()=>tab(1);$('#t2').onclick=()=>tab(2);
$('#q').oninput=()=>{if(!$('#v2').classList.contains('hide'))showOrders();else if(DATA)draw()};
$('#reload').onclick=async()=>{try{await load();toast('Atualizado.')}catch(e){toast(e.message)}};

/* CSV com ; (Excel em português). Células que começam com = + - @ ganham um apóstrofo para não virarem fórmula. */
const cell=v=>{v=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
$('#csv').onclick=()=>{if(!DATA)return;
 const rows=[['Nome','E-mail','WhatsApp','Plano','Comprou em','Vence em','Situação','Aparelhos em uso','Final da chave']];
 DATA.customers.forEach(c=>c.purchases.forEach(p=>rows.push([c.name,c.email,c.phone,PLAN[p.plan]||p.plan,dt(p.created_at),p.expires_at?dd(p.expires_at):'sem vencimento',status(p)[0],p.devices,p.hint?'…'+p.hint:''])));
 const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='clientes-marcasom.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)};

$('#ggo').onclick=async()=>{const b=$('#ggo'),err=$('#gerr');err.textContent='';
 const email=$('#gmail').value.trim();if(!/^\S+@\S+\.\S{2,}$/.test(email)){err.textContent='Digite um e-mail válido.';return}
 b.disabled=true;b.textContent='Gerando…';
 try{const r=await api('/api/admin/grant','POST',{name:$('#gname').value.trim(),email,plan:$('#gplan').value});
  $('#gkey').textContent=r.key;$('#gres').classList.remove('hide');$('#gname').value='';$('#gmail').value='';await load();toast('Chave gerada.')}
 catch(e){err.textContent=e.message||'Não consegui gerar.'}
 b.disabled=false;b.textContent='Gerar chave'};
$('#gcp').onclick=async()=>{try{await navigator.clipboard.writeText($('#gkey').textContent);toast('Chave copiada.')}catch(e){toast('Selecione a chave e copie.')}};
async function logout(){try{await fetch('/api/admin/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'})}catch(e){}DATA=null;ORDERS=null;$('#app').classList.add('hide');$('#login').classList.remove('hide');$('#tok').value=''}
$('#out').onclick=logout;
async function enter(){const tk=$('#tok').value.trim();$('#lerr').textContent='';if(!tk){$('#lerr').textContent='Digite o token.';return}
 const b=$('#enter');b.disabled=true;b.textContent='Entrando…';
 try{const r=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:tk})});
  if(r.status===401)throw new Error('Token incorreto.');
  if(r.status===429)throw new Error('Muitas tentativas. Tente de novo em 15 minutos.');
  if(!r.ok)throw new Error('Não consegui entrar.');
  $('#tok').value='';await load()}
 catch(e){$('#lerr').textContent=e.message||'Não consegui entrar.'}
 b.disabled=false;b.textContent='Entrar'}
$('#enter').onclick=enter;$('#tok').onkeydown=e=>{if(e.key==='Enter')enter()};
load().catch(()=>{});
