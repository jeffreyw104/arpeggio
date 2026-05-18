import { render, screen } from "@testing-library/react";
import App from "./App";

test("App renders the import screen", async () => {
  render(<App />);
  expect(await screen.findByText(/midi or musicxml/i)).toBeInTheDocument();
});
