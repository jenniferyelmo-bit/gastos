/* Shared validation at the device boundary. Does not mutate preferences. */
(function(root){
 'use strict';
 function validate(s){
  const check=(v,msg)=>{if(!v)throw Error(msg)},text=(v,n)=>typeof v==='string'&&v.length<=n;
  const id=v=>['string','number'].includes(typeof v)&&/^[\w-]{1,100}$/.test(String(v));
  const amount=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12&&Math.abs(v*100-Math.round(v*100))<.02;
  const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v};
  check(s?.schemaVersion===2,'Respaldo incompatible.');
  for(const k of ['cats','movements','services','budgets','debts'])check(Array.isArray(s[k]),'Falta la sección '+k);
  check(amount(s.opening)&&amount(s.usdOpening),'Saldos inválidos.');
  for(const k of ['cats','movements','services','serviceTemplates'])if(s[k])check(Array.isArray(s[k])&&s[k].every(x=>x&&id(x.id))&&new Set(s[k].map(x=>String(x.id))).size===s[k].length,'Identificadores inválidos en '+k);
  s.cats.forEach(c=>check(text(c.name,100)&&['income','expense'].includes(c.type)&&/^[a-z0-9-]+$/.test(c.icon)&&/^#[a-f0-9]{6}$/i.test(c.color)&&Array.isArray(c.subs)&&c.subs.every(v=>text(v,100)),'Categoría inválida.'));
  const cats=new Set(s.cats.map(c=>String(c.id))),ref=v=>v==='uncategorized'||cats.has(String(v));
  s.movements.forEach(m=>check(ref(m.cat)&&['income','expense'].includes(m.type)&&amount(m.amount)&&m.amount>0&&date(m.date)&&(m.currency==null||['ARS','USD'].includes(m.currency))&&(m.note==null||text(m.note,2000))&&(m.sub==null||text(m.sub,100))&&(m.serviceId==null||id(m.serviceId))&&(m.usd==null||amount(m.usd)&&m.usd>0&&m.type==='expense')&&!(m.currency==='USD'&&(m.usd!=null||m.serviceId||m.cat==='usd')),'Movimiento inválido.'));
  s.services.forEach(v=>check(text(v.name,100)&&ref(v.cat)&&amount(v.amount)&&v.amount>0&&date(v.due)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)&&(v.sub==null||text(v.sub,100)),'Servicio inválido.'));
  const links=s.movements.filter(m=>m.serviceId).map(m=>String(m.serviceId));check(new Set(links).size===links.length,'Una factura tiene dos pagos.');
  s.debts.forEach(d=>check(text(d.name,100)&&amount(d.total)&&d.total>0&&amount(d.paid)&&d.paid>=0&&d.paid<=d.total&&date(d.date)&&['pay','receive'].includes(d.direction)&&(d.currency==null||['ARS','USD'].includes(d.currency)),'Préstamo inválido.'));
  s.budgets.forEach(b=>check(ref(b.cat)&&amount(b.amount)&&b.amount>0,'Presupuesto inválido.'));
  return s;
 }
 const api={validate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JennySyncValidate=api;
})(typeof globalThis!=='undefined'?globalThis:this);
