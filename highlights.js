(()=>{
'use strict';
const labels={all:'すべて',new_store:'新店舗',limited_menu:'期間限定メニュー・フェア',event:'イベント',new_product:'新商品',sale_campaign:'セール・キャンペーン'};
const icons={new_store:'🆕',limited_menu:'⭐',event:'🎪',new_product:'🛍️',sale_campaign:'🏷️'};
const dayMs=86400000;
const todayText=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateValue=value=>value?new Date(value+'T00:00:00+09:00').getTime():null;
const daysFromToday=value=>value?Math.ceil((dateValue(value)-dateValue(todayText()))/dayMs):null;
const daysLeft=value=>value?Math.ceil((new Date(value+'T23:59:59+09:00')-new Date())/dayMs):null;
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};

function normalizedDiscoveries(list){
  return list.map(x=>({
    id:x.id,type:'new_store',title:x.title,place:x.area||x.region,summary:x.summary,
    startDate:x.openDate,endDate:x.expiresAt,region:x.region,emoji:x.emoji||icons.new_store,
    url:x.url,verifiedByOfficial:!!x.verifiedByOfficial,
    verificationLabel:x.verificationLabel||'情報源を確認'
  }));
}

function embeddedEvents(){
  try{
    const raw=document.querySelector('#munakata-data')?.textContent;
    if(!raw)return[];
    const data=JSON.parse(raw);
    return(data.events||[]).map(x=>({
      id:'embedded-'+x.id,type:'event',title:x.title,
      place:x.location||x.place||'宗像市内',
      summary:x.summary||x.description||'開催内容は公式情報で確認してください。',
      startDate:x.startDate||x.date,endDate:x.endDate||x.startDate||x.date,
      region:x.region||'宗像市内',emoji:x.emoji||icons.event,url:x.url,
      verifiedByOfficial:true,verificationLabel:'掲載元で確認'
    }));
  }catch(error){
    console.warn('イベントデータを読み込めませんでした',error);
    return[];
  }
}

function timingLabel(item){
  if(item.dateLabel)return item.dateLabel;
  const untilStart=daysFromToday(item.startDate);
  if(untilStart!==null&&untilStart>0){
    return untilStart<=7?`あと${untilStart}日で開始`:`${item.startDate.replaceAll('-','/')}開始`;
  }
  if(!item.endDate)return'掲載中';
  if(item.endDateIsEstimate)return`${item.endDate.replaceAll('-','/')}掲載確認`;
  const remaining=daysLeft(item.endDate);
  if(remaining<0)return'終了';
  if(remaining===0)return'今日まで';
  if(remaining<=7)return`あと${remaining}日`;
  return`${item.endDate.replaceAll('-','/')}まで`;
}

function isUrgent(item){
  const untilStart=daysFromToday(item.startDate);
  if(untilStart!==null&&untilStart>0)return untilStart<=3;
  const remaining=daysLeft(item.endDate);
  return remaining!==null&&remaining>=0&&remaining<=7&&!item.endDateIsEstimate;
}

function makeCard(item){
  const card=el('article','lh-card');
  const top=el('div','lh-top');
  top.append(el('span','lh-icon',item.emoji||icons[item.type]),el('span','lh-type',labels[item.type]));
  card.append(top,el('h3','',item.title));
  if(item.place)card.append(el('div','lh-place',item.place));
  card.append(el('p','lh-summary',item.summary||'詳細は掲載元で確認してください。'));
  const meta=el('div','lh-meta');
  if(item.region)meta.append(el('span','lh-chip',item.region));
  const timing=timingLabel(item);
  if(timing)meta.append(el('span','lh-chip '+(isUrgent(item)?'lh-ending':''),timing));
  card.append(meta);
  const actions=el('div','lh-actions');
  const check=el('span','lh-check',item.verificationLabel||(item.verifiedByOfficial?'公式確認済み':'追加確認中'));
  if(item.url){
    const link=el('a','','詳しく見る');
    link.href=item.url;
    link.target='_blank';
    link.rel='noopener noreferrer';
    actions.append(link);
  }
  actions.append(check);
  card.append(actions);
  return card;
}

async function getJson(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`${url}の読み込みに失敗しました`);
  return response.json();
}

async function init(){
  const mount=el('section');
  mount.id='local-highlights';
  const wrap=el('div','lh-wrap');
  const head=el('div','lh-head');
  const titles=el('div');
  titles.append(el('h2','','宗像の「今」を見つける'),el('p','lh-sub','限定メニュー、イベント、新商品、お得情報を期限つきで掲載。'));
  head.append(titles);
  const tabs=el('div','lh-tabs');
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','情報の種類');
  const grid=el('div','lh-grid');
  const more=el('button','lh-more','もっと見る');
  more.type='button';
  more.hidden=true;
  wrap.append(head,tabs,grid,more);
  mount.append(wrap);
  document.body.prepend(mount);

  let offers=[],extraOffers=[],discoveries=[];
  try{
    [offers,extraOffers,discoveries]=await Promise.all([
      getJson('offers.json?v=20260724'),
      getJson('offers-extra.json?v=20260724'),
      getJson('discoveries.json?v=20260724')
    ]);
  }catch(error){
    console.error('地域情報の読み込みに失敗しました',error);
  }

  const combined=[...normalizedDiscoveries(discoveries),...embeddedEvents(),...offers,...extraOffers];
  const byKey=new Map();
  combined.forEach(item=>{
    const key=`${item.type}|${item.title}|${item.startDate||''}`;
    byKey.set(key,item);
  });
  const today=todayText();
  const items=[...byKey.values()]
    .filter(item=>!item.endDate||item.endDate>=today)
    .sort((a,b)=>{
      const aFuture=(a.startDate||'')>today?1:0;
      const bFuture=(b.startDate||'')>today?1:0;
      if(aFuture!==bFuture)return aFuture-bFuture;
      return(a.endDate||a.startDate||'9999').localeCompare(b.endDate||b.startDate||'9999');
    });

  const counts=Object.fromEntries(Object.keys(labels).map(type=>[
    type,type==='all'?items.length:items.filter(item=>item.type===type).length
  ]));
  let current='all';
  let expanded=false;

  function render(){
    grid.replaceChildren();
    const selected=current==='all'?items:items.filter(item=>item.type===current);
    const visible=current==='all'&&!expanded?selected.slice(0,12):selected;
    if(!visible.length){
      grid.append(el('div','lh-empty','現在掲載できる情報はありません。確認でき次第追加します。'));
    }else{
      visible.forEach(item=>grid.append(makeCard(item)));
    }
    more.hidden=!(current==='all'&&selected.length>12);
    more.textContent=expanded?'表示を減らす':`もっと見る（残り${Math.max(0,selected.length-12)}件）`;
    [...tabs.children].forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.type===current)));
  }

  Object.entries(labels).forEach(([type,label])=>{
    const button=el('button','',`${label} (${counts[type]})`);
    button.type='button';
    button.dataset.type=type;
    button.addEventListener('click',()=>{
      current=type;
      expanded=false;
      render();
    });
    tabs.append(button);
  });
  more.addEventListener('click',()=>{
    expanded=!expanded;
    render();
    if(!expanded)mount.scrollIntoView({behavior:'smooth',block:'start'});
  });
  render();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();