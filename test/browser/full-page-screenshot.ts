import { expect, type Page, type CDPSession } from '@playwright/test';

const sessions = new WeakMap<Page, Promise<CDPSession>>();

/** Capture the whole document without changing the session that owns mobile emulation. */
export async function fullPageScreenshot(page: Page) {
  const pixelRatio = await page.evaluate(async () => {
    await document.fonts.ready;
    return devicePixelRatio;
  });
  let pending = sessions.get(page);
  if (!pending) {
    pending = page.context().newCDPSession(page);
    sessions.set(page, pending);
  }
  // CDP sessions are closed with their page; reuse this one across consecutive captures.
  const session = await pending;
  let screenshot: Buffer = Buffer.alloc(0);
  await expect
    .poll(
      async () => {
        const previous = screenshot;
        const { cssContentSize } = await session.send('Page.getLayoutMetrics');
        const { data } = await session.send('Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: 0,
            y: 0,
            width: Math.ceil(cssContentSize.width),
            height: Math.ceil(cssContentSize.height),
            scale: 1 / pixelRatio,
          },
          captureBeyondViewport: true,
        });
        screenshot = Buffer.from(data, 'base64');
        return previous.equals(screenshot);
      },
      { message: 'The complete page must paint identically in consecutive captures' },
    )
    .toBe(true);
  return screenshot;
}
