const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function citedText(section){
 const text=String(section.text||'');let end=0,html='';
 const citations=[...(section.citations||[])].sort((a,b)=>a.start-b.start);
 for(const c of citations){
  const link=safeURL(c.url);
  if(!link||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<end||c.end<c.start||c.end>text.length)continue;
  html+=escape(text.slice(end,c.start));
  html+=`<a class="citation" href="${escape(link)}" target="_blank" rel="noopener noreferrer" title="${escape(c.title)}">${escape(text.slice(c.start,c.end)||'[source]')}</a>`;
  end=c.end;
 }
 return html+escape(text.slice(end));
}
export function researchBrief(entry){
 const sources=new Map();
 for(const s of entry.sections||[])for(const c of s.citations||[]){const link=safeURL(c.url);if(link&&!sources.has(link))sources.set(link,c.title||new URL(link).hostname);}
 return `<p class="small">Saved with this image · ${escape(new Date(entry.created_at).toLocaleDateString())}</p>${(entry.sections||[]).map(s=>`<div class="research-text">${citedText(s)}</div>`).join('')}<h4>Read the sources</h4><ul class="research-sources">${[...sources].map(([href,title])=>`<li><a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a></li>`).join('')}</ul>`;
}
export function researchPanel(item,kind){
 const saved=item.analysis?.research||[];
 return `<section class="story-panel" aria-labelledby="story-title"><span class="eyebrow">BEHIND THE IMAGE</span><h3 id="story-title">Research the story</h3><p>Explore the people, places and events behind this find. Research includes sources and saves here automatically.</p><form id="research-form" data-id="${escape(item.id)}" data-kind="${escape(kind)}"><label for="research-query">What would you like to know?</label><textarea id="research-query" name="query" rows="3" minlength="3" maxlength="400" required>${escape(`What is the story behind ${item.title}?`)}</textarea><button class="primary">Research the story ↗</button></form><p class="small">Uses AI web search and your daily AI allowance. Reopening a saved question is free. Findings may include broader context; check the cited sources before publishing.</p><p id="research-status" role="status" hidden></p><div id="research-results">${saved.length?`<h4>Saved research · ${saved.length}</h4>`+saved.map((r,i)=>`<details class="research-entry" ${i===0?'open':''}><summary>${escape(r.query)}</summary>${researchBrief(r)}</details>`).join(''):'<div class="research-empty">Your first story starts with a question. Try the image title, a name, or an event.</div>'}</div></section>`;
}
export function threadOptions(item,kind){
 const queries=item.analysis?.rabbit_holes||[];
 return `<section class="thread-options"><h3>Follow the thread</h3><p class="small">Find another image or investigate the story.</p>${queries.length?queries.map(q=>`<div class="thread-option"><p>${escape(q)}</p><div><button class="secondary" data-query="${escape(q)}">Find images ↗</button><button class="secondary" data-research="${escape(item.id)}" data-kind="${escape(kind)}" data-question="${escape(q)}">Research story ↗</button></div></div>`).join(''):'<p>Analyze the image to get related search suggestions, or ask a question in the story panel.</p>'}</section>`;
}
