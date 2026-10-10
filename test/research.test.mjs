import test from 'node:test';
import assert from 'node:assert/strict';
import {researchResult,researchQuery,updateAnalysis} from '../lib/research.mjs';
import {citedText,researchPanel,threadOptions} from '../public/research-view.js';
const response=(annotations=[{type:'url_citation',url:'https://archive.org/record',title:'Original record',start_index:10,end_index:13}])=>({status:'completed',output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'A voyage. [1]',annotations}]}]});
test('research requires completed web search and real citation annotations',()=>{
 const r=researchResult(response(),'Who sailed?');assert.equal(r.sections[0].citations[0].url,'https://archive.org/record');assert.equal(r.query,'Who sailed?');
 assert.throws(()=>researchResult({...response(),status:'incomplete'},'x'),/did not finish/);
 assert.throws(()=>researchResult({...response(),output:response().output.slice(1)},'x'),/did not finish/);
 assert.throws(()=>researchResult(response([]),'x'),/No cited findings/);
});
test('malformed citation URLs and ranges never become trusted sources',()=>{
 const bad=[{url:'javascript:alert(1)',start_index:0,end_index:4},{url:'https://a.org',start_index:-1,end_index:4},{url:'https://a.org',start_index:0,end_index:999},{url:'https://user:password@a.org',start_index:0,end_index:4}];
 for(const a of bad)assert.throws(()=>researchResult(response([{type:'url_citation',...a}]),'x'),/No cited findings/);
});
test('citation rendering preserves claim text, escapes HTML and allows only web URLs',()=>{
 const section={text:'<script>Claim</script> [1]',citations:[{url:'https://a.org/?q="x"',title:'<img>',start:22,end:25}]};
 const html=citedText(section);assert.ok(html.includes('&lt;script&gt;Claim&lt;/script&gt;'));assert.ok(html.includes('rel="noopener noreferrer"'));assert.ok(!html.includes('<script>'));
 const unsafe=citedText({text:'claim',citations:[{url:'javascript:alert(1)',start:0,end:5}]});assert.equal(unsafe,'claim');
});
test('image with only research is usable without visual analysis, with escaped questions',()=>{
 const item={id:'x',title:'<img onerror=alert(1)>',analysis:{research:[{query:'A question?',created_at:'2026-10-10',sections:[]}]}};
 const panel=researchPanel(item,'candidate');assert.ok(panel.includes('Saved research · 1'));assert.ok(panel.includes('&lt;img'));assert.ok(!panel.includes('<img '));assert.ok(threadOptions(item,'candidate').includes('ask a question'));
 assert.throws(()=>researchQuery('a',item),/between/);assert.throws(()=>researchQuery('a'.repeat(401),item),/between/);
});
test('concurrent analysis write retries and preserves the newer research',async()=>{
 let reads=0,patches=0;const saved=await updateAnalysis(async(path,opts)=>{
  if(!opts)return [{analysis:++reads===1?{description:'old'}:{description:'new',_scout_revision:'revision-2',research:[{query:'Other thread'}]}}];
  patches++;assert.ok(path.includes(patches===1?'_scout_revision=is.null':'_scout_revision=eq.revision-2'));if(patches===1)return [];return [{analysis:opts.body.analysis}];
 },'scout_items','id',previous=>({analysis:{...previous,research:[...(previous.research||[]),{query:'My thread'}]}}));
 assert.equal(patches,2);assert.equal(saved.analysis.description,'new');assert.equal(saved.analysis.research.length,2);
});
