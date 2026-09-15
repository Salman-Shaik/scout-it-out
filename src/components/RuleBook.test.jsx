import { render, screen } from "@testing-library/react";
import RuleBook from "./RuleBook";

test("explains digital dice and secret holder in multiplayer mode", () => {
  render(<RuleBook multiplayer onClose={vi.fn()} />);
  expect(
    screen.getByText(/one scout holds the secret card/i),
  ).toBeInTheDocument();
  expect(screen.getByText(/guessers roll a digital die/i)).toBeInTheDocument();
  expect(screen.getByText(/only the room host can close/i)).toBeInTheDocument();
});
