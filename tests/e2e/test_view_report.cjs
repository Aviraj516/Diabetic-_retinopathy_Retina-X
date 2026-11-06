const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log('Testing View Report button click...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

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

  // 1. Log in as Nurse
  console.log('1. Logging in as Nurse...');
  await page.waitForSelector('#login-identifier', { timeout: 10000 });
  await page.type('#login-identifier', 'avi@gmail.com');
  await page.type('#login-password', 'password');
  await new Promise(r => setTimeout(r, 400));

  // Click Log In
  await page.click('#login-submit-btn');

  // Wait for Dashboard
  await page.waitForFunction(() => document.body.innerText.includes('New Screening') || document.body.innerText.includes('Dashboard'), { timeout: 15000 });
  console.log('✓ Successfully logged in');

  // Navigate to New Screening
  for (const b of await page.$$('button, a')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('New Screening')) {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));

  // Select patient
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('→') || text.includes('Select Patient')) {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));

  // Select Upload Image
  for (const div of await page.$$('div')) {
    const text = await page.evaluate(el => el.innerText, div);
    if (text.includes('Upload Image') && text.includes('Choose file')) {
      await div.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));

  // Upload image
  const goodQualityPath = path.resolve('test_images/IDRiD_01.jpg');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(goodQualityPath);
  await new Promise(r => setTimeout(r, 600));

  // Click Analyse Image
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('Analyse Image')) {
      await b.click();
      break;
    }
  }

  console.log('Analyzing image...');
  await page.waitForFunction(() => {
    return document.body.innerText.includes('Quality: Good') || document.body.innerText.includes('View Full Results');
  }, { timeout: 45000 });

  console.log('Clicking View Full Results...');
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('View Full Results')) {
      await b.click();
      break;
    }
  }

  await page.waitForFunction(() => document.body.innerText.includes('AI Screening Result') || document.body.innerText.includes('View Report'), { timeout: 15000 });
  console.log('On results page! Now clicking View Report...');

  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('View Report')) {
      await b.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 2000));

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body text length after clicking View Report:', bodyText.length);
  console.log('Body snippet:', bodyText.slice(0, 400));

  await page.screenshot({ path: 'outputs/qa_view_report_clicked.png' });
  console.log('✓ Screenshot saved to outputs/qa_view_report_clicked.png');

  await browser.close();
  console.log('Done.');
})().catch(e => {
  console.error('Test Error:', e);
  process.exit(1);
});
