import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{sanitizeCandidate,sanitizePreferences,extractJson,validateRecommendations,validateEnrich,validateCompare,corsHeaders} from '../src/index.js';

const candidate=(id='a',type='event')=>({id,title:`候補${id}`,type,summary:'公式に確認された期間限定情報',place:'宗像市内',verifiedByOfficial:true,limited:true});

test('candidate sanitation rejects unknown types',()=>{
  assert.equal(sanitizeCandidate({id:'x',title:'X',type:'unknown'}),null);
  assert.equal(sanitizeCandidate(candidate('x')).id,'x');
});
test('preferences are restricted',()=>{
  const prefs=sanitizePreferences({company:'invalid',time:'day',interest:'event',weather:'indoor',limited:'yes',area:'all'});
  assert.equal(prefs.time,'day');assert.notEqual(prefs.company,'invalid');
});
test('JSON extraction accepts fenced output',()=>{
  assert.deepEqual(extractJson('```json\n{"summary":"ok","recommendations":[]}\n```'),{summary:'ok',recommendations:[]});
});
test('validators block invented IDs',()=>{
  const ids=new Set(['a','b']);
  assert.equal(validateRecommendations({summary:'ok',recommendations:[{id:'a',reason:'条件に合う'}]},ids),true);
  assert.equal(validateRecommendations({summary:'ok',recommendations:[{id:'z',reason:'架空'}]},ids),false);
  assert.equal(validateEnrich({summary:'短い要約',tags:['期間限定','食事'],bestFor:'家族',caution:'在庫確認'}),true);
  assert.equal(validateCompare({summary:'比較',comparison:[{id:'a',bestFor:'家族',strength:'公式',caution:'確認'},{id:'b',bestFor:'友達',strength:'限定',caution:'在庫'}],verdict:'用途で選ぶ'},ids),true);
});
test('CORS stays pinned',()=>{
  const headers=corsHeaders('https://evil.example','https://soutarounaka1016-max.github.io');
  assert.equal(headers['access-control-allow-origin'],'https://soutarounaka1016-max.github.io');
});

function envReturning(response){return {ALLOWED_ORIGIN:'https://soutarounaka1016-max.github.io',AI:{run:async()=>({response})}}}
async function post(body,env){
  return worker.fetch(new Request('https://worker.example/',{method:'POST',headers:{origin:'https://soutarounaka1016-max.github.io','content-type':'application/json'},body:JSON.stringify(body)}),env);
}
test('recommend action remains backward compatible',async()=>{
  const response=await post({candidates:[candidate('a')],preferences:{}},envReturning({summary:'提案',recommendations:[{id:'a',reason:'公式情報'}]}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.action,'recommend');
});
test('enrich rank and compare actions return validated JSON',async()=>{
  let response=await post({action:'enrich',item:candidate('a')},envReturning({summary:'短く整理',tags:['期間限定','イベント'],bestFor:'家族',caution:'実施状況を確認'}));
  assert.equal(response.status,200);
  response=await post({action:'rank',candidates:[candidate('a'),candidate('b')]},envReturning({summary:'順位',ranking:[{id:'a',reason:'終了が近い'}]}));
  assert.equal(response.status,200);
  response=await post({action:'compare',candidates:[candidate('a'),candidate('b')]},envReturning({summary:'比較',comparison:[{id:'a',bestFor:'家族',strength:'公式',caution:'在庫'},{id:'b',bestFor:'友達',strength:'限定',caution:'期間'}],verdict:'条件で選ぶ'}));
  assert.equal(response.status,200);
});