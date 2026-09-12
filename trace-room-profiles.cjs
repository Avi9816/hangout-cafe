const puppeteer = require('puppeteer-core');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isPortActive(port) {
    return new Promise((resolve) => {
        const req = http.request({
            host: 'localhost',
            port: port,
            path: '/',
            method: 'GET',
            timeout: 1000
        }, (res) => {
            resolve(true);
        });
        req.on('error', () => {
            resolve(false);
        });
        req.end();
    });
}

async function main() {
    let vite;
    let browser;
    let page1;
    let page2;

    const globalTimeout = setTimeout(() => {
        console.error('GLOBAL_TIMEOUT: Room Profiles verification exceeded 240 seconds');
        cleanup().then(() => process.exit(1));
    }, 240000);

    async function cleanup() {
        console.log('\nCleaning up processes...');
        clearTimeout(globalTimeout);
        if (page1) { try { await page1.close(); } catch(e) {} }
        if (page2) { try { await page2.close(); } catch(e) {} }
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
        const portActive = await isPortActive(3000);
        const viteUrl = 'http://localhost:3000';
        if (portActive) {
            console.log('Vite server already running on port 3000. Reusing...');
        } else {
            console.log('Starting Vite server...');
            vite = spawn('npx', ['vite', '--open', 'false'], {
                cwd: __dirname,
                shell: true
            });

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
        }

        console.log('Launching browser...');
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context1 = await browser.createBrowserContext();
        page1 = await context1.newPage();

        // Inject WebTorrent Mock and Storage Mock
        const injectMock = async (page) => {
            await page.evaluateOnNewDocument(() => {
                // WebTorrent Mock
                const mockWebTorrent = function() {
                    this.torrents = [];
                    this.seed = function(file, callback) {
                        callback({ magnetURI: 'magnet:?xt=urn:btih:mock_magnet_' + Math.random().toString(36).substring(2, 8) });
                    };
                    this.add = function(url, callback) {
                        callback({ magnetURI: url });
                    };
                    this.remove = function(url) {};
                };
                Object.defineProperty(window, 'WebTorrent', {
                    get: () => mockWebTorrent,
                    configurable: false
                });

                window.mockUploadPhoto = async function(file) {
                    return 'https://firebasestorage.googleapis.com/v0/b/hangout-cafe-9441c.appspot.com/o/mock_polaroid.png?alt=media';
                };
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
        await page1.type('#id-alias', 'HostTab1');
        await page1.click('#btn-enter-cafe');
        await page1.waitForFunction(() => {
            const el = document.getElementById('identity-overlay');
            return el && el.classList.contains('hidden');
        }, { timeout: 10000 });

        const testRoomName = 'room-profile-test-' + Math.random().toString(36).substring(2, 8);
        console.log(`Tab 1 joining random room: ${testRoomName}`);
        await page1.evaluate((room) => window.presence.joinRoom(room), testRoomName);
        await sleep(3000);

        console.log('\n--- ROOM PROFILES & FAVORITES VERIFICATION CHECKS ---');

        // Check 1: Verify first-time join sets visitorCount = 1 and visitCount = 1
        console.log('Checking Check 1 (Initial stats)...');
        const initialStats = await page1.evaluate(async (room) => {
            const fs = window._firestore;
            const docRef = fs.doc(window.presence.db, 'artifacts', window.presence.appId, 'public', 'data', 'rooms', room);
            for (let i = 0; i < 10; i++) {
                const snap = await fs.getDoc(docRef);
                const data = snap.data();
                if (data && data.visitorCount !== undefined && data.visitCount !== undefined) {
                    return { visitorCount: data.visitorCount, visitCount: data.visitCount };
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            const snap = await fs.getDoc(docRef);
            const data = snap.data() || {};
            return { visitorCount: data.visitorCount, visitCount: data.visitCount };
        }, testRoomName);
        console.log('Initial Room Stats:', initialStats);
        const check1Pass = initialStats.visitorCount === 1 && initialStats.visitCount === 1;
        console.log(`Check 1 (Initial stats): ${check1Pass ? 'PASS' : 'FAIL'}`);

        // Check 2: Verify refresh loop (re-join) increments visitCount but NOT visitorCount
        console.log('Re-joining the same room in Tab 1 (simulating refresh)...');
        await page1.evaluate((room) => window.presence.joinRoom(room), testRoomName);
        await sleep(3000);

        const statsAfterRejoin = await page1.evaluate(async (room) => {
            const fs = window._firestore;
            const snap = await fs.getDoc(fs.doc(window.presence.db, 'artifacts', window.presence.appId, 'public', 'data', 'rooms', room));
            const data = snap.data();
            return { visitorCount: data.visitorCount, visitCount: data.visitCount };
        }, testRoomName);
        console.log('Stats after rejoin:', statsAfterRejoin);
        const check2Pass = statsAfterRejoin.visitorCount === 1 && statsAfterRejoin.visitCount === 2;
        console.log(`Check 2 (Refresh loop does not duplicate visitorCount): ${check2Pass ? 'PASS' : 'FAIL'}`);

        // Spawn Tab 2
        console.log('Spawning Tab 2...');
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
        await page2.type('#id-alias', 'PeerTab2');
        await page2.click('#btn-enter-cafe');
        await page2.waitForFunction(() => {
            const el = document.getElementById('identity-overlay');
            return el && el.classList.contains('hidden');
        }, { timeout: 10000 });
        await sleep(3000);

        // Check 3: Peer joining increments visitorCount to 2 and visitCount to 3
        console.log('Tab 2 joining room...');
        await page2.evaluate((room) => window.presence.joinRoom(room), testRoomName);
        
        const statsAfterPeer = await page2.evaluate(async (room) => {
            const fs = window._firestore;
            const docRef = fs.doc(window.presence.db, 'artifacts', window.presence.appId, 'public', 'data', 'rooms', room);
            for (let i = 0; i < 20; i++) {
                const snap = await fs.getDoc(docRef);
                const data = snap.data();
                if (data && data.visitorCount === 2 && data.visitCount === 3) {
                    return { visitorCount: data.visitorCount, visitCount: data.visitCount };
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            const snap = await fs.getDoc(docRef);
            const data = snap.data() || {};
            return { visitorCount: data.visitorCount, visitCount: data.visitCount };
        }, testRoomName);
        console.log('Stats after peer join:', statsAfterPeer);
        const check3Pass = statsAfterPeer.visitorCount === 2 && statsAfterPeer.visitCount === 3;
        console.log(`Check 3 (Second unique visitor increments visitorCount): ${check3Pass ? 'PASS' : 'FAIL'}`);

        // Check 4: Open Room Profile modal and verify it renders stats
        console.log('Checking Check 4 (Room Profile Render)...');
        await page2.evaluate((room) => window.spatialUI.openRoomProfile(room), testRoomName);
        
        // Wait dynamically for page2 UI to render the correct values
        await page2.waitForFunction(() => {
            const visitors = document.getElementById('profile-stat-visitors')?.textContent;
            const visits = document.getElementById('profile-stat-visits')?.textContent;
            return visitors === '2' && visits === '3';
        }, { timeout: 15000 }).catch(() => console.log('Check 4 UI rendering wait timed out.'));

        const profileRenderDetails = await page2.evaluate(() => {
            const modal = document.getElementById('room-profile-modal');
            const title = document.getElementById('profile-room-title')?.textContent;
            const visitorsVal = document.getElementById('profile-stat-visitors')?.textContent;
            const visitsVal = document.getElementById('profile-stat-visits')?.textContent;
            return {
                visible: modal && modal.style.display === 'flex',
                title,
                visitorsVal,
                visitsVal
            };
        });
        console.log('Room Profile Modal details:', profileRenderDetails);
        const check4Pass = profileRenderDetails.visible && 
                           profileRenderDetails.title === testRoomName && 
                           profileRenderDetails.visitorsVal === '2' && 
                           profileRenderDetails.visitsVal === '3';
        console.log(`Check 4 (Room Profile renders correctly): ${check4Pass ? 'PASS' : 'FAIL'}`);

        // Check 5: Toggle Favorite and verify it updates subcollection and UI in real-time
        console.log('Checking Check 5 (Favorites toggle)...');
        await page2.click('#btn-toggle-favorite');
        await sleep(2000);

        const favSavedState = await page2.evaluate(async (room) => {
            // Check button text
            const btnText = document.getElementById('btn-toggle-favorite')?.textContent;
            // Check UI Card in lobby
            const favCard = document.querySelector(`.favorite-card[data-room-code="${room}"]`);
            return {
                btnText,
                cardRendered: !!favCard
            };
        }, testRoomName);
        console.log('Favorite state details:', favSavedState);
        const check5Pass = favSavedState.btnText === '⭐ Saved' && favSavedState.cardRendered;
        console.log(`Check 5 (Favorites toggle saves and renders card): ${check5Pass ? 'PASS' : 'FAIL'}`);

        // Check 6: Verify isolation (Tab 1 does not see Tab 2's favorites)
        console.log('Checking Check 6 (Favorites Isolation)...');
        const tab1FavCardExists = await page1.evaluate((room) => {
            const card = document.querySelector(`.favorite-card[data-room-code="${room}"]`);
            return !!card;
        }, testRoomName);
        console.log('Tab 1 has Tab 2 favorite card:', tab1FavCardExists);
        const check6Pass = !tab1FavCardExists;
        console.log(`Check 6 (Favorites isolation): ${check6Pass ? 'PASS' : 'FAIL'}`);

        // Check 7: Verify direct join path and inline "Enter room" buttons work
        console.log('Checking Check 7 (Favorites enter room direct join)...');
        // Let's first make Tab 2 join 'window-seat' so it is out of testRoomName
        await page2.evaluate(() => window.presence.joinRoom('window-seat'));
        await sleep(2000);
        
        // Now click dedicated "Enter room" button in the favorite card
        const clickResult = await page2.evaluate((room) => {
            const card = document.querySelector(`.favorite-card[data-room-code="${room}"]`);
            if (!card) return 'card_not_found';
            const btn = card.querySelector('.favorite-card-action');
            if (!btn) return 'btn_not_found';
            btn.click();
            return 'clicked';
        }, testRoomName);
        console.log('Check 7 click result:', clickResult);
        await sleep(3000);

        const tab2CurrentRoomCode = await page2.evaluate(() => window.presence.roomCode);
        console.log('Tab 2 room after clicking favorite enter button:', tab2CurrentRoomCode);
        const check7Pass = tab2CurrentRoomCode === testRoomName;
        console.log(`Check 7 (Direct join from favorite card): ${check7Pass ? 'PASS' : 'FAIL'}`);

        // Check 8: Delete Favorite (Toggle off) and confirm card disappears
        console.log('Checking Check 8 (Favorites removal)...');
        // Open profile modal
        await page2.evaluate((room) => window.spatialUI.openRoomProfile(room), testRoomName);
        await sleep(2000);
        // Click untoggle
        await page2.click('#btn-toggle-favorite');
        await sleep(2000);

        const favRemovedState = await page2.evaluate(async (room) => {
            const btnText = document.getElementById('btn-toggle-favorite')?.textContent;
            const favCard = document.querySelector(`.favorite-card[data-room-code="${room}"]`);
            return {
                btnText,
                cardRendered: !!favCard
            };
        }, testRoomName);
        console.log('Removed Favorite state details:', favRemovedState);
        const check8Pass = favRemovedState.btnText === '⭐ Save to Favorites' && !favRemovedState.cardRendered;
        console.log(`Check 8 (Favorites removal cleans UI): ${check8Pass ? 'PASS' : 'FAIL'}`);

        // Check 9: Security rules block updates to other user's favorites
        console.log('Checking Check 9 (Security rules enforce favorites isolation)...');
        const rulesBlockPass = await page1.evaluate(async (peerUid, room) => {
            const p = window.presence;
            const fs = window._firestore;
            const ref = fs.doc(p.db, 'artifacts', p.appId, 'users', peerUid, 'favorites', room);
            try {
                await fs.setDoc(ref, { roomCode: room, displayName: 'Hacked', theme: 'window-seat', savedAt: Date.now() });
                console.log('RULE_CHECK: Set placeholder doc succeeded unexpectedly!');
                return false;
            } catch (err) {
                console.log('RULE_CHECK: Caught error for placeholder:', err.code, err.message);
                return err.code === 'permission-denied' || err.message.toLowerCase().includes('permission');
            }
        }, statsAfterPeer.visitorCount === 2 ? 'placeholder-uid' : 'some-uid', testRoomName);
        console.log('Peer favorites write blocked:', rulesBlockPass);
        
        const tab2Uid = await page2.evaluate(() => window.presence.userId);
        const exactRulesBlockPass = await page1.evaluate(async (peerUid, room) => {
            const p = window.presence;
            const fs = window._firestore;
            const ref = fs.doc(p.db, 'artifacts', p.appId, 'users', peerUid, 'favorites', room);
            try {
                await fs.setDoc(ref, { roomCode: room, displayName: 'Hacked', theme: 'window-seat', savedAt: Date.now() });
                console.log('RULE_CHECK: Set exact doc succeeded unexpectedly!');
                return false;
            } catch (err) {
                console.log('RULE_CHECK: Caught error for exact:', err.code, err.message);
                return err.code === 'permission-denied' || err.message.toLowerCase().includes('permission');
            }
        }, tab2Uid, testRoomName);
        console.log('Exact Peer favorites write blocked:', exactRulesBlockPass);
        const check9Pass = exactRulesBlockPass;
        console.log(`Check 9 (Security rules block peer favorite edits): ${check9Pass ? 'PASS' : 'FAIL'}`);

        // Check 10: Root Array Bloat Check
        console.log('Checking Check 10 (No root arrays)...');
        const roomDocData = await page1.evaluate(async (room) => {
            const fs = window._firestore;
            const snap = await fs.getDoc(fs.doc(window.presence.db, 'artifacts', window.presence.appId, 'public', 'data', 'rooms', room));
            return snap.data();
        }, testRoomName);
        const rootKeys = Object.keys(roomDocData);
        console.log('Room Doc root keys:', rootKeys);
        const check10Pass = !rootKeys.some(key => !['notes', 'objects'].includes(key) && Array.isArray(roomDocData[key]));
        console.log(`Check 10 (No root array fields except notes/objects): ${check10Pass ? 'PASS' : 'FAIL'}`);

        const allPassed = check1Pass && check2Pass && check3Pass && check4Pass && check5Pass && check6Pass && check7Pass && check8Pass && check9Pass && check10Pass;
        if (allPassed) {
            console.log('\nALL 10 ROOM PROFILES & FAVORITES VERIFICATION CHECKS PASSED.');
            await cleanup();
            process.exit(0);
        } else {
            console.error('\nSOME VERIFICATION CHECKS FAILED.');
            await cleanup();
            process.exit(1);
        }

    } catch (err) {
        console.error('ERROR during verification:', err);
        await cleanup();
        process.exit(1);
    }
}

main();
