import { Global } from './global.js';
import { performance } from 'perf_hooks';

// <polyfill>

// the interfaces are only necessary if you're not including https://github.com/microsoft/TypeScript/blob/main/src/lib/esnext.disposable.d.ts as a `lib` option
interface SymbolConstructor {
    readonly dispose: unique symbol
}

interface Disposable {
    [Symbol.dispose](): void
}

// @ts-ignore - if it already exists as a readonly property, this is a no-op anyway
Symbol.dispose ??= Symbol('Symbol.dispose')

// </polyfill>

export class PerformanceCounter implements Disposable {
    // @ts-ignore
    #description: string;
    // @ts-ignore
    #start: number;

    constructor(desc: string, start: number = performance.now()) {
        try {
            this.#description = (desc == null) ? "[UNKNOWN]" : desc;
            this.#start = start;
        } catch (e) {
            Global.logger().logErrorAsync(`Failed to start timing, got ${e}`);
        }
    }

    [Symbol.dispose](): void {
        const end = performance.now();
        const timeMs = end - this.#start;

        Global.logger().logInfo(`${this.#description} completed in ${timeMs} milliseconds`);
    }
}