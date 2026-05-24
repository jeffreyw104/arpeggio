import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Layout } from "./Layout";

const falldown = <div data-testid="falldown-panel">falldown</div>;
const scorePanel = <div data-testid="score-panel">score</div>;

test("orientation='column' applies layout--column class", () => {
  const { container } = render(
    <Layout
      viewMode="both"
      split={0.5}
      onSplitChange={() => {}}
      falldown={<div>F</div>}
      score={<div>S</div>}
      orientation="column"
    />,
  );
  expect(container.querySelector(".layout")?.classList.contains("layout--column")).toBe(true);
});

test("orientation defaults to row (no class added)", () => {
  const { container } = render(
    <Layout
      viewMode="both"
      split={0.5}
      onSplitChange={() => {}}
      falldown={<div>F</div>}
      score={<div>S</div>}
    />,
  );
  expect(container.querySelector(".layout")?.classList.contains("layout--column")).toBe(false);
});

describe("Layout", () => {
  it("shows both panels and the divider in 'both' mode", () => {
    render(
      <Layout
        viewMode="both"
        split={0.65}
        onSplitChange={() => {}}
        falldown={falldown}
        score={scorePanel}
      />,
    );
    expect(screen.getByTestId("falldown-panel")).toBeVisible();
    expect(screen.getByTestId("score-panel")).toBeVisible();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("shows only the falldown (no divider) in 'falldown' mode", () => {
    render(
      <Layout
        viewMode="falldown"
        split={0.65}
        onSplitChange={() => {}}
        falldown={falldown}
        score={scorePanel}
      />,
    );
    expect(screen.getByTestId("falldown-panel")).toBeVisible();
    expect(screen.getByTestId("score-panel")).not.toBeVisible();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("shows only the score in 'score' mode", () => {
    render(
      <Layout
        viewMode="score"
        split={0.65}
        onSplitChange={() => {}}
        falldown={falldown}
        score={scorePanel}
      />,
    );
    expect(screen.getByTestId("score-panel")).toBeVisible();
    expect(screen.getByTestId("falldown-panel")).not.toBeVisible();
  });
});
