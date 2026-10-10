export function externalSearchURL(source,query){
 const sites={pinterest:['https://www.pinterest.com/search/pins/','q'],flickr:['https://www.flickr.com/search/','text']};
 if(!sites[source])return null;
 const [base,key]=sites[source];const u=new URL(base);u.searchParams.set(key,String(query).trim());return u.href;
}
export function sourceHint(source){
 if(source==='publicdomain')return 'Only images explicitly marked public domain or CC0 in source metadata. Check the original record before publishing.';
 if(source==='pinterest'||source==='flickr')return 'Opens search results in a new tab. Use Add image to keep a find and its original source. Rights vary by image.';
 return 'Search archive images and add new finds to your review queue.';
}
