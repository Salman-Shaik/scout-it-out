import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorldMap from "./WorldMap";

const countries = [
  { country_code: "ca", answer: "Canada" },
  { country_code: "fr", answer: "France" },
];

test("a player selects and submits a country from every map control layout", async () => {
  const user = userEvent.setup();
  const onCountrySelect = vi.fn();
  const onClose = vi.fn();
  render(<WorldMap countries={countries} onClose={onClose} onCountrySelect={onCountrySelect} />);

  const canada = screen.getByRole("button", { name: "Canada" });
  await user.click(canada);
  expect(screen.getByText("Canada", { selector: "output" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Guess Canada" }));
  expect(onCountrySelect).toHaveBeenCalledWith("ca");
  const picker = screen.getByLabelText("Or choose by name");
  await user.selectOptions(picker, "fr");
  expect(screen.getByRole("button", { name: "Guess France" })).toBeEnabled();
  await user.selectOptions(picker, "");
  expect(screen.getByRole("button", { name: "Select a country to guess" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Europe" }));
  await user.click(screen.getByRole("button", { name: "Caribbean & Central America" }));
  await user.click(screen.getByRole("button", { name: "Pacific Islands" }));
  await user.click(screen.getByRole("button", { name: "Whole world" }));
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  await user.click(screen.getByRole("button", { name: "Zoom out" }));
  await user.click(screen.getByRole("button", { name: "Close map" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("the reference map discovers countries without showing guess controls", async () => {
  const user = userEvent.setup();
  render(<WorldMap countries={countries} onClose={vi.fn()} />);
  expect(screen.getByText(/hover, tap, or use the keyboard/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /guess canada/i })).toBeNull();
  await user.tab();
  await user.tab();
  await user.tab();
  await user.tab();
  await user.tab();
  expect(screen.getByRole("img", { name: "Interactive world map" })).toBeInTheDocument();
});

test("country submission is locked while a guess is being sent", async () => {
  const user = userEvent.setup();
  render(<WorldMap countries={countries} onClose={vi.fn()}
    onCountrySelect={vi.fn()} submitting />);
  await user.click(screen.getByRole("button", { name: "Canada" }));
  expect(screen.getByRole("button", { name: "Guess Canada" })).toBeDisabled();
});
