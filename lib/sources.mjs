import {candidate,clean,fail} from './core.mjs';
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ExpeditionSocietyImageScout/0.1 (personal editorial research)'}});if(!r.ok)throw fail(r.status===429?'Source request limit reached; try again later.':'Source search is temporarily unavailable.',502);return r.json();}
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

const cc0='https://creativecommons.org/publicdomain/zero/1.0/';
const https=value=>typeof value==='string'?value.replace(/^http:\/\//,'https://'):value;
const join=value=>Array.isArray(value)?value.join(', '):value;
const rows=(data,map)=>data.flatMap(x=>{try{const item=map(x);return item?[candidate(item)]:[];}catch{return [];}});
export async function internetArchive(query){
 const u=new URL('https://archive.org/advancedsearch.php');
 u.search=new URLSearchParams({q:`(${query}) AND (mediatype:image OR mediatype:texts)`,rows:'12',page:'1',output:'json'});
 for(const field of ['identifier','title','creator','licenseurl','mediatype'])u.searchParams.append('fl[]',field);
 const data=await json(u);if(data.error)throw fail('Internet Archive could not complete that query.',502);
 return rows(data.response?.docs||[],x=>{if(!/^[A-Za-z0-9_.-]+$/.test(x.identifier||''))return null;const license=Array.isArray(x.licenseurl)?x.licenseurl[0]:x.licenseurl;return {title:x.title||x.identifier,image_url:`https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,source_url:`https://archive.org/details/${encodeURIComponent(x.identifier)}`,source:'Internet Archive',creator:join(x.creator),license:license?'Item preview; verify license on source':'Item preview — check original files and rights',license_url:https(license)||null,query};});
}
export async function nasa(query){
 const u=new URL('https://images-api.nasa.gov/search');u.search=new URLSearchParams({q:query,media_type:'image',page_size:'12'});
 const data=await json(u);
 return rows(data.collection?.items||[],x=>{const d=x.data?.[0];const image=x.links?.find(l=>l.rel==='preview'&&/^https:\/\//.test(l.href));if(!d?.nasa_id||!image)return null;return {title:d.title,image_url:image.href,source_url:`https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,source:'NASA Image Library',creator:d.photographer||d.secondary_creator||d.center||'NASA',license:'NASA media guidelines apply; check third-party credits',license_url:'https://www.nasa.gov/nasa-brand-center/images-and-media/',query};});
}
export async function artic(query){
 const u=new URL('https://api.artic.edu/api/v1/artworks/search');u.search=new URLSearchParams({q:query,limit:'12',fields:'id,title,image_id,artist_display,is_public_domain','query[term][is_public_domain]':'true'});
 const data=await json(u);
 return rows(data.data||[],x=>x.image_id&&x.is_public_domain===true?{title:x.title,image_url:`https://www.artic.edu/iiif/2/${encodeURIComponent(x.image_id)}/full/843,/0/default.jpg`,source_url:`https://www.artic.edu/artworks/${x.id}`,source:'Art Institute of Chicago',creator:x.artist_display,license:'Public domain / CC0 open-access image',license_url:cc0,query}:null);
}
export async function cleveland(query){
 const u=new URL('https://openaccess-api.clevelandart.org/api/artworks/');u.search=new URLSearchParams({q:query,limit:'12',cc0:'',has_image:'1'});
 const data=await json(u);
 return rows(data.data||[],x=>x.images?.web?.url&&x.share_license_status==='CC0'?{title:x.title,image_url:https(x.images.web.url),source_url:https(x.url)||`https://www.clevelandart.org/art/${x.accession_number}`,source:'Cleveland Museum of Art',creator:(x.creators||[]).map(c=>c.description||c.name||'').filter(Boolean).join(', '),license:'CC0 open-access image',license_url:cc0,query}:null);
}
export async function met(query){
 const u=new URL('https://collectionapi.metmuseum.org/public/collection/v1.1/search');u.search=new URLSearchParams({q:query,hasImages:'true',limit:'12',offset:'0'});
 const search=await json(u);const ids=(search.objectIDs||[]).slice(0,12).filter(x=>Number.isInteger(x)&&x>0);const objects=[];let failed=0;
 // Bound concurrency and result count rather than requesting every matching object.
 for(let i=0;i<ids.length;i+=4){const results=await Promise.allSettled(ids.slice(i,i+4).map(id=>json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)));for(const r of results){if(r.status==='fulfilled')objects.push(r.value);else failed++;}}
 if(ids.length&&failed===ids.length)throw fail('The Met could not retrieve image records.',502);
 return rows(objects,x=>x.isPublicDomain===true&&(x.primaryImageSmall||x.primaryImage)?{title:x.title,image_url:x.primaryImageSmall||x.primaryImage,source_url:https(x.objectURL)||`https://www.metmuseum.org/art/collection/search/${x.objectID}`,source:'The Metropolitan Museum of Art',creator:x.artistDisplayName||x.culture,license:'Public domain / CC0 open-access image',license_url:cc0,query}:null);
}
const registry=[
 {id:'commons',label:'Wikimedia Commons',search:commons},
 {id:'loc',label:'Library of Congress',search:loc},
 {id:'internetarchive',label:'Internet Archive',search:internetArchive},
 {id:'nasa',label:'NASA Image Library',search:nasa},
 {id:'met',label:'The Metropolitan Museum of Art',search:met},
 {id:'artic',label:'Art Institute of Chicago',search:artic},
 {id:'cleveland',label:'Cleveland Museum of Art',search:cleveland}
];
export const availableSources=()=>registry.map(({id,label})=>({id,label}));
export async function discover(query,source='all'){
 let jobs;if(source==='all')jobs=registry;else if(source==='both')jobs=registry.slice(0,2);else jobs=registry.filter(x=>x.id===source);
 if(!jobs.length)throw fail('Choose a supported image source.');
 const results=await Promise.allSettled(jobs.map(x=>x.search(query)));
 const warnings=results.flatMap((r,i)=>r.status==='rejected'?[`${jobs[i].label}: ${r.reason.message}`]:[]);
 if(results.every(r=>r.status==='rejected'))throw fail(warnings.join(' '),502);
 const seen=new Set();const items=[];
 // Round-robin keeps the first visible results diverse across sources.
 const lists=results.map(r=>r.status==='fulfilled'?r.value:[]);
 for(let i=0;i<12;i++)for(const list of lists){const item=list[i];if(item&&!seen.has(item.image_url)){seen.add(item.image_url);items.push(item);}}
 return {items,warnings,source_results:results.map((r,i)=>({id:jobs[i].id,label:jobs[i].label,count:r.status==='fulfilled'?r.value.length:0,status:r.status}))};
}
