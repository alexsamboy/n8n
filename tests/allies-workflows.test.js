"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const core=require("../src/allies-core");
const scheduler=require("../workflows/apps/boletin-aliados/coordinators/monthly.json");
const build=require("../workflows/apps/boletin-aliados/orchestration/build-send-campaign.json");
test("Aliados calcula el mes calendario anterior",()=>{
  const w=core.monthlyWindow("2026-06-01T14:00:00Z");
  assert.equal(w.windowStart,"2026-05-01T04:00:00.000Z");
  assert.equal(w.windowEndExclusive,"2026-06-01T04:00:00.000Z");
});
test("Prensa mensual conserva categorías y prioriza Rectoría",()=>{
  const a=core.normalizeArticle({databaseId:1,title:"A",date:"2026-05-03T10:00:00",link:"https://prensa.pucmm.edu.do/a",content:"<p>x</p>",categories:{nodes:[{databaseId:2,name:"Eventos",slug:"eventos"},{databaseId:3,name:"Conferencia",slug:"conferencia"}]},opcionesPublicacion:{dependencia:{nodes:[{name:"Rectoría"}]},portalPucmm:false}});
  const b=core.normalizeArticle({databaseId:2,title:"B",date:"2026-05-04T10:00:00",link:"https://prensa.pucmm.edu.do/b",content:"<p>y</p>",categories:{nodes:[]},opcionesPublicacion:{dependencia:{nodes:[]},portalPucmm:false}});
  assert.equal(a.categories.length,2);assert.equal(a.segment,0);assert.deepEqual(core.sortArticles([a,b]).map(x=>x.id),["1","2"]);
});
test("Aliados permanece inactivo, primer lunes y reutiliza MJML/Brevo",()=>{
  assert.equal(scheduler.active,false);assert.equal(scheduler.nodes[0].parameters.rule.interval[0].expression,"0 10 1-7 * 1");
  assert.ok(build.nodes.some(n=>n.parameters.workflowId?.value==="73pz6aMDSOoMOrBr"));
  assert.ok(build.nodes.some(n=>n.credentials?.sendInBlueApi?.id==="brevo-shared"));
  const cfg=build.nodes.find(n=>n.name==="Configuración Aliados");const values=Object.fromEntries(cfg.parameters.assignments.assignments.map(x=>[x.name,x.value]));
  assert.equal(values.testMode,true);assert.equal(values.dryRun,true);assert.equal(values.recipientId,"116");assert.equal(values.senderId,1);
});
