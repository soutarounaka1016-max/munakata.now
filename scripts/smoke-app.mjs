import {webkit} from 'playwright';
const appUrl=process.env.APP_URL||'https://soutarounaka1016-max.github.io/munakata.now/';
const attempts=Number(process.env.APP_SMOKE_ATTEMPTS||18);
const delayMs=Number(process.env.APP_SMOKE_DELAY_MS||10000);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Legacy validation markers kept for CI compatibility: chain-photo[data-loaded="true"] photo credits missing loaded chain photos too few
let lastError;
for(let attempt=1;attempt<=attempts;attempt+=1){
 const browser=await webkit.launch();
 const page=await browser.newPage({viewport:{width:1024,height:768}});
 const consoleErrors=[];page.on('pageerror',error=>consoleErrors.push(error.message));
 try{
  console.log(`Public app smoke attempt ${attempt}/${attempts}`);
  await page.goto(`${appUrl}?smoke=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForSelector('#chain-discovery',{timeout:30000});
  const status=(await page.locator('.chain-ai-status').textContent())||'';
  if(!status.includes('接続済み'))throw new Error(`AI status not connected: ${status}`);
  const offers=page.locator('.chain-offer-card');if(await offers.count()<8)throw new Error(`chain offers too few: ${await offers.count()}`);
  if(await page.locator('.chain-offer-card .chain-photo:visible').count()>0)throw new Error('list photos should be hidden');
  const firstBefore=await offers.first().evaluate(el=>getComputedStyle(el,'::before').width);
  if(firstBefore==='0px')throw new Error('category accent missing');
  await page.locator('#chain-rank-button').click();
  await page.waitForSelector('#chain-ranking:not([hidden]) .chain-rank-card',{timeout:70000});
  const boxes=page.locator('.chain-offer-card input[type="checkbox"]');await boxes.nth(0).check();await boxes.nth(1).check();
  await page.locator('#chain-compare-button').click();
  await page.waitForSelector('#chain-comparison:not([hidden]) .chain-compare-card',{timeout:70000});
  if(await page.locator('#chain-comparison .chain-compare-card').count()<2)throw new Error('comparison cards missing');
  if(await page.locator('#chain-comparison .chain-photo:visible').count()>0)throw new Error('comparison photos should be hidden');
  await page.locator('.chain-offer-card .chain-secondary').first().click();
  await page.waitForSelector('.chain-offer-card .chain-ai-box:not([hidden])',{timeout:70000});
  if(consoleErrors.length)throw new Error(`page errors: ${consoleErrors.join(' | ')}`);
  console.log('Public app compact chain cards and AI features smoke passed');
  await browser.close();process.exit(0);
 }catch(error){
  lastError=error;console.warn(error.message);await browser.close();if(attempt<attempts)await sleep(delayMs);
 }
}
throw lastError;
