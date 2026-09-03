import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Lobby from "./Lobby";
import Player from "../model/Player";

const addPlayer = async (user, name) => {
  await user.type(screen.getByPlaceholderText(/enter player name/i), name);
  await user.click(screen.getByRole("button", { name: /add player/i }));
};

test("adds, uniquely names, and removes players", async () => {
  const user = userEvent.setup();
  render(<Lobby setPlayerState={vi.fn()} setIsNewGame={vi.fn()} />);

  const addButton = screen.getByRole("button", { name: /add player/i });
  await user.click(addButton);
  expect(screen.queryAllByText(/^Ada/)).toHaveLength(0);

  await addPlayer(user, "  Ada  ");
  await addPlayer(user, "Ada");
  await addPlayer(user, "Ada");

  expect(screen.getByText("Ada")).toBeInTheDocument();
  expect(screen.getByText("Ada (2)")).toBeInTheDocument();
  expect(screen.getByText("Ada (3)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Remove Ada (2)" }));
  expect(screen.queryByText("Ada (2)")).not.toBeInTheDocument();
});

test("starts a game with Player instances", async () => {
  const user = userEvent.setup();
  const setPlayerState = vi.fn();
  const setIsNewGame = vi.fn();
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  render(<Lobby setPlayerState={setPlayerState} setIsNewGame={setIsNewGame} />);

  const startButton = screen.getByRole("button", { name: /start exploring/i });
  expect(startButton).toBeDisabled();
  for (const name of ["Ada", "Grace", "Linus"]) await addPlayer(user, name);

  expect(startButton).toBeEnabled();
  await user.click(startButton);

  const players = setPlayerState.mock.calls[0][0];
  expect(players).toHaveLength(3);
  expect(players.every((player) => player instanceof Player)).toBe(true);
  expect(setIsNewGame).toHaveBeenCalledWith(false);
  expect(alertSpy).toHaveBeenCalledWith(
    "Game starting with players: Ada, Grace, Linus",
  );
  alertSpy.mockRestore();
});

test("caps the lobby at thirteen players", async () => {
  const user = userEvent.setup();
  render(<Lobby setPlayerState={vi.fn()} setIsNewGame={vi.fn()} />);

  for (let index = 1; index <= 13; index += 1) {
    await addPlayer(user, `P${index}`);
  }

  expect(screen.getByRole("button", { name: /add player/i })).toBeDisabled();
  expect(screen.getAllByRole("button", { name: /remove p/i })).toHaveLength(13);
});
