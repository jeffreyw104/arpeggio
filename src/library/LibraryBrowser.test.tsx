import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("displays source label for MIDI pieces", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"), "midi");
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("♪ Notes only")).toBeInTheDocument(),
    );
  });

  it("displays source label for MusicXML pieces", async () => {
    await savePiece("Moonlight.musicxml", bytes("y"), "musicxml");
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("𝄞 Sheet music")).toBeInTheDocument(),
    );
  });
});
