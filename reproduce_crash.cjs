const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log('Starting error reproduction...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.error('PAGE ERROR CRASH DETECTED:');
    console.error(err);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('PAGE CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // Login
  await page.waitForSelector('#btn-quick-nurse', { timeout: 5000 });
  await page.click('#btn-quick-nurse');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#login-submit-btn');
  await page.waitForFunction(() => document.body.innerText.includes('New Screening'), { timeout: 10000 });
  
  // Navigate to New Screening
  for (const b of await page.$$('button, a')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('New Screening')) {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  // Select patient
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('→') || text.includes('Select Patient')) {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  // Select Upload Image
  for (const div of await page.$$('div')) {
    const text = await page.evaluate(el => el.innerText, div);
    if (text.includes('Upload Image') && text.includes('Choose file')) {
      await div.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
  
  // Upload image
  const goodQualityPath = path.resolve('test_images/IDRiD_01.jpg');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(goodQualityPath);
  await new Promise(r => setTimeout(r, 1000));
  
  // Click Analyse Image
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('Analyse Image')) {
      await b.click();
      break;
    }
  }
  
  console.log('Clicked analyse image. Waiting 5 seconds to catch any crashes...');
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
  console.log('Done.');
})();
