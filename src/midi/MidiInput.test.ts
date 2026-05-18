import { describe, it, expect, afterEach } from "vitest";
import { MidiInput } from "./MidiInput";

interface FakeInput {
  id: string;
  name: string;
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null;
}

function fakeAccess(inputs: FakeInput[]) {
  const access = {
    inputs: new Map(inputs.map((i) => [i.id, i])),
    onstatechange: null as (() => void) | null,
  };
  return access;
}

afterEach(() => {
  // @ts-expect-error test cleanup
  delete navigator.requestMIDIAccess;
});

describe("MidiInput", () => {
  it("reports unsupported when the API is absent", async () => {
    const midi = new MidiInput();
    await midi.start();
    expect(midi.status).toBe("unsupported");
  });

  it("connects and lists devices", async () => {
    const input: FakeInput = { id: "d1", name: "Piano", onmidimessage: null };
    // @ts-expect-error test stub
    navigator.requestMIDIAccess = async () => fakeAccess([input]);
    const midi = new MidiInput();
    await midi.start();
    expect(midi.status).toBe("connected");
    expect(midi.devices).toEqual([{ id: "d1", name: "Piano" }]);
  });

  it("emits note-on, note-off and pedal from raw messages", async () => {
    const input: FakeInput = { id: "d1", name: "Piano", onmidimessage: null };
    // @ts-expect-error test stub
    navigator.requestMIDIAccess = async () => fakeAccess([input]);
    const midi = new MidiInput();
    const events: string[] = [];
    midi.onNoteOn = (e) => events.push(`on:${e.pitch}:${e.velocity}`);
    midi.onNoteOff = (e) => events.push(`off:${e.pitch}`);
    midi.onPedal = (down) => events.push(`pedal:${down}`);
    await midi.start();
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 127]), timeStamp: 1 });
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 0]), timeStamp: 2 });
    input.onmidimessage!({ data: new Uint8Array([0x80, 62, 40]), timeStamp: 3 });
    input.onmidimessage!({ data: new Uint8Array([0xb0, 64, 80]), timeStamp: 4 });
    input.onmidimessage!({ data: new Uint8Array([0xb0, 64, 10]), timeStamp: 5 });
    expect(events).toEqual([
      "on:60:1",
      "off:60",
      "off:62",
      "pedal:true",
      "pedal:false",
    ]);
  });
});
