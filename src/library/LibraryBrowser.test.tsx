import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LibraryBrowser } from "./LibraryBrowser";
import { savePiece, clearLibrary } from "./db";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

beforeEach(async () => {
  await clearLibrary();
});

describe("LibraryBrowser", () => {
  it("lists saved pieces", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    await savePiece("Moonlight.musicxml", bytes("y"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    expect(screen.getByText("Moonlight.musicxml")).toBeInTheDocument();
  });

  it("filters the list by the search box", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    await savePiece("Moonlight.musicxml", bytes("y"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "moon" },
    });
    expect(screen.queryByText("Chopin Ballade.mid")).not.toBeInTheDocument();
    expect(screen.getByText("Moonlight.musicxml")).toBeInTheDocument();
  });

  it("calls onOpen with the piece id when a piece is clicked", async () => {
    const id = await savePiece("Chopin Ballade.mid", bytes("x"));
    const onOpen = vi.fn();
    render(<LibraryBrowser onOpen={onOpen} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Chopin Ballade.mid"));
    expect(onOpen).toHaveBeenCalledWith(id);
  });

  it("removes a piece when its delete button is clicked", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() =>
      expect(
        screen.queryByText("Chopin Ballade.mid"),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("FormatCompare (via LibraryBrowser empty state)", () => {
  it("renders both MIDI and MUSICXML columns with their bullet content", async () => {
    render(<LibraryBrowser onOpen={() => {}} />);
    // Empty state is the default — IDB starts empty in the test setup.
    // Wait for the async listPieces effect to settle and the empty state to render.
    const midi = await screen.findByTestId("lib-compare-midi");
    const xml = screen.getByTestId("lib-compare-xml");
    expect(within(midi).getByText(/MIDI/i)).toBeInTheDocument();
    expect(within(midi).getByText(/falldown/i)).toBeInTheDocument();
    expect(within(xml).getByText(/MUSICXML/i)).toBeInTheDocument();
    expect(within(xml).getByText(/engraved/i)).toBeInTheDocument();
  });
});
