/**
 * MidiTab — MIDI Practice tab layout shell.
 *
 * This component is NOT rendered as a React subtree that swaps against Layout;
 * doing so would unmount the falldown canvas and score container, breaking the
 * FalldownRenderer and ScoreView bindings.  Instead, PracticeView always renders
 * one stable content div and switches its CSS class between play/midi modes.
 * MidiTab.tsx exists as the authoritative description of the midi-tab layout and
 * exports the `MidiTabContent` component that wraps the chrome — the actual canvas
 * and score-container nodes are passed as children (rendered by PracticeView at
 * stable tree positions).
 */

interface MidiTabProps {
  /** The falldown canvas node — rendered by PracticeView, passed through here. */
  falldown: React.ReactNode;
  /** The reading lane node (wraps the score-container). */
  readingLane: React.ReactNode;
}

/**
 * The MIDI tab chrome: reading lane pinned above the falldown canvas.
 * For Plan 1 this is a layout-only shell; MIDI input logic arrives in Plan 2.
 */
export function MidiTabContent({
  falldown,
  readingLane,
}: MidiTabProps): React.JSX.Element {
  return (
    <>
      {readingLane}
      <div className="midi-tab-falldown" data-testid="midi-tab-falldown">
        {falldown}
      </div>
    </>
  );
}
