import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a pill showing the current mode label", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Play/ })).toBeInTheDocument();
  });

  it("shows `MIDI Practice` as the pill label when mode is midi", () => {
    render(<ModeSwitch mode="midi" onModeChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /MIDI Practice/ }),
    ).toBeInTheDocument();
  });

  it("clicking the pill opens a menu with Play and MIDI Practice", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    expect(screen.getByRole("menuitem", { name: /Play/ })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /MIDI Practice/ }),
    ).toBeInTheDocument();
  });

  it("calls onModeChange with the picked mode", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /MIDI Practice/ }));
    expect(onModeChange).toHaveBeenCalledWith("midi");
  });
});
