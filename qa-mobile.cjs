const { chromium } = require('C:/Users/Hw_le/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:5176', { waitUntil: 'networkidle' })
  await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles(
    'C:/Users/Hw_le/Downloads/PDF-Bahasa-Jerman/BAHAN AJAR BABAK A1 FULL.pdf',
  )
  await page.getByText('PDF tersimpan offline').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.locator('.doc-row').waitFor({ timeout: 30000 })
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.library-panel')
    const list = document.querySelector('.library-scroll')
    const canvas = document.querySelector('.pdf-canvas')
    return {
      panelHeight: panel?.getBoundingClientRect().height,
      listHeight: list?.getBoundingClientRect().height,
      listScrollHeight: list?.scrollHeight,
      canvasWidth: canvas?.getBoundingClientRect().width,
      canvasHeight: canvas?.getBoundingClientRect().height,
    }
  })
  await page.screenshot({ path: 'qa-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Perbaiki teks PDF' }).click()
  await page.getByText('Siap - mode kompatibilitas').waitFor({ timeout: 30000 })
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.doc-delete').click()
  await page.getByText('Belum ada PDF tersimpan.').waitFor({ timeout: 10000 })
  console.log(JSON.stringify({ layout, errors, deleteWorked: true }))
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
