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
 if(o.method==='PATCH'){saved=JSON.parse(o.body);return json(null);}
 if(u.includes('scout_items?id='))return json([{id:owner,title:'Boat',image_url:'https://example.org/boat.jpg'}]);
 return json([]);
 };try{const r=await call({action:'analyze',id:owner});assert.equal(r.statusCode,200);assert.equal(saved.scores.taste_match,80);assert.equal(JSON.parse(saved.embedding).length,1536);assert.equal(saved.analysis.tags[0],'boat');}finally{global.fetch=old;}
});
test('login cookies are HttpOnly and passwords not returned',async()=>{const old=global.fetch;global.fetch=async()=>json({user:{email:'owner@example.org'},access_token:'token',refresh_token:'refresh',expires_in:3600});try{const r=await call({action:'login',email:'owner@example.org',password:'secret'},{cookie:''});assert.equal(r.statusCode,200);assert.ok(r.headers['Set-Cookie'].every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')));assert.deepEqual(r.body,{email:'owner@example.org'});}finally{global.fetch=old;}});
