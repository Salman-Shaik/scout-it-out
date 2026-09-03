import { expect, test } from "@playwright/test";

const startGame = async (page, target = "7") => {
  await page.goto("/");
  for (const name of ["Ada", "Grace", "Linus"]) {
    await page.getByPlaceholder("Enter Player Name").fill(name);
    await page.getByRole("button", { name: "Add player" }).click();
  }
  if (target !== "7") {
    await page.getByText(target, { exact: true }).click();
  }
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Start exploring" }).click();
  await expect(
    page.getByText(target === "Endless" ? "Endless" : `First to ${target}`),
  ).toBeVisible();
};

test("rule book explains the digital game", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "How to play" }).click();
  const rules = page.getByRole("dialog");
  await expect(
    rules.getByRole("heading", { name: "How to play" }),
  ).toBeVisible();
  await expect(rules.getByText("Read the clues in order")).toBeVisible();
  await expect(
    rules.getByText(/tied leaders share the victory/i),
  ).toBeVisible();
  await rules.getByRole("button", { name: "Close rules" }).click();
  await expect(rules).toBeHidden();
});

test("players can end an Endless game", async ({ page }) => {
  await startGame(page, "Endless");

  await page.getByRole("combobox").selectOption("Ada");
  await page.getByRole("button", { name: /award point/i }).click();

  await page.getByRole("button", { name: "End game" }).click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation.getByText("End this Endless game?")).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep playing" }).click();
  await expect(confirmation).toBeHidden();

  await page.getByRole("button", { name: "End game" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "End game" })
    .click();
  await expect(page.getByText(/Ada wins/i)).toBeVisible();
});

test("players can quit without declaring a winner", async ({ page }) => {
  await startGame(page, "3");
  await expect(page.getByRole("button", { name: "End game" })).toHaveCount(0);
  await page.getByRole("button", { name: "Quit game" }).click();
  const confirmation = page.getByRole("dialog");
  await expect(
    confirmation.getByText("No winner will be declared."),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Quit game" }).click();
  await expect(page.getByText("Build your scout crew")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Build your scout crew")).toBeVisible();
  await expect(page.getByText("Game in progress")).toHaveCount(0);
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

test("world map opens and identifies countries", async ({ page }) => {
  await startGame(page);
  await page.getByRole("button", { name: "World map" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("img", { name: "Interactive world map" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Europe" }).click();
  await expect(
    dialog.getByRole("img", { name: "Interactive world map" }),
  ).toHaveAttribute("viewBox", "430 205 190 150");
  await dialog
    .getByRole("button", { name: "Caribbean & Central America" })
    .click();
  await expect(
    dialog.getByRole("img", { name: "Interactive world map" }),
  ).toHaveAttribute("viewBox", "170 300 265 190");
  await dialog.getByRole("button", { name: "Pacific Islands" }).click();
  await expect(
    dialog.getByRole("img", { name: "Interactive world map" }),
  ).toHaveAttribute("viewBox", "785 350 225 230");
  await dialog.getByRole("button", { name: "France" }).focus();
  await expect(dialog.getByRole("status")).toHaveText("France");
  await dialog.getByRole("button", { name: "Close map" }).click();
  await expect(dialog).toBeHidden();
});
