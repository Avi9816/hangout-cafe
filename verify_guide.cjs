const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = "C:/Users/sharm/.gemini/antigravity/brain/24c7ebdd-25ef-4290-8433-38e52d5617af/";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runVerification() {
  const browser = await puppeteer.launch({ 
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  page.on('console', msg => console.log(`[PAGE CONSOLE] ${msg.text()}`));

  console.log("1. Starting app and clearing localStorage...");
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem("lateNightCafe.firstNightGuide.version");
  });
  
  // Reload to ensure localStorage is cleared on initial load
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);

  // Enter name if on identity screen
  const identityVisible = await page.evaluate(() => {
    const overlay = document.getElementById('identity-overlay');
    return overlay && !overlay.classList.contains('hidden');
  });

  if (identityVisible) {
    console.log("Entering name to step out of the cold...");
    await page.type('#id-alias', 'VerifierBot');
    await page.type('#id-mood', 'testing guide');
    await page.click('#btn-enter-cafe');
    console.log("Waiting for identity overlay to hide...");
    await page.waitForSelector('#identity-overlay', { hidden: true, timeout: 15000 });
    await sleep(2000);
  }

  // Hide ambient feed so it doesn't block shots
  await page.evaluate(() => {
    const feed = document.getElementById('ambient-feed-container');
    if (feed) feed.style.display = 'none';
  });

  // Verify step 1 auto-open
  const guideOpenOnStart = await page.evaluate(() => {
    return document.querySelector('.guide-card') !== null;
  });

  if (!guideOpenOnStart) {
    console.log("Guide not auto-opened due to retry timeout. Opening manually via replay button...");
    await page.click('#btn-replay-guide');
    await sleep(1500);
  }

  console.log("Taking screenshot: guide-step-1.png");
  await page.screenshot({ path: OUT_DIR + 'guide-step-1.png' });

  // Click next to Step 2
  console.log("Advancing to Step 2...");
  await page.click('#btn-guide-next');
  await sleep(1500);

  // Verify step 2 scroll and highlights
  console.log("Taking screenshot: guide-step-2-highlight.png");
  await page.screenshot({ path: OUT_DIR + 'guide-step-2-highlight.png' });

  // Click next to Step 3
  console.log("Advancing to Step 3...");
  await page.click('#btn-guide-next');
  await sleep(1500);

  // Verify step 3 copy and removed highlights
  console.log("Taking screenshot: guide-step-3.png");
  await page.screenshot({ path: OUT_DIR + 'guide-step-3.png' });

  // Click next to Step 4
  console.log("Advancing to Step 4...");
  await page.click('#btn-guide-next');
  await sleep(1500);

  // Verify step 4
  console.log("Taking screenshot: guide-step-4.png");
  await page.screenshot({ path: OUT_DIR + 'guide-step-4.png' });

  // Click complete
  console.log("Completing guide...");
  await page.click('#btn-guide-next');
  await sleep(1000);

  // Check localStorage key
  const hasSeen = await page.evaluate(() => localStorage.getItem("lateNightCafe.firstNightGuide.version"));
  console.log(`localStorage key after completion: lateNightCafe.firstNightGuide.version = ${hasSeen}`);

  // Refresh page and confirm guide doesn't open
  console.log("Refreshing page to check persistence...");
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // Open guide manually
  console.log("Replaying guide via link button...");
  await page.click('#btn-replay-guide');
  await sleep(1500);

  console.log("Taking screenshot: guide-replay.png");
  await page.screenshot({ path: OUT_DIR + 'guide-replay.png' });

  // Press Escape to skip/dismiss
  console.log("Testing Escape key dismissal...");
  await page.keyboard.press('Escape');
  await sleep(1000);

  const hasSeenAfterEsc = await page.evaluate(() => localStorage.getItem("lateNightCafe.firstNightGuide.version"));
  console.log(`localStorage key after Escape dismissal: ${hasSeenAfterEsc}`);

  // Clear localStorage again and refresh to test room entry dismissal
  console.log("Resetting guide to test room entry behavior...");
  await page.evaluate(() => {
    localStorage.removeItem("lateNightCafe.firstNightGuide.version");
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // Click replay to ensure guide is open
  await page.click('#btn-replay-guide');
  await sleep(1000);

  // Enter room Window Seat
  console.log("Entering Room Window Seat while guide is open...");
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.dest-btn'));
    const card = cards.find(c => c.textContent.includes('Window Seat'));
    if (card) {
      const joinBtn = card.querySelector('.dest-card-join');
      if (joinBtn) joinBtn.click();
      else card.click();
    }
  });

  // Wait for room view and take screenshot
  await page.waitForFunction(() => {
    const rv = document.getElementById('room-view');
    return rv && window.getComputedStyle(rv).display !== 'none';
  }, { timeout: 10000 });
  await sleep(2500);

  console.log("Taking screenshot: guide-room-entry-dismissed.png");
  await page.screenshot({ path: OUT_DIR + 'guide-room-entry-dismissed.png' });

  // Leave room
  console.log("Leaving room...");
  await page.evaluate(() => {
    if (window.presence && window.presence.leaveRoom) {
      window.presence.leaveRoom();
    }
  });
  await sleep(2000);

  // Switch to mobile viewport
  console.log("Switching to mobile viewport...");
  await page.setViewport({ width: 390, height: 844 });
  await sleep(1500);

  // Open guide manually on mobile
  console.log("Opening mobile guide via replay button...");
  await page.click('#btn-replay-guide');
  await sleep(1000);

  console.log("Taking screenshot: mobile-guide-step-1.png");
  await page.screenshot({ path: OUT_DIR + 'mobile-guide-step-1.png' });

  // Advance to Step 2
  console.log("Advancing mobile guide to Step 2...");
  await page.click('#btn-guide-next');
  await sleep(1500);

  console.log("Taking screenshot: mobile-guide-step-2-highlight.png");
  await page.screenshot({ path: OUT_DIR + 'mobile-guide-step-2-highlight.png' });

  console.log("All verification screenshots taken successfully.");
  await browser.close();
}

runVerification().catch(err => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
