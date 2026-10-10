import {createHash} from 'node:crypto';
import {fail,seedRating,clean,httpsURL} from './core.mjs';
import {config} from './services.mjs';
export function decodeImage(data){
 const match=String(data||'').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
 if(!match)throw fail('Choose a JPEG, PNG or WebP image.');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.length>2500000||bytes.length<12)throw fail('Use an image smaller than 2.5 MB.');
 const type=match[1];
 const valid=type==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)throw fail('Image data does not match its file type.');
 return {bytes,type,hash:createHash('sha256').update(bytes).digest('hex')};
}
export async function uploadSeed(input,user,token){
 const rating=seedRating(input.rating);if(!rating)throw fail('Rate this example before saving.');
 const image=decodeImage(input.data);const c=config();const path=`${user.id}/${image.hash}.${image.type==='jpeg'?'jpg':image.type}`;
 const source_url=input.source_url?httpsURL(input.source_url):null;
 const r=await fetch(`${c.url}/storage/v1/object/scout-seeds/${path}`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:c.key,Authorization:`Bearer ${token}`,'Content-Type':`image/${image.type}`,'x-upsert':'false'},body:image.bytes});
 if(!r.ok){const error=await r.json().catch(()=>({}));if(![409,'409'].includes(error.statusCode)&&r.status!==409)throw fail('Image upload failed. Check that the seed-image migration was applied.',502);}
 return {owner_id:user.id,title:clean(input.title).slice(0,240)||'Seed image',image_url:`${c.url}/storage/v1/object/authenticated/scout-seeds/${path}`,storage_path:path,source_url,source:'Seed upload',caption:clean(input.caption),rating};
}
