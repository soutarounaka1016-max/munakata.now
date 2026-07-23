const endpoint=(process.env.AI_ENDPOINT||'https://munakatanow.soutarou-naka-1016.workers.dev/').replace(/\/+$/,'/');
const origin='https://soutarounaka1016-max.github.io';
const expectedVersion='20260723-ai2';
const attempts=Number(process.env.SMOKE_ATTEMPTS||18);
const delayMs=Number(process.env.SMOKE_DELAY_MS||10000);

const payload={
  preferences:{company:'family',time:'half',interest:'event',weather:'indoor',limited:'yes',area:'all'},
  candidates:[{
    id:'smoke-event-1',
    type:'event',
    title:'宗像市内の屋内イベント',
    place:'宗像市内',
    region:'宗像市',
    summary:'家族で半日楽しめる、期間限定の屋内イベントです。',
    startDate:'2026-07-23',
    endDate:'2026-08-31',
    indoor:true,
    family:true,
    limited:true,
    verifiedByOfficial:true
  }]
};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function check(){
  const healthResponse=await fetch(endpoint,{headers:{origin},cache:'no-store'});
  const healthText=await healthResponse.text();
  let health;
  try{health=JSON.parse(healthText)}catch{throw new Error(`health invalid JSON (${healthResponse.status}): ${healthText.slice(0,200)}`)}
  if(!healthResponse.ok)throw new Error(`health failed (${healthResponse.status}): ${JSON.stringify(health)}`);
  if(health.version!==expectedVersion)throw new Error(`old Worker version: ${health.version||'unknown'}`);
  if(health.aiBinding!==true)throw new Error(`Workers AI binding unavailable: ${JSON.stringify(health)}`);

  const response=await fetch(endpoint,{
    method:'POST',
    headers:{origin,'content-type':'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store'
  });
  const text=await response.text();
  let result;
  try{result=JSON.parse(text)}catch{throw new Error(`recommendation invalid JSON (${response.status}): ${text.slice(0,300)}`)}
  if(!response.ok)throw new Error(`recommendation failed (${response.status}): ${JSON.stringify(result)}`);
  if(result.workerVersion!==expectedVersion)throw new Error(`unexpected response version: ${result.workerVersion||'unknown'}`);
  if(!Array.isArray(result.recommendations)||result.recommendations.length<1)throw new Error(`recommendations missing: ${JSON.stringify(result)}`);
  if(result.recommendations[0].id!=='smoke-event-1')throw new Error(`unexpected recommendation ID: ${JSON.stringify(result)}`);
  if(typeof result.recommendations[0].reason!=='string'||!result.recommendations[0].reason.trim())throw new Error(`recommendation reason missing: ${JSON.stringify(result)}`);
  console.log('Workers AI smoke test passed:',JSON.stringify(result));
}

let lastError;
for(let attempt=1;attempt<=attempts;attempt+=1){
  try{
    console.log(`Workers AI smoke attempt ${attempt}/${attempts}`);
    await check();
    process.exit(0);
  }catch(error){
    lastError=error;
    console.warn(error.message);
    if(attempt<attempts)await sleep(delayMs);
  }
}
throw lastError;
