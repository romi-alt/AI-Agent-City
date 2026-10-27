/** Characterization tests: PASS means the documented legacy behavior was reproduced, NOT that it is correct. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
const runtime=resolve(process.argv[2]??'.audit-runtime');
const {Sim}=await import(pathToFileURL(join(runtime,'src/core/sim.mjs')));
const {buildCity}=await import(pathToFileURL(join(runtime,'src/core/data/buildings.mjs')));
const {AuthStore}=await import(pathToFileURL(join(runtime,'server/auth.mjs')));
const {totpNow}=await import(pathToFileURL(join(runtime,'server/totp.mjs')));
function fresh(){const s=Sim.create('2026-10-27');s.leads.clear();s.approvals=[];s.messages.clear();s.content.clear();s.revenue=[];s.stageLog=[];return s;}
function lead(s,b='fast-sales',floor=11){return s.createLead({buildingId:b,floor,name:'Audit Example',email:'audit@example.com',phone:'+15550100100'},'Audit');}
function task(s,l,a){const t={id:'test-task',title:'Test',category:'New leads',channel:'email',leadId:l.id,action:'contact',remaining:0,needsApproval:true};a.current=t;a.status='working';s.finishContact(s.building(a.buildingId),a,t);return s.approvals.at(-1);}
test('C01 exact current seed is 15 buildings / 183 floors / 281 AI / 22 human desks',()=>{
 const bs=buildCity(),a=bs.flatMap(b=>b.floors.flatMap(f=>f.agents));
 assert.equal(bs.length,15);assert.equal(bs.flatMap(b=>b.floors).length,183);
 assert.equal(a.filter(a=>a.kind==='ai').length,281);assert.equal(a.filter(a=>a.kind==='human').length,22);
 assert.equal(bs.find(b=>b.id==='fast-sales').floors.flatMap(f=>f.agents).length,33);
});
test('C02 manual real-dealer Sold transition fabricates revenue and re-entry counts again',()=>{
 const s=fresh(),l=lead(s,'honda',12);s.updateLead(l.id,{stage:'Sold'},'Audit');
 assert.equal(s.revenue.length,1);assert.ok(s.revenue[0].amount>=1500&&s.revenue[0].amount<=4000);
 s.updateLead(l.id,{stage:'Negotiation'},'Audit');s.updateLead(l.id,{stage:'Sold'},'Audit');
 assert.equal(s.revenue.length,2);assert.equal(s.kpis('honda').closedMonth,2);
});
test('C03 real-training enrollment manufactures a fixed 997 revenue value',()=>{
 const s=fresh(),l=lead(s);s.updateLead(l.id,{stage:'Training started'},'Audit');assert.equal(s.revenue[0].amount,997);
});
test('C04 scheduled content can change without reapproval; published content also mutable through domain API',()=>{
 const s=fresh();const c={id:'post',buildingId:'fast-sales',day:1,time:'12:00',platform:'Facebook',format:'image',topic:'Example',caption:'Approved',status:'scheduled'};
 s.content.set(c.id,c);s.updateContent(c.id,{caption:'Changed after review'});assert.equal(c.status,'scheduled');assert.equal(s.approvals.length,0);
 c.status='published';s.updateContent(c.id,{caption:'Changed after publish'});assert.equal(c.caption,'Changed after publish');
});
test('C05 late AI draft can change recorded message during an approved in-flight send',()=>{
 const s=fresh(),l=lead(s),a=s.agent('fast-sales-L11-0');const ap=task(s,l,a);let sent;
 s.hooks.outbound=m=>{sent={body:m.body,subject:m.subject};};s.resolve(ap.id,true,'Reviewer');
 const m=s.messages.get(ap.refId);s.updateMessageDraft(m.id,'Late new subject','Late new body');
 assert.notEqual(m.body,sent.body);assert.notEqual(m.subject,sent.subject);assert.equal(s.approvals.length,0);
});
test('C06 contact reservation is lost on snapshot restore while agent task survives',()=>{
 const s=fresh(),l=lead(s),a=s.agent('fast-sales-L11-0');const t=s.contactTask(s.building('fast-sales'),{...a,categories:['New leads']});
 a.current=t;a.status='working';assert.equal(s.busy.has(l.id),true);
 const r=new Sim(structuredClone(s.snapshot()));assert.equal(r.busy.has(l.id),false);assert.ok(r.agent(a.id).current);
});
test('C07 unanswered real approval can release contact and create a second pending draft',()=>{
 const s=fresh(),l=lead(s),a=s.agent('fast-sales-L11-0');s.busy.add(l.id);task(s,l,a);
 s.now+=62;s.unblock();assert.equal(s.approvals.length,1);assert.equal(s.busy.has(l.id),false);
 const t=s.contactTask(s.building('fast-sales'),{...a,categories:['New leads']});assert.equal(t.leadId,l.id);
 a.current=t;a.status='working';s.finishContact(s.building('fast-sales'),a,t);assert.equal(s.approvals.length,2);
});
test('C08 retention deletes a pending real message still referenced by approval',()=>{
 const s=fresh(),l=lead(s),a=s.agent('fast-sales-L11-0'),ap=task(s,l,a);
 for(let i=0;i<300;i++)s.addMessage({buildingId:'fast-sales',agentName:'Test',channel:'email',to:'audit@example.com',body:'Test',status:'simulated',real:false,by:'template'});
 s.trim();assert.equal(s.messages.has(ap.refId),false);assert.ok(s.approvals.some(x=>x.id===ap.id));
});
test('C09 manual real email invokes outbound without a separate approval queue entry',()=>{
 const s=fresh(),l=lead(s);let calls=0;s.hooks.outbound=()=>{calls++;};s.sendManual(l.id,'email','Subject','Body','Operator');
 assert.equal(calls,1);assert.equal(s.approvals.length,0);
});
test('C10 rental-floor agent can select another rented floor contact',()=>{
 const s=fresh();for(const n of [1,2])s.rentFloor('rental-1',n,{name:'Example '+n,contact:'',email:'',phone:''});
 const l=lead(s,'rental-1',2),a=s.agent('rental-1-L1-0');const picked=s.pickLead(s.building('rental-1'),a,'New customers');
 assert.equal(picked.id,l.id);assert.equal(picked.floor,2);assert.equal(a.floor,1);
});
test('C11 failed send still counts outreach and moves real lead to Contacted',()=>{
 const s=fresh(),l=lead(s),a=s.agent('fast-sales-L11-0'),ap=task(s,l,a);
 s.hooks.outbound=m=>s.setMessageStatus(m.id,'failed','Synthetic failure');s.resolve(ap.id,true,'Reviewer');
 assert.equal(s.messages.get(ap.refId).status,'failed');assert.equal(l.stage,'Contacted');assert.equal(s.report('fast-sales')[0].email,1);
});
test('C12 social publishing fabricates metrics without any platform adapter',()=>{
 const s=fresh(),c={id:'p',buildingId:'fast-sales',day:0,time:'08:00',platform:'Facebook',format:'image',topic:'Example',status:'scheduled'};
 s.content.set(c.id,c);s.publish(c);assert.equal(c.status,'published');assert.ok(c.metrics.reach>0);
});
test('C13 changing a contact address does not invalidate a queued message recipient',()=>{
 const s=fresh(),l=lead(s),a=s.agent('fast-sales-L11-0'),ap=task(s,l,a);s.updateLead(l.id,{email:'changed@example.com'},'Audit');
 let to;s.hooks.outbound=m=>{to=m.to;};s.resolve(ap.id,true,'Reviewer');assert.equal(to,'audit@example.com');
});
test('C14 renting a floor raises displayed revenue without any payment',()=>{
 const s=fresh();s.rentFloor('rental-1',1,{name:'Example',contact:'',email:'',phone:''});
 assert.equal(s.kpis('rental-1').rentMonthly,199);assert.equal(s.kpis('rental-1').revenueMonth,199);
});
test('C15 clock advances 60 business minutes in 30 ticks independent of wall time',()=>{
 const s=fresh();s.buildings=[];const start=s.now;for(let i=0;i<30;i++)s.tick();assert.equal(s.now-start,60);
});
test('C16 password reset removes sessions but retains remembered-device token',()=>{
 const dir=mkdtempSync(join(tmpdir(),'agentcity-audit-')),oldNow=Date.now;
 try{
  let now=Date.now();Date.now=()=>now;const a=new AuthStore(join(dir,'auth.json'));
  const {user,token}=a.createUser('audit','Audit','member');a.startEnroll(token,'example-password-123');
  const {codes}=a.finishEnroll(token,totpNow(user.pendingSecret));const device=a.rememberDevice(user.id);a.newSession(user.id,'full');
  now+=60000;const result=a.resetPassword('audit',totpNow(user.totpSecret),codes[0],'replacement-password-123');
  assert.ok(result.user);assert.equal(a.sessions.size,0);assert.equal(a.deviceUser(device),user.id);
 }finally{Date.now=oldNow;rmSync(dir,{recursive:true,force:true});}
});
