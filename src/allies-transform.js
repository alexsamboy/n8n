const c={...$('Configuración Aliados').first().json,...$('Calcular mes anterior').first().json,...$json};
const pages=$('Consultar Prensa mensual').all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]);
if(pages.some(x=>x.errors?.length)) throw new Error('GraphQL errors[]');
const clean=v=>String(v??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const safe=v=>{const s=String(v||'').trim();return /^https:\/\/[^\s<>\x22\x27]+$/i.test(s)?s:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,z=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[z]));
const start=new Date(c.windowStart),end=new Date(c.windowEndExclusive),map=new Map(),invalid=[];
for(const x of pages.flatMap(x=>x.data?.posts?.nodes||[])){
  const d=new Date(String(x.date||'')+'-04:00');
  const categories=(x.categories?.nodes||[]).map(y=>({id:String(y.databaseId||''),name:clean(y.name),slug:clean(y.slug)})).filter(y=>y.name);
  const department=clean(x.opcionesPublicacion?.dependencia?.nodes?.[0]?.name)||null;
  const normalizedDepartment=department?.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const portalPucmm=Boolean(x.opcionesPublicacion?.portalPucmm);
  const a={id:String(x.databaseId||''),title:clean(x.title),publishedAt:Number.isNaN(d.valueOf())?null:d.toISOString(),url:safe(x.link),excerptText:clean(x.content).slice(0,c.excerptMaxChars),imageUrl:safe(x.featuredImage?.node?.sourceUrl),imageAlt:clean(x.featuredImage?.node?.altText)||clean(x.title),categories,campus:clean(x.opcionesPublicacion?.campus)||null,department,portalPucmm,segment:normalizedDepartment==='rectoria'?0:portalPucmm?1:2};
  if(!a.id||!a.title||!a.url||Number.isNaN(d.valueOf())||d<start||d>=end){invalid.push(a.id);continue}
  if(!map.has(a.id)) map.set(a.id,a);
}
const articles=[...map.values()].sort((a,b)=>(a.segment??2)-(b.segment??2)||new Date(b.publishedAt)-new Date(a.publishedAt)||a.id.localeCompare(b.id));
const month=new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',month:'long'}).format(start);
const year=new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',year:'numeric'}).format(start);
const cards=articles.map(a=>'<mj-section background-color="#ffffff" padding="18px 28px"><mj-column>'+(a.imageUrl?'<mj-image href="'+esc(a.url)+'" src="'+esc(a.imageUrl)+'" alt="'+esc(a.imageAlt)+'"/>':'')+'<mj-text font-size="12px" color="#666">'+esc((a.categories[0]?.name||'')+' · '+new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',dateStyle:'long'}).format(new Date(a.publishedAt)))+'</mj-text><mj-text font-size="21px" font-family="Libre Baskerville,Georgia,serif"><a href="'+esc(a.url)+'" style="color:#111;text-decoration:none"><b>'+esc(a.title)+'</b></a></mj-text><mj-text>'+esc(a.excerptText)+'</mj-text><mj-divider border-color="#ddd"/></mj-column></mj-section>').join('');
const key=require('crypto').createHash('sha256').update('allies-monthly|'+c.monthKey+'|'+c.recipientType+'|'+c.recipientId).digest('hex');
const subject=(c.testMode?'[PRUEBA] ':'')+'Noticias PUCMM · '+month+' de '+year;
const mjml='<mjml><mj-head><mj-title>'+esc(subject)+'</mj-title><mj-preview>'+articles.length+' noticias de Prensa PUCMM</mj-preview><mj-breakpoint width="575px"/><mj-font name="Libre Baskerville" href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&amp;display=swap"/></mj-head><mj-body width="800px" background-color="#f1f1f1"><mj-section background-color="#00369c"><mj-column width="30%"><mj-image src="'+esc(c.logoUrl)+'" alt="PUCMM"/></mj-column><mj-column width="70%"><mj-text align="center" color="#fff"><h1>Prensa PUCMM</h1><p>Boletín para Aliados · Dirección de Comunicaciones</p></mj-text></mj-column></mj-section><mj-section background-color="#fff"><mj-column><mj-text align="center"><h2>Noticias PUCMM</h2>Compartimos las noticias publicadas durante '+month+' de '+year+'.</mj-text><mj-divider border-color="#F4D500" border-width="3px"/></mj-column></mj-section>'+cards+'<mj-section background-color="#fff"><mj-column><mj-button background-color="#F4D500" href="'+esc(c.pressUrl)+'">Ver todas las noticias</mj-button></mj-column></mj-section></mj-body></mjml>';
return [{json:{...c,articles,articleCount:articles.length,adCount:0,invalidCount:invalid.length,executionKey:key,subject,mjml,shouldProcess:articles.length>0,startedAt:new Date().toISOString()}}];
