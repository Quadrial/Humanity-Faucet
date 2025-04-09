const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path"); // Add path module for cross-platform path handling

// Configuration
const FAUCET_URL = "https://faucet.testnet.humanity.org/";
const WALLET_ADDRESS = "0xEDf4364Ca6AA3e6702DaB8b16eb63cc61B649EDD";
const CLAIM_INTERVAL_MS = 90 * 1000; // 1.5 minutes in milliseconds
const DEBUG_FOLDER = "debug-artifacts"; // Folder for saving debug files

// Create the debug folder if it doesn't exist
if (!fs.existsSync(DEBUG_FOLDER)) {
  fs.mkdirSync(DEBUG_FOLDER, { recursive: true });
  console.log(`Created debug folder: ${DEBUG_FOLDER}`);
}

async function claimFaucet() {
  let browser;
  let page;

  try {
    console.log("Starting faucet claim at", new Date().toISOString());

    // Launch the browser
    browser = await puppeteer.launch({
      headless: false, // Set to false for debugging; can be changed to true for production
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: null, // Use full window size
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setDefaultNavigationTimeout(60000);

    // Navigate to the faucet URL
    console.log("Navigating to faucet...");
    await page.goto(FAUCET_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Fill in the wallet address
    console.log("Filling address...");
    await page.waitForSelector('input[type="text"]', {
      timeout: 15000,
      visible: true,
    });
    await page.type('input[type="text"]', WALLET_ADDRESS, { delay: 30 });

    // Click the Request button
    console.log("Attempting to click Request button...");
    await clickRequestButton(page);

    // Wait for confirmation of the claim
    console.log("Waiting for confirmation...");
    await waitForConfirmation(page);

    console.log("Faucet claimed successfully at", new Date().toISOString());
  } catch (error) {
    console.error("Error claiming faucet:", error);
    await saveDebugArtifacts(page);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function clickRequestButton(page) {
  try {
    // Wait for any button to be present on the page
    console.log("Waiting for the Request button to be visible...");
    await page.waitForSelector("button", { timeout: 15000, visible: true });

    // Find the button with the exact text "Request"
    const button = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((b) => b.textContent.trim() === "Request");
    });

    if (!button.asElement()) {
      throw new Error("Request button not found on the page");
    }

    console.log("Request button found, attempting to click...");

    // Scroll the button into view to ensure it's clickable
    await button.evaluate((btn) =>
      btn.scrollIntoView({ behavior: "smooth", block: "center" })
    );

    // Click the button
    await button.click();
    console.log("Clicked the Request button using direct click");

    // Wait for a short period to ensure the click is processed
    await page.waitForTimeout(1000);
  } catch (error) {
    console.error("Failed to click the Request button:", error);

    // Fallback: Try clicking via JavaScript evaluation
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const requestBtn = buttons.find(
          (b) => b.textContent.trim() === "Request"
        );
        if (requestBtn) {
          requestBtn.click();
        } else {
          throw new Error("Request button not found in fallback method");
        }
      });
      console.log("Clicked the Request button using JavaScript evaluation");
      await page.waitForTimeout(1000);
    } catch (fallbackError) {
      console.error("Fallback click method failed:", fallbackError);

      // Additional debugging: Log all buttons on the page
      const buttonDetails = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        return buttons.map((b) => ({
          text: b.textContent.trim(),
          class: b.className,
          id: b.id,
        }));
      });
      console.log("Available buttons on the page:", buttonDetails);

      throw new Error("All button click methods failed");
    }
  }
}

async function waitForConfirmation(page) {
  try {
    // Wait for success indicators in the page content
    await page.waitForFunction(
      () => {
        const bodyText = document.body.innerText.toLowerCase();
        return (
          bodyText.includes("success") ||
          bodyText.includes("sent") ||
          bodyText.includes("received") ||
          bodyText.includes("processing")
        );
      },
      { timeout: 20000 }
    );
    console.log("Confirmation detected via page content");
  } catch (error) {
    // Fallback: Check if the Request button is disabled (indicating success)
    const isButtonDisabled = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const requestBtn = buttons.find(
        (b) => b.textContent.trim() === "Request"
      );
      return requestBtn ? requestBtn.disabled : false;
    });

    if (isButtonDisabled) {
      console.log("Button disabled state indicates success");
    } else {
      console.error("Confirmation wait failed:", error);
      throw new Error("Failed to confirm faucet claim");
    }
  }
}

async function saveDebugArtifacts(page) {
  if (!page) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    // Save screenshot in the debug folder
    const screenshotPath = path.join(DEBUG_FOLDER, `error-${timestamp}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    console.log(`Saved screenshot to ${screenshotPath}`);

    // Save HTML content in the debug folder
    const htmlPath = path.join(DEBUG_FOLDER, `page-${timestamp}.html`);
    const html = await page.content();
    fs.writeFileSync(htmlPath, html);
    console.log(`Saved page HTML to ${htmlPath}`);
  } catch (saveError) {
    console.error("Failed to save debug artifacts:", saveError);
  }
}

// Initial claim
claimFaucet();

// Set up the interval for repeated claims
setInterval(claimFaucet, CLAIM_INTERVAL_MS);

console.log(
  `Faucet claimer started. Will attempt to claim every ${
    CLAIM_INTERVAL_MS / 1000
  } seconds.`
);
