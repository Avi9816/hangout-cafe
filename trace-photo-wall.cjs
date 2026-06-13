const puppeteer = require('puppeteer-core');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    // Create a temporary 1x1 pixel PNG file for upload
    const pngBuffer = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 
      0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 
      0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
    ]);
    fs.writeFileSync('test-image.png', pngBuffer);

    let vite;
    let browser;
    let page1;
    let page2;
    let page3;

    const globalTimeout = setTimeout(() => {
        console.error('GLOBAL_TIMEOUT: Photo Wall verification exceeded 240 seconds');
        cleanup().then(() => process.exit(1));
    }, 240000);

    async function cleanup() {
        console.log('\nCleaning up processes...');
        clearTimeout(globalTimeout);
        try { fs.unlinkSync('test-image.png'); } catch (e) {}
        if (page1) { try { await page1.close(); } catch(e) {} }
        if (page2) { try { await page2.close(); } catch(e) {} }
        if (page3) { try { await page3.close(); } catch(e) {} }
        if (browser) { try { await browser.close(); } catch (err) {} }
        if (vite) {
            try {
                execSync(`taskkill /pid ${vite.pid} /f /t`, { stdio: 'ignore' });
            } catch (err) {
                try { vite.kill(); } catch(e) {}
            }
        }
    }

    try {
        console.log('Starting Vite server...');
        vite = spawn('npx', ['vite', '--open', 'false'], {
            cwd: __dirname,
            shell: true
        });

        const viteUrl = 'http://localhost:3000';
        
        await new Promise((resolve, reject) => {
            const startTimeout = setTimeout(() => {
                reject(new Error('Vite server did not start in time'));
            }, 30000);
            vite.stdout.on('data', (data) => {
                if (data.toString().includes('Local:') || data.toString().includes('ready in') || data.toString().includes('localhost:')) {
                    clearTimeout(startTimeout);
                    resolve();
                }
            });
        });

        console.log('Launching browser...');
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context1 = await browser.createBrowserContext();
        page1 = await context1.newPage();

        // Inject WebTorrent mock and Storage Mock
        const injectMock = async (page) => {
            await page.evaluateOnNewDocument(() => {
                // WebTorrent Mock
                const mockWebTorrent = function() {
                    this.torrents = [];
                    this.seed = function(file, callback) {
                        callback({
                            magnetURI: 'magnet:?xt=urn:btih:mock_magnet_' + Math.random().toString(36).substring(2, 8),
                            files: [{
                                name: 'mock_video.mp4',
                                appendTo: function(container, options, cb) {
                                    const video = document.createElement('video');
                                    video.src = 'https://www.w3schools.com/html/mov_bbb.mp4';
                                    video.autoplay = true;
                                    video.loop = true;
                                    video.controls = true;
                                    const parent = document.querySelector(container);
                                    if (parent) parent.appendChild(video);
                                    cb(null, video);
                                }
                            }]
                        });
                    };
                    this.add = function(url, callback) {
                        callback({
                            magnetURI: url,
                            files: [{
                                name: 'mock_video.mp4',
                                appendTo: function(container, options, cb) {
                                    const video = document.createElement('video');
                                    video.src = 'https://www.w3schools.com/html/mov_bbb.mp4';
                                    video.autoplay = true;
                                    video.loop = true;
                                    video.controls = true;
                                    const parent = document.querySelector(container);
                                    if (parent) parent.appendChild(video);
                                    cb(null, video);
                                }
                            }]
                        });
                    };
                    this.remove = function(url) {};
                };
                Object.defineProperty(window, 'WebTorrent', {
                    get: () => mockWebTorrent,
                    configurable: false
                });
            });
        };

        await injectMock(page1);
        page1.on('console', msg => console.log(`[TAB 1 CONSOLE] ${msg.text()}`));
        page1.on('requestfailed', request => {
            console.log(`[TAB 1 REQ_FAILED] ${request.url()} - ${request.failure() ? request.failure().errorText : 'unknown error'}`);
        });

        console.log('Navigating Tab 1...');
        await page1.goto(viteUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3000);

        console.log('Logging in Tab 1...');
        await page1.type('#id-alias', 'Tab1Host');
        await page1.click('#btn-enter-cafe');
        await page1.waitForFunction(() => {
            const el = document.getElementById('identity-overlay');
            return el && el.classList.contains('hidden');
        }, { timeout: 10000 });

        const testRoomName = 'photo-verify-' + Math.random().toString(36).substring(2, 8);
        console.log(`Using room name: ${testRoomName}`);

        await page1.type('#private-room-input', testRoomName);
        await page1.click('#btn-create-private');
        await page1.waitForFunction(() => {
            const el = document.getElementById('btn-leave-private');
            return el && el.style.display !== 'none';
        }, { timeout: 10000 });

        await sleep(3000);

        // Spawn Tab 2
        console.log('Spawning Tab 2 (Peer)...');
        const context2 = await browser.createBrowserContext();
        page2 = await context2.newPage();
        await injectMock(page2);
        page2.on('console', msg => console.log(`[TAB 2 CONSOLE] ${msg.text()}`));
        page2.on('requestfailed', request => {
            console.log(`[TAB 2 REQ_FAILED] ${request.url()} - ${request.failure() ? request.failure().errorText : 'unknown error'}`);
        });

        console.log('Navigating Tab 2...');
        await page2.goto(viteUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3000);

        console.log('Logging in Tab 2...');
        await page2.type('#id-alias', 'Tab2Peer');
        await page2.click('#btn-enter-cafe');
        await page2.waitForFunction(() => {
            const el = document.getElementById('identity-overlay');
            return el && el.classList.contains('hidden');
        }, { timeout: 10000 });

        console.log('Tab 2 joining room...');
        await page2.evaluate((room) => window.presence.joinRoom(room), testRoomName);
        await page2.waitForFunction(() => {
            const el = document.getElementById('btn-leave-private');
            return el && el.style.display !== 'none';
        }, { timeout: 10000 });
        await sleep(3000); // Wait for snapshot load

        console.log('\n--- VERIFICATION CHECKS ---');

        console.log('Tab 1 selecting file and writing caption...');
        const fileInput = await page1.$('#photo-file-input');
        // Upload test-image.png as a real image file
        await fileInput.uploadFile(path.join(__dirname, 'test-image.png'));
        await sleep(1000);
        
        const selectedFileName = await page1.evaluate(() => document.getElementById('selected-photo-name').textContent);
        console.log('Selected file name in UI:', selectedFileName);
        const fileSelectedPass = selectedFileName === 'test-image.png';
        console.log(`Check 0 (File Selection Works): ${fileSelectedPass ? 'PASS' : 'FAIL'}`);

        await page1.type('#photo-caption-input', 'Late Night Coffee');
        await page1.click('#btn-upload-photo');
        console.log('Clicking upload...');
        // Wait for peer tab (page2) to receive the photo sync
        await page2.waitForFunction(() => {
            return window.presence && window.presence.photos && window.presence.photos.length === 1;
        }, { timeout: 10000 });

        // Check 2: Photo document written and synced in realtime
        const tab1Photos = await page1.evaluate(() => window.presence.photos || []);
        const tab2Photos = await page2.evaluate(() => window.presence.photos || []);
        console.log('Tab 1 Photos:', tab1Photos);
        console.log('Tab 2 Photos:', tab2Photos);
        const docWrittenPass = tab1Photos.length === 1 && tab1Photos[0].caption === 'Late Night Coffee';
        const docSyncPass = tab2Photos.length === 1 && tab2Photos[0].caption === 'Late Night Coffee';
        console.log(`Check 1 (Photo Upload & Doc Written): ${docWrittenPass ? 'PASS' : 'FAIL'}`);
        console.log(`Check 2 (Realtime Photo Sync): ${docSyncPass ? 'PASS' : 'FAIL'}`);

        const photoId = tab1Photos[0].id;
        const photoUrl = tab1Photos[0].url;

        // Check 3: History event written
        await page2.waitForFunction(() => {
            return window.presence && window.presence.history && window.presence.history.some(h => h.type === 'photo_added' && h.text.includes('Tab1Host pinned a photograph'));
        }, { timeout: 10000 });
        const historyList = await page2.evaluate(() => window.presence.history || []);
        console.log('History List Text:', historyList.map(h => h.text));
        const historyLoggedPass = historyList.some(h => h.type === 'photo_added' && h.text.includes('Tab1Host pinned a photograph'));
        console.log(`Check 3 (History Event Written): ${historyLoggedPass ? 'PASS' : 'FAIL'}`);

        // Check 4: Photos appear in memory section
        const memoriesText = await page2.evaluate(() => {
            const list = document.getElementById('room-memories-list');
            return list ? list.innerHTML : '';
        });
        console.log('Memories Panel HTML sample contains 📸:', memoriesText.includes('📸') && memoriesText.includes('Late Night Coffee'));
        const memoryListPass = memoriesText.includes('📸') && memoriesText.includes('Late Night Coffee');
        console.log(`Check 4 (Photos Appear in Memory Section): ${memoryListPass ? 'PASS' : 'FAIL'}`);

        // Check 5: Creator-only delete (Tab 2 cannot delete, Tab 1 can)
        console.log('Tab 2 trying to delete Tab 1\'s photo directly via security rules check...');
        const deleteBlockPass = await page2.evaluate(async (id) => {
            const p = window.presence;
            const fs = window._firestore;
            if (!p.roomCode) {
                console.error('ERROR: p.roomCode is null in Tab 2 check 5');
                return false;
            }
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode, 'photos', id);
            try {
                await fs.deleteDoc(docRef);
                return false; // delete succeeded! Rules failed
            } catch (err) {
                const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
                return isDenied;
            }
        }, photoId);
        console.log(`Check 5 (Creator-only Delete Enforced by Rules): ${deleteBlockPass ? 'PASS' : 'FAIL'}`);

        // Tab 2 UI check: delete button should not be present
        const tab2HasDeleteBtn = await page2.evaluate((id) => {
            // Find polaroid card
            const cards = Array.from(document.querySelectorAll('.polaroid-card'));
            const card = cards.find(c => c.innerHTML.includes('Late Night Coffee'));
            return card ? !!card.querySelector('.polaroid-delete-btn') : false;
        });
        console.log(`Check 6 (Delete Button Hidden for Non-creator): ${!tab2HasDeleteBtn ? 'PASS' : 'FAIL'}`);

        // Upload another photo to test Empty Room Restoration
        console.log('Tab 1 uploading second photo to test restoration...');
        const fileInput2 = await page1.$('#photo-file-input');
        await fileInput2.uploadFile(path.join(__dirname, 'test-image.png'));
        await sleep(1000);
        await page1.type('#photo-caption-input', 'Restored Polaroid');
        await page1.click('#btn-upload-photo');
        // Wait for upload and local state sync
        await page1.waitForFunction(() => {
            return window.presence && window.presence.photos && window.presence.photos.length === 2;
        }, { timeout: 10000 });

        const tab1PhotosAfter = await page1.evaluate(() => window.presence.photos || []);
        console.log('Photos count after 2nd upload:', tab1PhotosAfter.length);
        const restoredPhotoId = tab1PhotosAfter.find(p => p.caption === 'Restored Polaroid')?.id;

        // Both leave room -> Empty room!
        console.log('Both tabs leaving the room...');
        await page1.evaluate(() => window.presence.leaveRoom());
        await page2.evaluate(() => window.presence.leaveRoom());
        await sleep(4000);

        // Spawn Tab 3 (New user joining empty room)
        console.log('Spawning Tab 3 (Late Rejoiner)...');
        const context3 = await browser.createBrowserContext();
        page3 = await context3.newPage();
        await injectMock(page3);
        page3.on('console', msg => console.log(`[TAB 3 CONSOLE] ${msg.text()}`));
        page3.on('requestfailed', request => {
            console.log(`[TAB 3 REQ_FAILED] ${request.url()} - ${request.failure() ? request.failure().errorText : 'unknown error'}`);
        });

        console.log('Navigating Tab 3...');
        await page3.goto(viteUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3000);

        console.log('Logging in Tab 3...');
        await page3.type('#id-alias', 'Tab3Rejoiner');
        await page3.click('#btn-enter-cafe');
        await page3.waitForFunction(() => {
            const el = document.getElementById('identity-overlay');
            return el && el.classList.contains('hidden');
        }, { timeout: 10000 });

        console.log('Tab 3 joining the empty room...');
        await page3.evaluate((room) => window.presence.joinRoom(room), testRoomName);
        await page3.waitForFunction(() => {
            const el = document.getElementById('btn-leave-private');
            return el && el.style.display !== 'none';
        }, { timeout: 10000 });
        // Wait for empty room restoration to sync
        await page3.waitForFunction(() => {
            return window.presence && window.presence.photos && window.presence.photos.length === 2;
        }, { timeout: 10000 });

        const tab3Photos = await page3.evaluate(() => window.presence.photos || []);
        console.log('Tab 3 photos restored:', tab3Photos.map(p => p.caption));
        const photoRestorePass = tab3Photos.length === 2 && tab3Photos.some(p => p.caption === 'Restored Polaroid');
        console.log(`Check 7 (Photos Restored after Empty Room): ${photoRestorePass ? 'PASS' : 'FAIL'}`);

        // Check 8: Security rules block photo updates (negative check)
        console.log('Tab 3 attempting illegal update to photo document...');
        const editBlockPass = await page3.evaluate(async (id) => {
            const p = window.presence;
            const fs = window._firestore;
            if (!p.roomCode) {
                console.error('ERROR: p.roomCode is null in Tab 3 check 8');
                return false;
            }
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode, 'photos', id);
            try {
                await fs.updateDoc(docRef, { caption: 'hacked caption' });
                return false; // update succeeded! Rules failed
            } catch (err) {
                const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
                return isDenied;
            }
        }, restoredPhotoId);
        console.log(`Check 8 (Rules Block Illegal Updates): ${editBlockPass ? 'PASS' : 'FAIL'}`);

        // Check 9: No root room document bloat
        const roomDocData = await page3.evaluate(async () => {
            const p = window.presence;
            const fs = window._firestore;
            if (!p.roomCode) {
                console.error('ERROR: p.roomCode is null in Tab 3 check 9');
                return null;
            }
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode);
            const snap = await fs.getDoc(docRef);
            return snap.exists() ? snap.data() : null;
        });
        console.log('Room Doc Root Keys:', Object.keys(roomDocData || {}));
        const noBloatPass = roomDocData && !roomDocData.photos;
        console.log(`Check 9 (No Root Room Document Bloated arrays): ${noBloatPass ? 'PASS' : 'FAIL'}`);

        // Cleanup: Tab 3 (which is now host since it's the only one left) deletes the photo it uploaded (Wait! Tab 3 didn't upload them, Tab 1 did! So Tab 3 shouldn't be able to delete them either.)
        console.log('Tab 3 attempting to delete Tab 1\'s restored photo (should fail)...');
        const tab3DeleteBlock = await page3.evaluate(async (id) => {
            const p = window.presence;
            const fs = window._firestore;
            if (!p.roomCode) {
                console.error('ERROR: p.roomCode is null in Tab 3 check 10');
                return false;
            }
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode, 'photos', id);
            try {
                await fs.deleteDoc(docRef);
                return false;
            } catch (err) {
                return err.code === 'permission-denied' || err.message.includes('permission');
            }
        }, restoredPhotoId);
        console.log(`Check 10 (Tab 3 Delete Blocked): ${tab3DeleteBlock ? 'PASS' : 'FAIL'}`);

        const allPass = fileSelectedPass && docWrittenPass && docSyncPass && historyLoggedPass && memoryListPass && deleteBlockPass && !tab2HasDeleteBtn && photoRestorePass && editBlockPass && noBloatPass && tab3DeleteBlock;

        console.log(`\n--- HANGOUT CAFE PHOTO WALL SYSTEM RESULTS ---`);
        console.log(`1. File Selection Works: ${fileSelectedPass ? 'PASS' : 'FAIL'}`);
        console.log(`2. Photo Document Written: ${docWrittenPass ? 'PASS' : 'FAIL'}`);
        console.log(`3. Realtime Photo Sync: ${docSyncPass ? 'PASS' : 'FAIL'}`);
        console.log(`4. History Event Logged: ${historyLoggedPass ? 'PASS' : 'FAIL'}`);
        console.log(`5. Photos Integrated in Memories: ${memoryListPass ? 'PASS' : 'FAIL'}`);
        console.log(`6. Creator-only Delete Enforced: ${deleteBlockPass ? 'PASS' : 'FAIL'}`);
        console.log(`7. Delete Hidden for Non-creator: ${!tab2HasDeleteBtn ? 'PASS' : 'FAIL'}`);
        console.log(`8. Photos Restored on Empty Room: ${photoRestorePass ? 'PASS' : 'FAIL'}`);
        console.log(`9. Rules Block updates: ${editBlockPass ? 'PASS' : 'FAIL'}`);
        console.log(`10. No Room Doc Bloat: ${noBloatPass ? 'PASS' : 'FAIL'}`);
        console.log(`-------------------------------------------\n`);

        if (allPass) {
            console.log('SUCCESS: Shared Photo Wall + Persistent Polaroids verification PASSED.');
            await cleanup();
            process.exit(0);
        } else {
            console.error('FAILURE: Shared Photo Wall + Persistent Polaroids verification FAILED.');
            await cleanup();
            process.exit(1);
        }

    } catch (err) {
        console.error('Error in trace script:', err);
        await cleanup();
        process.exit(1);
    } finally {
        process.exit(1);
    }
}

main();
