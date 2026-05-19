import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolsPopover } from "./ToolsPopover";

function renderPopover(open: boolean): ReturnType<typeof render> {
  return render(
    <ToolsPopover open={open}>
      <span>Tools content</span>
    </ToolsPopover>,
  );
}

describe("ToolsPopover", () => {
  it("renders nothing when closed", () => {
    renderPopover(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Tools content")).toBeNull();
  });

  it("renders children inside a dialog when open", () => {
    renderPopover(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Tools content")).toBeInTheDocument();
  });

  it("stays open when Escape is pressed (toggle-only close)", () => {
    renderPopover(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stays open when clicking outside the panel", () => {
    renderPopover(true);
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
