import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBarSelect } from "./TopBarSelect";

describe("TopBarSelect", () => {
  const options = [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
  ];

  it("renders the current value with a chevron", () => {
    render(<TopBarSelect value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Option A/ })).toBeInTheDocument();
  });

  it("opens a menu listing all options on click", () => {
    render(<TopBarSelect value="a" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    expect(screen.getByRole("menuitem", { name: /Option A/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Option B/ })).toBeInTheDocument();
  });

  it("highlights the current option", () => {
    render(<TopBarSelect value="b" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option B/ }));
    const active = screen.getByRole("menuitem", { name: /Option B/ });
    expect(active).toHaveAttribute("aria-current", "true");
  });

  it("calls onChange with the picked value and closes the menu", () => {
    const onChange = vi.fn();
    render(<TopBarSelect value="a" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Option B/ }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("prefixes the value with `label` when provided", () => {
    render(<TopBarSelect label="View:" value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /View: Option A/ })).toBeInTheDocument();
  });

  it("renders multi-section menus with section headings + dividers", () => {
    const sections = [
      { section: "Group 1", items: [{ value: "a", label: "Option A" }] },
      { section: "Group 2", items: [{ value: "b", label: "Option B" }] },
    ];
    render(<TopBarSelect value="a" sections={sections} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<TopBarSelect value="a" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("closes on outside click", () => {
    render(
      <div>
        <TopBarSelect value="a" options={options} onChange={vi.fn()} />
        <button>Outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("marks options in extraActive with aria-current", () => {
    render(
      <TopBarSelect
        value="a"
        options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
        extraActive={new Set(["b"])}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /A/ }));
    expect(screen.getByRole("menuitem", { name: /B/ })).toHaveAttribute("aria-current", "true");
  });
});
