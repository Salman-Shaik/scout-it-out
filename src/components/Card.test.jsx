import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Card from "./Card";

const info = {
  answer: "Testland",
  country_code: "tl",
  clues: ["One", "Two", "Three", "Four", "Five", "Six"],
  continent: "Oceania",
  buzzword: "Compass",
};

test("renders all country information", () => {
  render(<Card info={info} isFlagMode={false} setIsFlagMode={vi.fn()} />);

  expect(screen.getByText("Testland")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(6);
  expect(screen.getByText("Oceania")).toBeInTheDocument();
  expect(screen.getByText("Compass")).toBeInTheDocument();
});

test("opens and closes flag mode", async () => {
  const user = userEvent.setup();
  const setIsFlagMode = vi.fn();
  const view = render(
    <Card info={info} isFlagMode={false} setIsFlagMode={setIsFlagMode} />,
  );

  await user.click(screen.getByRole("button", { name: /show flag/i }));
  expect(setIsFlagMode).toHaveBeenCalledWith(true);

  view.rerender(
    <Card info={info} isFlagMode={true} setIsFlagMode={setIsFlagMode} />,
  );
  expect(screen.queryByText("Testland")).not.toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: /mystery country flag/i }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /back to clues/i }));
  expect(setIsFlagMode).toHaveBeenCalledWith(false);
});
