const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,950'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });

  await page.evaluateOnNewDocument(() => {
    const user = {
      id: 'user_specialist',
      name: 'Dr. Aviraj Murkute',
      role: 'specialist',
      title: 'Ophthalmologist',
      email: 'specialist@trinay.com',
      phone: '+91 98200 00000',
      contactNo: '+91 98200 00000',
      avatarLetter: 'A',
    };
    localStorage.setItem('retina_x_v3_current_user', JSON.stringify(user));
    localStorage.setItem('retina_current_user', JSON.stringify(user));
    sessionStorage.setItem('retina_x_active_page', 'glaucoma-screening');
  });

  console.log('1. Navigating directly to Glaucoma Screening on http://127.0.0.1:5001...');
  await page.goto('http://127.0.0.1:5001', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2000));

  console.log('2. Waiting for file upload input...');
  await page.waitForSelector('input#glaucoma-file-upload', { timeout: 10000 });
  const fileInput = await page.$('input#glaucoma-file-upload');

  console.log('3. Uploading test image IDRiD_01.jpg...');
  const testImgPath = path.resolve('test_images/IDRiD_01.jpg');
  await fileInput.uploadFile(testImgPath);
  await new Promise((r) => setTimeout(r, 1500));

  console.log('4. Clicking Run AI Screening (#run-glaucoma-screening-btn)...');
  await page.waitForSelector('#run-glaucoma-screening-btn', { timeout: 10000 });
  await page.click('#run-glaucoma-screening-btn');

  console.log('5. Waiting for ML inference and segmentation pipeline to finish...');
  await page.waitForFunction(
    () => {
      return (
        document.body.innerText.includes('RETINAL AI VISUALIZATION') ||
        document.body.innerText.includes('GLAUCOMA STRUCTURAL BIOMARKERS')
      );
    },
    { timeout: 45000 }
  );

  console.log('Screening done! Waiting 1s for canvas render...');
  await new Promise((r) => setTimeout(r, 1200));

  // Tab 1: Original Fundus Image
  console.log('Clicking Tab 1: Original Fundus Image...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.innerText && (b.innerText.trim() === 'Original Fundus Image' || b.innerText.trim() === 'Original')) {
        b.click();
        return;
      }
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: '/Users/avirajmurkute/.gemini/antigravity-ide/brain/b0e92d41-aef8-4349-acb4-ec187761767b/tab_1_original.png',
  });

  // Tab 2: Optic Disc & Cup
  console.log('Clicking Tab 2: Optic Disc & Cup...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.innerText && b.innerText.trim() === 'Optic Disc & Cup') {
        b.click();
        return;
      }
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: '/Users/avirajmurkute/.gemini/antigravity-ide/brain/b0e92d41-aef8-4349-acb4-ec187761767b/tab_2_optic_disc.png',
  });

  // Tab 3: Neuroretinal Rim
  console.log('Clicking Tab 3: Neuroretinal Rim...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.innerText && b.innerText.trim() === 'Neuroretinal Rim') {
        b.click();
        return;
      }
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: '/Users/avirajmurkute/.gemini/antigravity-ide/brain/b0e92d41-aef8-4349-acb4-ec187761767b/tab_3_rim.png',
  });

  // Tab 4: Retinal Vessels
  console.log('Clicking Tab 4: Retinal Vessels...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.innerText && b.innerText.trim() === 'Retinal Vessels') {
        b.click();
        return;
      }
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: '/Users/avirajmurkute/.gemini/antigravity-ide/brain/b0e92d41-aef8-4349-acb4-ec187761767b/tab_4_vessels.png',
  });

  // Tab 5: Grad-CAM
  console.log('Clicking Tab 5: Grad-CAM...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.innerText && b.innerText.trim() === 'Grad-CAM') {
        b.click();
        return;
      }
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: '/Users/avirajmurkute/.gemini/antigravity-ide/brain/b0e92d41-aef8-4349-acb4-ec187761767b/tab_5_gradcam.png',
  });

  // Tab 6: Clinical Evidence
  console.log('Clicking Tab 6: Clinical Evidence...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if (b.innerText && b.innerText.trim() === 'Clinical Evidence') {
        b.click();
        return;
      }
    }
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({
    path: '/Users/avirajmurkute/.gemini/antigravity-ide/brain/b0e92d41-aef8-4349-acb4-ec187761767b/tab_6_clinical_evidence.png',
  });

  console.log('SUCCESS: All 6 tab screenshots saved successfully!');
  await browser.close();
})();
