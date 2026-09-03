import { expect, test } from "@playwright/test";

const startGame = async (page) => {
  await page.goto("/");
  for (const name of ["Ada", "Grace", "Linus"]) {
    await page.getByPlaceholder("Enter Player Name").fill(name);
    await page.getByRole("button", { name: "Add player" }).click();
  }
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Start exploring" }).click();
  await expect(page.getByRole("button", { name: "Quit game" })).toBeVisible();
};

test("players can start and quit a game early", async ({ page }) => {
  await startGame(page);

  await page.getByRole("button", { name: "Quit game" }).click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation.getByText("End this game?")).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep playing" }).click();
  await expect(confirmation).toBeHidden();

  await page.getByRole("button", { name: "Quit game" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Quit game" })
    .click();
  await expect(page.getByText("Build your scout crew")).toBeVisible();
});

test("flag reveal does not disclose the answer", async ({ page }) => {
  await startGame(page);
  const answer = await page.locator(".cards.active .card_title").textContent();

  await page
    .locator(".cards.active")
    .getByRole("button", { name: "Show flag" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", { name: "Mystery country flag" }),
  ).toBeVisible();
  await expect(dialog.getByText(answer, { exact: true })).toHaveCount(0);
});
