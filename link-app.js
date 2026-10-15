'use strict';
const client=JennySupabaseTransport.create({url:'https://scjaevrihhtzaijwnpnw.supabase.co',publishableKey:'sb_publishable_0Z5niNlJ2jlMM567vvExeA_bvbDPl62'});
const $=id=>document.getElementById(id),form=$('login'),status=$('status');
let remote,store,coordinator,candidate,busy=false;
const validate=JennySyncValidate.validate;
function setBusy(value){busy=value;document.querySelectorAll('button,input').forEach(el=>el.disabled=value)}
function describe(s){return `${s.cats.length} categorías · ${s.movements.length} movimientos · ${s.services.length} servicios · ${s.debts.length} préstamos/deudas`}
function showLinked(){ $('open-pc').hidden=false; $('import-panel').hidden=true;$('sync').hidden=false;$('download').hidden=false;candidate=null;$('backup').value=''; }
async function localRecord(){try{return await store.read()}catch(e){if(e.message==='El dispositivo todavía no está vinculado.')return null;throw e}}
async function sync(){
 const result=await coordinator.sync();
 const messages={synced:'Copia sincronizada con tu espacio privado.',offline:'Sin conexión. Tus datos y los envíos pendientes están guardados; podés reintentar.', 'auth-required':'La sesión venció. Cerrá esta conexión e ingresá de nuevo.',conflict:'Hay cambios incompatibles entre dispositivos. Conservamos ambas versiones; no se reemplazó tu copia local.', 'link-required':'Ya existen datos en la nube. Este dispositivo requiere revisar el enlace antes de enviar.', 'server-reset':'El espacio remoto cambió inesperadamente. Detuvimos el envío para proteger tus datos.',forbidden:'No tenés permiso para esta operación.', 'invalid-request':'El servidor rechazó los datos. Tu copia local sigue guardada.', 'invalid-response':'La respuesta del servidor no es válida. Tu copia local sigue guardada.', 'server-error':'El servidor no está disponible. Podés reintentar.', 'rate-limit':'Esperá unos minutos antes de reintentar.',retry:'Hay cambios en curso. Volvé a sincronizar.'};
 status.textContent=messages[result.status]||'No se pudo completar la sincronización.';
 const record=await store.read();$('counts').textContent=describe(record.local);
 return result;
}
form.addEventListener('submit',async e=>{
 e.preventDefault();setBusy(true);status.textContent='Comprobando conexión…';
 try{
  remote=await client.signIn($('email').value,$('password').value);$('password').value='';
  store=await JennySyncStore.open({project:'scjaevrihhtzaijwnpnw',userId:remote.userId});
  coordinator=JennySyncSession.create({store,remote,newId:()=>crypto.randomUUID(),validate});
  const record=await localRecord(),cloud=await remote.read();
  if(cloud.state!==null)validate(cloud.state);
  if(record){validate(record.local);showLinked();status.textContent='Conectado. Tu copia local está disponible. La sincronización es automática.';$('counts').textContent=describe(record.local)}
  else if(cloud.state!==null){await store.initialize(cloud.state,{revision:cloud.revision,state:JennySyncCore.project(cloud.state)});showLinked();status.textContent='Conectado. Se descargó tu copia privada en este navegador.';$('counts').textContent=describe(cloud.state)}
  else{$('import-panel').hidden=false;status.textContent='Conexión correcta. Tu espacio está vacío: elegí un respaldo para el primer enlace.'}
  form.hidden=true;$('link').hidden=false;$('disconnect').hidden=false;
  if(record||cloud.state!==null)await pcOpen();
 }catch(e){client.clearSession();store?.close();store=null;status.textContent=e.message;$('password').value=''}finally{setBusy(false)}
});
$('backup').addEventListener('change',async()=>{
 candidate=null;$('upload').hidden=true;$('preview').textContent='';const file=$('backup').files[0];if(!file)return;
 setBusy(true);
 try{if(file.size>20*1024*1024)throw Error('El respaldo supera los 20 MB.');const parsed=JSON.parse(await file.text());validate(parsed);candidate=JennySyncCore.project(parsed);$('preview').textContent=describe(candidate);$('upload').hidden=false}
 catch(e){$('preview').textContent='No se pudo abrir el respaldo: '+e.message}finally{setBusy(false)}
});
$('upload').onclick=async()=>{
 if(busy||!candidate)return;setBusy(true);
 try{
  const cloud=await remote.read();if(cloud.state!==null)throw Error('El espacio ya tiene datos. Cerrá esta conexión e ingresá otra vez para descargarlos; no se reemplazaron.');
  const initialized=await store.initialize(candidate);if(!initialized)throw Error('Ya hay una copia local vinculada. Volvé a iniciar sesión para revisarla.');
  showLinked();await sync();await pcOpen();
 }catch(e){status.textContent=e.message}finally{setBusy(false)}
};
$('sync').onclick=async()=>{if(busy)return;setBusy(true);try{await sync()}catch(e){status.textContent=e.message}finally{setBusy(false)}};
$('download').onclick=async()=>{try{const record=await store.read(),blob=new Blob([JSON.stringify(record.local)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Jenny-copia-vinculada.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){status.textContent=e.message}};
$('disconnect').onclick=()=>{pcVisible=false;pcState=null;document.body.classList.remove('pc-mode');$('pc-panel').hidden=true;$('pc-panel').innerHTML='';$('open-pc').hidden=true;client.clearSession();store?.close();store=null;remote=null;candidate=null;form.reset();form.hidden=false;$('link').hidden=true;$('disconnect').hidden=true;$('upload').hidden=true;$('sync').hidden=true;$('download').hidden=true;$('preview').textContent='';$('counts').textContent='';status.textContent='Conexión cerrada. Los datos locales se conservan para este usuario.'};
window.addEventListener('pagehide',()=>{client.clearSession();store?.close()});
