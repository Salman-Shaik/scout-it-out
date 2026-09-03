import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardCarousel from "./CardCarousel";
import Player from "../model/Player";

const items = [
  {
    answer: "Alpha",
    country_code: "fr",
    clues: ["A1", "A2", "A3", "A4", "A5", "A6"],
    continent: "Asia",
    buzzword: "A",
  },
  {
    answer: "Beta",
    country_code: "de",
    clues: ["B1", "B2", "B3", "B4", "B5", "B6"],
    continent: "Europe",
    buzzword: "B",
  },
];

const renderCarousel = (players = [new Player("Ada"), new Player("Grace")]) => {
  const setPlayers = vi.fn();
  const setIsNewGame = vi.fn();
  render(
    <CardCarousel
      items={items}
      players={players}
      setPlayers={setPlayers}
      setIsNewGame={setIsNewGame}
    />,
  );
  return { setPlayers, setIsNewGame };
};

test("scores the selected player and never wraps to a used card", async () => {
  const user = userEvent.setup();
  const { setPlayers } = renderCarousel();
  const nextButton = screen.getByRole("button", {
    name: /award point & continue/i,
  });

  expect(nextButton).toBeDisabled();
  expect(screen.getByText("Alpha").closest(".cards")).toHaveClass("active");

  await user.selectOptions(screen.getByRole("combobox"), "Ada");
  expect(nextButton).toBeEnabled();
  await user.click(nextButton);

  const updatedPlayers = setPlayers.mock.calls[0][0];
  expect(updatedPlayers.map((player) => player.getScore())).toEqual([1, 0]);
  expect(screen.getByText("Beta").closest(".cards")).toHaveClass("active");
  expect(nextButton).toBeDisabled();

  await user.selectOptions(screen.getByRole("combobox"), "Grace");
  await user.click(nextButton);
  expect(screen.getByText("Beta").closest(".cards")).toHaveClass("active");
  expect(screen.getByText("Alpha").closest(".cards")).toHaveClass("hidden");
});

test("hides controls while the flag overlay is open", async () => {
  const user = userEvent.setup();
  renderCarousel();

  await user.click(screen.getAllByRole("button", { name: /show flag/i })[0]);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

  await user.click(
    screen.getAllByRole("button", { name: /back to clues/i })[0],
  );
  expect(screen.getByRole("combobox")).toBeInTheDocument();
});

test("confirms before quitting an unfinished game", async () => {
  const user = userEvent.setup();
  const { setIsNewGame } = renderCarousel();

  await user.click(screen.getByRole("button", { name: /^quit game$/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(setIsNewGame).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: /keep playing/i }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^quit game$/i }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /quit game/i }));
  expect(setIsNewGame).toHaveBeenCalledWith(true);
});

test("opens and closes the interactive world map", async () => {
  const user = userEvent.setup();
  renderCarousel();

  await user.click(screen.getByRole("button", { name: /world map/i }));
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: /world map/i }),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("img", { name: /interactive world map/i }),
  ).toBeInTheDocument();

  const alpha = within(dialog).getByRole("button", { name: "Alpha" });
  await user.hover(alpha);
  expect(dialog.querySelector(".mapPopup")).toHaveTextContent("Alpha");
  await user.unhover(alpha);
  expect(dialog.querySelector(".mapPopup")).not.toBeInTheDocument();
  await user.click(alpha);
  expect(dialog.querySelector(".mapPopup")).toHaveTextContent("Alpha");
  alpha.focus();
  expect(
    within(dialog).getByText("Alpha", { selector: "output" }),
  ).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: /close map/i }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("shows the winner and starts a new game", async () => {
  const user = userEvent.setup();
  const players = [new Player("Ada", 6), new Player("Grace", 2)];
  const { setIsNewGame } = renderCarousel(players);

  await user.selectOptions(screen.getByRole("combobox"), "Ada");
  await user.click(
    screen.getByRole("button", { name: /award point & continue/i }),
  );

  expect(screen.getByText(/Ada wins/)).toBeInTheDocument();
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Ada: 6")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /start a new game/i }));
  expect(setIsNewGame).toHaveBeenCalledWith(true);
});
