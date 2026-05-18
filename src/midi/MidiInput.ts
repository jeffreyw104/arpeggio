/** A note press or release from an input source. */
export interface MidiNoteEvent {
  pitch: number;
  /** Normalized velocity, 0–1. */
  velocity: number;
  /** Event time in the performance.now() domain (ms). */
  pressTime: number;
}

/** A connected MIDI input device. */
export interface MidiDevice {
  id: string;
  name: string;
}

export type MidiStatus = "unsupported" | "denied" | "no-device" | "connected";

/**
 * Thin wrapper over the Web MIDI API: device enumeration, hot-plug, and raw
 * message parsing. Holds no app logic — callers wire the emitted events to a
 * LiveNotes store.
 */
export class MidiInput {
  onNoteOn: ((e: MidiNoteEvent) => void) | null = null;
  onNoteOff: ((e: MidiNoteEvent) => void) | null = null;
  onPedal: ((down: boolean) => void) | null = null;
  /** Fired whenever `status` or `devices` changes. */
  onStatusChange: (() => void) | null = null;

  private access: MIDIAccess | null = null;
  private selectedId: string | null = null;
  private _status: MidiStatus = "no-device";
  private _devices: MidiDevice[] = [];

  get status(): MidiStatus {
    return this._status;
  }
  get devices(): readonly MidiDevice[] {
    return this._devices;
  }
  get selectedDevice(): MidiDevice | null {
    return this._devices.find((d) => d.id === this.selectedId) ?? null;
  }

  /** Request Web MIDI access and bind devices. */
  async start(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      this.setStatus("unsupported");
      return;
    }
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      this.setStatus("denied");
      return;
    }
    this.access.onstatechange = () => this.rebind();
    this.rebind();
  }

  /** Listen to a specific device by id. */
  select(id: string): void {
    this.selectedId = id;
    this.rebind();
  }

  private rebind(): void {
    if (!this.access) return;
    const inputs = [...this.access.inputs.values()];
    this._devices = inputs.map((i) => ({
      id: i.id,
      name: i.name ?? "MIDI device",
    }));
    for (const input of inputs) input.onmidimessage = null;
    if (this.selectedId == null && inputs.length > 0) {
      this.selectedId = inputs[0].id;
    }
    const active = inputs.find((i) => i.id === this.selectedId);
    if (active) {
      active.onmidimessage = (e) => this.handleMessage(e);
      this._status = "connected";
    } else {
      this.selectedId = null;
      this._status = "no-device";
      this.onPedal?.(false); // clear any stuck pedal on disconnect
    }
    this.onStatusChange?.();
  }

  private handleMessage(e: MIDIMessageEvent): void {
    const data = e.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const a = data[1];
    const b = data.length > 2 ? data[2] : 0;
    if (status === 0x90 && b > 0) {
      this.onNoteOn?.({ pitch: a, velocity: b / 127, pressTime: e.timeStamp });
    } else if (status === 0x80 || (status === 0x90 && b === 0)) {
      this.onNoteOff?.({ pitch: a, velocity: 0, pressTime: e.timeStamp });
    } else if (status === 0xb0 && a === 64) {
      this.onPedal?.(b >= 64);
    }
  }

  private setStatus(status: MidiStatus): void {
    this._status = status;
    this.onStatusChange?.();
  }

  /** Detach all handlers. */
  dispose(): void {
    if (this.access) {
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = null;
      }
      this.access.onstatechange = null;
    }
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onPedal = null;
    this.onStatusChange = null;
  }
}
