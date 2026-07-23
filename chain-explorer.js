(()=>{
'use strict';
const BUILD='20260723-ai4';
const CONFIG_URL=`ai-config.json?v=${BUILD}`;
const STORE_URL=`chain-stores.json?v=${BUILD}`;
const OFFER_URL=`chain-offers.json?v=${BUILD}`;
const AI_TIMEOUT_MS=50000;
const TYPE_LABELS={limited_menu:'限定メニュー',event:'イベント',new_product:'新商品',sale_campaign:'セール・キャンペーン'};
const FILTERS=[['all','すべて'],['limited_menu','限定メニュー'],['event','イベント'],['new_product','新商品'],['sale_campaign','セール']];
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function json(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${url}を取得できません`);return response.json()}
const mapUrl=query=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query} 福岡県宗像市`)}`;
function isActive(item){return !item.endDate||item.endDate>=today()}
function dateLabel(item){
 if(item.dateLabel)return item.dateLabel;
 if(item.startDate>today())return `${item.startDate.replaceAll('-','/')}から`;
 if(item.endDate)return `${item.endDate.replaceAll('-','/')}まで${item.endDateIsEstimate?'（予定）':''}`;
 return '販売・開催中';
}
function localTags(item){
 const tags=[...(item.tagsSeed||[])];
 if(item.family)tags.push('家族向け');
 if(item.indoor)tags.push('雨の日');
 if(item.limited||item.endDate)tags.push('期間限定');
 if(item.type==='sale_campaign')tags.push('お得');
 return [...new Set(tags)].slice(0,5);
}
function urgency(item){
 if(!item.endDate)return 0;
 const days=Math.ceil((new Date(item.endDate+'T23:59:59+09:00')-new Date())/86400000);
 if(days<0)return -99;
 if(days<=3)return 6;
 if(days<=7)return 4;
 if(days<=14)return 2;
 return 0;
}
function localScore(item){
 let score=0;
 if(item.verifiedByOfficial)score+=3;
 if(item.limited)score+=2;
 if(item.type==='sale_campaign')score+=2;
 if(item.startDate>=today())score+=2;
 score+=urgency(item);
 return score;
}
function localRank(items){return [...items].sort((a,b)=>localScore(b)-localScore(a)||String(a.endDate||'9999').localeCompare(String(b.endDate||'9999'))).slice(0,5)}
function sanitize(item){const keys=['id','type','brand','title','place','region','summary','startDate','endDate','indoor','family','limited','verifiedByOfficial','availabilityNote','tagsSeed'];return Object.fromEntries(keys.map(key=>[key,item[key]]))}
async function callAi(endpoint,payload){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.code||`HTTP_${response.status}`);
  return body;
 }finally{clearTimeout(timer)}
}
function chip(text){return el('span','chain-chip',text)}
function renderStore(store){
 const card=el('article','chain-store-card');
 const top=el('div','chain-store-top');top.append(chip(store.brand),el('strong','',store.name));
 card.append(top,el('p','chain-muted',store.address));
 const services=el('div','chain-tags');for(const service of store.services||[])services.append(chip(service));card.append(services);
 const links=el('div','chain-links');
 const official=el('a','','公式店舗情報');official.href=store.url;official.target='_blank';official.rel='noopener noreferrer';
 const map=el('a','','地図');map.href=mapUrl(store.mapQuery||store.name);map.target='_blank';map.rel='noopener noreferrer';
 links.append(official,map);card.append(links);return card;
}
function renderOffer(item,state){
 const card=el('article','chain-offer-card');card.dataset.type=item.type;card.dataset.id=item.id;
 const heading=el('div','chain-card-head');const brand=chip(item.brand||'チェーン店');brand.classList.add('chain-brand');
 heading.append(brand,chip(TYPE_LABELS[item.type]||item.type));card.append(heading,el('h3','',item.title),el('p','chain-place',item.place),el('p','chain-summary',item.summary));
 const meta=el('div','chain-meta');meta.append(chip(dateLabel(item)));if(item.verifiedByOfficial)meta.append(chip('公式確認済み'));card.append(meta);
 const tags=el('div','chain-tags');for(const tag of localTags(item))tags.append(chip(tag));card.append(tags);
 if(item.availabilityNote)card.append(el('p','chain-note',item.availabilityNote));
 const aiBox=el('div','chain-ai-box');aiBox.hidden=true;card.append(aiBox);
 const controls=el('div','chain-card-controls');
 const compare=el('label','chain-compare');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=item.id;checkbox.addEventListener('change',()=>state.onSelection(item.id,checkbox.checked));compare.append(checkbox,document.createTextNode(' 比較に追加'));
 const summaryButton=el('button','chain-secondary','AI要約・タグ');summaryButton.type='button';
 summaryButton.addEventListener('click',async()=>{
  summaryButton.disabled=true;summaryButton.textContent='AIが整理中…';
  try{
   const result=state.endpoint?await callAi(state.endpoint,{action:'enrich',item:sanitize(item)}):null;
   const info=result&&result.summary?result:{summary:item.summary,tags:localTags(item),bestFor:'掲載内容を短く確認したいとき',caution:item.availabilityNote||'販売状況は公式情報で確認してください。',mode:'fallback'};
   aiBox.replaceChildren(el('strong','',result?'AI要約':'ルール要約'),el('p','',info.summary));
   const aiTags=el('div','chain-tags');for(const tag of info.tags||[])aiTags.append(chip(tag));aiBox.append(aiTags);
   if(info.bestFor)aiBox.append(el('p','chain-ai-detail',`向いている人：${info.bestFor}`));
   if(info.caution)aiBox.append(el('p','chain-ai-detail',`確認点：${info.caution}`));
   aiBox.hidden=false;
  }catch(error){
   console.warn('AI要約に失敗',error);aiBox.replaceChildren(el('strong','','ルール要約'),el('p','',item.summary),el('p','chain-ai-detail',item.availabilityNote||'販売状況は公式情報で確認してください。'));aiBox.hidden=false;
  }finally{summaryButton.disabled=false;summaryButton.textContent='AI要約・タグ'}
 });
 const official=el('a','chain-link-button','公式情報');official.href=item.url;official.target='_blank';official.rel='noopener noreferrer';
 controls.append(compare,summaryButton,official);card.append(controls);return card;
}
function renderRanking(container,items,result){
 container.replaceChildren();container.hidden=false;
 container.append(el('p','chain-ai-lead',result?.summary||'終了が近い情報や公式確認済みの情報を優先しました。'));
 const ranking=result?.ranking?.length?result.ranking:localRank(items).map((item,index)=>({id:item.id,reason:index===0?'公式確認済みで、今すぐ確認する価値が高い情報です。':'期間・新しさ・確認状態から上位にしました。'}));
 const byId=new Map(items.map(item=>[item.id,item]));
 ranking.forEach((row,index)=>{const item=byId.get(row.id);if(!item)return;const card=el('article','chain-rank-card');card.append(el('span','chain-rank-number',String(index+1)),el('div','',undefined));const body=card.lastChild;body.append(el('strong','',item.title),el('p','',row.reason));container.append(card)});
}
function renderComparison(container,selected,result){
 container.replaceChildren();container.hidden=false;
 container.append(el('p','chain-ai-lead',result?.summary||'種類、期間、利用場面を並べて比較しました。'));
 const byId=new Map(selected.map(item=>[item.id,item]));
 const rows=result?.comparison?.length?result.comparison:selected.map(item=>({id:item.id,bestFor:localTags(item).slice(0,2).join('・')||'気軽に試したい人',strength:item.summary,caution:item.availabilityNote||'公式情報で販売状況を確認'}));
 const grid=el('div','chain-compare-grid');
 for(const row of rows){const item=byId.get(row.id);if(!item)continue;const card=el('article','chain-compare-card');card.append(chip(item.brand),el('h3','',item.title),el('p','',`向いている人：${row.bestFor}`),el('p','',`強み：${row.strength}`),el('p','',`確認点：${row.caution}`));grid.append(card)}
 container.append(grid);if(result?.verdict)container.append(el('p','chain-verdict',`AIの結論：${result.verdict}`));
}
async function init(){
 const mount=el('section');mount.id='chain-discovery';mount.innerHTML='<div class="chain-shell"><div class="chain-title-row"><div><p class="chain-eyebrow">CHAIN DISCOVERY</p><h2>宗像のチェーン店情報</h2><p class="chain-intro">宗像市内に実在する店舗へ絞り、限定メニュー・イベント・新商品・セールをまとめました。</p></div><span class="chain-ai-status">AI機能を準備中</span></div><div class="chain-tools"><button type="button" id="chain-rank-button">今日のAIランキング</button><button type="button" id="chain-compare-button" disabled>選択した情報をAI比較</button><span id="chain-selection-count">0件選択</span></div><div class="chain-filter" role="group" aria-label="種類で絞り込み"></div><div id="chain-ranking" class="chain-ai-panel" hidden></div><div id="chain-comparison" class="chain-ai-panel" hidden></div><h3 class="chain-section-title">開催中・発売中の情報</h3><div id="chain-offer-grid" class="chain-offer-grid"></div><details class="chain-store-details"><summary>宗像市内で確認できたチェーン店舗</summary><div id="chain-store-grid" class="chain-store-grid"></div></details><p class="chain-footnote">全国企画でも、宗像市内に公式店舗が確認できるブランドだけを掲載しています。販売・在庫・実施状況は公式ページまたは店頭で確認してください。</p></div>';
 const anchor=document.querySelector('#local-highlights')||document.querySelector('#ai-recommender');
 if(anchor?.parentNode)anchor.parentNode.insertBefore(mount,anchor.nextSibling);else document.body.prepend(mount);
 const filter=mount.querySelector('.chain-filter'),offerGrid=mount.querySelector('#chain-offer-grid'),storeGrid=mount.querySelector('#chain-store-grid'),rankPanel=mount.querySelector('#chain-ranking'),comparePanel=mount.querySelector('#chain-comparison'),rankButton=mount.querySelector('#chain-rank-button'),compareButton=mount.querySelector('#chain-compare-button'),selectionText=mount.querySelector('#chain-selection-count'),aiStatus=mount.querySelector('.chain-ai-status');
 let config={endpoint:''},stores=[],offers=[],activeFilter='all';const selectedIds=new Set();
 try{[config,stores,offers]=await Promise.all([json(CONFIG_URL),json(STORE_URL),json(OFFER_URL)]);offers=offers.filter(isActive);aiStatus.textContent=config.endpoint?'Workers AI接続済み':'ルール機能で稼働中';if(config.endpoint)aiStatus.dataset.connected='true'}catch(error){console.error(error);aiStatus.textContent='読み込みに失敗しました';return}
 const state={endpoint:config.endpoint,onSelection(id,checked){checked?selectedIds.add(id):selectedIds.delete(id);if(selectedIds.size>3){selectedIds.delete(id);const box=offerGrid.querySelector(`input[value="${CSS.escape(id)}"]`);if(box)box.checked=false}selectionText.textContent=`${selectedIds.size}件選択`;compareButton.disabled=selectedIds.size<2||selectedIds.size>3}};
 const renderOffers=()=>{offerGrid.replaceChildren();for(const item of offers.filter(item=>activeFilter==='all'||item.type===activeFilter))offerGrid.append(renderOffer(item,state))};
 for(const [value,label] of FILTERS){const button=el('button','chain-filter-button',label);button.type='button';button.dataset.active=String(value==='all');button.addEventListener('click',()=>{activeFilter=value;for(const child of filter.children)child.dataset.active=String(child===button);selectedIds.clear();selectionText.textContent='0件選択';compareButton.disabled=true;renderOffers()});filter.append(button)}
 stores.forEach(store=>storeGrid.append(renderStore(store)));renderOffers();
 rankButton.addEventListener('click',async()=>{rankButton.disabled=true;rankButton.textContent='AIが順位を作成中…';try{const candidates=localRank(offers).concat(offers).filter((item,index,array)=>array.findIndex(x=>x.id===item.id)===index).slice(0,15);const result=config.endpoint?await callAi(config.endpoint,{action:'rank',candidates:candidates.map(sanitize),context:{date:today(),scope:'宗像市内で今日確認する価値'}}):null;renderRanking(rankPanel,offers,result)}catch(error){console.warn('AIランキングに失敗',error);renderRanking(rankPanel,offers,null)}finally{rankButton.disabled=false;rankButton.textContent='今日のAIランキング'}});
 compareButton.addEventListener('click',async()=>{const selected=offers.filter(item=>selectedIds.has(item.id));if(selected.length<2)return;compareButton.disabled=true;compareButton.textContent='AIが比較中…';try{const result=config.endpoint?await callAi(config.endpoint,{action:'compare',candidates:selected.map(sanitize)}):null;renderComparison(comparePanel,selected,result)}catch(error){console.warn('AI比較に失敗',error);renderComparison(comparePanel,selected,null)}finally{compareButton.disabled=false;compareButton.textContent='選択した情報をAI比較'}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();