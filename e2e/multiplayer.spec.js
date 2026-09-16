import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const fillIdentity = async (page, name, age) => {
  await page.getByLabel("Your player name").fill(name);
  await page.getByLabel(/your age/i).fill(String(age));
};

const newPlayer = async (browser, viewport, storageState) => {
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(storageState ? { storageState } : {}),
  });
  if (storageState) await context.addInitScript(() => localStorage.removeItem("scoutItOutRoom"));
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Play together" })).toBeVisible();
  return { context, page };
};

const join = async (page, code, name, age) => {
  await fillIdentity(page, name, age);
  await page.getByLabel("Room code").fill(code);
  await page.getByRole("button", { name: "Join room" }).click();
  try {
    await expect(page.locator(".multiRoomHeader h2")).toHaveText(code, { timeout: 20_000 });
  } catch (failure) {
    const alerts = await page.getByRole("alert").allTextContents();
    throw new Error(`Joining ${code} failed: ${alerts.join(" | ") || failure.message}`);
  }
};

const closeRoom = async (host) => {
  const mapClose = host.getByRole("button", { name: "Close map" });
  if (await mapClose.isVisible().catch(() => false)) await mapClose.click();
  const quit = host.getByRole("button", { name: "Quit game" });
  if (await quit.isVisible().catch(() => false)) {
    host.once("dialog", (dialog) => dialog.accept());
    await quit.click();
    await expect(host.getByRole("heading", { name: "Play together" })).toBeVisible();
  }
};

test("three devices play rotating turns, tokens, quit, and Endless results", async ({ browser }) => {
  const devices = [];
  let host;
  try {
    const first = await newPlayer(browser);
    devices.push(first);
    host = first.page;
    if (await host.getByText(/server busy/i).isVisible().catch(() => false))
      test.skip(true, "Another family's room is already active");

    await fillIdentity(host, "Ada", 27);
    await host.getByRole("button", { name: "Create room" }).click();
    const code = (await host.locator(".multiRoomHeader h2").textContent()).trim();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const elderDevice = await newPlayer(browser);
    devices.push(elderDevice);
    const elder = elderDevice.page;
    await join(elder, code, "Grace", 45);

    const mobileDevice = await newPlayer(browser, { width: 390, height: 844 });
    devices.push(mobileDevice);
    const mobile = mobileDevice.page;
    await join(mobile, code, "Linus", 22);
    await expect.poll(() => mobile.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const outsiderDevice = await newPlayer(browser, undefined,
      await first.context.storageState());
    devices.push(outsiderDevice);
    await expect(outsiderDevice.page.getByText(/server busy/i)).toBeVisible();
    await expect(outsiderDevice.page.getByRole("button", { name: "Create room" })).toBeDisabled();

    await host.getByRole("button", { name: "Start shared game" }).click();
    await expect(elder.getByRole("heading", { name: "You hold the card" })).toBeVisible();
    await expect(elder.getByRole("img", { name: "Current country flag" })).toBeVisible();
    await expect(host.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await expect(mobile.getByRole("dialog", { name: "World map" })).toBeVisible();
    await expect(mobile.getByRole("button", { name: "Roll digital die" })).toHaveCount(0);

    await host.getByRole("button", { name: "Roll digital die" }).click();
    await expect(host.getByText(/clue [1-6]:/i)).toBeVisible();
    await expect(host.getByRole("button", { name: "Roll digital die" })).toBeDisabled();
    await expect(elder.getByText(/read clue [1-6] aloud/i)).toBeVisible();
    await host.getByRole("button", { name: "Open world map" }).click();
    await expect(host.getByRole("dialog", { name: "World map" })).toBeVisible();
    await host.getByRole("button", { name: "Close map" }).click();

    await elder.getByRole("button", { name: /next roller/i }).click();
    await expect(mobile.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await expect(mobile.getByRole("dialog", { name: "World map" })).toHaveCount(0);
    await mobile.getByRole("button", { name: "Roll digital die" }).click();
    await expect(mobile.getByText(/clue [1-6]:/i)).toBeVisible();

    await elder.getByLabel("First correct guesser").selectOption({ label: "Ada" });
    await elder.getByRole("button", { name: /award card and token/i }).click();
    await expect(host.getByText(/1 cards · 1 tokens/i)).toBeVisible();
    await expect(mobile.getByRole("heading", { name: "You hold the card" })).toBeVisible();
    await expect(mobile.getByRole("img", { name: "Current country flag" })).toBeVisible();

    await expect(elder.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await elder.getByRole("button", { name: "Roll digital die" }).click();
    await mobile.getByRole("button", { name: /next roller/i }).click();
    await expect(host.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await host.getByRole("button", { name: /see flag.*1 token/i }).click();
    await expect(host.getByRole("img", { name: "Mystery flag" })).toBeVisible();
    await expect(host.getByRole("button", { name: /bonus word.*1 token/i })).toBeDisabled();

    await host.reload({ waitUntil: "domcontentloaded" });
    await expect(host.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await expect(host.getByRole("img", { name: "Mystery flag" })).toBeVisible();

    await closeRoom(host);
    await expect(host.getByRole("heading", { name: "Play together" })).toBeVisible();
    for (const page of [elder, mobile]) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Play together" })).toBeVisible();
    }

    await fillIdentity(host, "Ada", 27);
    await host.getByRole("radio", { name: "Endless" }).check();
    await host.getByRole("button", { name: "Create room" }).click();
    const endlessCode = (await host.locator(".multiRoomHeader h2").textContent()).trim();
    await join(elder, endlessCode, "Grace", 45);
    await join(mobile, endlessCode, "Linus", 22);
    await host.getByRole("button", { name: "Start shared game" }).click();
    host.once("dialog", (dialog) => dialog.accept());
    await host.getByRole("button", { name: "End game" }).click();
    await expect(host.getByRole("heading", { name: "Game complete" })).toBeVisible();
    for (const name of ["Ada", "Grace", "Linus"]) {
      await expect(host.getByLabel("Game results")).toContainText(name);
    }
    await host.getByRole("button", { name: "Leave results" }).click();
    await expect(host.getByRole("heading", { name: "Play together" })).toBeVisible();
  } finally {
    if (host) await closeRoom(host).catch(() => {});
    await Promise.all(devices.map(({ context }) => context.close()));
  }
});
