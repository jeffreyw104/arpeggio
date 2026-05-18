import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadingLane } from "./ReadingLane";

describe("ReadingLane", () => {
  it("renders the toggle button with correct label when expanded", () => {
    render(
      <ReadingLane collapsed={false} onToggle={vi.fn()}>
        <div data-testid="score" />
      </ReadingLane>,
    );
    const toggle = screen.getByRole("button", {
      name: /collapse reading lane/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the toggle button with correct label when collapsed", () => {
    render(
      <ReadingLane collapsed={true} onToggle={vi.fn()}>
        <div data-testid="score" />
      </ReadingLane>,
    );
    const toggle = screen.getByRole("button", {
      name: /expand reading lane/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onToggle when the toggle button is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ReadingLane collapsed={false} onToggle={onToggle}>
        <div data-testid="score" />
      </ReadingLane>,
    );
    fireEvent.click(screen.getByRole("button", { name: /collapse/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders children (the score container) inside the lane", () => {
    render(
      <ReadingLane collapsed={false} onToggle={vi.fn()}>
        <div data-testid="score-container" />
      </ReadingLane>,
    );
    expect(screen.getByTestId("score-container")).toBeInTheDocument();
  });

  it("applies the collapsed modifier class when collapsed", () => {
    const { container } = render(
      <ReadingLane collapsed={true} onToggle={vi.fn()}>
        <div />
      </ReadingLane>,
    );
    expect(container.firstChild).toHaveClass("reading-lane--collapsed");
  });

  it("does not apply the collapsed class when expanded", () => {
    const { container } = render(
      <ReadingLane collapsed={false} onToggle={vi.fn()}>
        <div />
      </ReadingLane>,
    );
    expect(container.firstChild).not.toHaveClass("reading-lane--collapsed");
  });
});
