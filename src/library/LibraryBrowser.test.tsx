import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LibraryBrowser } from "./LibraryBrowser";
import { __KebabMenu_test_only as KebabMenu } from "./LibraryBrowser";
import { savePiece, listPieces, clearLibrary } from "./db";

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

  it("renders both saved pieces — newer in the hero, older in the list", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    await new Promise((r) => setTimeout(r, 5));
    await savePiece("Moonlight.musicxml", bytes("y"));
    render(<LibraryBrowser onOpen={() => {}} />);
    // NOTE: the hero doesn't exist yet at this task (Task 10 adds it).
    // For this task, both pieces will still render as rows. We'll FIX this
    // assertion in Task 10 when the hero is wired in. For now, assert what
    // Task 9 actually produces: both pieces appear as rows.
    await screen.findAllByTestId("lib-row");
    const rows = screen.getAllByTestId("lib-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Moonlight.musicxml")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Chopin Ballade.mid")).toBeInTheDocument();
  });

  it("filters the list by the search box", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    await new Promise((r) => setTimeout(r, 5));
    await savePiece("Moonlight.musicxml", bytes("y"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findAllByTestId("lib-row");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "moon" },
    });
    const rows = screen.getAllByTestId("lib-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Moonlight.musicxml")).toBeInTheDocument();
  });

  it("shows the chip with MIDI label for .mid files and XML for .musicxml files", async () => {
    // MThd MIDI header bytes
    const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]).buffer;
    // simple MusicXML
    const xml = new TextEncoder().encode(
      "<?xml version='1.0'?><score-partwise></score-partwise>",
    ).buffer;
    await savePiece("a.mid", midi);
    await savePiece("b.musicxml", xml);
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findAllByTestId("lib-row");
    const chips = screen.getAllByTestId("lib-chip");
    const labels = chips.map((c) => c.textContent);
    expect(labels).toContain("MIDI");
    expect(labels).toContain("XML");
  });

  it("calls onOpen with the piece id when a row's name is clicked", async () => {
    const onOpen = vi.fn();
    const targetId = await savePiece("target.mid", new ArrayBuffer(4));
    await new Promise((r) => setTimeout(r, 5));
    await savePiece("hero.mid", new ArrayBuffer(4));
    render(<LibraryBrowser onOpen={onOpen} />);
    await screen.findAllByTestId("lib-row");
    // find the row containing "target.mid"
    const rows = screen.getAllByTestId("lib-row");
    const targetRow = rows.find((r) =>
      within(r).queryByText(/target\.mid/) !== null,
    );
    if (!targetRow) throw new Error("target row not found");
    fireEvent.click(within(targetRow).getByRole("button", { name: /target\.mid/ }));
    expect(onOpen).toHaveBeenCalledWith(targetId);
  });

  it("renames a piece via the kebab menu", async () => {
    await savePiece("target.mid", new ArrayBuffer(4));
    await new Promise((r) => setTimeout(r, 5));
    await savePiece("hero.mid", new ArrayBuffer(4));
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findAllByTestId("lib-row");
    const rows = screen.getAllByTestId("lib-row");
    const targetRow = rows.find((r) =>
      within(r).queryByText(/target\.mid/) !== null,
    );
    if (!targetRow) throw new Error("target row not found");
    fireEvent.click(within(targetRow).getByTestId("lib-kebab"));
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByLabelText("New name");
    fireEvent.change(input, { target: { value: "newname.mid" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(async () => {
      const pieces = await listPieces();
      const renamed = pieces.find((p) => p.name === "newname.mid");
      expect(renamed).toBeDefined();
    });
  });

  it("deletes a piece via the kebab menu", async () => {
    await savePiece("target.mid", new ArrayBuffer(4));
    await new Promise((r) => setTimeout(r, 5));
    await savePiece("hero.mid", new ArrayBuffer(4));
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findAllByTestId("lib-row");
    const rows = screen.getAllByTestId("lib-row");
    const targetRow = rows.find((r) =>
      within(r).queryByText(/target\.mid/) !== null,
    );
    if (!targetRow) throw new Error("target row not found");
    fireEvent.click(within(targetRow).getByTestId("lib-kebab"));
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(async () => {
      const pieces = await listPieces();
      expect(pieces.find((p) => p.name === "target.mid")).toBeUndefined();
    });
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

describe("KebabMenu", () => {
  it("fires onOpen when 'Open' clicked", () => {
    const onOpen = vi.fn();
    render(
      <KebabMenu
        onOpen={onOpen}
        onRename={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires onRename when 'Rename' clicked", () => {
    const onRename = vi.fn();
    render(
      <KebabMenu
        onOpen={() => {}}
        onRename={onRename}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Rename"));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("fires onDelete when 'Delete' clicked", () => {
    const onDelete = vi.fn();
    render(
      <KebabMenu
        onOpen={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("fires onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <KebabMenu
        onOpen={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
