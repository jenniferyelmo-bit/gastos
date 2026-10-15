/* Transport-neutral sync coordinator. Not connected to the shipping app yet.
 * Store contract: read() -> {version,local,base,pending};
 * compareAndSet(version,bundle) atomically persists the complete bundle.
 * Remote contract: read() -> {revision,state}; commit({operationId,revision,state})
 * -> {ok:true,revision,state} or {ok:false,conflict:true}.
 * The server MUST durably deduplicate operationId and return its original receipt.
 */
(function(root){
 'use strict';
 const core=typeof module!=='undefined'&&module.exports?require('./sync-core.js'):root.JennySyncCore;
 function create({store,remote,newId,validate}){
  let running=null;
  const remoteFailure=e=>({status:['auth-required','forbidden','rate-limit','server-error','invalid-request','invalid-response'].includes(e?.code)?e.code:'offline'});
  const checked=state=>{validate(state);return core.project(state)};
  async function save(record,changes){return store.compareAndSet(record.version,{local:record.local,base:record.base,pending:record.pending,...changes})}
  async function run(){
   for(let attempt=0;attempt<8;attempt++){
    const record=await store.read();const local=checked(record.local);
    // Complete an interrupted push before starting another. No new operation ID.
    if(record.pending){
     const pending=record.pending;let reply;
     try{reply=await remote.commit(pending.request)}catch(e){return remoteFailure(e)}
     if(reply.conflict){if(!await save(record,{pending:null}))continue;continue}
     if(!reply.ok||!Number.isSafeInteger(reply.revision))throw Error('Invalid server receipt');
     const accepted=checked(reply.state);
     const merged=core.merge(pending.localAtSend,local,accepted);
     if(!merged.ok)return {status:'conflict',conflicts:merged.conflicts};
     checked(merged.state);
     // Preserve unsynced local edits made while the upload was in flight.
     if(!await save(record,{local:{...record.local,...merged.state},base:{revision:reply.revision,state:accepted},pending:null}))continue;
     continue;
    }
    let cloud;try{cloud=await remote.read()}catch(e){return remoteFailure(e)}
    if(!Number.isSafeInteger(cloud.revision)||cloud.revision<0)throw Error('Invalid revision');
    if(cloud.state===null){
     // Never silently recreate a lost/reset server after this device was linked.
     if(record.base)return {status:'server-reset'};
     const request={operationId:newId(),revision:cloud.revision,state:local};
     if(!await save(record,{pending:{request,localAtSend:local}}))continue;
     continue;
    }
    const remoteState=checked(cloud.state);
    if(!record.base)return {status:'link-required'};
    if(cloud.revision<record.base.revision)return {status:'server-reset'};
    const result=core.merge(record.base.state,local,remoteState);
    if(!result.ok)return {status:'conflict',conflicts:result.conflicts};
    checked(result.state);
    if(core.equal(result.state,remoteState)){
     if(!await save(record,{local:{...record.local,...result.state},base:{revision:cloud.revision,state:remoteState}}))continue;
     return {status:'synced',revision:cloud.revision};
    }
    const request={operationId:newId(),revision:cloud.revision,state:result.state};
    // Journal before sending: process termination cannot turn retries into duplicates.
    if(!await save(record,{pending:{request,localAtSend:local}}))continue;
   }
   return {status:'retry'};
  }
  return {sync(){if(!running)running=run().finally(()=>{running=null});return running}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JennySyncSession=api;
})(typeof globalThis!=='undefined'?globalThis:this);
