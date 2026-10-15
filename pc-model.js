/* Pure projections and commands over the same schema-2 snapshot as Android. */
(function(root){
 const round=n=>Math.round(n*100)/100;
 const currency=m=>m.currency||'ARS';
 function roles(s){const find=(name,type)=>s.cats.find(c=>c.name.trim().toLocaleLowerCase('es')===name&&c.type===type)?.id;return {departmentIncome:find('servicios depto','income'),departmentExpense:find('servicios depto','expense'),services:find('servicios casa','expense'),cards:find('tarjetas','expense')}}
 function summary(s,month){
  const r=roles(s),inMonth=m=>m.date.startsWith(month),monthly=s.movements.filter(inMonth),peso=monthly.filter(m=>currency(m)==='ARS');
  const income=peso.filter(m=>m.type==='income'&&m.cat!==r.departmentIncome);
  const entrusted=peso.filter(m=>m.cat===r.departmentIncome&&m.type==='income');
  const invoices=s.services.filter(v=>v.due.startsWith(month));
  const payment=v=>s.movements.find(m=>String(m.serviceId)===String(v.id));
  const personal=invoices.filter(v=>v.cat!==r.departmentExpense),department=invoices.filter(v=>v.cat===r.departmentExpense);
  const sum=(xs,field='amount')=>round(xs.reduce((n,x)=>n+x[field],0));
  const daily=monthly.filter(m=>m.type==='expense'&&!m.serviceId&&!['usd',r.services,r.cards,r.departmentExpense].filter(Boolean).includes(m.cat));
  const usd=round(s.usdOpening+s.movements.reduce((n,m)=>n+(currency(m)==='USD'?(m.type==='income'?m.amount:-m.amount):(m.cat==='usd'&&m.type==='expense'?m.usd||0:0)),0));
  const paid=personal.filter(payment),pending=personal.filter(v=>!payment(v));
  const direct=peso.filter(m=>m.type==='expense'&&!m.serviceId&&[r.services,r.cards].filter(Boolean).includes(m.cat));
  const deptDirect=peso.filter(m=>m.type==='expense'&&!m.serviceId&&r.departmentExpense&&m.cat===r.departmentExpense);
  return {r,income,entrusted,personal,department,daily,direct,deptDirect,usd,payment,incomeTotal:sum(income),received:sum(entrusted),departmentPaid:round(sum(department.map(payment).filter(Boolean))+sum(deptDirect)),paid:round(sum(paid.map(payment))+sum(direct)),pending:sum(pending),dailyARS:sum(daily.filter(m=>currency(m)==='ARS')),dailyUSD:sum(daily.filter(m=>currency(m)==='USD'))};
 }
 function catalog(s,cat){
  if(!cat)return [];
  const names=new Map(),add=(name,sub='')=>{if(name?.trim())names.set(name.trim().toLocaleLowerCase('es'),{name,sub,cat})};
  (s.cats.find(c=>c.id===cat)?.subs||[]).forEach(name=>add(name,name));
  s.services.filter(v=>v.cat===cat).forEach(v=>add(v.name,v.sub||''));
  return [...names.values()];
 }
 function saveMovement(s,row,expected){
  const i=s.movements.findIndex(m=>String(m.id)===String(row.id));
  if(expected&&JSON.stringify(s.movements[i])!==JSON.stringify(expected))throw Error('Este movimiento cambió en otra pestaña. Cerrá el formulario y abrilo otra vez.');
  if(i<0)s.movements.push({...row,createdAt:row.createdAt||new Date().toISOString()});else s.movements[i]={...row,...(s.movements[i].createdAt?{createdAt:s.movements[i].createdAt}:{})};
 }
 function saveInvoice(s,row,{paid,paymentDate,paymentId,expected}){
  if(!row.name.trim())throw Error('Ingresá el nombre del servicio o tarjeta.');
  const i=s.services.findIndex(v=>String(v.id)===String(row.id));
  if(expected&&JSON.stringify(s.services[i])!==JSON.stringify(expected))throw Error('Esta factura cambió en otra pestaña. Volvé a abrirla.');
  if(i<0)s.services.push(row);else s.services[i]=row;
  const existing=s.movements.find(m=>String(m.serviceId)===String(row.id));
  if(paid){const m={...(existing||{}),id:existing?.id||paymentId,type:'expense',currency:'ARS',amount:row.amount,date:paymentDate,cat:row.cat,sub:row.sub||'',note:row.name,serviceId:row.id};saveMovement(s,m)}
  else if(existing)s.movements=s.movements.filter(m=>m!==existing);
 }
 function newestFirst(rows){return rows.map((row,index)=>({row,index})).sort((a,b)=>{const stamp=x=>Date.parse(x.createdAt)||( /^\d{13}$/.test(String(x.id))?Number(x.id):0);return stamp(b.row)-stamp(a.row)||b.index-a.index}).map(x=>x.row)}
 function removeHabitual(s,t,month){const c=s.cats.find(c=>c.id===t.cat);if(!c)throw Error('La categoría ya no existe.');const same=n=>n.trim().toLocaleLowerCase('es')===t.name.trim().toLocaleLowerCase('es');c.hiddenServices=[...(c.hiddenServices||[]).filter(n=>!same(n)),t.name];c.subs=c.subs.filter(n=>!same(n));s.services=s.services.filter(v=>v.cat!==t.cat||!same(v.name)||v.due.slice(0,7)<month||s.movements.some(m=>String(m.serviceId)===String(v.id)))}
 const api={roles,summary,catalog,saveMovement,saveInvoice,newestFirst,removeHabitual};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JennyPCModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
