// The few globals core uses: in browsers, Node and React Native (Hermes) alike. No DOM.
declare function setTimeout(fn: () => void, ms?: number): number;
declare function clearTimeout(id: number | undefined): void;
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
declare var crypto: { randomUUID(): string };
