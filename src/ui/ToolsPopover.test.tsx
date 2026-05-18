import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolsPopover } from "./ToolsPopover";

function renderPopover(
  open: boolean,
  onClose = vi.fn(),
): ReturnType<typeof render> {
  return render(
    <ToolsPopover open={open} onClose={onClose}>
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

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    renderPopover(true, onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking outside the panel", () => {
    const onClose = vi.fn();
    renderPopover(true, onClose);
    // Click on the document body — outside the panel.
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when clicking inside the panel", () => {
    const onClose = vi.fn();
    renderPopover(true, onClose);
    const panel = screen.getByRole("dialog");
    fireEvent.pointerDown(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not fire the Escape listener when closed", () => {
    const onClose = vi.fn();
    renderPopover(false, onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
