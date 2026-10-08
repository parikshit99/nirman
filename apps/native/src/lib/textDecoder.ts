// Hermes (Android's JavaScript engine here) only decodes UTF-8, but jspdf's PNG reader (fast-png) creates a
// TextDecoder('latin1') as soon as it loads, which crashed the app at start. This adds the single-byte encodings and
// leaves everything else to Hermes. Imported first by index.ts, before any library loads.

const Native = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder;
const SINGLE_BYTE = new Set(['latin1', 'iso-8859-1', 'iso8859-1', 'l1', 'ascii', 'us-ascii', 'windows-1252', 'cp1252']);

class SingleByteAwareTextDecoder {
  readonly encoding: string;
  private readonly native?: TextDecoder;

  constructor(label = 'utf-8', options?: TextDecoderOptions) {
    if (SINGLE_BYTE.has(String(label).trim().toLowerCase())) {
      this.encoding = 'windows-1252';
    } else {
      if (!Native) throw new RangeError(`Unknown encoding: ${label}`);
      this.native = new Native(label, options);
      this.encoding = this.native.encoding;
    }
  }

  get fatal(): boolean {
    return this.native?.fatal ?? false;
  }

  get ignoreBOM(): boolean {
    return this.native?.ignoreBOM ?? false;
  }

  decode(input?: ArrayBuffer | ArrayBufferView, options?: TextDecodeOptions): string {
    if (this.native) return this.native.decode(input, options);
    if (!input) return '';
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let out = '';
    for (let at = 0; at < bytes.length; at += 8192) out += String.fromCharCode(...bytes.subarray(at, at + 8192));
    return out;
  }
}

(globalThis as { TextDecoder: unknown }).TextDecoder = SingleByteAwareTextDecoder;
