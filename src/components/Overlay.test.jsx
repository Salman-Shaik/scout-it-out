import { render, screen } from "@testing-library/react";
import Overlay from "./Overlay";

test.each([
  [true, "block"],
  [false, "none"],
])("sets visibility for showOverlay=%s", (showOverlay, display) => {
  render(<Overlay showOverlay={showOverlay}>Content</Overlay>);
  expect(screen.getByText("Content")).toHaveStyle({ display });
});
