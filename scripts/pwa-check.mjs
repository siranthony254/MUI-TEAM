// Asks a real Chrome whether the app is installable, via the DevTools protocol.
// Usage: node scripts/pwa-check.mjs [url]   (needs a running production server and `npm i --no-save puppeteer-core`)
import puppeteer from 'puppeteer-core'

const URL_ = process.argv[2] || 'http://localhost:3058/login'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true })
  await page.goto(URL_, { waitUntil: 'networkidle0' })

  // Wait for the service worker to be active and controlling.
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false }
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))])
    return { supported: true, registered: !!reg, scope: reg && reg.scope, active: !!(reg && reg.active) }
  })

  const cdp = await page.createCDPSession()
  const { url: manifestUrl, errors: manifestErrors, data } = await cdp.send('Page.getAppManifest')
  let installErrors = []
  try { installErrors = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors } catch {}

  console.log('service worker :', JSON.stringify(sw))
  console.log('manifest url   :', manifestUrl)
  console.log('manifest errors:', manifestErrors.length ? manifestErrors.map((e) => e.message).join('; ') : 'none')
  const m = data ? JSON.parse(data) : {}
  console.log('manifest       :', `name="${m.name}" display=${m.display} start_url=${m.start_url} icons=${(m.icons || []).map((i) => i.sizes + (i.purpose ? `(${i.purpose})` : '')).join(',')}`)
  console.log('installability :', installErrors.length
    ? 'NOT INSTALLABLE -> ' + installErrors.map((e) => `${e.errorId} ${JSON.stringify(e.errorArguments)}`).join('; ')
    : 'INSTALLABLE (Chrome reports no blocking errors)')

  // The in-page install UI: does the app capture beforeinstallprompt / show its banner?
  const banner = await page.evaluate(() => !!Array.from(document.querySelectorAll('button')).find((b) => /Install|How/.test(b.textContent || '')))
  console.log('install banner on sign-in screen:', banner ? 'shown' : 'not shown (Chrome only fires the prompt event when it decides to; headless may not)')
} finally {
  await browser.close()
}
