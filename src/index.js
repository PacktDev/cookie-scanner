import * as puppeteer from 'puppeteer'
import * as fs from 'fs';
import yargs from 'yargs';
import * as process from 'process';

const args = yargs(process.argv.slice(2))
    .option('chrome', {
        alias: 'c',
        description: 'Path to chrome executable',
        type: 'string',
        default: '/usr/bin/google-chrome'
    })
    .option('output', {
        alias: 'o',
        description: 'Path to output file',
        type: 'string',
        demandOption: true
    })
    .option('url', {
        alias: 'u',
        description: 'URL to navigate to',
        type: 'string',
        demandOption: true
    })
    .parse()


const cookies = new Set();
const storage = new Set();

async function _store(type, change) {
    return new Promise((resolve, reject) => {
        if (type === 'cookie') {
            cookies.add(change);
            resolve();
        }
        else if (type === 'storage') {
            storage.add(change);
            resolve();
        }
        else {
            reject();
        }
    });
}

const inject = () => {
    if (cookieStore) {
        cookieStore.addEventListener(
            'change',
            async (event) => {
                if (event.changed) {
                    for (let idx in event.changed) {
                        let change = event.changed[idx];
                        change.host = window.location.host;
                        await window._store('cookie', change)
                    }
                }
                else if (event.deleted) {
                    for (let idx in event.deleted) {
                        let change = event.changed[idx];
                        await window._store('cookie', change)
                    }
                }
            }
        )
    }
    if (window.localStorage) {
        window.addEventListener('storage', async (event) => {
            await window._store('storage', event)
        })
    }
}

(async (args) => {
    const browser = await puppeteer.launch({
        args: [],
        executablePath: args.chrome,
        headless: false,
        defaultViewport: null
    });
    browser.on('disconnected', () => {
        console.log('Browser disconnected');
        fs.writeFileSync(args.output, JSON.stringify({
            cookies: [...cookies],
            storage: [...storage]
        }, null, 2));
    });

    const page = await browser.newPage();

    page.on('response', async () => {
        const cookies = await page.cookies();
        for (let idx in cookies) {
            let cookie = cookies[idx];
            if (cookie.domain.startsWith('.')) {
                cookie.domain = cookie.domain.slice(1);
            }
            await _store('cookie', cookie);
        }
    });

    await page.exposeFunction('_store', _store);
    await page.evaluateOnNewDocument(inject);
    await page.goto(args.url);

    if (process.env.CI === 'true') {
        await page.waitForNetworkIdle({
            idleTime: 1000,
            timeout: 10000
        });
        await browser.close();
        process.exit(fs.existsSync(args.output) ? 0 : 1);
    }
})(args);