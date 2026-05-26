import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LibraryBrowser } from "./LibraryBrowser";
import { savePiece, clearLibrary } from "./db";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

beforeEach(async () => {
  await clearLibrary();
});

describe("LibraryBrowser", () => {
  it("shows an empty-state card with the format comparison when no pieces are saved", async () => {
    render(<LibraryBrowser onOpen={() => {}} />);
    // Wait for IDB read.
    await screen.findByTestId("lib-empty");
    expect(screen.getByText(/Your library is empty/i)).toBeInTheDocument();
    expect(screen.getByTestId("lib-compare-midi")).toBeInTheDocument();
    expect(screen.getByTestId("lib-compare-xml")).toBeInTheDocument();
  });

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
    expect(within(midi).getAllByText(/MIDI/i).length).toBeGreaterThan(0);
    expect(within(midi).getByText(/falldown/i)).toBeInTheDocument();
    expect(within(xml).getAllByText(/MUSICXML/i).length).toBeGreaterThan(0);
    expect(within(xml).getAllByText(/engraved/i).length).toBeGreaterThan(0);
  });
});

describe("FormatInfoPill", () => {
  async function renderWithOnePiece() {
    await savePiece("seed.mid", new ArrayBuffer(4));
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findByTestId("lib-info-pill");
  }

  it("renders the pill once there is at least one piece", async () => {
    await renderWithOnePiece();
    expect(screen.getByTestId("lib-info-pill")).toBeInTheDocument();
  });

  it("toggles the popover open and closed on pill click", async () => {
    await renderWithOnePiece();
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.getByTestId("lib-info-popover")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
  });

  it("closes the popover on Escape", async () => {
    await renderWithOnePiece();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.getByTestId("lib-info-popover")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
  });

  it("closes the popover on outside click", async () => {
    await renderWithOnePiece();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.getByTestId("lib-info-popover")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
  });
});
