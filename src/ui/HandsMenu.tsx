import { useState } from "react";
import type { HandState, HandVisibility } from "../practice/hands";

interface HandsMenuProps {
  handState: HandState;
}

/**
 * The hands dropdown: per-hand show/dim/hide visibility and mute. Rendered
 * only while the dropdown is open, so its inputs initialise from the live
 * hand state each time it opens.
 */
export function HandsMenu({ handState }: HandsMenuProps): React.JSX.Element {
  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  return (
    <div
      className="hud-hands-menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label>
        Left hand{" "}
        <select
          value={leftVis}
          onChange={(e) => {
            const v = e.target.value as HandVisibility;
            setLeftVis(v);
            handState.setVisibility("left", v);
          }}
        >
          <option value="show">Show</option>
          <option value="dim">Dim</option>
          <option value="hide">Hide</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={muteLeft}
          onChange={(e) => {
            setMuteLeft(e.target.checked);
            handState.setMuted("left", e.target.checked);
          }}
        />{" "}
        Mute L
      </label>
      <label>
        Right hand{" "}
        <select
          value={rightVis}
          onChange={(e) => {
            const v = e.target.value as HandVisibility;
            setRightVis(v);
            handState.setVisibility("right", v);
          }}
        >
          <option value="show">Show</option>
          <option value="dim">Dim</option>
          <option value="hide">Hide</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={muteRight}
          onChange={(e) => {
            setMuteRight(e.target.checked);
            handState.setMuted("right", e.target.checked);
          }}
        />{" "}
        Mute R
      </label>
    </div>
  );
}
