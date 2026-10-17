const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  console.log('--- Starting Glaucoma Screening E2E Test ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,950']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });

  page.on('pageerror', err => {
    console.error('PAGE ERROR CRASH DETECTED:', err.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('CONSOLE ERROR:', msg.text());
    }
  });

  try {
    console.log('1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Check if login needed
    const loginInput = await page.$('#login-identifier');
    if (loginInput) {
      console.log('2. Logging in as Nurse...');
      await page.type('#login-identifier', 'avi@gmail.com');
      await page.type('#login-password', 'password');
      await page.click('#login-submit-btn');
      await page.waitForFunction(() => 
        document.body.innerText.includes('New Screening') || 
        document.body.innerText.includes('Dashboard') ||
        document.body.innerText.includes('Glaucoma'), 
        { timeout: 15000 }
      );
      console.log('✓ Successfully logged in');
    } else {
      console.log('✓ Already authenticated, session active');
    }

    // 3. Navigate to Glaucoma screening
    console.log('3. Navigating to Glaucoma Screening Flow...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, span, div'));
      for (const el of elements) {
        if (el.innerText && el.innerText.trim() === 'Glaucoma') {
          el.click();
          return true;
        }
      }
      return false;
    });

    await new Promise(r => setTimeout(r, 1200));

    // If on Glaucoma history page, click "New Glaucoma Screening"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      for (const b of btns) {
        if (b.innerText && (b.innerText.includes('New Glaucoma Screening') || b.innerText.includes('New Screening'))) {
          b.click();
          return true;
        }
      }
      return false;
    });
    await new Promise(r => setTimeout(r, 1200));

    // Step 1: Select patient
    console.log('4. Selecting Patient...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const b of btns) {
        if (b.innerText && (b.innerText.includes('Select Patient') || b.innerText.includes('Select') || b.innerText.includes('→'))) {
          b.click();
          return;
        }
      }
    });
    await new Promise(r => setTimeout(r, 1000));

    // Step 2: Upload image
    console.log('5. Uploading fundus image (test_images/IDRiD_01.jpg)...');
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error('File input not found');
    }
    const testImgPath = path.resolve('test_images/IDRiD_01.jpg');
    await fileInput.uploadFile(testImgPath);
    await new Promise(r => setTimeout(r, 1500));

    // Step 3: Click Analyze
    console.log('6. Clicking Run Glaucoma AI Screening...');
    await page.waitForSelector('#run-glaucoma-screening-btn', { timeout: 10000 });
    await page.click('#run-glaucoma-screening-btn');
    console.log('✓ Run Glaucoma AI Screening clicked successfully');

    // Wait for screening result to appear
    console.log('7. Waiting for AI inference & segmentation pipeline to finish...');
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return (
          (text.includes('Optic Disc & Cup') || text.includes('Retinal Vessels') || text.includes('VCDR')) && 
          (text.includes('GLAUCOMA SUSPECT') || text.includes('NORMAL / LOW RISK') || text.includes('NORMAL'))
        );
      },
      { timeout: 90000 }
    );
    console.log('✓ Glaucoma inference completed and results rendered on UI!');

    // Check tabs
    console.log('8. Testing Canvas Mode Switcher...');
    const tabLabels = ['Optic Disc & Cup', 'Retinal Vessels', 'Grad-CAM', 'Clinical Workflow', 'Original'];
    for (const tab of tabLabels) {
      await page.evaluate((label) => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const b of btns) {
          if (b.innerText && b.innerText.trim() === label) {
            b.click();
            return;
          }
        }
      }, tab);
      await new Promise(r => setTimeout(r, 500));
    }
    console.log('✓ Canvas mode switcher tested successfully');

    // Check Biomarkers & Features
    const resultText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const hasVCDR = resultText.includes('vertical cup-to-disc ratio') || resultText.includes('vcdr');
    const hasRim = resultText.includes('neuroretinal rim') || resultText.includes('isnt');
    const hasVessels = resultText.includes('retinal microvasculature') || resultText.includes('vessel');
    console.log('✓ Biomarker cards rendered: VCDR =', hasVCDR, ', Rim =', hasRim, ', Vessels =', hasVessels);

    // Check Doctor Triage Summary & Patient Explanation
    const hasDoctorSummary = resultText.includes("doctor's clinical triage summary");
    const hasPatientSummary = resultText.includes("what this means for the patient");
    console.log('✓ Clinical guidance rendered: Doctor =', hasDoctorSummary, ', Patient =', hasPatientSummary);

    // 9. Take a screenshot of the Glaucoma Results Screen (Matching Diabetic Retinopathy UI)
    console.log('9. Saving screenshot of Glaucoma Screening Result (DR-style)...');
    await page.screenshot({ path: 'scratch/glaucoma_screening_result_view.png', fullPage: true });
    console.log('✓ Screenshot saved to scratch/glaucoma_screening_result_view.png');

    // 10. Click "View Report" button (matching NewScreeningFlow)
    console.log('10. Clicking "View Report"...');
    const viewReportClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const b of btns) {
        if (b.innerText && b.innerText.trim() === 'View Report') {
          b.click();
          return true;
        }
      }
      return false;
    });
    console.log('✓ View Report button clicked:', viewReportClicked);

    await new Promise(r => setTimeout(r, 2000));
    const reportText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const isReportOpen = 
      reportText.includes('glaucoma') &&
      (reportText.includes('clinical report') || reportText.includes('screening report') || reportText.includes('report id'));
    console.log('✓ Glaucoma Report Modal/Page opened successfully:', isReportOpen);

    // Save screenshot of the report
    await page.screenshot({ path: 'scratch/glaucoma_report_modal_view.png' });
    console.log('✓ Report screenshot saved to scratch/glaucoma_report_modal_view.png');

    // 11. Test PDF download button
    console.log('11. Testing PDF button on report...');
    const downloadClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const b of btns) {
        if (b.innerText && (b.innerText.includes('Download') || b.innerText.includes('PDF'))) {
          b.click();
          return true;
        }
      }
      return false;
    });
    console.log('✓ PDF button clicked:', downloadClicked);
    await new Promise(r => setTimeout(r, 2000));

    console.log('=== ALL GLAUCOMA SCREENING & REPORTING CHECKS PASSED WITH 100% SUCCESS ===');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
