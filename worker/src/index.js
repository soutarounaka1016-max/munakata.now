const MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const VERSION='20260723-ai4';
const MAX_CANDIDATES=40;
const MAX_BODY_BYTES=70000;
const ALLOWED_TYPES=new Set(['new_store','limited_menu','event','new_product','sale_campaign']);
const ALLOWED_TAGS=['家族向け','友達向け','一人向け','雨の日','短時間','半日','期間限定','新商品','お得','テイクアウト','店内','子ども向け','学生向け','辛い','甘い','食事','ドリンク','イベント','手土産','大人向け'];

export function corsHeaders(origin,allowedOrigin){
  const allowed=origin===allowedOrigin?origin:allowedOrigin;
  return {
    'access-control-allow-origin':allowed,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type',
    'access-control-max-age':'86400',
    'vary':'Origin',
    'content-type':'application/json; charset=utf-8',
    'x-content-type-options':'nosniff'
  };
}

export function sanitizeCandidate(value){
  if(!value||typeof value!=='object')return null;
  const id=String(value.id||'').slice(0,120);
  const title=String(value.title||'').slice(0,140);
  const type=String(value.type||'');
  if(!id||!title||!ALLOWED_TYPES.has(type))return null;
  return {
    id,type,title,
    brand:String(value.brand||'').slice(0,80),
    place:String(value.place||'').slice(0,120),
    region:String(value.region||'').slice(0,80),
    summary:String(value.summary||'').slice(0,360),
    startDate:String(value.startDate||'').slice(0,10),
    endDate:String(value.endDate||'').slice(0,10),
    availabilityNote:String(value.availabilityNote||'').slice(0,240),
    tagsSeed:Array.isArray(value.tagsSeed)?value.tagsSeed.slice(0,8).map(x=>String(x).slice(0,30)):[],
    indoor:Boolean(value.indoor),family:Boolean(value.family),limited:Boolean(value.limited),
    verifiedByOfficial:Boolean(value.verifiedByOfficial)
  };
}

export function sanitizePreferences(value){
  const input=value&&typeof value==='object'?value:{};
  const allowed={
    company:new Set(['solo','friends','family']),
    time:new Set(['short','half','day']),
    interest:new Set(['all',...ALLOWED_TYPES]),
    weather:new Set(['any','indoor']),
    limited:new Set(['yes','no']),
    area:new Set(['all'])
  };
  return Object.fromEntries(Object.entries(allowed).map(([key,set])=>[key,set.has(input[key])?input[key]:[...set][0]]));
}

export function extractJson(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const first=raw.indexOf('{');const last=raw.lastIndexOf('}');
  if(first<0||last<=first)throw new Error('AI response did not contain JSON');
  return JSON.parse(raw.slice(first,last+1));
}
export function parseAiResponse(value){
  const response=value&&typeof value==='object'&&'response'in value?value.response:value;
  if(response&&typeof response==='object')return response;
  return extractJson(response);
}
function jsonResponse(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}

function recommendationSchema(ids,maxItems=3){
  return {type:'object',additionalProperties:false,properties:{
    summary:{type:'string',minLength:1,maxLength:220},
    recommendations:{type:'array',minItems:1,maxItems,items:{type:'object',additionalProperties:false,properties:{
      id:{type:'string',enum:ids},reason:{type:'string',minLength:1,maxLength:180}
    },required:['id','reason']}}
  },required:['summary','recommendations']};
}
function enrichSchema(){
  return {type:'object',additionalProperties:false,properties:{
    summary:{type:'string',minLength:1,maxLength:140},
    tags:{type:'array',minItems:2,maxItems:5,uniqueItems:true,items:{type:'string',enum:ALLOWED_TAGS}},
    bestFor:{type:'string',minLength:1,maxLength:100},
    caution:{type:'string',minLength:1,maxLength:140}
  },required:['summary','tags','bestFor','caution']};
}
function rankSchema(ids){
  return {type:'object',additionalProperties:false,properties:{
    summary:{type:'string',minLength:1,maxLength:220},
    ranking:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,properties:{
      id:{type:'string',enum:ids},reason:{type:'string',minLength:1,maxLength:180}
    },required:['id','reason']}}
  },required:['summary','ranking']};
}
function compareSchema(ids){
  return {type:'object',additionalProperties:false,properties:{
    summary:{type:'string',minLength:1,maxLength:220},
    comparison:{type:'array',minItems:2,maxItems:3,items:{type:'object',additionalProperties:false,properties:{
      id:{type:'string',enum:ids},bestFor:{type:'string',minLength:1,maxLength:100},
      strength:{type:'string',minLength:1,maxLength:160},caution:{type:'string',minLength:1,maxLength:140}
    },required:['id','bestFor','strength','caution']}},
    verdict:{type:'string',minLength:1,maxLength:180}
  },required:['summary','comparison','verdict']};
}
async function runStructured(env,{system,user,schema,plainFormat,maxTokens=700}){
  if(!env.AI||typeof env.AI.run!=='function'){const error=new Error('Workers AI binding is missing');error.code='AI_BINDING_MISSING';throw error}
  const messages=[{role:'system',content:system},{role:'user',content:user}];
  try{
    return await env.AI.run(MODEL,{messages,response_format:{type:'json_schema',json_schema:schema},max_tokens:maxTokens,temperature:0.1});
  }catch(error){
    console.warn('Workers AI JSON mode failed; retrying plain JSON',error);
    return env.AI.run(MODEL,{messages:[{role:'system',content:`JSON以外を出力しないでください。形式: ${plainFormat}`},{role:'user',content:user}],max_tokens:maxTokens,temperature:0.1});
  }
}

export function validateRecommendations(result,allowedIds,maxItems=3,key='recommendations'){
  const rows=result?.[key];
  if(typeof result?.summary!=='string'||result.summary.length<1||result.summary.length>220||!Array.isArray(rows)||rows.length<1||rows.length>maxItems)return false;
  const seen=new Set();
  return rows.every(item=>item&&allowedIds.has(item.id)&&!seen.has(item.id)&&typeof item.reason==='string'&&item.reason.length>0&&item.reason.length<=180&&(seen.add(item.id)||true));
}
export function validateEnrich(result){
  return !!result&&typeof result.summary==='string'&&result.summary.length>0&&result.summary.length<=140&&Array.isArray(result.tags)&&result.tags.length>=2&&result.tags.length<=5&&result.tags.every(tag=>ALLOWED_TAGS.includes(tag))&&typeof result.bestFor==='string'&&result.bestFor.length>0&&typeof result.caution==='string'&&result.caution.length>0;
}
export function validateCompare(result,allowedIds){
  if(!result||typeof result.summary!=='string'||typeof result.verdict!=='string'||!Array.isArray(result.comparison)||result.comparison.length<2||result.comparison.length>3)return false;
  const seen=new Set();
  return result.comparison.every(row=>row&&allowedIds.has(row.id)&&!seen.has(row.id)&&['bestFor','strength','caution'].every(key=>typeof row[key]==='string'&&row[key].length>0)&&(seen.add(row.id)||true));
}

async function recommend(env,preferences,candidates){
  const prompt=['あなたは福岡県宗像市のおでかけ提案アシスタントです。','候補一覧に存在するIDだけを使い、条件に合うものを最大3件選んでください。','店舗名、日時、URL、価格を創作せず、候補にない事実を追加しないでください。',`利用条件: ${JSON.stringify(preferences)}`,`候補一覧: ${JSON.stringify(candidates)}`].join('\n');
  return runStructured(env,{system:'候補IDだけを使い、指定されたJSON形式で回答してください。',user:prompt,schema:recommendationSchema(candidates.map(x=>x.id)),plainFormat:'{"summary":"短い提案","recommendations":[{"id":"候補ID","reason":"理由"}]}'});
}
async function enrich(env,item){
  const prompt=['次の宗像市内で利用できる情報を、追加の事実を作らずに短く整理してください。','要約は元情報だけで140文字以内。タグは指定候補から2〜5個。確認点には在庫・店舗差・期間など元情報から分かる注意だけを書く。',`情報: ${JSON.stringify(item)}`,`タグ候補: ${JSON.stringify(ALLOWED_TAGS)}`].join('\n');
  return runStructured(env,{system:'地域情報の編集者として、入力にない事実を作らずJSONだけで回答してください。',user:prompt,schema:enrichSchema(),plainFormat:'{"summary":"要約","tags":["期間限定","食事"],"bestFor":"向いている人","caution":"確認点"}'});
}
async function rank(env,candidates,context){
  const prompt=['福岡県宗像市で今日確認する価値が高い順に最大5件を並べてください。','終了の近さ、新しさ、公式確認、限定性、実用性を考慮し、候補ID以外は使わないでください。',`状況: ${JSON.stringify(context||{})}`,`候補: ${JSON.stringify(candidates)}`].join('\n');
  return runStructured(env,{system:'地域情報ランキングを、入力だけに基づいてJSONで作成してください。',user:prompt,schema:rankSchema(candidates.map(x=>x.id)),plainFormat:'{"summary":"全体説明","ranking":[{"id":"候補ID","reason":"順位理由"}]}'});
}
async function compare(env,candidates){
  const prompt=['次の2〜3件を、利用者が選びやすいよう比較してください。','候補にない価格、味、混雑、営業時間を作らないでください。各候補を1回ずつ比較に含めてください。',`候補: ${JSON.stringify(candidates)}`].join('\n');
  return runStructured(env,{system:'比較編集者として入力だけに基づきJSONで回答してください。',user:prompt,schema:compareSchema(candidates.map(x=>x.id)),plainFormat:'{"summary":"比較概要","comparison":[{"id":"候補ID","bestFor":"向いている人","strength":"強み","caution":"確認点"}],"verdict":"結論"}',maxTokens:900});
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('origin')||'';
    const allowedOrigin=env.ALLOWED_ORIGIN||'https://soutarounaka1016-max.github.io';
    const headers=corsHeaders(origin,allowedOrigin);const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method==='GET')return jsonResponse({ok:true,service:'munakatanow-ai',version:VERSION,model:MODEL,features:['recommend','enrich','rank','compare'],aiBinding:Boolean(env.AI&&typeof env.AI.run==='function'),path:url.pathname},200,headers);
    if(request.method!=='POST')return jsonResponse({error:'POST only',code:'METHOD_NOT_ALLOWED'},405,headers);
    if(origin&&origin!==allowedOrigin)return jsonResponse({error:'Origin not allowed',code:'ORIGIN_NOT_ALLOWED'},403,headers);
    if(Number(request.headers.get('content-length')||0)>MAX_BODY_BYTES)return jsonResponse({error:'Request too large',code:'REQUEST_TOO_LARGE'},413,headers);
    let body;try{body=await request.json()}catch{return jsonResponse({error:'Invalid JSON',code:'INVALID_JSON'},400,headers)}
    const action=String(body?.action||'recommend');
    try{
      if(action==='enrich'){
        const item=sanitizeCandidate(body?.item);if(!item)return jsonResponse({error:'No valid item',code:'NO_VALID_ITEM'},400,headers);
        const parsed=parseAiResponse(await enrich(env,item));if(!validateEnrich(parsed)){const e=new Error('AI enrich validation failed');e.code='AI_RESPONSE_INVALID';throw e}
        return jsonResponse({...parsed,action,workerVersion:VERSION},200,headers);
      }
      const candidates=Array.isArray(body?.candidates)?body.candidates.slice(0,MAX_CANDIDATES).map(sanitizeCandidate).filter(Boolean):[];
      if(candidates.length<1)return jsonResponse({error:'No valid candidates',code:'NO_VALID_CANDIDATES'},400,headers);
      const ids=new Set(candidates.map(x=>x.id));let parsed;
      if(action==='compare'){
        if(candidates.length<2||candidates.length>3)return jsonResponse({error:'Compare requires 2-3 candidates',code:'INVALID_COMPARE_COUNT'},400,headers);
        parsed=parseAiResponse(await compare(env,candidates));if(!validateCompare(parsed,ids)){const e=new Error('AI compare validation failed');e.code='AI_RESPONSE_INVALID';throw e}
      }else if(action==='rank'){
        parsed=parseAiResponse(await rank(env,candidates,body?.context));if(!validateRecommendations(parsed,ids,5,'ranking')){const e=new Error('AI rank validation failed');e.code='AI_RESPONSE_INVALID';throw e}
      }else if(action==='recommend'){
        parsed=parseAiResponse(await recommend(env,sanitizePreferences(body?.preferences),candidates));if(!validateRecommendations(parsed,ids,3,'recommendations')){const e=new Error('AI recommendation validation failed');e.code='AI_RESPONSE_INVALID';throw e}
      }else return jsonResponse({error:'Unknown action',code:'UNKNOWN_ACTION'},400,headers);
      return jsonResponse({...parsed,action,workerVersion:VERSION},200,headers);
    }catch(error){
      console.error(`Workers AI ${action} failed`,error);
      return jsonResponse({error:'AI feature unavailable',code:error?.code||'AI_RUN_FAILED',action,workerVersion:VERSION},503,headers);
    }
  }
};