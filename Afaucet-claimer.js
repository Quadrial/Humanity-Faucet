const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Configuration for multiple wallets
const CONFIGS = [
  {
    label: "Wallet 1",
    FAUCET_URL: "https://faucet.testnet.humanity.org/",
    WALLET_ADDRESS: "0xEDf4364Ca6AA3e6702DaB8b16eb63cc61B649EDD",
    CLAIM_INTERVAL_MS: 90 * 1000, // 1.5 minutes in milliseconds
  },
  {
    label: "Wallet 2",
    FAUCET_URL: "https://faucet.testnet.humanity.org/",
    WALLET_ADDRESS: "0x1DCb5a1C5FA7571860926fF8F09ea959c49D3461",
    CLAIM_INTERVAL_MS: 90 * 1000, // 1.5 minutes in milliseconds
  },
];

const DEBUG_FOLDER = "debug-artifacts"; // Folder for saving debug files

// Create the debug folder if it doesn't exist
if (!fs.existsSync(DEBUG_FOLDER)) {
  fs.mkdirSync(DEBUG_FOLDER, { recursive: true });
  console.log(`Created debug folder: ${DEBUG_FOLDER}`);
}

async function claimFaucet(config) {
  let browser;
  let page;

  try {
    console.log(
      `[${config.label}] Starting faucet claim at`,
      new Date().toISOString()
    );

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
    console.log(`[${config.label}] Navigating to faucet...`);
    await page.goto(config.FAUCET_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Fill in the wallet address
    console.log(`[${config.label}] Filling address...`);
    await page.waitForSelector('input[type="text"]', {
      timeout: 15000,
      visible: true,
    });
    await page.type('input[type="text"]', config.WALLET_ADDRESS, { delay: 30 });

    // Click the Request button
    console.log(`[${config.label}] Attempting to click Request button...`);
    await clickRequestButton(page);

    // Wait for confirmation of the claim
    console.log(`[${config.label}] Waiting for confirmation...`);
    await waitForConfirmation(page);

    console.log(
      `[${config.label}] Faucet claimed successfully at`,
      new Date().toISOString()
    );
  } catch (error) {
    console.error(`[${config.label}] Error claiming faucet:`, error);
    await saveDebugArtifacts(page, config.label);
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

async function saveDebugArtifacts(page, label) {
  if (!page) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    // Save screenshot in the debug folder with wallet label
    const screenshotPath = path.join(
      DEBUG_FOLDER,
      `${label}-error-${timestamp}.png`
    );
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    console.log(`[${label}] Saved screenshot to ${screenshotPath}`);

    // Save HTML content in the debug folder with wallet label
    const htmlPath = path.join(
      DEBUG_FOLDER,
      `${label}-page-${timestamp}.html`
    );
    const html = await page.content();
    fs.writeFileSync(htmlPath, html);
    console.log(`[${label}] Saved page HTML to ${htmlPath}`);
  } catch (saveError) {
    console.error(`[${label}] Failed to save debug artifacts:`, saveError);
  }
}

// Function to start claiming for a specific config
function startClaimingForConfig(config) {
  // Initial claim
  claimFaucet(config);

  // Set up the interval for repeated claims
  setInterval(() => claimFaucet(config), config.CLAIM_INTERVAL_MS);

  console.log(
    `[${config.label}] Faucet claimer started. Will attempt to claim every ${
      config.CLAIM_INTERVAL_MS / 1000
    } seconds.`
  );
}

// Start claiming for all configs simultaneously
CONFIGS.forEach((config) => {
  startClaimingForConfig(config);
});