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

    const globalTimeout = setTimeout(() => {
        console.error('GLOBAL_TIMEOUT: Queue system verification exceeded 180 seconds');
        cleanup().then(() => process.exit(1));
    }, 180000);

    async function cleanup() {
        console.log('\nCleaning up processes...');
        clearTimeout(globalTimeout);
        if (page1) {
            try { await page1.close(); } catch(e) {}
        }
        if (page2) {
            try { await page2.close(); } catch(e) {}
        }
        if (browser) {
            try {
                await browser.close();
            } catch (err) {}
        }
        if (vite) {
            try {
                execSync(`taskkill /pid ${vite.pid} /f /t`, { stdio: 'ignore' });
            } catch (err) {
                try {
                    vite.kill();
                } catch(e) {}
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

        const testRoomName = 'queue-verify-' + Math.random().toString(36).substring(2, 8);
        console.log(`Using room name: ${testRoomName}`);

        await page1.type('#private-room-input', testRoomName);
        await page1.click('#btn-create-private');
        await page1.waitForFunction(() => {
            const el = document.getElementById('btn-leave-private');
            return el && el.style.display !== 'none';
        }, { timeout: 10000 });

        await sleep(2000);

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

        // --- START TESTS ---
        console.log('\n--- VERIFICATION CHECKS ---');

        // Check 1: Enqueue Media from Tab 1
        console.log('Tab 1 enqueuing Tape A...');
        await page1.evaluate(async () => {
            await window.presence.enqueueMedia('magnet:?xt=urn:btih:tape_a_mock_magnet', 'Tape A');
        });
        await sleep(3000);

        const tab1Queue = await page1.evaluate(() => window.presence.queue);
        console.log('Tab 1 Queue:', tab1Queue);
        const enqueuePass = tab1Queue.length === 1 && tab1Queue[0].title === 'Tape A' && tab1Queue[0].status === 'pending';
        console.log(`Check 1 (Queue Written to Subcollection): ${enqueuePass ? 'PASS' : 'FAIL'}`);

        // Check 2: Queue Syncs Realtime across tabs
        const tab2Queue = await page2.evaluate(() => window.presence.queue);
        console.log('Tab 2 Queue:', tab2Queue);
        const queueSyncPass = tab2Queue.length === 1 && tab2Queue[0].title === 'Tape A';
        console.log(`Check 2 (Queue Syncs Realtime Across Tabs): ${queueSyncPass ? 'PASS' : 'FAIL'}`);

        // Check 3: Host starts queued media
        console.log('Tab 1 (host) starting Tape A...');
        const tapeAId = tab1Queue[0].id;
        await page1.evaluate(async (id) => {
            await window.presence.startQueuedMedia(id);
        }, tapeAId);
        await sleep(3000);

        const tab1QueueAfterStart = await page1.evaluate(() => window.presence.queue);
        const tab1VideoState = await page1.evaluate(() => window.presence.currentVideoState);
        console.log('Tab 1 Video State:', tab1VideoState);
        const hostStartPass = tab1QueueAfterStart.some(q => q.id === tapeAId && q.status === 'playing') && 
                               tab1VideoState && tab1VideoState.url === 'magnet:?xt=urn:btih:tape_a_mock_magnet';
        console.log(`Check 3 (Host Can Start Queued Media): ${hostStartPass ? 'PASS' : 'FAIL'}`);

        // Check 4: Viewer cannot control queue (negative check)
        console.log('Tab 2 (viewer) trying to play/skip media...');
        const viewerControlBlocked = await page2.evaluate(async (id) => {
            const p = window.presence;
            // Trying to start media as non-host
            await p.startQueuedMedia(id);
            await p.playNextInQueue();
            return p.currentVideoState.hostId !== p.userId; // host should still be Tab 1
        }, tapeAId);
        console.log(`Check 4 (Viewer Cannot Control Queue): ${viewerControlBlocked ? 'PASS' : 'FAIL'}`);

        // Check 5: Firestore rules block illegal queue mutations (negative check)
        console.log('Tab 2 attempting illegal field edits in queue...');
        const rulesBlockPass = await page2.evaluate(async (id) => {
            const p = window.presence;
            const fs = window._firestore;
            const docRef = fs.doc(p.db, 'artifacts', p.appId, 'public', 'data', 'rooms', p.roomCode, 'queue', id);
            
            // Try to edit url (immutable field)
            try {
                await fs.updateDoc(docRef, { url: 'magnet:?xt=urn:btih:hacked_magnet' });
                return false; // update succeeded! Rules failed
            } catch (err) {
                const isDenied = err.code === 'permission-denied' || err.message.includes('permission');
                if (!isDenied) console.log('Unexpected edit error:', err);
                return isDenied;
            }
        }, tapeAId);
        console.log(`Check 5 (Firestore Rules Block Illegal Mutations): ${rulesBlockPass ? 'PASS' : 'FAIL'}`);

        // Check 6: Enqueue Tape B and Tape C
        console.log('Enqueuing Tape B and Tape C...');
        await page2.evaluate(async () => {
            await window.presence.enqueueMedia('magnet:?xt=urn:btih:tape_b_mock_magnet', 'Tape B');
        });
        await sleep(1500);
        await page2.evaluate(async () => {
            await window.presence.enqueueMedia('magnet:?xt=urn:btih:tape_c_mock_magnet', 'Tape C');
        });
        await sleep(2000);

        const tab1QueueWithThree = await page1.evaluate(() => window.presence.queue);
        console.log('Queue with three tapes:', tab1QueueWithThree.map(t => `${t.title} [${t.status}]`));

        // Check 7: Auto-advance works after MEDIA_ENDED
        console.log('Simulating Tape A ended on Tab 1 (Host)...');
        await page1.evaluate(() => {
            window.presence.bus.emit('local:media_ended', { type: 'magnet', url: 'magnet:?xt=urn:btih:tape_a_mock_magnet' });
        });
        await sleep(4000);

        const queueAfterEnd = await page1.evaluate(() => window.presence.queue);
        const videoStateAfterEnd = await page1.evaluate(() => window.presence.currentVideoState);
        console.log('Queue after Tape A ended:', queueAfterEnd.map(t => `${t.title} [${t.status}]`));
        console.log('Video state after Tape A ended:', videoStateAfterEnd);

        const autoAdvancePass = queueAfterEnd.some(q => q.title === 'Tape A' && q.status === 'completed') &&
                                queueAfterEnd.some(q => q.title === 'Tape B' && q.status === 'playing') &&
                                videoStateAfterEnd && videoStateAfterEnd.url === 'magnet:?xt=urn:btih:tape_b_mock_magnet';
        console.log(`Check 7 (Auto-advance Works on End): ${autoAdvancePass ? 'PASS' : 'FAIL'}`);

        // Check 8 & 9: Host leaving transfers authority and new host continues playback
        console.log('Tab 1 (Host) leaving the room...');
        await page1.evaluate(() => window.presence.leaveRoom());
        await sleep(4000);

        const tab2VideoStateAfterLeave = await page2.evaluate(() => window.presence.currentVideoState);
        const tab2UserId = await page2.evaluate(() => window.presence.userId);
        console.log('Tab 2 User ID:', tab2UserId);
        console.log('Tab 2 sees video state after host leaves:', tab2VideoStateAfterLeave);

        const hostTransferPass = tab2VideoStateAfterLeave && tab2VideoStateAfterLeave.hostId === tab2UserId;
        console.log(`Check 8 (Host Leaving Transfers Authority): ${hostTransferPass ? 'PASS' : 'FAIL'}`);

        // Check 10 & 11: New host can control and skip to Tape C
        console.log('Tab 2 (New Host) skipping current tape (Tape B)...');
        await page2.evaluate(() => window.presence.playNextInQueue());
        await sleep(4000);

        const queueAfterSkip = await page2.evaluate(() => window.presence.queue);
        const videoStateAfterSkip = await page2.evaluate(() => window.presence.currentVideoState);
        console.log('Queue after Tape B skipped:', queueAfterSkip.map(t => `${t.title} [${t.status}]`));
        console.log('Video state after Tape B skipped:', videoStateAfterSkip);

        const skipWorksPass = queueAfterSkip.some(q => q.title === 'Tape B' && q.status === 'completed') &&
                              queueAfterSkip.some(q => q.title === 'Tape C' && q.status === 'playing') &&
                              videoStateAfterSkip && videoStateAfterSkip.url === 'magnet:?xt=urn:btih:tape_c_mock_magnet';
        console.log(`Check 10 (New Host Can Skip Current Tape): ${skipWorksPass ? 'PASS' : 'FAIL'}`);

        const allPass = enqueuePass && queueSyncPass && hostStartPass && viewerControlBlocked && rulesBlockPass && autoAdvancePass && hostTransferPass && skipWorksPass;

        console.log(`\n--- SYNCHRONIZED VHS MEDIA QUEUE SYSTEM RESULTS ---`);
        console.log(`1. Queue Items Written to Subcollection: ${enqueuePass ? 'PASS' : 'FAIL'}`);
        console.log(`2. Queue Syncs Realtime Across Tabs: ${queueSyncPass ? 'PASS' : 'FAIL'}`);
        console.log(`3. Host Can Start Queued Media: ${hostStartPass ? 'PASS' : 'FAIL'}`);
        console.log(`4. Host Can Skip Current Media: ${skipWorksPass ? 'PASS' : 'FAIL'}`);
        console.log(`5. Auto-advance Works after MEDIA_ENDED: ${autoAdvancePass ? 'PASS' : 'FAIL'}`);
        console.log(`6. Viewer Cannot Control Queue: ${viewerControlBlocked ? 'PASS' : 'FAIL'}`);
        console.log(`7. Host Leaving Transfers Authority: ${hostTransferPass ? 'PASS' : 'FAIL'}`);
        console.log(`8. New Host Can Continue Playback (Skip Works): ${skipWorksPass ? 'PASS' : 'FAIL'}`);
        console.log(`9. Firestore Rules Block Illegal mutations: ${rulesBlockPass ? 'PASS' : 'FAIL'}`);
        console.log(`-------------------------------------------\n`);

        if (allPass) {
            console.log('SUCCESS: Synchronized VHS media queue system verification PASSED.');
            await cleanup();
            process.exit(0);
        } else {
            console.error('FAILURE: Synchronized VHS media queue system verification FAILED.');
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
