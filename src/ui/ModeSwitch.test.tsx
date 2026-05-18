import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a Play/Practice toggle reflecting the current mode", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    const toggle = screen.getByRole("switch", { name: /play.*practice/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("reads aria-checked true in Practice mode", () => {
    render(<ModeSwitch mode="practice" onModeChange={vi.fn()} />);
    expect(
      screen.getByRole("switch", { name: /play.*practice/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("flips to Practice when clicked from Play", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("switch", { name: /play.*practice/i }));
    expect(onModeChange).toHaveBeenCalledWith("practice");
  });

  it("flips to Play when clicked from Practice", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="practice" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("switch", { name: /play.*practice/i }));
    expect(onModeChange).toHaveBeenCalledWith("play");
  });
});
