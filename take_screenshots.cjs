const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = "C:/Users/sharm/.gemini/antigravity/brain/24c7ebdd-25ef-4290-8433-38e52d5617af/";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function takeScreenshots() {
  const browser = await puppeteer.launch({ 
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', msg => console.log(`[PAGE] ${msg.text()}`));
  page.on('dialog', async dialog => {
    console.log(`[DIALOG] ${dialog.message()}`);
    await dialog.accept();
  });

  console.log("Navigating to app...");
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Enter name if on identity screen
  const identityVisible = await page.evaluate(() => {
    const overlay = document.getElementById('identity-overlay');
    return overlay && !overlay.classList.contains('hidden');
  });

  if (identityVisible) {
    console.log("Entering name...");
    await page.type('#id-alias', 'ScreenshotBot');
    await page.click('#btn-enter-cafe');
    console.log("Waiting for identity overlay to hide...");
    await page.waitForSelector('#identity-overlay', { hidden: true, timeout: 15000 });
    await sleep(2500);
  }

  await page.waitForSelector('#identity-overlay', { hidden: true, timeout: 15000 });
  await page.waitForSelector('.dest-btn', { visible: true, timeout: 15000 });
  console.log("Lobby loaded.");

  // Hide ambient feed to avoid covering content
  await page.evaluate(() => {
    const feed = document.getElementById('ambient-feed-container');
    if (feed) feed.style.display = 'none';
  });

  // Open guide manually to ensure it is visible in the screenshots
  console.log("Opening First Night Guide...");
  await page.click('#btn-replay-guide');
  await sleep(1000);

  console.log("Screenshot 1: lobby-top");
  await page.screenshot({ path: OUT_DIR + 'lobby-top.png' });

  // Advance to Step 2 (Choose a corner) to show highlights
  console.log("Advancing to Step 2 (Highlights)...");
  await page.click('#btn-guide-next');
  await sleep(1000);

  // Scroll lobby down to show private corner highlights
  console.log("Scrolling lobby down...");
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(1000);
  console.log("Screenshot 2: lobby-scrolled");
  await page.screenshot({ path: OUT_DIR + 'lobby-scrolled.png' });

  // Scroll back up
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // Join Rooftop
  console.log("Entering Rooftop...");
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.dest-btn'));
    const card = cards.find(c => c.textContent.includes('Rooftop'));
    if (card) {
      const joinBtn = card.querySelector('.dest-card-join');
      if (joinBtn) joinBtn.click();
      else card.click();
    }
  });

  // Wait for room-view to become visible
  await page.waitForFunction(() => {
    const rv = document.getElementById('room-view');
    if (!rv) return false;
    const style = window.getComputedStyle(rv);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
  }, { timeout: 12000 });
  await sleep(2000); // let transition complete

  console.log("Screenshot 3: room-top");
  await page.screenshot({ path: OUT_DIR + 'room-top.png' });

  // Leave room
  console.log("Leaving room...");
  await page.evaluate(() => {
    if (window.presence && window.presence.leaveRoom) {
      window.presence.leaveRoom();
    }
  });

  // Wait for room-view to disappear
  await page.waitForFunction(() => {
    const rv = document.getElementById('room-view');
    if (!rv) return true;
    const style = window.getComputedStyle(rv);
    return parseFloat(style.opacity) < 0.1 || style.display === 'none';
  }, { timeout: 10000 });
  await sleep(2000); // let lobby fade back in

  console.log("Screenshot 4: lobby-again");
  await page.screenshot({ path: OUT_DIR + 'lobby-again.png' });

  // Switch to mobile viewport (390x844)
  console.log("Switching to mobile viewport...");
  await page.setViewport({ width: 390, height: 844 });
  await sleep(1000);
  console.log("Screenshot 5: mobile-lobby");
  await page.screenshot({ path: OUT_DIR + 'mobile-lobby.png' });

  console.log("All screenshots done.");
  await browser.close();
}

takeScreenshots().catch(e => {
  console.error("Screenshot script failed:", e.message);
  process.exit(1);
});
