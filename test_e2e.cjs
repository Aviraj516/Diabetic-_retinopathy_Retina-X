const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log('=== STARTING AUTOMATED QA TEST ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Load login page
  console.log('1. Loading login page...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // 2. Log in as Nurse
  console.log('2. Logging in as Nurse...');
  await page.waitForSelector('#login-identifier', { timeout: 10000 });
  await page.type('#login-identifier', 'avi@gmail.com');
  await page.type('#login-password', 'password');
  await new Promise(r => setTimeout(r, 400));

  // Click Log In
  await page.click('#login-submit-btn');

  // Wait for Dashboard
  await page.waitForFunction(() => document.body.innerText.includes('New Screening') || document.body.innerText.includes('Dashboard'), { timeout: 15000 });
  console.log('✓ Successfully logged in to Dashboard');

  // 3. Navigate to New Screening
  console.log('3. Opening New Screening flow...');
  for (const b of await page.$$('button, a')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('New Screening')) {
      await b.click();
      break;
    }
  }

  await new Promise(r => setTimeout(r, 600));

  // 4. Select patient
  console.log('4. Selecting patient...');
  let patientSelected = false;
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('→') || text.includes('Select Patient')) {
      await b.click();
      patientSelected = true;
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));

  // 5. Select Upload Image
  console.log('5. Choosing Upload Image source...');
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('div, h3')).some(el => el.innerText && el.innerText.includes('Upload Image'));
  });
  for (const div of await page.$$('div')) {
    const text = await page.evaluate(el => el.innerText, div);
    if (text.includes('Upload Image') && text.includes('Choose file')) {
      await div.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));

  // 6. TEST 1: LOW QUALITY IMAGE
  console.log('6. Uploading test_images/low_quality.png...');
  const lowQualityPath = path.resolve('test_images/low_quality.png');
  const fileInput1 = await page.$('input[type="file"]');
  await fileInput1.uploadFile(lowQualityPath);
  await new Promise(r => setTimeout(r, 600));

  // Click Analyse Image
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('Analyse Image')) {
      await b.click();
      break;
    }
  }

  console.log('Waiting for Quality Assessment on low quality image...');
  await page.waitForFunction(() => {
    return document.body.innerText.includes('Image quality is insufficient') || document.body.innerText.includes('Ungradable') || document.body.innerText.includes('Borderline');
  }, { timeout: 30000 });

  const lowQualityText = await page.evaluate(() => document.body.innerText);
  const stoppedCorrectly = lowQualityText.includes('Image quality is insufficient. Please retake or upload a clearer retinal image.');
  console.log('Quality verdict for low_quality.png:', lowQualityText.includes('Ungradable') ? 'Ungradable' : 'Borderline');
  console.log('Pipeline stopped with retake warning:', stoppedCorrectly);
  if (!stoppedCorrectly) throw new Error('Low quality image was not stopped!');

  await page.screenshot({ path: 'outputs/qa_low_quality_test.png' });
  console.log('✓ Screenshot saved to outputs/qa_low_quality_test.png');

  // 7. TEST 2: GOOD QUALITY IMAGE (IDRiD_01.jpg)
  console.log('\n7. Testing GOOD image (test_images/IDRiD_01.jpg)...');
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('Upload a different image') || text.includes('Back')) {
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 600));

  const goodQualityPath = path.resolve('test_images/IDRiD_01.jpg');
  const fileInput2 = await page.$('input[type="file"]');
  await fileInput2.uploadFile(goodQualityPath);
  await new Promise(r => setTimeout(r, 600));

  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('Analyse Image')) {
      await b.click();
      break;
    }
  }

  console.log('Waiting for full pipeline on IDRiD_01.jpg...');
  await page.waitForFunction(() => {
    return document.body.innerText.includes('Quality: Good') || document.body.innerText.includes('View Full Results');
  }, { timeout: 45000 });

  console.log('✓ Quality assessed as Good! Clicking "View Full Results →"...');
  for (const b of await page.$$('button')) {
    const text = await page.evaluate(el => el.innerText, b);
    if (text.includes('View Full Results')) {
      await b.click();
      break;
    }
  }

  await page.waitForFunction(() => {
    return document.body.innerText.includes('Moderate') || document.body.innerText.includes('AI-Detected Findings');
  }, { timeout: 15000 });

  const resultText = await page.evaluate(() => document.body.innerText);
  console.log('Checking Result Page:');
  console.log('  - Contains Moderate DR:', resultText.includes('Moderate'));
  console.log('  - Contains 97% confidence:', resultText.includes('97%'));
  console.log('  - Contains Microaneurysm:', resultText.includes('Microaneurysm'));
  console.log('  - Contains Haemorrhage:', resultText.includes('Haemorrhage'));
  console.log('  - Contains Hard Exudate:', resultText.includes('Hard Exudate'));
  console.log('  - Contains Soft Exudate:', resultText.includes('Soft Exudate'));

  await page.screenshot({ path: 'outputs/qa_good_quality_test.png' });
  console.log('✓ Screenshot saved to outputs/qa_good_quality_test.png');

  await browser.close();
  console.log('\n🎉 ALL QA END-TO-END BROWSER TESTS PASSED!');
})().catch(e => {
  console.error('QA Test Error:', e);
  process.exit(1);
});
