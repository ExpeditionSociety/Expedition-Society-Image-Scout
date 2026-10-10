import test from 'node:test';import assert from 'node:assert/strict';import handler from '../api/scout.js';
const owner='00000000-0000-4000-8000-000000000001';
Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key',OWNER_EMAIL:'owner@example.org',APP_ORIGIN:'http://localhost:3000',OPENAI_API_KEY:'test-server-key'});
async function call(body,headers={}){const req={method:'POST',body,headers:{origin:'http://localhost:3000',cookie:'scout_access=valid',...headers}};const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};await handler(req,res);return res;}
const json=(d,status=200)=>new Response(JSON.stringify(d),{status});
test('unauthenticated calls fail closed and do not query private tables',async()=>{
 const old=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('Unexpected request');};try{const r=await call({action:'list'},{cookie:''});assert.equal(r.statusCode,401);assert.equal(calls,0);}finally{global.fetch=old;}
});
test('cross-origin requests are rejected before authentication or paid work',async()=>{const r=await call({action:'analyze',id:owner},{origin:'https://evil.example.org'});assert.equal(r.statusCode,403);});
test('wrong owner denied even with valid Supabase session',async()=>{const old=global.fetch;global.fetch=async()=>json({id:owner,email:'other@example.org'});try{assert.equal((await call({action:'list'})).statusCode,403);}finally{global.fetch=old;}});
test('list uses the user JWT rather than any administrative key',async()=>{const old=global.fetch;const calls=[];global.fetch=async(u,o)=>{calls.push([u,o]);return json(u.endsWith('/auth/v1/user')?{id:owner,email:'owner@example.org'}:[]);};try{const r=await call({action:'list'});assert.equal(r.statusCode,200);assert.equal(calls.length,3);assert.ok(calls.every(([,o])=>o.headers.Authorization==='Bearer valid'));assert.deepEqual(r.body,{items:[],history:[]});}finally{global.fetch=old;}});
test('duplicate discovery inserts preserve review decisions and analysis',async()=>{const old=global.fetch;let insertion;global.fetch=async(u,o)=>{
 u=String(u);
 if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
 if(u.includes('commons.wikimedia.org'))return json({query:{pages:{1:{title:'File:Boat.jpg',imageinfo:[{mime:'image/jpeg',url:'https://upload.wikimedia.org/boat.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Boat.jpg',extmetadata:{LicenseShortName:{value:'CC BY 4.0'},Artist:{value:'<b>Person</b>'}}}]}}}});
 insertion=JSON.parse(o.body);assert.match(o.headers.Prefer,/ignore-duplicates/);return json(insertion);
 };try{const r=await call({action:'discover',query:'sailing',source:'commons'});assert.equal(r.statusCode,200);assert.equal(r.body.added,1);assert.equal(insertion[0].owner_id,owner);assert.equal(insertion[0].creator,'Person');assert.equal(insertion[0].status,undefined);}finally{global.fetch=old;}});
test('daily limit prevents paid calls',async()=>{const old=global.fetch;global.fetch=async(u)=>{if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});if(u.includes('scout_items?'))return json([{id:owner,image_url:'https://example.org/a.jpg'}]);if(u.endsWith('rpc/reserve_analysis'))return json(false);throw Error('Paid API must not be called');};try{const r=await call({action:'analyze',id:owner});assert.equal(r.statusCode,429);}finally{global.fetch=old;}});
test('analysis sends the actual image, validates embedding and persists score',async()=>{const old=global.fetch;let saved;
 global.fetch=async(u,o)=>{
 u=String(u);
 if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
 if(u.endsWith('rpc/reserve_analysis'))return json(true);
 if(u.endsWith('rpc/match_scout'))return json([{kind:'history',similarity:.8}]);
 if(u.endsWith('/responses')){const b=JSON.parse(o.body);assert.equal(b.store,false);assert.equal(b.input[0].content[1].type,'input_image');return json({output:[{content:[{type:'output_text',text:JSON.stringify({description:'A wooden boat with white sails.',tags:['boat'],brand_fit:90,visual_match:80,engagement_potential:70,rationale:'An adventurous image.',rabbit_holes:['wooden sailing ship']})}]}]});}
 if(u.endsWith('/embeddings'))return json({data:[{embedding:Array(1536).fill(.01)}]});
 if(o.method==='PATCH'){saved=JSON.parse(o.body);return json([saved]);}
 if(u.includes('scout_items?id='))return json([{id:owner,title:'Boat',image_url:'https://example.org/boat.jpg',analysis:{research:[{query:'Saved story'}]}}]);
 return json([]);
 };try{const r=await call({action:'analyze',id:owner});assert.equal(r.statusCode,200);assert.equal(saved.scores.taste_match,80);assert.equal(JSON.parse(saved.embedding).length,1536);assert.equal(saved.analysis.tags[0],'boat');assert.equal(saved.analysis.research[0].query,'Saved story');}finally{global.fetch=old;}
});
test('login cookies are HttpOnly and passwords not returned',async()=>{const old=global.fetch;global.fetch=async()=>json({user:{email:'owner@example.org'},access_token:'token',refresh_token:'refresh',expires_in:3600});try{const r=await call({action:'login',email:'owner@example.org',password:'secret'},{cookie:''});assert.equal(r.statusCode,200);assert.ok(r.headers['Set-Cookie'].every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')));assert.deepEqual(r.body,{email:'owner@example.org'});}finally{global.fetch=old;}});

test('research fetches sources, saves beside analysis and uses the shared budget',async()=>{
 const old=global.fetch;let saved,budget=0;const visual={description:'A ship',brand_fit:80,research:[{query:'An earlier question',sections:[]}]};
 global.fetch=async(u,o)=>{
  if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
  if(u.endsWith('rpc/reserve_analysis')){budget++;return json(true);}
  if(u.endsWith('/responses')){
   const b=JSON.parse(o.body);assert.equal(b.store,false);assert.equal(b.tools[0].type,'web_search');assert.equal(b.tool_choice,'required');assert.ok(!b.input.includes('private-file.jpg'));assert.ok(!b.input.includes('rating'));
   return json({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'An expedition. [1]',annotations:[{type:'url_citation',url:'https://loc.gov/record',title:'Archive',start_index:15,end_index:18}]}]}]});
  }
  if(o.method==='PATCH'){saved=JSON.parse(o.body);assert.match(u,/analysis->>_scout_revision=/);return json([saved]);}
  return json([{id:owner,title:'Ship',image_url:'https://example.org/private-file.jpg',analysis:visual}]);
 };
 try{const r=await call({action:'research',id:owner,query:'Who sailed on this ship?'});assert.equal(r.statusCode,200);assert.equal(budget,1);assert.equal(saved.analysis.description,'A ship');assert.equal(saved.analysis.research.length,2);assert.equal(r.body.research.query,'Who sailed on this ship?');}finally{global.fetch=old;}
});
test('cached research is free and research budget blocks additional paid work',async()=>{
 const old=global.fetch;let reserves=0;
 global.fetch=async(u)=>{
  if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
  if(u.includes('scout_items?'))return json([{id:owner,title:'Ship',analysis:{research:[{query:'Who sailed?',sections:[]}]}}]);
  if(u.endsWith('rpc/reserve_analysis')){reserves++;return json(false);}
  throw Error('Paid API must not be called');
 };
 try{const cached=await call({action:'research',id:owner,query:' WHO SAILED? '});assert.equal(cached.statusCode,200);assert.equal(cached.body.cached,true);assert.equal(reserves,0);assert.equal((await call({action:'research',id:owner,query:'What happened next?'})).statusCode,429);assert.equal(reserves,1);}finally{global.fetch=old;}
});
test('research requires owner session and existing row before paid work',async()=>{
 const old=global.fetch;let calls=0;
 global.fetch=async(u)=>{calls++;if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});if(u.includes('scout_items?'))return json([]);throw Error('Unexpected paid work');};
 try{assert.equal((await call({action:'research',id:owner},{cookie:''})).statusCode,401);assert.equal(calls,0);assert.equal((await call({action:'research',id:owner})).statusCode,404);assert.equal((await call({action:'research',id:'bad'})).statusCode,400);}finally{global.fetch=old;}
});
test('uncited or failed web research cannot overwrite saved image data',async()=>{
 const old=global.fetch;let writes=0;
 global.fetch=async(u,o)=>{
  if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
  if(u.endsWith('rpc/reserve_analysis'))return json(true);
  if(u.endsWith('/responses'))return json({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Unsupported claim.',annotations:[]}]}]});
  if(o.method==='PATCH'){writes++;throw Error('Must not save');}
  return json([{id:owner,title:'Ship',analysis:{description:'Existing analysis'}}]);
 };
 try{const r=await call({action:'research',id:owner});assert.equal(r.statusCode,502);assert.match(r.body.error,/No cited findings/);assert.equal(writes,0);}finally{global.fetch=old;}
});

test('bulk delete targets only selected pending rows owned by the signed-in user',async()=>{
 const old=global.fetch;let deletion;global.fetch=async(u,o)=>{
  if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
  deletion={url:u,options:o};return json([{id:owner}]);
 };
 try{const r=await call({action:'delete',ids:[owner,owner]});assert.equal(r.statusCode,200);assert.equal(r.body.deleted,1);assert.equal(deletion.options.method,'DELETE');assert.ok(deletion.url.includes(`id=in.(${owner})`));assert.ok(deletion.url.includes('status=eq.pending'));assert.ok(deletion.url.includes(`owner_id=eq.${owner}`));assert.equal(deletion.options.headers.Authorization,'Bearer valid');}finally{global.fetch=old;}
});
test('bulk delete rejects empty, malformed and oversized lists before writing',async()=>{
 const old=global.fetch;let writes=0;global.fetch=async(u,o)=>{if(o.method==='DELETE')writes++;return json({id:owner,email:'owner@example.org'});};
 try{for(const ids of [[],['bad'],[owner,'bad'],Array(301).fill(owner),null])assert.equal((await call({action:'delete',ids})).statusCode,400);assert.equal(writes,0);assert.equal((await call({action:'delete',ids:[owner]},{cookie:''})).statusCode,401);}finally{global.fetch=old;}
});

test('large deletions use bounded requests and report partial failure without losing remaining selections',async()=>{
 const old=global.fetch;const ids=Array.from({length:120},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`);let chunks=0;
 global.fetch=async(u,o)=>{
  if(u.endsWith('/auth/v1/user'))return json({id:owner,email:'owner@example.org'});
  chunks++;const selected=u.match(/id=in\.\(([^)]+)\)/)[1].split(',');assert.ok(selected.length<=50);assert.ok(u.length<2400);if(chunks===2)return json({},503);return json(selected.map(id=>({id})));
 };
 try{const r=await call({action:'delete',ids});assert.equal(r.statusCode,200);assert.equal(r.body.deleted,50);assert.equal(r.body.ids.length,50);assert.ok(r.body.warning);assert.equal(chunks,2);}finally{global.fetch=old;}
});
