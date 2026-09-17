import { expect, test } from "@playwright/test";
import { MockGameServer } from "./support/mockServer";

test.setTimeout(180_000);

const openDevice = async (browser, server, viewport) => {
  const context = await browser.newContext(viewport ? { viewport } : {});
  await server.install(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(45_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Play together" })).toBeVisible();
  return { context, page };
};

const fillIdentity = async (page, name, age) => {
  await page.getByLabel("Your player name").fill(name);
  await page.getByLabel(/your age/i).fill(String(age));
};

const joinRoom = async (page, name, age) => {
  await fillIdentity(page, name, age);
  await page.getByLabel("Room code").fill("MOCK42");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.locator(".multiRoomHeader h2")).toHaveText("MOCK42");
};

const crew = async (browser, server, target = "5") => {
  const hostDevice = await openDevice(browser, server);
  const elderDevice = await openDevice(browser, server);
  const mobileDevice = await openDevice(browser, server, { width: 390, height: 844 });
  const host = hostDevice.page;
  const elder = elderDevice.page;
  const mobile = mobileDevice.page;
  await fillIdentity(host, "Ada", 27);
  if (target !== "5") await host.getByRole("radio", { name: target === "Endless"
    ? "Endless" : `${target} to win` }).check();
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host.locator(".multiRoomHeader h2")).toHaveText("MOCK42");
  await joinRoom(elder, "Grace", 45);
  await joinRoom(mobile, "Linus", 22);
  return { devices: [hostDevice, elderDevice, mobileDevice], host, elder, mobile };
};

const refresh = async (page) => page.reload({ waitUntil: "domcontentloaded" });

test("room roles, map, one roll, rotation, bonus token, and mobile layout", async ({ browser }) => {
  const server = new MockGameServer();
  const { devices, host, elder, mobile } = await crew(browser, server);
  try {
    const visitor = await openDevice(browser, server);
    devices.push(visitor);
    await expect(visitor.page.getByText(/server busy/i)).toBeVisible();
    await expect(visitor.page.getByRole("button", { name: "Create room" })).toBeDisabled();

    await host.getByRole("button", { name: "Start shared game" }).click();
    await refresh(elder);
    await refresh(mobile);
    await expect(elder.getByRole("heading", { name: "You hold the card" })).toBeVisible();
    await expect(elder.getByRole("img", { name: "Current country flag" })).toBeVisible();
    const firstAnswer = await elder.locator(".holderCard h4").textContent();
    await expect(host.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await expect(mobile.getByRole("dialog", { name: "World map" })).toHaveCount(0);
    await expect(mobile.getByRole("button", { name: "Open world map" })).toBeVisible();
    await expect.poll(() => mobile.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await host.getByRole("button", { name: "Roll digital die" }).click();
    await expect(host.getByLabel("Shared round updates")).toContainText(/Clue [1-6]/i);
    await expect(host.getByRole("button", { name: "Roll digital die" })).toBeDisabled();
    await refresh(mobile);
    await expect(mobile.getByLabel("Shared round updates")).toContainText(/Clue [1-6]/i);
    await mobile.getByRole("button", { name: "Open world map" }).click();
    await mobile.getByLabel("Or choose by name").selectOption("ca");
    await mobile.getByRole("button", { name: "Guess Canada" }).click();
    await refresh(elder);
    await expect(elder.locator(".roundGuess")).toContainText("Linus guessed Canada");
    await refresh(host);
    await expect(host.locator(".roundGuess")).toContainText("Linus guessed Canada");
    await elder.getByRole("button", { name: "Not correct" }).click();
    await host.getByRole("button", { name: "Open world map" }).click();
    await expect(host.getByRole("dialog", { name: "World map" })).toBeVisible();
    await host.getByRole("button", { name: "Close map" }).click();
    await refresh(elder);
    await expect(elder.getByText(/read clue [1-6] aloud/i)).toBeVisible();
    await elder.getByRole("button", { name: /next roller/i }).click();
    await refresh(mobile);
    await expect(mobile.getByRole("heading", { name: "Your turn to roll" })).toBeVisible();
    await expect(mobile.getByRole("dialog", { name: "World map" })).toHaveCount(0);
    await mobile.getByRole("button", { name: "Roll digital die" }).click();
    await refresh(elder);
    await elder.getByLabel("First correct guesser").selectOption({ label: "Ada" });
    await elder.getByRole("button", { name: /award card and token/i }).click();
    await refresh(host);
    await refresh(mobile);
    await expect(host.getByText(/1 cards/i)).toBeVisible();
    await expect(host.getByText(/See flag ×1/i)).toBeVisible();
    await expect(mobile.getByRole("heading", { name: "You hold the card" })).toBeVisible();
    await expect(mobile.getByRole("img", { name: "Current country flag" })).toBeVisible();
    expect(await mobile.locator(".holderCard h4").textContent()).not.toBe(firstAnswer);

    await refresh(elder);
    await elder.getByRole("button", { name: "Roll digital die" }).click();
    await refresh(mobile);
    await mobile.getByRole("button", { name: /next roller/i }).click();
    await refresh(host);
    await host.getByRole("button", { name: /see flag.*1 available/i }).click();
    await expect(host.getByRole("img", { name: "Shared mystery flag" })).toBeVisible();
    await expect(host.locator(".multiBonusActions button")).toHaveCount(0);
    await refresh(host);
    await expect(host.getByRole("img", { name: "Shared mystery flag" })).toBeVisible();
  } finally {
    await Promise.all(devices.map(({ context }) => context.close()));
  }
});

test("finite target ends with a winner and Endless can declare tied winners", async ({ browser }) => {
  const server = new MockGameServer();
  const { devices, host, elder, mobile } = await crew(browser, server, "3");
  try {
    await host.getByRole("button", { name: "Start shared game" }).click();
    await host.getByRole("button", { name: "Roll digital die" }).click();
    server.player(server.game.host_user_id).score = 2;
    await refresh(elder);
    await elder.getByLabel("First correct guesser").selectOption({ label: "Ada" });
    await elder.getByRole("button", { name: /award card and token/i }).click();
    await refresh(host);
    await expect(host.getByRole("heading", { name: "Game complete" })).toBeVisible();
    await expect(host.getByLabel("Game results")).toContainText("Ada wins");
    await expect(host.getByRole("button", { name: "End game" })).toHaveCount(0);
    await host.getByRole("button", { name: "Leave results" }).click();
    await refresh(elder);
    await refresh(mobile);
    await elder.getByRole("button", { name: "Leave results" }).click();
    await mobile.getByRole("button", { name: "Leave results" }).click();

    await fillIdentity(host, "Ada", 27);
    await host.getByRole("radio", { name: "Endless" }).check();
    await host.getByRole("button", { name: "Create room" }).click();
    await joinRoom(elder, "Grace", 45);
    await joinRoom(mobile, "Linus", 22);
    await host.getByRole("button", { name: "Start shared game" }).click();
    host.once("dialog", (dialog) => dialog.accept());
    await host.getByRole("button", { name: "End game" }).click();
    await expect(host.getByRole("heading", { name: "Game complete" })).toBeVisible();
    for (const name of ["Ada", "Grace", "Linus"]) {
      await expect(host.getByLabel("Game results")).toContainText(name);
    }
  } finally {
    await Promise.all(devices.map(({ context }) => context.close()));
  }
});

test("host quit clears a room without a winner or refresh resurrection", async ({ browser }) => {
  const server = new MockGameServer();
  const { devices, host } = await crew(browser, server);
  try {
    await host.getByRole("button", { name: "Start shared game" }).click();
    host.once("dialog", (dialog) => dialog.accept());
    await host.getByRole("button", { name: "Quit game" }).click();
    await expect(host.getByRole("heading", { name: "Play together" })).toBeVisible();
    expect(server.game).toBeNull();
    await refresh(host);
    await expect(host.getByRole("heading", { name: "Play together" })).toBeVisible();
    await expect(host.getByRole("heading", { name: "Game complete" })).toHaveCount(0);
  } finally {
    await Promise.all(devices.map(({ context }) => context.close()));
  }
});
