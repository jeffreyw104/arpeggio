import { render, screen } from "@testing-library/react";
import App from "./App";

test("App renders the import screen", () => {
  render(<App />);
  expect(screen.getByText(/midi or musicxml/i)).toBeInTheDocument();
});
