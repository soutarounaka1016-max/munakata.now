import { webkit } from 'playwright';

const appUrl=process.env.APP_URL||'https://soutarounaka1016-max.github.io/munakata.now/';
const browser=await webkit.launch({headless:true});
const page=await browser.newPage({
  viewport:{width:1180,height:820},
  locale:'ja-JP',
  timezoneId:'Asia/Tokyo'
});

const consoleErrors=[];
page.on('console',message=>{
  if(message.type()==='error')consoleErrors.push(message.text());
});
page.on('pageerror',error=>consoleErrors.push(error.message));

try{
  await page.goto(`${appUrl}?e2e=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#ai-recommender',{state:'visible',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('.ai-mode')?.textContent?.includes('AI接続可能'),null,{timeout:30000});

  await page.selectOption('select[name="company"]','family');
  await page.selectOption('select[name="time"]','half');
  await page.selectOption('select[name="interest"]','event');
  await page.selectOption('select[name="weather"]','indoor');
  await page.selectOption('select[name="limited"]','yes');
  await page.click('#ai-recommender button[type="submit"]');

  await page.waitForFunction(()=>document.querySelector('.ai-status')?.textContent?.includes('AIが掲載中の情報から選びました。'),null,{timeout:45000});
  const cards=await page.locator('#ai-recommender .ai-card').count();
  if(cards<1)throw new Error('AI recommendation cards were not rendered');
  const status=(await page.locator('.ai-status').textContent())?.trim();
  const mode=(await page.locator('.ai-mode').textContent())?.trim();
  const firstTitle=(await page.locator('#ai-recommender .ai-card h3').first().textContent())?.trim();
  const firstReason=(await page.locator('#ai-recommender .ai-card .ai-reason').first().textContent())?.trim();
  if(!firstReason)throw new Error('AI recommendation reason was empty');
  console.log('Public app AI smoke test passed:',JSON.stringify({mode,status,cards,firstTitle,firstReason,consoleErrors}));
}finally{
  await browser.close();
}
