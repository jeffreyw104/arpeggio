import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Layout } from "./Layout";

const falldown = <div data-testid="falldown-panel">falldown</div>;
const scorePanel = <div data-testid="score-panel">score</div>;

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
    expect(screen.getByTestId("falldown-panel")).toBeInTheDocument();
    expect(screen.getByTestId("score-panel")).toBeInTheDocument();
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
    expect(screen.getByTestId("falldown-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("score-panel")).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("falldown-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("score-panel")).toBeInTheDocument();
  });
});
