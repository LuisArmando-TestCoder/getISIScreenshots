const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const archiver = require('archiver');

const secondsToWait = 16;
const sizesMap = new Map();

sizesMap.set([300, 250], 1500);
sizesMap.set([300, 600], 2000);
sizesMap.set([160, 600], 3000);
sizesMap.set([728, 90], 1500);
// todo: set height dinamically

screenshotBanners(sizesMap, 'http://127.0.0.1:5500/dev/v1', 'v1');
screenshotBanners(sizesMap, 'http://127.0.0.1:5500/dev/v2', 'v2');

async function getFullScreenshot(url, width, canvasHeight, timing, cssChangesSet) {
  let canvasBuffer;
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(
      new chrome.Options()
        .headless()
        .windowSize({ width: width, height: canvasHeight })
    )
    .build();

  try {
    // Navigate to the URL
    await driver.get(url);

    // Wait for the specified amount of time
    await driver.sleep(timing);

    // Make CSS changes to specified elements
    for (const [query, cssChanges] of cssChangesSet) {
      for (const cssChange of cssChanges) {
        const [property, value] = cssChange.split(':');
        await driver.executeScript(
          `document.querySelector('${query}').style['${property}'] = '${value}';`
        );
      }
    }

    // Get the full page height
    const fullPageHeight = await driver.executeScript(
      `return Math.max( 
        document.body.scrollHeight, 
        document.body.offsetHeight, 
        document.documentElement.clientHeight, 
        document.documentElement.scrollHeight, 
        document.documentElement.offsetHeight 
      );`
    );

    // Create the canvas
    const canvas = createCanvas(width, canvasHeight);
    const context = canvas.getContext('2d');

    // Take the first screenshot
    let imageData = await driver.takeScreenshot();

    // Parse the image data and add it to the canvas
    let image = await loadImage(Buffer.from(imageData, 'base64'));
    context.drawImage(image, 0, 0, width, canvasHeight);

    // Scroll down and take screenshots until the full page is captured
    let previousHeight = 0;
    while (previousHeight < fullPageHeight) {
      // Scroll down
      await driver.executeScript(
        `window.scrollTo(0, ${previousHeight + canvasHeight});`
      );

      // Wait for the page to scroll
      await driver.wait(until.elementLocated(By.css('body')));

      // Take the screenshot
      imageData = await driver.takeScreenshot();

      // Parse the image data and add it to the canvas
      image = await loadImage(Buffer.from(imageData, 'base64'));
      context.drawImage(
        image,
        0,
        previousHeight + canvasHeight,
        width,
        canvasHeight
      );

      // Update the previous height
      previousHeight += canvasHeight;
    }

    // Save the canvas as an image
    // fs.writeFileSync(`${imageName}.png`, canvas.toBuffer());

    canvasBuffer = canvas.toBuffer();
  } catch (error) {
    console.error(error);
  } finally {
    await driver.quit();
  }

  return canvasBuffer;
}

async function screenshotBanners(sizesMap, url, conceptName) {
  const output = fs.createWriteStream(`full_ISI_Screenshots_${conceptName}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`${archive.pointer()} total bytes`);
    console.log(
      'archiver has been finalized and the output file descriptor has closed.'
    );
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  const sizes = [];

  for (let [resolution, canvasHeight] of sizesMap) {
    sizes.push([resolution, canvasHeight]);
  }

  const takingScreenshots = sizes.map(([[width, height], canvasHeight]) => {
    return getFullScreenshot(
      `${url}/${width}x${height}/`,
      width,
      canvasHeight,
      secondsToWait * 1000,
      [
        ['#isiB', [`height: ${canvasHeight}px`]],
        ['#isiBox', [`height: ${canvasHeight}px`]],
        ['#main', [`height: ${canvasHeight}px`]],
      ],
      `${width}x${height}`
    ).then(fullScreenshot => {
      // Append the fullScreenshot canvas buffer to the archive
      archive.append(fullScreenshot, {
        name: `full_ISI_screenshot_${conceptName}_${width}x${height}.png`
      });
    });
  });
  
  await Promise.all(takingScreenshots);

  archive.finalize();
}