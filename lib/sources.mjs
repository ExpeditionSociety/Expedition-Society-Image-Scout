import {candidate,clean,fail} from './core.mjs';
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ExpeditionSocietyImageScout/0.1 (personal editorial research)'}});if(!r.ok)throw fail('Archive search is temporarily unavailable.',502);return r.json();}
export async function commons(query){
 const u=new URL('https://commons.wikimedia.org/w/api.php');
 u.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|extmetadata|mime',iiurlwidth:'900'});
 const data=await json(u); if(data.error)throw fail('Wikimedia could not complete that query.',502);
 return Object.values(data.query?.pages||{}).flatMap(p=>{
 const i=p.imageinfo?.[0];if(!i||!/^image\/(jpeg|png|webp)$/.test(i.mime))return [];
 const m=i.extmetadata||{};try{return [candidate({title:p.title.replace(/^File:/,''),image_url:i.thumburl||i.url,source_url:i.descriptionurl,source:'Wikimedia Commons',creator:m.Artist?.value,license:m.LicenseShortName?.value||'Check source',license_url:m.LicenseUrl?.value||null,query})];}catch{return [];}});
}
export async function loc(query){
 const u=new URL('https://www.loc.gov/photos/');u.search=new URLSearchParams({fo:'json',q:query,c:'12',at:'results'});
 const data=await json(u); return (data.results||[]).flatMap(p=>{
 const images=(p.image_url||[]).filter(x=>/^https:\/\//.test(x)); if(!images.length)return [];
 try{return [candidate({title:p.title,image_url:images.at(-1),source_url:p.url||p.id,source:'Library of Congress',creator:(p.contributor||[]).join(', '),license:'Check item rights & access',query})];}catch{return [];}});
}
export async function discover(query,source='both'){
 if(!['both','commons','loc'].includes(source))throw fail('Choose a supported archive.');
 const jobs=source==='both'?[['Wikimedia Commons',commons],['Library of Congress',loc]]:source==='commons'?[['Wikimedia Commons',commons]]:[['Library of Congress',loc]];
 const results=await Promise.allSettled(jobs.map(([,fn])=>fn(query)));
 const warnings=results.flatMap((r,i)=>r.status==='rejected'?[`${jobs[i][0]}: ${r.reason.message}`]:[]);
 if(results.every(r=>r.status==='rejected'))throw fail(warnings.join(' '),502);
 return {items:results.flatMap(r=>r.status==='fulfilled'?r.value:[]),warnings};
}
