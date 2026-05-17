import { render, screen } from "@testing-library/react";
import App from "./App";

test("App renders the Arpeggio heading", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /arpeggio/i }),
  ).toBeInTheDocument();
});
