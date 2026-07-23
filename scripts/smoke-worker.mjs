const endpoint=(process.env.AI_ENDPOINT||'https://munakatanow.soutarou-naka-1016.workers.dev/').replace(/\/+$/,'/');
const origin='https://soutarounaka1016-max.github.io';
const expectedVersion='20260723-ai4';
const attempts=Number(process.env.SMOKE_ATTEMPTS||24);
const delayMs=Number(process.env.SMOKE_DELAY_MS||10000);
const candidates=[
 {id:'smoke-event-1',type:'event',brand:'テストブランド',title:'宗像市内の屋内イベント',place:'宗像市内',region:'宗像市',summary:'家族で半日楽しめる期間限定の屋内イベントです。',startDate:'2026-07-23',endDate:'2026-08-31',indoor:true,family:true,limited:true,verifiedByOfficial:true,tagsSeed:['家族向け','イベント']},
 {id:'smoke-menu-2',type:'limited_menu',brand:'テストブランド',title:'宗像市内の期間限定メニュー',place:'宗像市内',region:'宗像市',summary:'友達と短時間で楽しめる夏限定のドリンクです。',startDate:'2026-07-22',endDate:'2026-08-20',indoor:true,family:false,limited:true,verifiedByOfficial:true,tagsSeed:['期間限定','ドリンク']}
];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function post(body){
 const response=await fetch(endpoint,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 const text=await response.text();let result;
 try{result=JSON.parse(text)}catch{throw new Error(`invalid JSON (${response.status}): ${text.slice(0,300)}`)}
 if(!response.ok)throw new Error(`request failed (${response.status}): ${JSON.stringify(result)}`);
 if(result.workerVersion!==expectedVersion)throw new Error(`unexpected response version: ${result.workerVersion||'unknown'}`);
 return result;
}
async function check(){
 const healthResponse=await fetch(endpoint,{headers:{origin},cache:'no-store'});const health=await healthResponse.json();
 if(!healthResponse.ok||health.version!==expectedVersion||health.aiBinding!==true)throw new Error(`health mismatch: ${JSON.stringify(health)}`);
 for(const feature of ['recommend','enrich','rank','compare'])if(!health.features?.includes(feature))throw new Error(`missing feature ${feature}`);
 const recommendation=await post({action:'recommend',preferences:{company:'family',time:'half',interest:'event',weather:'indoor',limited:'yes',area:'all'},candidates});
 if(!recommendation.recommendations?.length)throw new Error('recommendations missing');
 const enrich=await post({action:'enrich',item:candidates[0]});
 if(!enrich.summary||!Array.isArray(enrich.tags)||enrich.tags.length<2)throw new Error('enrich result missing');
 const rank=await post({action:'rank',context:{date:'2026-07-23'},candidates});
 if(!rank.ranking?.length)throw new Error('ranking missing');
 const compare=await post({action:'compare',candidates});
 if(compare.comparison?.length!==2)throw new Error('comparison missing');
 console.log('Workers AI phase 2 smoke passed',JSON.stringify({recommendation,enrich,rank,compare}));
}
let lastError;
for(let attempt=1;attempt<=attempts;attempt+=1){
 try{console.log(`Workers AI smoke attempt ${attempt}/${attempts}`);await check();process.exit(0)}
 catch(error){lastError=error;console.warn(error.message);if(attempt<attempts)await sleep(delayMs)}
}
throw lastError;