import { log } from '../../utils/log'
import type { PeriodicSerializationConfig } from './periodic-serialization-config'

/**
 * What the timer needs from the plugin.
 */
export interface PeriodicSerializerHost {
    /** Hands the interval to Obsidian so it is cleared when the plugin unloads */
    registerInterval(id: number): number
    /** Read live on every tick, so a device disable applies without re-arming */
    isDisabledOnDevice(): boolean
    /** One full serialization run */
    run(): Promise<void>
}

/**
 * The timer functions used, injectable for tests.
 */
export interface IntervalTimers {
    setInterval(handler: () => void, timeoutMs: number): number
    clearInterval(id: number): void
}

const MS_PER_MINUTE = 60_000

/**
 * Runs a full serialization every N minutes, when enabled.
 *
 * - `configure` (re-)arms the timer, so config changes apply without a reload.
 * - A tick is skipped while the previous run is still going, so a slow run on
 *   a large vault never stacks up behind itself.
 * - A tick does nothing while the plugin is disabled on this device.
 */
export class PeriodicSerializer {
    private intervalId: number | null = null
    private running = false

    constructor(
        private readonly host: PeriodicSerializerHost,
        private readonly timers: IntervalTimers = {
            setInterval: (handler, timeoutMs) => window.setInterval(handler, timeoutMs),
            clearInterval: (id) => window.clearInterval(id)
        }
    ) {}

    get isArmed(): boolean {
        return this.intervalId !== null
    }

    configure(config: PeriodicSerializationConfig): void {
        this.stop()
        if (!config.enabled) {
            return
        }

        const id = this.timers.setInterval(() => {
            void this.tick()
        }, config.intervalMinutes * MS_PER_MINUTE)
        this.intervalId = this.host.registerInterval(id)
        log(`Periodic serialization armed: every ${config.intervalMinutes} minute(s)`, 'debug')
    }

    stop(): void {
        if (this.intervalId === null) {
            return
        }
        this.timers.clearInterval(this.intervalId)
        this.intervalId = null
        log('Periodic serialization stopped', 'debug')
    }

    async tick(): Promise<void> {
        if (this.running) {
            log('Periodic serialization: previous run still in progress, skipping', 'debug')
            return
        }
        if (this.host.isDisabledOnDevice()) {
            return
        }

        this.running = true
        try {
            log('Periodic serialization: running', 'debug')
            await this.host.run()
        } catch (error: unknown) {
            log('Periodic serialization failed', 'warn', error)
        } finally {
            this.running = false
        }
    }
}
