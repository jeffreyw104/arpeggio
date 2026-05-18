import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a Play and a Practice button", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Practice" }),
    ).toBeInTheDocument();
  });

  it("marks the active mode with aria-pressed", () => {
    render(<ModeSwitch mode="practice" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Practice" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onModeChange with practice when Practice is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Practice" }));
    expect(onModeChange).toHaveBeenCalledWith("practice");
  });

  it("calls onModeChange with play when Play is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="practice" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onModeChange).toHaveBeenCalledWith("play");
  });
});
