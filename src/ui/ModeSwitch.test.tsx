import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a Play and a Practice segment", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^practice$/i }),
    ).toBeInTheDocument();
  });

  it("marks the active mode with aria-pressed", () => {
    render(<ModeSwitch mode="practice" onModeChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /^practice$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^play$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("emits onModeChange when a segment is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^practice$/i }));
    expect(onModeChange).toHaveBeenCalledWith("practice");
  });
});
