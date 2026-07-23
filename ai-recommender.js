(()=>{
'use strict';
const BUILD='20260723-ai3';
const CONFIG_URL=`ai-config.json?v=${BUILD}`;
const DATA_URLS=[`discoveries.json?v=${BUILD}`,`offers.json?v=${BUILD}`,`offers-extra.json?v=${BUILD}`];
const MAX_AI_CANDIDATES=10;
const AI_TIMEOUT_MS=45000;
const TYPE_LABELS={new_store:'新店舗',limited_menu:'限定メニュー',event:'イベント',new_product:'新商品',sale_campaign:'セール'};
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const mapUrl=item=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.mapQuery||item.place||item.title} 福岡県宗像市`)}`;
async function json(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${url}を取得できません`);return response.json()}
function normalize(discoveries,offers){
 const stores=discoveries.map(x=>({id:x.id,type:'new_store',title:x.title,place:x.area||x.region,region:x.region,summary:x.summary,startDate:x.openDate,endDate:x.expiresAt,url:x.url,mapQuery:x.mapQuery,indoor:!!x.indoor,family:!!x.family,limited:!!x.limited,verifiedByOfficial:!!x.verifiedByOfficial}));
 return [...stores,...offers].filter(x=>!x.endDate||x.endDate>=today()).map(x=>({...x,place:x.place||x.region||'宗像市内',indoor:!!x.indoor,family:!!x.family,limited:x.limited??x.type==='limited_menu'}));
}
function score(item,prefs){
 let score=0;const reasons=[];
 if(prefs.interest==='all'||item.type===prefs.interest){score+=4;reasons.push('興味に合う')}
 if(prefs.company==='family'&&item.family){score+=3;reasons.push('家族向け')}
 if(prefs.weather==='indoor'&&item.indoor){score+=3;reasons.push('屋内で楽しめる')}
 if(prefs.limited==='yes'&&(item.limited||item.endDate)){score+=3;reasons.push('今だけの情報')}
 if(prefs.area!=='all'&&(item.region||item.place||'').includes(prefs.area)){score+=4;reasons.push('希望エリア')}
 if(item.verifiedByOfficial){score+=1;reasons.push('公式確認済み')}
 if(item.endDate){const days=Math.ceil((new Date(item.endDate+'T23:59:59+09:00')-new Date())/86400000);if(days>=0&&days<=7){score+=3;reasons.push(`終了まで${days===0?'今日':days+'日'}`)}}
 if(prefs.time==='short'&&item.type==='event')score-=1;
 return {score,reasons:reasons.slice(0,3)};
}
function rankForAi(items,prefs){
 const matching=prefs.interest==='all'?items:items.filter(item=>item.type===prefs.interest);
 const pool=matching.length>=3?matching:items;
 return pool.map(item=>({item,ranking:score(item,prefs).score})).sort((a,b)=>b.ranking-a.ranking||String(a.item.endDate||'9999').localeCompare(String(b.item.endDate||'9999'))).slice(0,MAX_AI_CANDIDATES).map(({item})=>item);
}
function fallback(items,prefs){
 const ranked=items.map(item=>({item,...score(item,prefs)})).sort((a,b)=>b.score-a.score||String(a.item.endDate||'9999').localeCompare(String(b.item.endDate||'9999'))).slice(0,3);
 return {mode:'fallback',summary:'掲載中の情報を条件に合わせて選びました。',recommendations:ranked.map(({item,reasons})=>({id:item.id,reason:reasons.length?`${reasons.join('・')}ためおすすめです。`:'現在掲載中で、今日の候補にしやすい情報です。'}))};
}
function validAiResult(value,allowedIds){
 if(!value||!Array.isArray(value.recommendations))return false;
 if(value.recommendations.length<1||value.recommendations.length>3)return false;
 return value.recommendations.every(x=>allowedIds.has(x.id)&&typeof x.reason==='string'&&x.reason.length>0&&x.reason.length<=180);
}
async function askAi(endpoint,items,prefs){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),AI_TIMEOUT_MS);
 try{
  const selected=rankForAi(items,prefs);
  const candidates=selected.map(({id,type,title,place,region,summary,startDate,endDate,indoor,family,limited,verifiedByOfficial})=>({id,type,title,place,region,summary,startDate,endDate,indoor,family,limited,verifiedByOfficial}));
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({preferences:prefs,candidates}),signal:controller.signal,cache:'no-store'});
  if(!response.ok){let detail='';try{const body=await response.json();detail=body?.code?` / ${body.code}`:''}catch{}throw new Error(`AI通信に失敗しました（${response.status}${detail}）`)}
  const result=await response.json();
  if(!validAiResult(result,new Set(selected.map(x=>x.id))))throw new Error('AIの回答形式が正しくありません');
  return {...result,mode:'ai'};
 }finally{clearTimeout(timeout)}
}
function field(label,name,options){const wrap=el('label','',label);const select=el('select');select.name=name;for(const [value,text] of options){const option=el('option','',text);option.value=value;select.append(option)}wrap.append(select);return wrap}
function renderResults(container,result,byId){container.replaceChildren();for(const [index,rec] of result.recommendations.entries()){const item=byId.get(rec.id);if(!item)continue;const card=el('article','ai-card');card.append(el('div','ai-rank',`おすすめ ${index+1}・${TYPE_LABELS[item.type]||'地域情報'}`),el('h3','',item.title),el('div','ai-place',item.place||item.region||'宗像市内'),el('p','ai-reason',rec.reason));const links=el('div','ai-links');if(item.url){const detail=el('a','','詳しく見る');detail.href=item.url;detail.target='_blank';detail.rel='noopener noreferrer';links.append(detail)}const map=el('a','','地図');map.href=mapUrl(item);map.target='_blank';map.rel='noopener noreferrer';links.append(map);card.append(links);container.append(card)}}
async function init(){
 const mount=el('section');mount.id='ai-recommender';const wrap=el('div','ai-wrap');const head=el('div','ai-head');const titles=el('div');titles.append(el('h2','','今日の宗像おすすめ'),el('p','ai-sub','条件を選ぶと、掲載中の情報だけから3件を提案します。外部AIが未接続でも端末内のルール提案が動きます。'));const mode=el('span','ai-mode','ルール提案で稼働中');head.append(titles,mode);const form=el('form');form.append(field('誰と行く？','company',[['solo','一人'],['friends','友達'],['family','家族']]),field('使える時間','time',[['short','30分〜1時間'],['half','半日'],['day','1日']]),field('したいこと','interest',[['all','おまかせ'],['limited_menu','限定メニュー'],['event','イベント'],['new_product','新商品'],['sale_campaign','セール'],['new_store','新店舗']]),field('天気・場所','weather',[['any','どちらでも'],['indoor','屋内を優先']]),field('今だけを優先','limited',[['yes','優先する'],['no','こだわらない']]));const action=el('div','ai-actions');const button=el('button','','おすすめを選ぶ');button.type='submit';action.append(button);form.append(action);const status=el('p','ai-status','条件を選んでボタンを押してください。');const results=el('div','ai-results');wrap.append(head,form,status,results,el('p','ai-note','提案は掲載中の候補だけを使用します。日時・価格・営業状況は必ず掲載元で確認してください。'));mount.append(wrap);
 const anchor=document.querySelector('#local-highlights');(anchor?.parentNode||document.body).insertBefore(mount,anchor||document.body.firstChild);
 let config={endpoint:'',mode:'fallback'},items=[];
 try{const [loadedConfig,discoveries,offers,extra]=await Promise.all([json(CONFIG_URL),...DATA_URLS.map(json)]);config=loadedConfig;items=normalize(discoveries,[...offers,...extra]);if(config.endpoint){mode.textContent='AI接続可能';mode.dataset.connected='true'}}catch(error){console.error(error);status.textContent='情報の読み込みに失敗しました。再読み込みしてください。'}
 const byId=new Map(items.map(x=>[x.id,x]));
 form.addEventListener('submit',async event=>{event.preventDefault();if(!items.length)return;const data=new FormData(form);const prefs={company:data.get('company'),time:data.get('time'),interest:data.get('interest'),weather:data.get('weather'),limited:data.get('limited'),area:'all'};button.disabled=true;status.textContent=config.endpoint?'AIが候補を確認中です。少しお待ちください…':'端末内で候補を選択中…';let result;try{result=config.endpoint?await askAi(config.endpoint,items,prefs):fallback(items,prefs);status.textContent=result.mode==='ai'?'AIが掲載中の情報から選びました。':'外部AI未接続のため、ルール提案で選びました。'}catch(error){console.warn('AI提案を使えないためルール提案へ切り替えます',error);result=fallback(items,prefs);status.textContent='AIへ接続できなかったため、ルール提案へ自動で切り替えました。'}finally{button.disabled=false}renderResults(results,result,byId)});
}
window.MunakataAI={fallback,validAiResult,normalize,score,rankForAi};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
