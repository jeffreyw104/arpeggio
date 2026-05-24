import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Divider } from "./Divider";

test("orientation='horizontal' updates fraction from clientY", () => {
  const onChange = vi.fn();
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  const { container } = render(<Divider fraction={0.5} onChange={onChange} orientation="horizontal" />);
  const separator = container.querySelector('[role="separator"]')!;
  fireEvent.mouseDown(separator);
  fireEvent.mouseMove(window, { clientY: 400 });
  expect(onChange).toHaveBeenLastCalledWith(0.4);
  fireEvent.mouseUp(window);
});

describe("Divider", () => {
  it("renders a separator with an accessible role", () => {
    render(<Divider fraction={0.65} onChange={() => {}} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("reports a new fraction while dragging", () => {
    const onChange = vi.fn();
    render(<Divider fraction={0.5} onChange={onChange} />);
    const handle = screen.getByRole("separator");
    // The Divider measures against window.innerWidth; jsdom defaults to 1024.
    fireEvent.mouseDown(handle, { clientX: 512 });
    fireEvent.mouseMove(window, { clientX: 700 });
    expect(onChange).toHaveBeenCalled();
    const reported = onChange.mock.calls.at(-1)![0] as number;
    expect(reported).toBeGreaterThan(0.5);
    expect(reported).toBeLessThanOrEqual(1);
    fireEvent.mouseUp(window);
  });

  it("does not report after the drag ends", () => {
    const onChange = vi.fn();
    render(<Divider fraction={0.5} onChange={onChange} />);
    const handle = screen.getByRole("separator");
    fireEvent.mouseDown(handle, { clientX: 512 });
    fireEvent.mouseUp(window);
    onChange.mockClear();
    fireEvent.mouseMove(window, { clientX: 900 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
