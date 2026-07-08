/** @type {import("puppeteer").Configuration} */
module.exports = {
  // Never download Chromium — rely on PUPPETEER_EXECUTABLE_PATH (system Chromium in Docker).
  skipDownload: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
}
