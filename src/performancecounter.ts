import { performance } from 'perf_hooks';
import { Logger } from './api/koalabotsystem.js'

import config from 'config'

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

export class SimplePerformanceCounter {
    public readonly description: string;
    private startTime: number;

    constructor(desc: string, start: number = performance.now()) {
        this.description = desc;
        this.startTime = start;
    }

    start(): void {
        this.setStartTime(performance.now());
    }

    setStartTime(startTime: number) {
        this.startTime = startTime;
    }

    get() {
        return performance.now() - this.startTime!;
    }
}

export class PerformanceCounter implements Disposable {
    private logger?: Logger;
    private static enableCounters = false;
    private static defaultLogger: Logger;
    private counter: SimplePerformanceCounter;
    private customMessage: string;

    private constructor(desc: string, start: number = performance.now(), logger: Logger = PerformanceCounter.defaultLogger, customMessage: string = "") {
        this.counter = new SimplePerformanceCounter(desc,start);
        this.logger = logger;
        this.customMessage = customMessage;
    }

    [Symbol.dispose](): void {
        const timeMs = this.counter.get();
        this.logger!.logInfo(this.customMessage || `${this.counter.description!} completed in ${timeMs} milliseconds`);
    }

    static Create(desc: string, start: number = performance.now(), logger: Logger = this.defaultLogger, overrideEnabled: boolean = false) {
        if (PerformanceCounter.enableCounters || overrideEnabled) {
            return new PerformanceCounter(desc, start, logger);
        } else {
            return undefined;
        }
    }

    static enablePerformanceCounters(enable: boolean, logger: Logger) {
        this.enableCounters = enable;
        this.defaultLogger = logger;
    }
}

export class AutoPerformanceCounter {

}
