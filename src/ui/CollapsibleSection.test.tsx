import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  it("renders the body only when open", () => {
    const { rerender } = render(
      <CollapsibleSection label="Loop" open={false} onToggle={vi.fn()}>
        <button type="button">Set start</button>
      </CollapsibleSection>,
    );
    // Collapsed: the chip shows, the body controls do not.
    expect(screen.getByText("Loop")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set start/i })).toBeNull();
    // Open: the body controls appear.
    rerender(
      <CollapsibleSection label="Loop" open={true} onToggle={vi.fn()}>
        <button type="button">Set start</button>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /set start/i }),
    ).toBeInTheDocument();
  });

  it("reflects open state via aria-expanded on the chip", () => {
    const { rerender } = render(
      <CollapsibleSection label="Loop" open={false} onToggle={vi.fn()}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /loop/i }),
    ).toHaveAttribute("aria-expanded", "false");
    rerender(
      <CollapsibleSection label="Loop" open={true} onToggle={vi.fn()}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /loop/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onToggle when the chip is clicked", () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection label="Loop" open={false} onToggle={onToggle}>
        <span>body</span>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /loop/i }));
    expect(onToggle).toHaveBeenCalled();
  });
});
