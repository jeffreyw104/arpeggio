import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "./TopBar";

function renderBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const props = {
    pieceName: "moonlight-sonata.mid",
    viewMode: "both" as const,
    onViewModeChange: vi.fn(),
    onOpenLibrary: vi.fn(),
    settingsOpen: false,
    onToggleSettings: vi.fn(),
    mode: "play" as const,
    onModeChange: vi.fn(),
    ...overrides,
  };
  render(<TopBar {...props} />);
  return { props };
}

describe("TopBar", () => {
  it("shows the piece name with its file extension stripped", () => {
    renderBar();
    expect(screen.getByText("moonlight-sonata")).toBeInTheDocument();
    expect(screen.queryByText(/\.mid/)).toBeNull();
  });

  it("calls onOpenLibrary when the Library button is clicked", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /library/i }));
    expect(props.onOpenLibrary).toHaveBeenCalled();
  });

  it("calls onViewModeChange when a view-mode button is clicked", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /score only/i }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("score");
  });

  it("marks the active view mode with aria-pressed", () => {
    renderBar({ viewMode: "falldown" });
    expect(
      screen.getByRole("button", { name: /falldown only/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^both$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders the Play/MIDI Practice switch", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "MIDI Practice" }));
    expect(props.onModeChange).toHaveBeenCalledWith("midi");
  });

  it("toggles settings and reflects the open state", () => {
    const { props } = renderBar({ settingsOpen: true });
    const gear = screen.getByRole("button", { name: "Settings" });
    expect(gear).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(gear);
    expect(props.onToggleSettings).toHaveBeenCalled();
  });

  it("shows the arpeggio wordmark", () => {
    renderBar();
    expect(screen.getByText("arpeggio")).toBeInTheDocument();
  });

});
