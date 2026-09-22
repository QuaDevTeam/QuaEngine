/** Retry only failed loopback transport, including initial CSS/module requests. */
export async function openDemoPage(page, url) {
  for (let attempt = 0; ; attempt++) {
    let invalidAddress = false
    const failed = (request) => {
      if (request.failure()?.errorText.includes('ERR_ADDRESS_INVALID'))
        invalidAddress = true
    }
    page.on('requestfailed', failed)
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
      if (!invalidAddress || attempt >= 3)
        return response
      console.warn('Retrying demo navigation after ERR_ADDRESS_INVALID in a page resource')
    }
    catch (error) {
      if (attempt >= 3 || !String(error).includes('ERR_ADDRESS_INVALID'))
        throw error
      console.warn('Retrying demo navigation after ERR_ADDRESS_INVALID')
    }
    finally { page.off('requestfailed', failed) }
    await page.waitForTimeout(500)
  }
}
