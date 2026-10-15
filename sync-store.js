/* Atomic IndexedDB journal, partitioned by project and authenticated user.
 * No tokens here. Every writer (UI edits included) must use this store.
 */
(function(root){
 'use strict';
 async function open({project,userId,indexedDB=root.indexedDB,name='jenny-sync-v1'}){
  if(!/^[a-z0-9-]+$/i.test(project)||! /^[a-z0-9-]+$/i.test(userId))throw Error('Invalid store identity');
  const key=project+':'+userId;
  const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('bundles');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Cerrá otras pestañas de Jenny y volvé a intentar.'))});
  db.onversionchange=()=>db.close();
  const clone=x=>structuredClone(x);
  function transact(mode,operation){return new Promise((resolve,reject)=>{
   const tx=db.transaction('bundles',mode),table=tx.objectStore('bundles');let value,failed;
   tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failed||tx.error||Error('No se pudo guardar'));tx.onerror=()=>{};
   const get=table.get(key);get.onsuccess=()=>{try{value=operation(get.result,table)}catch(e){failed=e;tx.abort()}};
  })}
  return {
   identity:key,
   read(){return transact('readonly',row=>{if(!row)throw Error('El dispositivo todavía no está vinculado.');return row})},
   initialize(local,base=null){const initial=clone({version:0,local,base,pending:null});return transact('readwrite',(row,table)=>{if(row)return false;table.put(initial,key);return true})},
   compareAndSet(version,bundle){const copy=clone(bundle);return transact('readwrite',(row,table)=>{if(!row||row.version!==version)return false;if(!Number.isSafeInteger(version+1))throw Error('Invalid local revision');table.put({...copy,version:version+1},key);return true})},
   async edit(mutator){for(let i=0;i<10;i++){const record=await this.read(),local=clone(record.local);mutator(local);if(await this.compareAndSet(record.version,{local,base:record.base,pending:record.pending}))return local}throw Error('Otra pestaña está editando. Volvé a intentar.')},
   close(){db.close()}
  };
 }
 const api={open};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JennySyncStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
