const puppeteer = require('puppeteer-core');
const { spawn, execSync } = require('child_process');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    let vite;
    let browser;
    let page1;
    let page2;
    let page3;

    const globalTimeout = setTimeout(() => {
        console.error('GLOBAL_TIMEOUT: Room memory verification exceeded 240 seconds');
        cleanup().then(() => process.exit(1));
    }, 240000);

    async function cleanup() {
        console.log('\nCleaning up processes...');
        clearTimeout(globalTimeout);
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

        // Inject WebTorrent mock to bypass media constraints
        const injectMock = async (page) => {
            await page.evaluateOnNewDocument(() => {
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

        const testRoomName = 'room-mem-verify-' + Math.random().toString(36).substring(2, 8);
        console.log(`Using room name: ${testRoomName}`);

        await page1.type('#private-room-input', testRoomName);
        await page1.click('#btn-create-private');
        await page1.waitForFunction(() => {
            const el = document.getElementById('btn-leave-private');
            return el && el.style.display !== 'none';
        }, { timeout: 10000 });

        await sleep(3000);

        // Check 1: Room created history event written
        const historyOnStart = await page1.evaluate(() => window.presence.history || []);
        console.log('History on room join:', historyOnStart);
        const hasRoomCreatedEvent = historyOnStart.some(h => h.type === 'room_created');
        console.log(`Check 1 (Room Created History logged): ${hasRoomCreatedEvent ? 'PASS' : 'FAIL'}`);

        // Spawn Tab 2
        console.log('Spawning Tab 2 (Peer)...');
        const context2 = await browser.createBrowserContext();
        page2 = await context2.newPage();
        await injectMock(page2);
        page2.on('console', msg => console.log(`[TAB 2 CONSOLE] ${msg.text()}`));

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
        await page2.type('#private-room-input', testRoomName);
        await page2.click('#btn-create-private');
        await sleep(3000); // Wait for snapshot load

        // Check 2 & 3: note_pinned and object_placed history events logged
        console.log('Tab 2 placing a note and an object...');
        await page2.evaluate(() => {
            window.presence.bus.emit('local:note_posted', { text: 'Hello Wall', author: 'Tab2Peer', id: Date.now() });
            window.presence.bus.emit('local:object_placed', { emoji: '🧸', label: 'teddy bear', author: 'Tab2Peer', id: Date.now() });
        });
        await sleep(3000);

        const historyAfterWrites = await page2.evaluate(() => window.presence.history || []);
        console.log('History after note/object placement:', historyAfterWrites.map(h => h.text));
        const hasNoteEvent = historyAfterWrites.some(h => h.type === 'note_pinned' && h.text.includes('Hello Wall'));
        const hasObjEvent = historyAfterWrites.some(h => h.type === 'object_placed' && h.text.includes('teddy bear'));
        console.log(`Check 2 (Note Pinned History logged): ${hasNoteEvent ? 'PASS' : 'FAIL'}`);
        console.log(`Check 3 (Object Placed History logged): ${hasObjEvent ? 'PASS' : 'FAIL'}`);

        // Check 5: History syncs realtime across tabs
        const tab1History = await page1.evaluate(() => window.presence.history || []);
        const historySyncPass = tab1History.some(h => h.type === 'note_pinned' && h.text.includes('Hello Wall'));
        console.log(`Check 5 (History Syncs Realtime Across Tabs): ${historySyncPass ? 'PASS' : 'FAIL'}`);

        // Check 6: History query bounded to 50
        console.log('Flooding history to check bounds...');
        await page2.evaluate(async () => {
            for (let i = 0; i < 55; i++) {
                await window.presence.addHistoryEvent('note_pinned', `Flood event ${i}`);
            }
        });
        await sleep(4000);
        const floodedHistoryCount = await page1.evaluate(() => window.presence.history.length);
        console.log('History count after flood:', floodedHistoryCount);
        const boundsPass = floodedHistoryCount <= 50;
        console.log(`Check 6 (History Query Bounded to 50): ${boundsPass ? 'PASS' : 'FAIL'}`);

        // Check 7: Pin Note & Object to memories from Tab 2
        console.log('Tab 2 pinning note and object as memories...');
        await page2.evaluate(async () => {
            await window.presence.saveMemory({
                type: 'note',
                title: 'Note: Hello Wall',
                description: 'Left by Tab2Peer',
                payload: { text: 'Hello Wall', author: 'Tab2Peer' }
            });
            await window.presence.saveMemory({
                type: 'object',
                title: '🧸 teddy bear',
                description: 'Placed by Tab2Peer',
                payload: { emoji: '🧸', label: 'teddy bear', author: 'Tab2Peer' }
            });
        });
        await sleep(3000);

        const tab2Memories = await page2.evaluate(() => window.presence.memories || []);
        console.log('Tab 2 memories:', tab2Memories.map(m => m.title));
        const memoriesSavedPass = tab2Memories.length === 2 && tab2Memories.some(m => m.type === 'note') && tab2Memories.some(m => m.type === 'object');
        console.log(`Check 7 (Memories Saved to Subcollection): ${memoriesSavedPass ? 'PASS' : 'FAIL'}`);

        // Check 4: Host takeover logs host_changed event
        console.log('Tab 1 starting tape playback...');
        await page1.evaluate(async () => {
            await window.presence.bus.emit('local:media_play', {
                type: 'magnet',
                url: 'magnet:?xt=urn:btih:tape_x_mock',
                title: 'Tape X',
                action: 'play',
                time: 0
            });
        });
        await sleep(3000);

        console.log('Tab 1 leaving room to trigger takeover...');
        await page1.evaluate(() => window.presence.leaveRoom());
        await sleep(4000);

        const historyAfterTakeover = await page2.evaluate(() => window.presence.history || []);
        console.log('History after takeover:', historyAfterTakeover.map(h => h.text));
        const hasHostChangedEvent = historyAfterTakeover.some(h => h.type === 'host_changed' && h.text.includes('Tab2Peer'));
        console.log(`Check 4 (Host Changed History logged): ${hasHostChangedEvent ? 'PASS' : 'FAIL'}`);

        // Clean up Tab 2 memories reference for later checks
        const memoryNoteId = tab2Memories.find(m => m.type === 'note').id;
        const memoryObjId = tab2Memories.find(m => m.type === 'object').id;

        // Tab 2 leaves room -> Completely empty room!
        console.log('Tab 2 leaving room (leaving room empty)...');
        await page2.evaluate(() => window.presence.leaveRoom());
        await sleep(3000);

        // Spawn Tab 3 (New User joining the empty room later)
        console.log('Spawning Tab 3 (Late Rejoiner)...');
        const context3 = await browser.createBrowserContext();
        page3 = await context3.newPage();
        await injectMock(page3);
        page3.on('console', msg => console.log(`[TAB 3 CONSOLE] ${msg.text()}`));

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
        await page3.type('#private-room-input', testRoomName);
        await page3.click('#btn-create-private');
        await sleep(4000); // Wait for restoration of snapshot and listeners

        // Check 8 & 9 & 10 & 11: Rejoining room restores memories, tape state, queue, theme
        const tab3Memories = await page3.evaluate(() => window.presence.memories || []);
        const tab3Video = await page3.evaluate(() => window.presence.currentVideoState);
        console.log('Tab 3 memories restored:', tab3Memories.map(m => m.title));
        console.log('Tab 3 restored video state:', tab3Video);

        const memoriesRestored = tab3Memories.length === 2;
        const videoRestored = tab3Video && tab3Video.url === 'magnet:?xt=urn:btih:tape_x_mock';
        const hostTakeoverOnRestore = tab3Video && tab3Video.hostId === (await page3.evaluate(() => window.presence.userId));
        console.log(`Check 8 (Memories Restored on Rejoin): ${memoriesRestored ? 'PASS' : 'FAIL'}`);
        console.log(`Check 10 (Current Tape Restored on Rejoin): ${videoRestored ? 'PASS' : 'FAIL'}`);
        console.log(`Check 10b (Host Takeover on Empty Room Restore): ${hostTakeoverOnRestore ? 'PASS' : 'FAIL'}`);

        // Check 12: Restore actions work
        console.log('Tab 3 restoring Note memory...');
        await page3.evaluate(async (id) => {
            const m = window.presence.memories.find(mem => mem.id === id);
            if (m) {
                await window.presence.bus.emit('local:note_posted', {
                    text: m.payload.text,
                    author: m.payload.author,
                    id: Date.now()
                });
            }
        }, memoryNoteId);
        await sleep(3000);

        const tab3Notes = await page3.evaluate(() => window.presence.notes || []);
        console.log('Tab 3 Notes on wall:', tab3Notes);
        const restoreActionPass = tab3Notes.some(n => n.text === 'Hello Wall');
        console.log(`Check 12 (Restore Action works): ${restoreActionPass ? 'PASS' : 'FAIL'}`);

        // Check 13: creator-only memory deletion enforced (negative check)
        console.log('Tab 3 trying to delete Tab 2\'s memory...');
        const deleteBlockPass = await page3.evaluate(async (id) => {
            const p = window.presence;
            const fs = window._firestore;
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode, 'memories', id);
            try {
                await fs.deleteDoc(docRef);
                return false; // delete succeeded! Security rules failed
            } catch (err) {
                const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
                return isDenied;
            }
        }, memoryNoteId);
        console.log(`Check 13 (Creator-only Memory Deletion Enforced): ${deleteBlockPass ? 'PASS' : 'FAIL'}`);

        // Check 14: Firestore rules block illegal edits (negative check)
        console.log('Tab 3 attempting illegal update to memory payload...');
        const editBlockPass = await page3.evaluate(async (id) => {
            const p = window.presence;
            const fs = window._firestore;
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode, 'memories', id);
            try {
                await fs.updateDoc(docRef, { payload: { text: 'hacked note' } });
                return false; // update succeeded! Rules failed
            } catch (err) {
                const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
                return isDenied;
            }
        }, memoryNoteId);
        console.log(`Check 14 (Rules Block Illegal Updates): ${editBlockPass ? 'PASS' : 'FAIL'}`);

        // Check 15: No root room document bloat
        const roomDocData = await page3.evaluate(async () => {
            const p = window.presence;
            const fs = window._firestore;
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode);
            const snap = await fs.getDoc(docRef);
            return snap.exists() ? snap.data() : null;
        });
        console.log('Room Doc Root Keys:', Object.keys(roomDocData || {}));
        const noBloatPass = roomDocData && !roomDocData.history && !roomDocData.memories;
        console.log(`Check 15 (No Root Room Document Bloated arrays): ${noBloatPass ? 'PASS' : 'FAIL'}`);

        const allPass = hasRoomCreatedEvent && hasNoteEvent && hasObjEvent && historySyncPass && boundsPass && memoriesSavedPass && hasHostChangedEvent && memoriesRestored && videoRestored && hostTakeoverOnRestore && restoreActionPass && deleteBlockPass && editBlockPass && noBloatPass;

        console.log(`\n--- HANGOUT CAFE ROOM MEMORY SYSTEM RESULTS ---`);
        console.log(`1. room_created History Logged: ${hasRoomCreatedEvent ? 'PASS' : 'FAIL'}`);
        console.log(`2. note_pinned History Logged: ${hasNoteEvent ? 'PASS' : 'FAIL'}`);
        console.log(`3. object_placed History Logged: ${hasObjEvent ? 'PASS' : 'FAIL'}`);
        console.log(`4. host_changed History Logged: ${hasHostChangedEvent ? 'PASS' : 'FAIL'}`);
        console.log(`5. History Syncs Realtime: ${historySyncPass ? 'PASS' : 'FAIL'}`);
        console.log(`6. History Bounded to 50: ${boundsPass ? 'PASS' : 'FAIL'}`);
        console.log(`7. Memories Persist after leave: ${memoriesSavedPass ? 'PASS' : 'FAIL'}`);
        console.log(`8. Memories Restored on Rejoin: ${memoriesRestored ? 'PASS' : 'FAIL'}`);
        console.log(`9. Current Tape Restored: ${videoRestored ? 'PASS' : 'FAIL'}`);
        console.log(`10. Host Continuity restored: ${hostTakeoverOnRestore ? 'PASS' : 'FAIL'}`);
        console.log(`11. Restore Actions Work: ${restoreActionPass ? 'PASS' : 'FAIL'}`);
        console.log(`12. Creator-only Deletion Enforced: ${deleteBlockPass ? 'PASS' : 'FAIL'}`);
        console.log(`13. Firestore Rules block illegal edits: ${editBlockPass ? 'PASS' : 'FAIL'}`);
        console.log(`14. No Room Doc Bloat: ${noBloatPass ? 'PASS' : 'FAIL'}`);
        console.log(`-------------------------------------------\n`);

        if (allPass) {
            console.log('SUCCESS: Persistent shared room memory system verification PASSED.');
            await cleanup();
            process.exit(0);
        } else {
            console.error('FAILURE: Persistent shared room memory system verification FAILED.');
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
