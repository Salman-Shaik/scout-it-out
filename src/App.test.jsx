import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import Player from "./model/Player";
import countryData from "./data/countries_info.json";

test("country deck contains no duplicate cards", () => {
  const countryCodes = countryData.map((country) => country.country_code);
  expect(new Set(countryCodes).size).toBe(countryCodes.length);
});

test("creates a freshly shuffled deck when a game starts", async () => {
  const user = userEvent.setup();
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

  render(<App />);
  const input = screen.getByPlaceholderText(/enter player name/i);
  for (const name of ["Ada", "Grace", "Linus"]) {
    await user.type(input, name);
    await user.click(screen.getByRole("button", { name: /add player/i }));
  }

  expect(randomSpy).toHaveBeenCalledTimes(countryData.length - 1);
  await user.click(screen.getByRole("button", { name: /start exploring/i }));
  expect(randomSpy).toHaveBeenCalledTimes((countryData.length - 1) * 2);

  alertSpy.mockRestore();
  randomSpy.mockRestore();
});

test("renders the game lobby", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /scout it out/i }),
  ).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/enter player name/i)).toBeInTheDocument();
});

test("opens and closes the rule book", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: /how to play/i }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: /how to play/i }),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByText(/read the clues in order/i),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("link", { name: /official skillmatics game/i }),
  ).toHaveAttribute("href", expect.stringContaining("skillmaticscardgame.com"));

  await user.click(
    within(dialog).getByRole("button", { name: /close rules/i }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("restores saved players and persists them", async () => {
  localStorage.setItem(
    "scoutItOutPlayers",
    JSON.stringify([new Player("Ada", 2).toJson()]),
  );

  render(<App />);

  const scoreboard = screen.getByRole("complementary", { name: /scoreboard/i });
  expect(within(scoreboard).getByText("Ada")).toBeInTheDocument();
  expect(within(scoreboard).getByText("2")).toBeInTheDocument();
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem("scoutItOutPlayers"))).toEqual([
      { name: "Ada", score: 2 },
    ]),
  );
});

test("discards malformed saved state", () => {
  localStorage.setItem("scoutItOutPlayers", "not json");

  render(<App />);

  expect(screen.getByPlaceholderText(/enter player name/i)).toBeInTheDocument();
  expect(localStorage.getItem("scoutItOutPlayers")).toBe("[]");
});

test("falls back safely from invalid saved win criteria", () => {
  localStorage.setItem(
    "scoutItOutPlayers",
    JSON.stringify([{ name: "Ada", score: 0 }]),
  );
  localStorage.setItem("scoutItOutWinTarget", "99");

  const { unmount } = render(<App />);
  expect(screen.getByText("First to 7")).toBeInTheDocument();
  unmount();

  localStorage.setItem("scoutItOutWinTarget", "not json");
  render(<App />);
  expect(screen.getByText("First to 7")).toBeInTheDocument();
  expect(localStorage.getItem("scoutItOutWinTarget")).toBe("7");
});

test("restores Endless mode", () => {
  localStorage.setItem(
    "scoutItOutPlayers",
    JSON.stringify([{ name: "Ada", score: 0 }]),
  );
  localStorage.setItem("scoutItOutWinTarget", "null");

  render(<App />);
  expect(screen.getByText("Endless")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "End game" })).toBeInTheDocument();
});

test("clears the saved game when a player quits", async () => {
  const user = userEvent.setup();
  localStorage.setItem(
    "scoutItOutPlayers",
    JSON.stringify([
      { name: "Ada", score: 2 },
      { name: "Grace", score: 1 },
      { name: "Linus", score: 0 },
    ]),
  );

  render(<App />);
  await user.click(screen.getByRole("button", { name: "Quit game" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Quit game",
    }),
  );

  expect(screen.getByText("Build your scout crew")).toBeInTheDocument();
  await waitFor(() =>
    expect(localStorage.getItem("scoutItOutPlayers")).toBe("[]"),
  );
});

test("uses the system theme and remembers a manual override", async () => {
  const user = userEvent.setup();
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });

  const { container } = render(<App />);
  const app = container.querySelector(".App");
  const toggle = screen.getByRole("switch", { name: /switch to light theme/i });

  expect(app).toHaveAttribute("data-theme", "dark");
  expect(toggle).toHaveAttribute("aria-checked", "true");
  await user.click(toggle);
  expect(app).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("scoutItOutTheme")).toBe("light");

  window.matchMedia = originalMatchMedia;
});

test("restores a saved theme and can switch to dark", async () => {
  const user = userEvent.setup();
  localStorage.setItem("scoutItOutTheme", "light");

  const { container } = render(<App />);
  await user.click(
    screen.getByRole("switch", { name: /switch to dark theme/i }),
  );

  expect(container.querySelector(".App")).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("scoutItOutTheme")).toBe("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
});
