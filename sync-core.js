/* Shared, transport-independent three-way merge. No network or persistence. */
(function(root){
 'use strict';
 const fields=['schemaVersion','setupDone','cats','movements','services','budgets','debts','opening','usdOpening','serviceTemplates','departmentCategoryIds'];
 const keyed=new Set(['cats','movements','services','serviceTemplates']);
 const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
 const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
 function canonical(x){if(x===undefined)return 'undefined';if(x===null||typeof x!=='object')return JSON.stringify(x);if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'}
 const equal=(a,b)=>canonical(a)===canonical(b);
 function project(state){const out={};for(const key of fields)if(own(state,key))out[key]=clone(state[key]);return out}
 function merge(base,local,remote){
  const conflicts=[];
  function value(b,l,r,path){
   if(equal(l,r))return clone(l);
   if(equal(l,b))return clone(r);
   if(equal(r,b))return clone(l);
   // A deletion against an edit is always a conflict. Never resurrect silently.
   if(b!==undefined&&l!==undefined&&r!==undefined&&b!==null&&l!==null&&r!==null&&typeof b==='object'&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(b)&&!Array.isArray(l)&&!Array.isArray(r)){
    const out={};for(const key of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){const v=value(b[key],l[key],r[key],path+'.'+key);if(v!==undefined)out[key]=v}return out;
   }
   conflicts.push({path,base:clone(b),local:clone(l),remote:clone(r)});return clone(l);
  }
  function rows(list,label){if(!Array.isArray(list))throw Error('Expected list: '+label);const result=new Map();for(const row of list){if(!row||!['string','number'].includes(typeof row.id)||result.has(String(row.id)))throw Error('Invalid or duplicate identifier: '+label);result.set(String(row.id),row)}return result}
  function collection(b,l,r,key){
   const bm=rows(b||[],key),lm=rows(l||[],key),rm=rows(r||[],key),out=[];
   // Remote order first keeps existing lists stable; local additions append.
   for(const id of new Set([...rm.keys(),...lm.keys(),...bm.keys()])){const row=value(bm.get(id),lm.get(id),rm.get(id),key+'['+id+']');if(row!==undefined)out.push(row)}return out;
  }
  const result={};for(const key of fields){const v=keyed.has(key)?collection(base[key],local[key],remote[key],key):value(base[key],local[key],remote[key],key);if(v!==undefined)result[key]=v}
  // Different devices must not each debit the same invoice.
  const payments=new Map();for(const m of result.movements||[]){if(!m.serviceId)continue;const id=String(m.serviceId);if(payments.has(id))conflicts.push({path:'services['+id+'].payment',reason:'duplicate-payment'});payments.set(id,m.id)}
  const catIds=new Set((result.cats||[]).map(x=>String(x.id)));
  for(const m of [...(result.movements||[]),...(result.services||[])])if(m.cat!=='uncategorized'&&!catIds.has(String(m.cat)))conflicts.push({path:'references['+m.id+'].category',reason:'deleted-category'});
  return {ok:conflicts.length===0,state:conflicts.length?null:result,conflicts};
 }
 const api={project,merge,equal};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JennySyncCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
