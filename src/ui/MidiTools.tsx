import { useState } from "react";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { CollapsibleSection } from "./CollapsibleSection";

interface MidiToolsProps {
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
}

/**
 * The Tools popover content for the MIDI Practice tab. Shows Volume and
 * Note-zoom (shared controls), plus a placeholder block for MIDI input
 * (added in the next update).
 */
export function MidiTools({
  audioEngine,
  falldown,
}: MidiToolsProps): React.JSX.Element {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  const [volume, setVolume] = useState(1);
  function changeVolume(v: number): void {
    setVolume(v);
    audioEngine?.setVolume(v);
  }

  const [zoom, setZoom] = useState(() => falldown?.zoom ?? 1);
  function changeZoom(z: number): void {
    setZoom(z);
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.zoom = z;
  }

  return (
    <div className="play-tools midi-tools">
      <div
        className="midi-tools-placeholder"
        aria-disabled="true"
      >
        MIDI input — added in the next update
      </div>

      <CollapsibleSection
        label="Volume"
        open={volumeOpen}
        onToggle={() => setVolumeOpen((o) => !o)}
      >
        <label className="hud-mini">
          <span className="hud-mini-label">Vol</span>
          <input
            type="range"
            aria-label="Volume"
            className="hud-minislider"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        label="Note zoom"
        open={zoomOpen}
        onToggle={() => setZoomOpen((o) => !o)}
      >
        <label className="hud-mini">
          <span className="hud-mini-label">Zoom</span>
          <input
            type="range"
            aria-label="Note zoom"
            className="hud-minislider"
            min={0.5}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
        </label>
      </CollapsibleSection>
    </div>
  );
}
