/* Shared REST transport. Sessions stay in memory in this connection-test phase.
 * The caller must scope its local store to remote.userId before syncing.
 */
(function(root){
 'use strict';
 function create({url,publishableKey,fetch:send=root.fetch.bind(root),onSession=()=>{}}){
  const origin=new URL(url);
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Invalid Supabase URL');
  if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))throw Error('A publishable key is required');
  let session=null,generation=0,refreshing=null;
  function error(code,message){const e=new Error(message);e.code=code;return e}
  async function request(path,body,token){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
   try{
    let res;
    try{res=await send(origin.origin+path,{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'})}
    catch{throw error('offline','No se pudo conectar. Revisá tu conexión e intentá de nuevo.')}
    if(!res.ok){
     if(res.status===401||res.status===400&&path.startsWith('/auth/'))throw error('auth-required','Revisá el correo y la contraseña o volvé a iniciar sesión.');
     if(res.status===403)throw error('forbidden','El usuario no tiene permiso para esta operación.');
     if(res.status===429)throw error('rate-limit','Hubo muchos intentos. Esperá unos minutos.');
     throw error(res.status>=500?'server-error':'invalid-request','No se pudo completar la operación. Código '+res.status+'.');
    }
    try{return await res.json()}catch{throw error('invalid-response','El servidor devolvió una respuesta inesperada.')}
   }finally{clearTimeout(timer)}
  }
  function boundRemote(s,epoch){
   const check=()=>{if(generation!==epoch||session!==s)throw error('auth-required','La sesión cambió. Volvé a conectar.')};
   async function renew(){
    check();if(Date.now()<s.expiresAt-30000)return;
    if(!s.refresh)throw error('auth-required','La sesión venció. Volvé a iniciar sesión.');
    if(!refreshing){const pending=(async()=>{const r=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh});check();const next=parse(r);if(next.userId!==s.userId)throw error('auth-required','La cuenta cambió.');Object.assign(s,next);onSession({userId:s.userId,refreshToken:s.refresh});})();refreshing=pending;try{await pending}finally{if(refreshing===pending)refreshing=null}}
    else await refreshing;
    check();
   }
   async function rpc(name,body){await renew();check();const result=await request('/rest/v1/rpc/'+name,body,s.token);check();return result}
   return {userId:s.userId,async read(){const r=await rpc('jenny_get_state',{});if(!r||!Number.isSafeInteger(r.revision)||r.revision<0||!(r.state===null||typeof r.state==='object'&&!Array.isArray(r.state)))throw error('invalid-response','Estado remoto inválido.');return r},async commit(q){return rpc('jenny_commit_state',{p_operation_id:q.operationId,p_expected_revision:q.revision,p_state:q.state})}};
  }
  function parse(r){if(!r?.user?.id||typeof r.access_token!=='string'||!Number.isFinite(r.expires_in)||r.expires_in<=0)throw error('invalid-response','Sesión inválida.');return {userId:r.user.id,token:r.access_token,refresh:r.refresh_token||null,expiresAt:Date.now()+r.expires_in*1000}}
  return {
   async signIn(email,password){
    const epoch=++generation;session=null;refreshing=null;
    const r=await request('/auth/v1/token?grant_type=password',{email:email.trim(),password});
    if(epoch!==generation)throw error('auth-required','El inicio de sesión fue cancelado.');
    session=parse(r);onSession({userId:session.userId,refreshToken:session.refresh});
    return boundRemote(session,epoch);
   },
   async restore({userId,refreshToken}){
    const epoch=++generation;session=null;refreshing=null;
    const r=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:refreshToken});
    if(epoch!==generation)throw error('auth-required','El inicio de sesión fue cancelado.');
    const next=parse(r);if(next.userId!==userId)throw error('auth-required','La cuenta no coincide.');
    session=next;onSession({userId:session.userId,refreshToken:session.refresh});return boundRemote(session,epoch);
   },
   // No credentials are persisted; discard even when the connection is offline.
   clearSession(){generation++;session=null;refreshing=null}
  };
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JennySupabaseTransport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
