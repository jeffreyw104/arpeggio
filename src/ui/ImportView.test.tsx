import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { ImportView } from "./ImportView";

function fileOf(name: string): File {
  return new File([readFileSync(`src/test/fixtures/${name}`)], name);
}

describe("ImportView", () => {
  it("shows a file input and a prompt", () => {
    render(<ImportView onLoaded={() => {}} />);
    expect(screen.getByText(/midi or musicxml/i)).toBeInTheDocument();
  });

  it("imports a chosen file and reports the Score", async () => {
    const onLoaded = vi.fn();
    render(<ImportView onLoaded={onLoaded} />);
    const input = screen.getByLabelText(/choose a file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("clean.mid")] } });
    await waitFor(() => expect(onLoaded).toHaveBeenCalled());
    const score = onLoaded.mock.calls[0][0];
    expect(score.notes.length).toBeGreaterThan(0);
  });

  it("shows an error for an unrecognized file", async () => {
    render(<ImportView onLoaded={() => {}} />);
    const input = screen.getByLabelText(/choose a file/i) as HTMLInputElement;
    const junk = new File(["nope"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [junk] } });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /unsupported|unrecognized/i,
      ),
    );
  });
});
