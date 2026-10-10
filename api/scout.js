import {candidate,historyRow,parseCSV,fail,statuses,finalScores,seedRating} from '../lib/core.mjs';
import {uploadSeed} from '../lib/uploads.mjs';
import {config,supa,analyze,signSeeds} from '../lib/services.mjs';
import {discover,availableSources} from '../lib/sources.mjs';
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=' )).filter(x=>x.length===2));
function session(res,data){const secure=process.env.NODE_ENV==='production'||!!process.env.VERCEL; const attrs=`; HttpOnly; SameSite=Strict; Path=/${secure?'; Secure':''}`;res.setHeader('Set-Cookie',[`scout_access=${data.access_token||''}; Max-Age=${data.expires_in||0}${attrs}`,`scout_refresh=${data.refresh_token||''}; Max-Age=${data.refresh_token?2592000:0}${attrs}`]);}
async function bodyOf(req){if(req.body){const b=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(b)>3800000)throw fail('Request too large.',413);try{return typeof req.body==='string'?JSON.parse(b):req.body;}catch{throw fail('Invalid JSON.');}}let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>3800000)throw fail('Request too large.',413);}try{return raw?JSON.parse(raw):{};}catch{throw fail('Invalid JSON.');}}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 try{
 if(req.method!=='POST')throw fail('Use POST.',405);
 const origin=req.headers.origin;const expected=process.env.APP_ORIGIN||(!process.env.VERCEL?'http://localhost:3000':null);
 if(!expected||origin!==expected)throw fail('Request origin denied. Set APP_ORIGIN to this site URL.',403);
 const b=await bodyOf(req);const c=config();const ready=!!(c.url&&c.key&&c.owner);
 if(b.action==='health')return send(200,{ready,ai:!!c.openai,sources:availableSources()});
 if(!ready)throw fail('Connect Supabase and set OWNER_EMAIL in Vercel before signing in.',503);
 if(b.action==='logout'){session(res,{});return send(200,{ok:true});}
 if(b.action==='login'){
 if(String(b.email).toLowerCase()!==c.owner)throw fail('Sign-in failed. Check your email and password.',401);
 const data=await supa('/auth/v1/token?grant_type=password',null,{method:'POST',body:{email:b.email,password:b.password}});session(res,data);return send(200,{email:data.user.email});}
 let token=cookies(req).scout_access;let user;
 if(token){try{user=await supa('/auth/v1/user',token);}catch(e){if(e.status!==401)throw e;}}
 if(!user&&cookies(req).scout_refresh){const data=await supa('/auth/v1/token?grant_type=refresh_token',null,{method:'POST',body:{refresh_token:cookies(req).scout_refresh}});token=data.access_token;user=data.user;session(res,data);}
 if(!user)throw fail('Sign in to your private scout.',401);
 if(user.email?.toLowerCase()!==c.owner)throw fail('This scout is private.',403);
 const db=(path,opts)=>supa('/rest/v1/'+path,token,opts); const insertHeaders={Prefer:'return=representation,resolution=merge-duplicates'};
 if(b.action==='session')return send(200,{email:user.email});
 if(b.action==='list'){const [items,history]=await Promise.all([db('scout_items?select=id,title,image_url,source_url,source,creator,license,license_url,query,status,analysis,scores,created_at&order=created_at.desc&limit=300'),db('scout_history?select=id,title,image_url,source_url,caption,likes,comments,saves,reach,rating,storage_path,analysis,created_at&order=created_at.desc&limit=200')]);return send(200,{items,history:await signSeeds(history,token)});}
 if(b.action==='discover'){const q=String(b.query||'').trim().slice(0,200);if(q.length<3)throw fail('Enter at least three characters.');const found=await discover(q,b.source||'all');if(!found.items.length)return send(200,{added:0,warnings:found.warnings,source_results:found.source_results});
 // Ignore duplicates to preserve human decisions and earlier analysis.
 const saved=await db('scout_items?on_conflict=owner_id,image_url',{method:'POST',headers:{Prefer:'return=representation,resolution=ignore-duplicates'},body:found.items.map(x=>({...x,owner_id:user.id}))});return send(200,{added:saved.length,warnings:found.warnings,source_results:found.source_results});}
 if(b.action==='add'){const saved=await db('scout_items?on_conflict=owner_id,image_url',{method:'POST',headers:{Prefer:'return=representation,resolution=ignore-duplicates'},body:{...candidate(b.item),owner_id:user.id}});return send(200,{added:saved.length});}
 if(b.action==='upload-seed'){const row=await uploadSeed(b.item||{},user,token);const saved=await db('scout_history?on_conflict=owner_id,image_url',{method:'POST',headers:{Prefer:'return=representation,resolution=ignore-duplicates'},body:row});return send(200,{added:saved.length});}
 if(b.action==='rate'){if(!/^[\da-f-]{36}$/i.test(b.id||''))throw fail('Invalid image ID.');const rating=seedRating(b.rating);if(!rating)throw fail('Select a rating.');const rows=await db(`scout_history?id=eq.${b.id}`,{method:'PATCH',headers:insertHeaders,body:{rating}});if(!rows.length)throw fail('Seed image not found.',404);return send(200,{ok:true});}
 if(b.action==='import'){const rows=b.csv!==undefined?parseCSV(String(b.csv)):[historyRow(b.item||{})];if(!rows.length)throw fail('No rows to import.');const saved=await db('scout_history?on_conflict=owner_id,image_url',{method:'POST',headers:{Prefer:'return=representation,resolution=ignore-duplicates'},body:rows.map(x=>({...x,owner_id:user.id}))});return send(200,{added:saved.length});}
 if(b.action==='feedback'){if(!statuses.includes(b.status))throw fail('Invalid review action.');if(!/^[\da-f-]{36}$/i.test(b.id||''))throw fail('Invalid image ID.');const result=await db(`scout_items?id=eq.${b.id}`,{method:'PATCH',headers:insertHeaders,body:{status:b.status,reviewed_at:new Date().toISOString()}});if(!result.length)throw fail('Image not found.',404);return send(200,{ok:true});}
 if(b.action==='analyze'){
 if(!c.openai)throw fail('Add OPENAI_API_KEY in Vercel to enable analysis.',503);
 const table=b.kind==='history'?'scout_history':'scout_items';if(!/^[\da-f-]{36}$/i.test(b.id||''))throw fail('Invalid image ID.');const [item]=await db(`${table}?id=eq.${b.id}&select=*&limit=1`);if(!item)throw fail('Image not found.',404);
 if(item.analysis&&!b.reanalyze)return send(200,{cached:true});
 const limit=Number(process.env.DAILY_ANALYSIS_LIMIT||30);if(!Number.isInteger(limit)||limit<1||limit>1000)throw fail('Invalid daily analysis limit.',503);
 const budget=await db('rpc/reserve_analysis',{method:'POST',body:{daily_limit:limit}});if(!budget)throw fail('Daily analysis limit reached. Try tomorrow.',429);
 const [history,feedback]=await Promise.all([db('scout_history?select=title,caption,analysis,likes,saves,reach,rating&analysis=not.is.null&order=created_at.desc&limit=30'),db('scout_items?select=title,status,analysis&analysis=not.is.null&status=in.(approved,rejected)&order=reviewed_at.desc&limit=20')]);
 const [visibleItem]=await signSeeds([item],token);
 const result=await analyze(visibleItem,[...history.map(x=>({...x,kind:'history'})),...feedback]);
 const matches=await db('rpc/match_scout',{method:'POST',body:{query_embedding:JSON.stringify(result.embedding),exclude_id:item.id}});
 const scores=finalScores(result.analysis,matches||[]);
 await db(`${table}?id=eq.${b.id}`,{method:'PATCH',body:{analysis:result.analysis,embedding:JSON.stringify(result.embedding),...(table==='scout_items'?{scores}: {})}});return send(200,{analysis:result.analysis,scores});
 }
 throw fail('Unknown action.');
 }catch(e){const status=e.status|| (e.name==='TimeoutError'?504:500);send(status,{error:status===500?'Unexpected error. Please try again.':e.message});}
}
