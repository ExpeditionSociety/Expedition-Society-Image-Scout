export const ratings=['Excellent','Good','Average','Poor'];
export function seedRating(value){if(value==null||value==='')return null;const r=ratings.find(x=>x.toLowerCase()===String(value).toLowerCase());if(!r)throw fail('Choose Excellent, Good, Average, or Poor.');return r;}
export const statuses=['pending','approved','later','rejected'];
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function httpsURL(value){
 let u; try{u=new URL(String(value));}catch{throw fail('A valid public HTTPS URL is required.');}
 if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.hostname==='localhost'||/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)||u.hostname.includes(':'))throw fail('Use a public HTTPS URL.');
 return u.href;
}
export const clean=value=>String(value??'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').slice(0,2000);
export function candidate(input){
 return {title:clean(input.title).slice(0,240)||'Untitled image',image_url:httpsURL(input.image_url),source_url:httpsURL(input.source_url),source:clean(input.source).slice(0,80)||'Manual',creator:clean(input.creator).slice(0,400),license:clean(input.license).slice(0,400),license_url:input.license_url?httpsURL(input.license_url):null,query:clean(input.query).slice(0,200)};
}
export function historyRow(input){
 const item=candidate({...input,source:'Instagram history',source_url:input.post_url||input.source_url||input.image_url});
 const metrics={}; for(const key of ['likes','comments','saves','reach']){ const v=input[key]; metrics[key]=(v===undefined||v==='')?null:Number(v); if(metrics[key]!==null&&(!Number.isFinite(metrics[key])||metrics[key]<0))throw fail('Metrics must be nonnegative numbers.'); }
 return {...item,rating:seedRating(input.rating),caption:clean(input.caption),...metrics};
}
export function parseCSV(text){
 if(text.length>500000)throw fail('CSV is too large. Import up to 200 posts.');
 const rows=[]; let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i]; if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell!=='')throw fail('Invalid CSV quoting.');else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw fail('CSV has an unclosed quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 const headers=(rows.shift()||[]).map((x,i)=>x.trim().replace(i===0?/^\uFEFF/:/$^/,''));
 if(!headers.includes('image_url'))throw fail('CSV must include image_url.');
 if(new Set(headers).size!==headers.length)throw fail('CSV headers must be unique.');
 if(rows.length>200)throw fail('Import no more than 200 posts at a time.');
 return rows.map((r,i)=>{if(r.length!==headers.length)throw fail(`CSV row ${i+2} has the wrong number of columns.`); return historyRow(Object.fromEntries(headers.map((h,j)=>[h,r[j]])));});
}
export function normalizedAnalysis(data){
 if(!data||typeof data.description!=='string'||!data.description.trim())throw fail('AI returned an incomplete analysis.',502);
 const score=k=>{const v=Number(data[k]);if(!Number.isFinite(v))throw fail('AI returned an invalid score.',502);return Math.max(0,Math.min(100,Math.round(v)));};
 return {description:clean(data.description),tags:Array.isArray(data.tags)?data.tags.slice(0,12).map(clean):[],brand_fit:score('brand_fit'),visual_match:score('visual_match'),engagement_potential:score('engagement_potential'),rationale:clean(data.rationale),rabbit_holes:Array.isArray(data.rabbit_holes)?data.rabbit_holes.slice(0,4).map(x=>clean(x).slice(0,160)):[]};
}
export function finalScores(a,matches){
 const history=matches.filter(x=>['approved','Excellent','Good','history'].includes(x.status)||(x.kind==='history'&&!x.status));
 const nearest=history.length?Math.max(...history.map(x=>Number(x.similarity)||0)):null;
 const disliked=matches.filter(x=>['rejected','Poor'].includes(x.status));
 const penalty=disliked.length?Math.max(0,Math.max(...disliked.map(x=>Number(x.similarity)||0))-0.65)*35:0;
 const novelty=nearest===null?null:Math.round(Math.max(0,Math.min(100,(1-nearest)*100)));
 const taste=nearest===null?a.visual_match:Math.round(Math.max(0,nearest)*100);
 return {taste_match:nearest===null?null:taste,novelty,score:Math.max(0,Math.min(100,Math.round(.45*a.brand_fit+.35*taste+.2*a.engagement_potential-penalty)))};
}
