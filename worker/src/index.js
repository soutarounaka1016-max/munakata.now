const MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
const VERSION='20260723-ai2';
const MAX_CANDIDATES=40;
const MAX_BODY_BYTES=50000;
const ALLOWED_TYPES=new Set(['new_store','limited_menu','event','new_product','sale_campaign']);

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
  const title=String(value.title||'').slice(0,120);
  const type=String(value.type||'');
  if(!id||!title||!ALLOWED_TYPES.has(type))return null;
  return {
    id,type,title,
    place:String(value.place||'').slice(0,100),
    region:String(value.region||'').slice(0,80),
    summary:String(value.summary||'').slice(0,280),
    startDate:String(value.startDate||'').slice(0,10),
    endDate:String(value.endDate||'').slice(0,10),
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
  const first=raw.indexOf('{');
  const last=raw.lastIndexOf('}');
  if(first<0||last<=first)throw new Error('AI response did not contain JSON');
  return JSON.parse(raw.slice(first,last+1));
}

export function parseAiResponse(value){
  const response=value&&typeof value==='object'&&'response'in value?value.response:value;
  if(response&&typeof response==='object')return response;
  return extractJson(response);
}

export function validateResult(result,allowedIds){
  if(!result||typeof result!=='object'||!Array.isArray(result.recommendations))return false;
  if(result.recommendations.length<1||result.recommendations.length>3)return false;
  if(typeof result.summary!=='string'||result.summary.length<1||result.summary.length>220)return false;
  const seen=new Set();
  return result.recommendations.every(item=>{
    if(!item||typeof item.id!=='string'||typeof item.reason!=='string')return false;
    if(!allowedIds.has(item.id)||seen.has(item.id))return false;
    if(item.reason.length<1||item.reason.length>180)return false;
    seen.add(item.id);return true;
  });
}

export function responseSchema(candidateIds){
  return {
    type:'object',
    additionalProperties:false,
    properties:{
      summary:{type:'string',minLength:1,maxLength:220},
      recommendations:{
        type:'array',minItems:1,maxItems:3,
        items:{
          type:'object',additionalProperties:false,
          properties:{
            id:{type:'string',enum:candidateIds},
            reason:{type:'string',minLength:1,maxLength:180}
          },
          required:['id','reason']
        }
      }
    },
    required:['summary','recommendations']
  };
}

function jsonResponse(data,status,headers){return new Response(JSON.stringify(data),{status,headers})}

function promptFor(preferences,candidates){
  return [
    'あなたは福岡県宗像市のおでかけ提案アシスタントです。',
    '候補一覧に存在するIDだけを使い、条件に合うものを最大3件選んでください。',
    '店舗名、日時、URL、価格を創作しないでください。候補にない事実を追加しないでください。',
    '理由は候補一覧と利用条件から確認できる内容だけを日本語で短く書いてください。',
    `利用条件: ${JSON.stringify(preferences)}`,
    `候補一覧: ${JSON.stringify(candidates)}`
  ].join('\n');
}

async function runRecommendation(env,preferences,candidates){
  if(!env.AI||typeof env.AI.run!=='function'){
    const error=new Error('Workers AI binding is missing');
    error.code='AI_BINDING_MISSING';
    throw error;
  }
  const messages=[
    {role:'system',content:'候補IDだけを使い、指定されたJSON形式で回答してください。'},
    {role:'user',content:promptFor(preferences,candidates)}
  ];
  const schema=responseSchema(candidates.map(item=>item.id));
  try{
    return await env.AI.run(MODEL,{
      messages,
      response_format:{type:'json_schema',json_schema:schema},
      max_tokens:500,
      temperature:0.1
    });
  }catch(jsonModeError){
    console.warn('Workers AI JSON mode failed; retrying plain JSON',jsonModeError);
    return env.AI.run(MODEL,{
      messages:[
        {role:'system',content:'JSON以外を出力しないでください。形式: {"summary":"短い提案","recommendations":[{"id":"候補ID","reason":"理由"}]}'},
        {role:'user',content:promptFor(preferences,candidates)}
      ],
      max_tokens:500,
      temperature:0.1
    });
  }
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('origin')||'';
    const allowedOrigin=env.ALLOWED_ORIGIN||'https://soutarounaka1016-max.github.io';
    const headers=corsHeaders(origin,allowedOrigin);
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method==='GET'){
      return jsonResponse({
        ok:true,
        service:'munakatanow-ai',
        version:VERSION,
        model:MODEL,
        aiBinding:Boolean(env.AI&&typeof env.AI.run==='function'),
        path:url.pathname
      },200,headers);
    }
    if(request.method!=='POST')return jsonResponse({error:'POST only',code:'METHOD_NOT_ALLOWED'},405,headers);
    if(origin&&origin!==allowedOrigin)return jsonResponse({error:'Origin not allowed',code:'ORIGIN_NOT_ALLOWED'},403,headers);
    const length=Number(request.headers.get('content-length')||0);
    if(length>MAX_BODY_BYTES)return jsonResponse({error:'Request too large',code:'REQUEST_TOO_LARGE'},413,headers);
    let body;
    try{body=await request.json()}catch{return jsonResponse({error:'Invalid JSON',code:'INVALID_JSON'},400,headers)}
    const candidates=Array.isArray(body?.candidates)?body.candidates.slice(0,MAX_CANDIDATES).map(sanitizeCandidate).filter(Boolean):[];
    if(candidates.length<1)return jsonResponse({error:'No valid candidates',code:'NO_VALID_CANDIDATES'},400,headers);
    const preferences=sanitizePreferences(body?.preferences);
    const allowedIds=new Set(candidates.map(x=>x.id));
    try{
      const aiResult=await runRecommendation(env,preferences,candidates);
      const parsed=parseAiResponse(aiResult);
      if(!validateResult(parsed,allowedIds)){
        const error=new Error('AI result validation failed');
        error.code='AI_RESPONSE_INVALID';
        throw error;
      }
      return jsonResponse({...parsed,workerVersion:VERSION},200,headers);
    }catch(error){
      console.error('Workers AI recommendation failed',error);
      return jsonResponse({
        error:'AI recommendation unavailable',
        code:error?.code||'AI_RUN_FAILED',
        workerVersion:VERSION
      },503,headers);
    }
  }
};
