import test from 'node:test';import assert from 'node:assert/strict';
import {parseCSV,httpsURL,candidate,finalScores,normalizedAnalysis} from '../lib/core.mjs';
test('CSV handles quoted commas, escaped quotes, newlines, BOM and missing metrics',()=>{
 const [r]=parseCSV('\uFEFFimage_url,post_url,title,caption,likes,saves,reach\r\nhttps://images.example.org/a.jpg,https://instagram.com/p/abc,"A, B","A ""quoted""\nstory",100,,1000\r\n');
 assert.equal(r.title,'A, B');assert.equal(r.caption,'A "quoted"\nstory');assert.equal(r.likes,100);assert.equal(r.saves,null);assert.equal(r.reach,1000);
});
test('CSV rejects malformed rows, quotes, headers and bad metrics before any writes',()=>{
 for(const x of ['caption\nhello','image_url,image_url\na,b','image_url,title\nhttps://example.com/a','image_url,title\nhttps://example.com/a,"oops','image_url,likes\nhttps://example.com/a,-1'])assert.throws(()=>parseCSV(x));
});
test('source URLs reject local, private, credentialed, non-HTTPS URLs',()=>{
 for(const x of ['javascript:alert(1)','http://example.com/a','https://127.0.0.1/a','https://10.1.2.3/a','https://172.20.1.1/a','https://[::1]/a','https://user:pass@example.com'])assert.throws(()=>httpsURL(x));
 assert.equal(httpsURL('https://commons.wikimedia.org/wiki/File:Example.jpg'),'https://commons.wikimedia.org/wiki/File:Example.jpg');
});
test('candidate cannot smuggle ownership, scores, or review status',()=>{const c=candidate({title:'<b>Image</b>',image_url:'https://example.com/a.jpg',source_url:'https://example.com/source',owner_id:'other',status:'approved',scores:{score:100}});assert.equal(c.title,'Image');assert.equal(c.owner_id,undefined);assert.equal(c.status,undefined);});
test('feedback penalizes matching rejected finds, later is neutral, cold start is explicit',()=>{
 const a={brand_fit:90,visual_match:80,engagement_potential:70};const cold=finalScores(a,[]);assert.equal(cold.novelty,null);assert.equal(cold.taste_match,null);
 const positive=finalScores(a,[{kind:'history',similarity:.8}]);assert.equal(positive.taste_match,80);assert.equal(positive.novelty,20);
 const negative=finalScores(a,[{kind:'history',similarity:.8},{status:'rejected',similarity:.99}]);assert.ok(negative.score<positive.score);
 assert.deepEqual(finalScores(a,[{status:'later',similarity:.9}]),cold);
});
test('AI output is validated and scores constrained',()=>{assert.throws(()=>normalizedAnalysis({}));assert.throws(()=>normalizedAnalysis({description:'a',brand_fit:'bad'}));const a=normalizedAnalysis({description:'image',brand_fit:120,visual_match:-3,engagement_potential:44});assert.equal(a.brand_fit,100);assert.equal(a.visual_match,0);});
