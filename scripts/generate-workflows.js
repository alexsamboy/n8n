"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const outDir = path.join(__dirname, "..", "workflows", "pucmm");
fs.mkdirSync(outDir, { recursive: true });

let sequence = 1;
const node = (name, type, parameters, position, typeVersion = 1) => ({
  id: `agenda-${String(sequence++).padStart(3, "0")}`,
  name, type: `n8n-nodes-base.${type}`, typeVersion, position, parameters,
});

function workflow(name, nodes, connections, settings = {}) {
  return {
    id: workflowId(name),
    name, nodes, connections, pinData: {}, active: false,
    settings: {
      executionOrder: "v1",
      timezone: "America/Santo_Domingo",
      saveDataSuccessExecution: "none",
      saveDataErrorExecution: "all",
      saveManualExecutions: false,
      ...settings,
    },
    versionId: cryptoRandom(),
    meta: { templateCredsSetupCompleted: false },
    tags: [{ id: "agenda-pucmm", name: "Agenda PUCMM" }],
  };
}

function workflowId(name) {
  return crypto.createHash("sha256").update(name).digest("hex").slice(0, 16);
}

function cryptoRandom() {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

const windowCode = (expected) => `
const ZONE = 'America/Santo_Domingo';
const OFFSET = '-04:00';
const pad = n => String(n).padStart(2, '0');
const reference = $json.referenceDate ? new Date($json.referenceDate) : new Date();
if (Number.isNaN(reference.valueOf())) throw new Error('referenceDate inválida');
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(reference).map(p=>[p.type,p.value]));
const today = {year:+parts.year,month:+parts.month,day:+parts.day};
const shift = (p,d) => { const x=new Date(Date.UTC(p.year,p.month-1,p.day+d)); return {year:x.getUTCFullYear(),month:x.getUTCMonth()+1,day:x.getUTCDate()}; };
const iso = p => p.year+'-'+pad(p.month)+'-'+pad(p.day)+'T00:00:00'+OFFSET;
const dow = new Date(Date.UTC(today.year,today.month-1,today.day)).getUTCDay();
let digestType='none', start, end;
if (dow===1 && today.day<=7) { digestType='monthly'; start={year:today.year,month:today.month,day:1}; end=today.month===12?{year:today.year+1,month:1,day:1}:{year:today.year,month:today.month+1,day:1}; }
else if (dow===1) { digestType='weekly'; start=today; end=shift(today,7); }
else if (dow>=2 && dow<=6) { digestType='daily'; start=today; end=shift(today,1); }
if (digestType !== '${expected}') return [];
return [{json:{digestType,windowStart:iso(start),windowEndExclusive:iso(end),referenceDate:reference.toISOString(),recipientGroup:digestType,timezone:ZONE}}];`.trim();

function scheduledWorkflow(type, cron) {
  sequence = 1;
  const schedule = node("Horario (inactivo al importar)", "scheduleTrigger", { rule: { interval: [{ field: "cronExpression", expression: cron }] } }, [-520, -100], 1.2);
  const manual = node("Prueba manual con referenceDate", "manualTrigger", {}, [-520, 100], 1);
  const compute = node(`Calcular ventana ${type}`, "code", { jsCode: windowCode(type) }, [-260, 0], 2);
  const call = node("Ejecutar build-and-send", "executeWorkflow", {
    workflowId: { __rl: true, mode: "id", value: workflowId("Agenda PUCMM — build-and-send-digest") },
    options: { waitForSubWorkflow: true },
  }, [20, 0], 1.3);
  return workflow(`Agenda PUCMM — ${type}`, [schedule, manual, compute, call], {
    [schedule.name]: { main: [[{ node: compute.name, type: "main", index: 0 }]] },
    [manual.name]: { main: [[{ node: compute.name, type: "main", index: 0 }]] },
    [compute.name]: { main: [[{ node: call.name, type: "main", index: 0 }]] },
  }, { errorWorkflow: workflowId("Agenda PUCMM — error-handler") });
}

const configAssignments = [
  ["wpGraphqlUrl", "={{ $vars.WP_GRAPHQL_URL || 'https://dia.pucmm.edu.do/graphql' }}", "string"],
  ["wpPageSize", "={{ Number($vars.WP_PAGE_SIZE || 100) }}", "number"],
  ["wpMaxPages", "={{ Number($vars.WP_MAX_PAGES || 100) }}", "number"],
  ["wpTimeoutMs", "={{ Number($vars.WP_REQUEST_TIMEOUT_MS || 30000) }}", "number"],
  ["testMode", "={{ String($vars.TEST_MODE || 'true') === 'true' }}", "boolean"],
  ["sendEmpty", "={{ String($vars.SEND_EMPTY_DIGEST || 'false') === 'true' }}", "boolean"],
  ["forceResend", "={{ String($vars.FORCE_RESEND || 'false') === 'true' }}", "boolean"],
  ["emailTransport", "={{ $vars.EMAIL_TRANSPORT || 'microsoft_graph' }}", "string"],
  ["emailToDaily", "={{ $vars.EMAIL_TO_DAILY || '' }}", "string"],
  ["emailToWeekly", "={{ $vars.EMAIL_TO_WEEKLY || '' }}", "string"],
  ["emailToMonthly", "={{ $vars.EMAIL_TO_MONTHLY || '' }}", "string"],
  ["emailTestRecipients", "={{ $vars.EMAIL_TEST_RECIPIENTS || '' }}", "string"],
  ["allowedDomains", "={{ $vars.ALLOWED_EMAIL_DOMAINS || 'pucmm.edu.do,ce.pucmm.edu.do' }}", "string"],
  ["emailFrom", "={{ $vars.EMAIL_FROM || '' }}", "string"],
  ["emailFromName", "={{ $vars.EMAIL_FROM_NAME || 'PUCMM Día a Día' }}", "string"],
  ["emailReplyTo", "={{ $vars.EMAIL_REPLY_TO || '' }}", "string"],
  ["mjmlUrl", "={{ $vars.MJML_LOCAL_URL || 'http://mjml:3000/render' }}", "string"],
  ["agendaUrl", "={{ $vars.AGENDA_PUBLIC_URL || 'https://dia.pucmm.edu.do/' }}", "string"],
  ["serviceUrl", "={{ $vars.SERVICE_REQUEST_URL || 'https://apps.powerapps.com/play/e/default-73c9a419-863d-4226-a83f-7a200ad69be9/a/081d747b-7e24-4d74-aa77-5e7296add2f5?tenantId=73c9a419-863d-4226-a83f-7a200ad69be9&hint=268173e9-41fe-4ce8-a8d1-566b4100cfd7&sourcetime=1764249968817' }}", "string"],
  ["logoUrl", "={{ $vars.PUCMM_LOGO_URL || 'https://pucmm.edu.do/wp-content/uploads/2026/07/pucmm-logo.svg' }}", "string"],
  ["monthlyClosing", "={{ $vars.MONTHLY_CLOSING_TEXT || '' }}", "string"],
  ["dataTableId", "={{ $vars.AGENDA_DATA_TABLE_ID || '' }}", "string"],
].map(([name, value, type], i) => ({ id: `cfg-${i}`, name, value, type }));

const eventGraphql = 'query Events($first:Int!,$cursor:String,$from:String!,$to:String!){posts(first:$first,after:$cursor,where:{status:PUBLISH,metaQuery:{relation:AND,metaArray:[{key:"fecha_inicio",value:$to,compare:LESS_THAN,type:DATETIME},{key:"fecha_termino",value:$from,compare:GREATER_THAN_OR_EQUAL_TO,type:DATETIME}]}}){pageInfo{hasNextPage endCursor}nodes{databaseId title link featuredImage{node{sourceUrl}}categories{nodes{name}}detallesDelEvento{detcampus modalidad status}horaYFechaDelEvento{fechaInicio horaDeInicio fechaTermino horaTermino}locations{nodes{name}}organizer{nodes{name organizador{nomCsd}}}}}}';
const adGraphql = 'query Ads($first:Int!,$cursor:String,$at:String!){banners(first:$first,after:$cursor,where:{status:PUBLISH,metaQuery:{relation:AND,metaArray:[{key:"inicio",value:$at,compare:LESS_THAN_OR_EQUAL_TO,type:DATETIME},{key:"fin",value:$at,compare:GREATER_THAN_OR_EQUAL_TO,type:DATETIME}]}}){pageInfo{hasNextPage endCursor}nodes{databaseId title newsletter{inicio fin enlace}featuredImage{node{sourceUrl}}}}}';

function wordpressRequest(name, query, root, position) {
  const request = node(name, "httpRequest", {
    method: "POST",
    url: "={{ $('Configuración segura').first().json.wpGraphqlUrl }}",
    authentication: "genericCredentialType",
    genericAuthType: "httpBasicAuth",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
    sendBody: true,
    contentType: "json",
    specifyBody: "json",
    jsonBody: root === "posts" ? "={{ $json.eventBody }}" : "={{ $('Preparar consultas').first().json.adBody }}",
    options: {
      timeout: "={{ $('Configuración segura').first().json.wpTimeoutMs }}",
      pagination: { pagination: {
        paginationMode: "updateAParameterInEachRequest",
        parameters: { parameters: [{ type: "body", name: "variables.cursor", value: `={{ $response.body.data.${root}.pageInfo.endCursor }}` }] },
        paginationCompleteWhen: "other",
        completeExpression: `={{ !$response.body.data.${root}.pageInfo.hasNextPage }}`,
        limitPagesFetched: true,
        maxRequests: 100,
        requestInterval: 250,
      } },
    },
  }, position, 4.3);
  request.credentials = { httpBasicAuth: { id: "pucmm-wordpress-api", name: "PUCMM WordPress API" } };
  return request;
}

const fetchRenderCode = String.raw`
const cfg = $('Configuración segura').first().json;
const crypto = require('node:crypto');
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean = v => v==null?null:(String(v).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()||null);
const safeUrl = v => { try { const u=new URL(String(v)); return u.protocol==='https:'?u.href:null; } catch { return null; } };
const pad=n=>String(n).padStart(2,'0');
const clock=v=>{const m=String(v||'12:00 am').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);if(!m)throw new Error('Hora WordPress inválida');let h=+m[1],min=+(m[2]||0);if(m[3]==='am'&&h===12)h=0;if(m[3]==='pm'&&h!==12)h+=12;return [h,min];};
const combine=(d,t)=>{if(!d)return null;const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)throw new Error('Fecha WordPress inválida');const [h,min]=clock(t);return m[1]+'-'+m[2]+'-'+m[3]+'T'+pad(h)+':'+pad(min)+':00-04:00';};
const pageBodies=name=>$(name).all().flatMap(i=>Array.isArray(i.json)?i.json:[i.json]);
const eventPages=pageBodies('Consultar actividades autenticadas');if(eventPages.some(p=>p.errors?.length))throw new Error('GraphQL actividades: '+eventPages.flatMap(p=>p.errors||[]).map(e=>e.message).join('; ').slice(0,500));
const rawEvents=eventPages.flatMap(p=>p.data?.posts?.nodes||[]);
const invalid=[];const byId=new Map();for(const n of rawEvents){let a;try{const startAt=combine(n.horaYFechaDelEvento?.fechaInicio,n.horaYFechaDelEvento?.horaDeInicio);const endAt=combine(n.horaYFechaDelEvento?.fechaTermino,n.horaYFechaDelEvento?.horaTermino)||startAt;a={id:n.databaseId==null?null:String(n.databaseId),title:clean(n.title),url:safeUrl(n.link),category:clean(n.categories?.nodes?.[0]?.name),startAt,endAt,venue:clean(n.locations?.nodes?.[0]?.name),campus:clean(n.detallesDelEvento?.detcampus),modality:clean(n.detallesDelEvento?.modalidad),status:clean(n.detallesDelEvento?.status),organizer:clean(n.organizer?.nodes?.[0]?.organizador?.nomCsd||n.organizer?.nodes?.[0]?.name),imageUrl:safeUrl(n.featuredImage?.node?.sourceUrl)};}catch(e){invalid.push({id:n.databaseId||null,reason:'invalid_datetime'});continue;}const errors=[];for(const f of ['id','title','url','startAt'])if(!a[f])errors.push('missing_'+f);if(a.endAt&&new Date(a.endAt)<new Date(a.startAt))errors.push('end_before_start');if(!(new Date(a.startAt)<new Date(cfg.windowEndExclusive)&&new Date(a.endAt||a.startAt)>=new Date(cfg.windowStart)))errors.push('outside_window');if(errors.length){invalid.push({id:a.id,reason:errors.join(',')});continue;}if(!byId.has(a.id))byId.set(a.id,a);}
const activities=[...byId.values()].sort((a,b)=>a.startAt.localeCompare(b.startAt)||a.title.localeCompare(b.title,'es')||a.id.localeCompare(b.id));
const adPages=pageBodies('Consultar banners autenticados');if(adPages.some(p=>p.errors?.length))throw new Error('GraphQL banners: '+adPages.flatMap(p=>p.errors||[]).map(e=>e.message).join('; ').slice(0,500));const rawAds=adPages.flatMap(p=>p.data?.banners?.nodes||[]);const ads=rawAds.map(n=>({id:String(n.databaseId),title:clean(n.title),imageUrl:safeUrl(n.featuredImage?.node?.sourceUrl),targetUrl:safeUrl(n.newsletter?.enlace),activeFrom:n.newsletter?.inicio||null,activeUntil:n.newsletter?.fin||null,priority:0,placement:null})).filter(a=>a.id&&a.title&&a.imageUrl&&a.targetUrl).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,2);if(ads.length===1)ads[0].resolvedPlacement='bottom';if(ads.length===2){ads[0].resolvedPlacement='top';ads[1].resolvedPlacement='bottom';}
const targetRaw=cfg.testMode?cfg.emailTestRecipients:cfg[cfg.digestType==='daily'?'emailToDaily':cfg.digestType==='weekly'?'emailToWeekly':'emailToMonthly'];const recipients=String(targetRaw||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);if(cfg.testMode&&!recipients.length)throw new Error('TEST_MODE requiere EMAIL_TEST_RECIPIENTS');const allowed=String(cfg.allowedDomains).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);if(!cfg.testMode&&recipients.some(x=>!allowed.includes((x.split('@')[1]||'').toLowerCase())))throw new Error('Destinatario fuera de ALLOWED_EMAIL_DOMAINS');
const localDate=s=>new Date(s);const dateLong=s=>new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',day:'numeric',month:'long',year:'numeric'}).format(localDate(s));const inclusiveEnd=new Date(new Date(cfg.windowEndExclusive).valueOf()-1);const weeklyRange=dateLong(cfg.windowStart)+' al '+dateLong(inclusiveEnd);const monthYear=new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',month:'long',year:'numeric'}).format(localDate(cfg.windowStart));
const messages={daily:{subject:'Hoy en PUCMM Día a Día',intro:'Les invitamos a mantenerse al tanto de las actividades y eventos programados para hoy en nuestra Universidad.',closing:'Aprovechemos juntos estos espacios que fortalecen nuestra formación, comunidad y espíritu universitario.'},weekly:{subject:'Esta semana en PUCMM Día a Día',intro:'Compartimos con ustedes la agenda PUCMM Día a Día con las actividades programadas del '+weeklyRange+'.',closing:'Les motivamos a integrarse en estas iniciativas que fortalecen nuestro espíritu universitario y contribuyen a la vivencia de los valores que nos caracterizan.'},monthly:{subject:'Este mes en PUCMM Día a Día',intro:'Compartimos con ustedes la agenda PUCMM Día a Día con las actividades programadas para este mes de '+monthYear+', con el fin de mantenernos informados y participar activamente en los diferentes espacios de formación, cultura, espiritualidad y recreación que ofrece nuestra Universidad.',closing:cfg.monthlyClosing||'Les motivamos a integrarse en estas iniciativas que fortalecen nuestro espíritu universitario y contribuyen a la vivencia de los valores que nos caracterizan.'}};const msg=messages[cfg.digestType];
const fmt=d=>{const x=new Date(d);return {day:new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',day:'numeric'}).format(x),month:new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',month:'short'}).format(x).replace('.','').toUpperCase(),time:new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',hour:'numeric',minute:'2-digit',hour12:true}).format(x)}};
const cards=[];for(let i=0;i<activities.length;i+=2){const pair=activities.slice(i,i+2);cards.push('<mj-section background-color="#ffffff" padding="6px 20px">'+pair.map(a=>{const f=fmt(a.startAt);return '<mj-column width="50%" padding="8px"><mj-text css-class="event-title" padding="12px" border="2px solid #00369c"><span style="font-size:24px;color:#00369c;font-weight:bold">'+esc(f.day)+' '+esc(f.month)+'</span><br/><a href="'+esc(a.url)+'" title="'+esc(a.title)+'" aria-label="'+esc(a.title)+'"><b>'+esc((a.category?a.category+' | ':'')+a.title)+'</b></a><br/><span style="font-family:Arial,sans-serif;font-size:12px">🕒 '+esc(f.time)+' · 🏛️ '+esc(a.venue||'Por confirmar')+' · '+esc(a.modality==='Virtual'?'🖥️ Virtual':'📍 '+(a.campus||a.modality||''))+'</span></mj-text></mj-column>';}).join('')+'</mj-section>');}
const adBlock=a=>a?'<mj-section background-color="#ffffff" padding="8px 20px"><mj-column><mj-image href="'+esc(a.targetUrl)+'" src="'+esc(a.imageUrl)+'" alt="'+esc(a.title)+'" title="'+esc(a.title)+'" fluid-on-mobile="true" /></mj-column></mj-section>':'';
const testBanner=cfg.testMode?'<mj-section css-class="test-banner" padding="8px"><mj-column><mj-text align="center"><b>[PRUEBA]</b> '+esc(cfg.digestType)+' · '+esc(cfg.windowStart)+' → '+esc(cfg.windowEndExclusive)+'</mj-text></mj-column></mj-section>':'';
const mjml='<mjml><mj-head><mj-title>'+esc(msg.subject)+'</mj-title><mj-preview>'+esc(msg.subject)+'</mj-preview><mj-attributes><mj-all font-family="Libre Baskerville, Baskerville, Georgia, serif"/><mj-text line-height="1.5"/></mj-attributes></mj-head><mj-body background-color="#f0f0f0" width="680px">'+testBanner+'<mj-section background-color="#00369c"><mj-column width="28%"><mj-image href="https://pucmm.edu.do/" src="'+esc(cfg.logoUrl)+'" alt="PUCMM" width="150px"/></mj-column><mj-column width="72%"><mj-text align="center" color="#ffffff" font-size="28px" font-weight="700">PUCMM Día a Día</mj-text></mj-column></mj-section><mj-section background-color="#ffffff"><mj-column><mj-text align="center" font-size="22px" font-weight="700">Familia PUCMM</mj-text><mj-text align="center">'+esc(msg.intro)+'</mj-text><mj-divider border-color="#00369c"/></mj-column></mj-section>'+adBlock(ads.find(a=>a.resolvedPlacement==='top'))+cards.join('')+adBlock(ads.find(a=>a.resolvedPlacement==='bottom'))+'<mj-section background-color="#ffffff"><mj-column><mj-text align="center">'+esc(msg.closing)+'</mj-text><mj-button background-color="#FFE607" color="#111111" href="'+esc(cfg.agendaUrl)+'">Ver todas las actividades</mj-button><mj-button background-color="rgb(116,39,116)" color="#ffffff" href="'+esc(cfg.serviceUrl)+'">Solicitud de Servicios</mj-button></mj-column></mj-section><mj-section background-color="#f0f0f0"><mj-column><mj-text align="center" font-family="Arial,Helvetica,sans-serif">Comunicación Interna<br/>Dirección de Comunicaciones<br/>Pontificia Universidad Católica Madre y Maestra</mj-text></mj-column></mj-section></mj-body></mjml>';
const mjmlWithPreview=mjml.replace('<mj-preview>'+esc(msg.subject)+'</mj-preview>','<mj-preview>🗓️ Entérate de lo que ocurre en la PUCMM: conferencias, talleres y más.</mj-preview>');
const key=crypto.createHash('sha256').update(cfg.digestType+'|'+cfg.windowStart+'|'+cfg.windowEndExclusive+'|'+cfg.recipientGroup).digest('hex');
return [{json:{...cfg,activities,ads,invalidCount:invalid.length,activityCount:activities.length,adCount:ads.length,recipients:recipients.join(','),subject:(cfg.testMode?'[PRUEBA] ':'')+msg.subject,mjml:mjmlWithPreview,executionKey:key,lookupKey:cfg.forceResend?key+'|force|'+$execution.id:key,shouldSend:activities.length>0||cfg.sendEmpty,startedAt:new Date().toISOString()}}];`;

function buildSendWorkflow() {
  sequence = 1;
  const trigger = node("Entrada de digest", "executeWorkflowTrigger", { workflowInputs: { values: [{ name: "digestType" }, { name: "windowStart" }, { name: "windowEndExclusive" }, { name: "referenceDate" }, { name: "recipientGroup" }] } }, [-900, 0], 1.1);
  const config = node("Configuración segura", "set", { assignments: { assignments: configAssignments }, includeOtherFields: true, options: {} }, [-700, 0], 3.4);
  const prepare = node("Preparar consultas", "code", { jsCode: `const cfg=$json;return [{json:{...cfg,eventBody:{query:${JSON.stringify(eventGraphql)},variables:{first:cfg.wpPageSize,cursor:null,from:cfg.windowStart,to:cfg.windowEndExclusive}},adBody:{query:${JSON.stringify(adGraphql)},variables:{first:cfg.wpPageSize,cursor:null,at:cfg.referenceDate}}}}];` }, [-590, 0], 2);
  const fetchEvents = wordpressRequest("Consultar actividades autenticadas", eventGraphql, "posts", [-500, 0]);
  const fetchAds = wordpressRequest("Consultar banners autenticados", adGraphql, "banners", [-280, 0]);
  const fetchNode = node("Normalizar y construir MJML", "code", { jsCode: fetchRenderCode }, [-60, 0], 2);
  const shouldSend = node("¿Debe enviar?", "if", { conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ id: "send", leftValue: "={{ $json.shouldSend }}", rightValue: true, operator: { type: "boolean", operation: "true", singleValue: true } }], combinator: "and" }, options: {} }, [-250, 0], 2.2);
  const notExists = node("Idempotencia: no enviado", "dataTable", { resource: "row", operation: "rowNotExists", dataTableId: { __rl: true, mode: "id", value: "={{ $json.dataTableId }}" }, matchType: "allConditions", filters: { conditions: [{ keyName: "execution_key", condition: "eq", keyValue: "={{ $json.lookupKey }}" }] } }, [0, -80], 1);
  const render = node("Compilar MJML local", "httpRequest", { method: "POST", url: "={{ $json.mjmlUrl }}", sendHeaders: true, headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] }, sendBody: true, contentType: "raw", rawContentType: "application/json", body: "={{ JSON.stringify({mjml: $json.mjml}) }}", options: { timeout: 30000, response: { response: { responseFormat: "json" } } } }, [250, -80], 4.2);
  const validate = node("Validar HTML y restaurar contexto", "code", { jsCode: "const source=$('Idempotencia: no enviado').item.json;const html=$json.html;if(typeof html!=='string'||!html.trim())throw new Error('MJML no produjo HTML');return [{json:{...source,html}}];" }, [500, -80], 2);
  const transport = node("Seleccionar transporte", "switch", { rules: { values: [{ conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ leftValue: "={{ $json.emailTransport }}", rightValue: "microsoft_graph", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "Microsoft Graph" }, { conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ leftValue: "={{ $json.emailTransport }}", rightValue: "smtp", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "SMTP" }] }, options: { fallbackOutput: "extra" } }, [750, -80], 3.3);
  const outlook = node("Enviar por Microsoft Graph", "microsoftOutlook", { resource: "message", operation: "send", authentication: "microsoftOutlookOAuth2Api", toRecipients: "={{ $json.recipients }}", subject: "={{ $json.subject }}", bodyContent: "={{ $json.html }}", additionalFields: { bodyContentType: "html", replyTo: "={{ $json.emailReplyTo }}", saveToSentItems: true } }, [1000, -180], 2);
  outlook.credentials = { microsoftOutlookOAuth2Api: { id: "CONFIGURE_IN_N8N", name: "PUCMM Agenda Microsoft Outlook" } };
  const smtp = node("Enviar por SMTP", "emailSend", { fromEmail: "={{ $json.emailFromName + ' <' + $json.emailFrom + '>' }}", toEmail: "={{ $json.recipients }}", replyTo: "={{ $json.emailReplyTo }}", subject: "={{ $json.subject }}", emailFormat: "html", html: "={{ $json.html }}", options: {} }, [1000, -40], 2.1);
  smtp.credentials = { smtp: { id: "CONFIGURE_IN_N8N", name: "PUCMM Agenda SMTP" } };
  const mark = node("Registrar envío confirmado", "dataTable", { resource: "row", operation: "insert", dataTableId: { __rl: true, mode: "id", value: "={{ $('Validar HTML y restaurar contexto').item.json.dataTableId }}" }, columns: { mappingMode: "defineBelow", value: { execution_key: "={{ $('Validar HTML y restaurar contexto').item.json.executionKey }}", digest_type: "={{ $('Validar HTML y restaurar contexto').item.json.digestType }}", window_start: "={{ $('Validar HTML y restaurar contexto').item.json.windowStart }}", window_end: "={{ $('Validar HTML y restaurar contexto').item.json.windowEndExclusive }}", recipient_group: "={{ $('Validar HTML y restaurar contexto').item.json.recipientGroup }}", status: "sent", message_id: "={{ $json.id || $json.messageId || '' }}", sent_at: "={{ $now.toISO() }}", activity_count: "={{ $('Validar HTML y restaurar contexto').item.json.activityCount }}", ad_count: "={{ $('Validar HTML y restaurar contexto').item.json.adCount }}" }, matchingColumns: [], schema: [] }, options: {} }, [1260, -100], 1);
  const log = node("Resultado observable sanitizado", "code", { jsCode: "const s=$('Validar HTML y restaurar contexto').item.json;return [{json:{status:'sent',digestType:s.digestType,windowStart:s.windowStart,windowEndExclusive:s.windowEndExclusive,activityCount:s.activityCount,adCount:s.adCount,invalidCount:s.invalidCount,messageId:$json.message_id||null,durationMs:Date.now()-new Date(s.startedAt).valueOf()}}];" }, [1500, -100], 2);
  return workflow("Agenda PUCMM — build-and-send-digest", [trigger, config, prepare, fetchEvents, fetchAds, fetchNode, shouldSend, notExists, render, validate, transport, outlook, smtp, mark, log], {
    [trigger.name]: { main: [[{ node: config.name, type: "main", index: 0 }]] },
    [config.name]: { main: [[{ node: prepare.name, type: "main", index: 0 }]] },
    [prepare.name]: { main: [[{ node: fetchEvents.name, type: "main", index: 0 }]] },
    [fetchEvents.name]: { main: [[{ node: fetchAds.name, type: "main", index: 0 }]] },
    [fetchAds.name]: { main: [[{ node: fetchNode.name, type: "main", index: 0 }]] },
    [fetchNode.name]: { main: [[{ node: shouldSend.name, type: "main", index: 0 }]] },
    [shouldSend.name]: { main: [[{ node: notExists.name, type: "main", index: 0 }], []] },
    [notExists.name]: { main: [[{ node: render.name, type: "main", index: 0 }]] },
    [render.name]: { main: [[{ node: validate.name, type: "main", index: 0 }]] },
    [validate.name]: { main: [[{ node: transport.name, type: "main", index: 0 }]] },
    [transport.name]: { main: [[{ node: outlook.name, type: "main", index: 0 }], [{ node: smtp.name, type: "main", index: 0 }], []] },
    [outlook.name]: { main: [[{ node: mark.name, type: "main", index: 0 }]] },
    [smtp.name]: { main: [[{ node: mark.name, type: "main", index: 0 }]] },
    [mark.name]: { main: [[{ node: log.name, type: "main", index: 0 }]] },
  }, { errorWorkflow: workflowId("Agenda PUCMM — error-handler") });
}

function errorWorkflow() {
  sequence = 1;
  const trigger = node("Error Trigger", "errorTrigger", {}, [-300, 0], 1);
  const sanitize = node("Sanitizar alerta", "code", { jsCode: "const e=$json.execution||{};const w=$json.workflow||{};return [{json:{status:'failed',workflow:w.name||null,executionId:e.id||null,lastNode:e.lastNodeExecuted||null,error:String(e.error?.message||$json.error?.message||'Error').slice(0,500),timestamp:new Date().toISOString()}}];" }, [-40, 0], 2);
  const config = node("Configurar alerta", "set", { assignments: { assignments: [
    { id: "alert-1", name: "alertTo", value: "={{ String($vars.TEST_MODE || 'true') === 'true' ? ($vars.EMAIL_TEST_RECIPIENTS || '') : ($vars.ERROR_ALERT_EMAIL || '') }}", type: "string" },
    { id: "alert-2", name: "transport", value: "={{ $vars.EMAIL_TRANSPORT || 'microsoft_graph' }}", type: "string" },
  ] }, includeOtherFields: true, options: {} }, [180, 0], 3.4);
  const hasTarget = node("¿Hay destinatario de alerta?", "if", { conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ leftValue: "={{ $json.alertTo }}", rightValue: "", operator: { type: "string", operation: "notEmpty", singleValue: true } }], combinator: "and" }, options: {} }, [400, 0], 2.2);
  const transport = node("Transporte de alerta", "switch", { rules: { values: [{ conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ leftValue: "={{ $json.transport }}", rightValue: "microsoft_graph", operator: { type: "string", operation: "equals" } }], combinator: "and" } }, { conditions: { options: { typeValidation: "strict", version: 2 }, conditions: [{ leftValue: "={{ $json.transport }}", rightValue: "smtp", operator: { type: "string", operation: "equals" } }], combinator: "and" } }] }, options: {} }, [620, -80], 3.3);
  const outlook = node("Alerta Microsoft Graph", "microsoftOutlook", { resource: "message", operation: "send", authentication: "microsoftOutlookOAuth2Api", toRecipients: "={{ $json.alertTo }}", subject: "={{ (String($vars.TEST_MODE || 'true') === 'true' ? '[PRUEBA] ' : '') + 'Error Agenda PUCMM — ' + $json.workflow }}", bodyContent: "={{ 'Workflow: ' + $json.workflow + '<br/>Nodo: ' + $json.lastNode + '<br/>Error: ' + $json.error + '<br/>Execution ID: ' + $json.executionId }}", additionalFields: { bodyContentType: "html", saveToSentItems: true } }, [850, -140], 2);
  outlook.credentials = { microsoftOutlookOAuth2Api: { id: "CONFIGURE_IN_N8N", name: "PUCMM Agenda Microsoft Outlook" } };
  const smtp = node("Alerta SMTP", "emailSend", { fromEmail: "={{ ($vars.EMAIL_FROM_NAME || 'PUCMM Día a Día') + ' <' + ($vars.EMAIL_FROM || '') + '>' }}", toEmail: "={{ $json.alertTo }}", subject: "={{ (String($vars.TEST_MODE || 'true') === 'true' ? '[PRUEBA] ' : '') + 'Error Agenda PUCMM — ' + $json.workflow }}", emailFormat: "text", text: "={{ 'Workflow: ' + $json.workflow + '\nNodo: ' + $json.lastNode + '\nError: ' + $json.error + '\nExecution ID: ' + $json.executionId }}", options: {} }, [850, 0], 2.1);
  smtp.credentials = { smtp: { id: "CONFIGURE_IN_N8N", name: "PUCMM Agenda SMTP" } };
  return workflow("Agenda PUCMM — error-handler", [trigger, sanitize, config, hasTarget, transport, outlook, smtp], {
    [trigger.name]: { main: [[{ node: sanitize.name, type: "main", index: 0 }]] },
    [sanitize.name]: { main: [[{ node: config.name, type: "main", index: 0 }]] },
    [config.name]: { main: [[{ node: hasTarget.name, type: "main", index: 0 }]] },
    [hasTarget.name]: { main: [[{ node: transport.name, type: "main", index: 0 }], []] },
    [transport.name]: { main: [[{ node: outlook.name, type: "main", index: 0 }], [{ node: smtp.name, type: "main", index: 0 }], []] },
  });
}

const files = {
  "agenda-daily.json": scheduledWorkflow("daily", "0 8 * * 2-6"),
  "agenda-weekly.json": scheduledWorkflow("weekly", "0 8 * * 1"),
  "agenda-monthly.json": scheduledWorkflow("monthly", "0 8 * * 1"),
  "agenda-build-send.json": buildSendWorkflow(),
  "agenda-error-handler.json": errorWorkflow(),
};

for (const [file, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, file), `${JSON.stringify(content, null, 2)}\n`);
}
