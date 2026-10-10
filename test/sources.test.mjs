import test from 'node:test';import assert from 'node:assert/strict';
import {discover,availableSources} from '../lib/sources.mjs';
const respond=data=>new Response(JSON.stringify(data));
const image='https://images.example.org/';
function fixtures(url){const u=String(url);
 if(u.includes('commons.wikimedia.org'))return respond({query:{pages:{1:{title:'File:Sail.jpg',imageinfo:[{mime:'image/jpeg',url:image+'shared.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Sail.jpg'}]}}}});
 if(u.includes('loc.gov/photos'))return respond({results:[{title:'Sailing',image_url:[image+'loc.jpg'],url:'https://www.loc.gov/item/123/'},{title:'Same image elsewhere',image_url:[image+'shared.jpg'],url:'https://www.loc.gov/item/124/'}]});
 if(u.includes('archive.org/advancedsearch'))return respond({response:{docs:[{identifier:'sailing-magazine_01',title:'Sailing magazine',creator:['Publisher'],licenseurl:'http://creativecommons.org/publicdomain/mark/1.0/'},{identifier:'../../evil'}]}});
 if(u.includes('images-api.nasa.gov'))return respond({collection:{items:[{data:[{nasa_id:'Apollo_01',title:'Apollo',photographer:'NASA photographer'}],links:[{rel:'preview',href:image+'nasa.jpg'}]},{data:[{nasa_id:'no-image'}]}]}});
 if(u.includes('api.artic.edu'))return respond({data:[{id:1,image_id:'painting-id',title:'Sailing',artist_display:'Artist',is_public_domain:true},{id:2,image_id:'copyright-id',is_public_domain:false}]});
 if(u.includes('clevelandart.org'))return respond({data:[{title:'Ship',url:'https://www.clevelandart.org/art/1',share_license_status:'CC0',images:{web:{url:image+'cleveland.jpg'}},creators:[{description:'Artist'}]},{share_license_status:'Copyrighted',images:{web:{url:image+'restricted.jpg'}}}]});
 if(u.includes('/v1.1/search'))return respond({objectIDs:[1,2,3]});
 if(u.includes('/v1/objects/1'))return respond({objectID:1,title:'Ship',isPublicDomain:true,primaryImageSmall:image+'met.jpg',objectURL:'https://www.metmuseum.org/art/collection/search/1'});
 if(u.includes('/v1/objects/2'))return respond({objectID:2,isPublicDomain:false,primaryImage:image+'restricted-met.jpg'});
 if(u.includes('/v1/objects/3'))return respond({objectID:3,isPublicDomain:true,primaryImage:''});
 throw Error('Unrecognized provider: '+u);
}
test('all seven sources normalize provenance, deduplicate and interleave finds',async()=>{const original=global.fetch;global.fetch=async u=>fixtures(u);try{const r=await discover('sailing');assert.equal(availableSources().length,10);assert.equal(r.source_results.length,7);assert.equal(r.warnings.length,0);assert.equal(r.items.length,7);assert.equal(new Set(r.items.map(x=>x.image_url)).size,7);assert.equal(r.items[0].source,'Wikimedia Commons');assert.equal(r.items[1].source,'Library of Congress');assert.equal(r.items[2].source,'Internet Archive');assert.ok(r.items.every(x=>x.image_url.startsWith('https://')&&x.source_url.startsWith('https://')));assert.equal(r.items.filter(x=>x.image_url.includes('restricted')).length,0);}finally{global.fetch=original;}});
test('one provider outage preserves all other results and labels the failure',async()=>{const original=global.fetch;global.fetch=async u=>String(u).includes('images-api.nasa.gov')?new Response('',{status:429}):fixtures(u);try{const r=await discover('sailing','all');assert.equal(r.warnings.length,1);assert.match(r.warnings[0],/NASA.*limit/);assert.ok(r.items.length>0);assert.equal(r.source_results.find(x=>x.id==='nasa').status,'rejected');}finally{global.fetch=original;}});
test('legitimate zero results are not presented as an outage',async()=>{const original=global.fetch;global.fetch=async()=>respond({collection:{items:[]}});try{const r=await discover('unlikely','nasa');assert.deepEqual(r.items,[]);assert.deepEqual(r.warnings,[]);assert.equal(r.source_results[0].status,'fulfilled');}finally{global.fetch=original;}});
test('unknown sources fail without requests; legacy both still uses just two archives',async()=>{const original=global.fetch;let calls=0;global.fetch=async u=>{calls++;return fixtures(u);};try{await assert.rejects(()=>discover('sail','unknown'),/supported/);assert.equal(calls,0);const r=await discover('sail','both');assert.equal(calls,2);assert.equal(r.source_results.length,2);}finally{global.fetch=original;}});
test('all-provider outage returns an actionable error',async()=>{const original=global.fetch;global.fetch=async()=>new Response('',{status:503});try{await assert.rejects(()=>discover('sail','all'),/NASA Image Library/);}finally{global.fetch=original;}});

test('copyright-free mode excludes attribution licenses, unknown rights and excluded providers',async()=>{
 const original=global.fetch;const calls=[];global.fetch=async u=>{
  calls.push(String(u));
  if(String(u).includes('commons.wikimedia.org'))return respond({query:{pages:{1:{title:'File:Free.jpg',imageinfo:[{mime:'image/jpeg',url:image+'free.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Free.jpg',extmetadata:{LicenseShortName:{value:'Public domain'}}}]},2:{title:'File:Attribution.jpg',imageinfo:[{mime:'image/jpeg',url:image+'by.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:By.jpg',extmetadata:{LicenseShortName:{value:'CC BY 4.0'}}}]},3:{title:'File:Unknown.jpg',imageinfo:[{mime:'image/jpeg',url:image+'unknown.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Unknown.jpg'}]}}}});
  return fixtures(u);
 };
 try{const r=await discover('sailing','publicdomain');assert.equal(r.source_results.length,5);assert.equal(r.items.length,5);assert.ok(r.items.some(x=>x.image_url===image+'free.jpg'));assert.ok(r.items.every(x=>!['Library of Congress','NASA Image Library'].includes(x.source)));assert.ok(!r.items.some(x=>/by.jpg|unknown.jpg/.test(x.image_url)));assert.ok(calls.every(x=>!x.includes('nasa.gov')&&!x.includes('loc.gov')));}finally{global.fetch=original;}
});
test('copyright-free matcher requires explicit metadata rather than vague rights notes',async()=>{
 const {copyrightFree}=await import('../lib/sources.mjs');
 assert.equal(copyrightFree({license:'Not public domain'}),false);assert.equal(copyrightFree({license:'No known copyright restrictions'}),false);assert.equal(copyrightFree({license:'CC BY-SA 4.0'}),false);
 assert.equal(copyrightFree({license:'CC0 1.0'}),true);assert.equal(copyrightFree({license_url:'https://creativecommons.org/publicdomain/zero/1.0/'}),true);assert.equal(copyrightFree({license_url:'https://evil.org/publicdomain/zero/1.0/'}),false);
});
