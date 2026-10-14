import { describe, expect, test } from 'bun:test'
import {
    PeriodicSerializer,
    type IntervalTimers,
    type PeriodicSerializerHost
} from './periodic-serializer'

class FakeTimers implements IntervalTimers {
    readonly active = new Map<number, { handler: () => void; timeoutMs: number }>()
    private nextId = 1

    setInterval(handler: () => void, timeoutMs: number): number {
        const id = this.nextId++
        this.active.set(id, { handler, timeoutMs })
        return id
    }

    clearInterval(id: number): void {
        this.active.delete(id)
    }
}

class FakeHost implements PeriodicSerializerHost {
    disabledOnDevice = false
    runs = 0
    registered: number[] = []
    private release: (() => void) | null = null
    blockRuns = false
    failRuns = false

    registerInterval(id: number): number {
        this.registered.push(id)
        return id
    }

    isDisabledOnDevice(): boolean {
        return this.disabledOnDevice
    }

    run(): Promise<void> {
        this.runs++
        if (this.failRuns) {
            return Promise.reject(new Error('boom'))
        }
        if (this.blockRuns) {
            return new Promise((resolve) => {
                this.release = resolve
            })
        }
        return Promise.resolve()
    }

    finishRun(): void {
        this.release?.()
        this.release = null
    }
}

describe('PeriodicSerializer.configure', () => {
    test('does not arm when disabled', () => {
        const timers = new FakeTimers()
        const serializer = new PeriodicSerializer(new FakeHost(), timers)
        serializer.configure({ enabled: false, intervalMinutes: 30 })
        expect(serializer.isArmed).toBe(false)
        expect(timers.active.size).toBe(0)
    })

    test('arms with the interval in milliseconds and registers it', () => {
        const timers = new FakeTimers()
        const host = new FakeHost()
        const serializer = new PeriodicSerializer(host, timers)
        serializer.configure({ enabled: true, intervalMinutes: 30 })
        expect(serializer.isArmed).toBe(true)
        expect([...timers.active.values()][0]?.timeoutMs).toBe(30 * 60_000)
        expect(host.registered).toHaveLength(1)
    })

    test('re-arms on reconfigure, leaving a single interval', () => {
        const timers = new FakeTimers()
        const serializer = new PeriodicSerializer(new FakeHost(), timers)
        serializer.configure({ enabled: true, intervalMinutes: 30 })
        serializer.configure({ enabled: true, intervalMinutes: 10 })
        expect(timers.active.size).toBe(1)
        expect([...timers.active.values()][0]?.timeoutMs).toBe(10 * 60_000)
    })

    test('stops when reconfigured as disabled', () => {
        const timers = new FakeTimers()
        const serializer = new PeriodicSerializer(new FakeHost(), timers)
        serializer.configure({ enabled: true, intervalMinutes: 30 })
        serializer.configure({ enabled: false, intervalMinutes: 30 })
        expect(serializer.isArmed).toBe(false)
        expect(timers.active.size).toBe(0)
    })
})

describe('PeriodicSerializer.tick', () => {
    test('runs a serialization', async () => {
        const host = new FakeHost()
        await new PeriodicSerializer(host, new FakeTimers()).tick()
        expect(host.runs).toBe(1)
    })

    test('the armed interval triggers a run', async () => {
        const timers = new FakeTimers()
        const host = new FakeHost()
        new PeriodicSerializer(host, timers).configure({ enabled: true, intervalMinutes: 5 })
        ;[...timers.active.values()][0]?.handler()
        await Promise.resolve()
        expect(host.runs).toBe(1)
    })

    test('skips while the plugin is disabled on this device', async () => {
        const host = new FakeHost()
        host.disabledOnDevice = true
        await new PeriodicSerializer(host, new FakeTimers()).tick()
        expect(host.runs).toBe(0)
    })

    test('skips a tick while the previous run is still going', async () => {
        const host = new FakeHost()
        host.blockRuns = true
        const serializer = new PeriodicSerializer(host, new FakeTimers())

        const first = serializer.tick()
        await serializer.tick()
        expect(host.runs).toBe(1)

        host.finishRun()
        await first
        host.blockRuns = false
        await serializer.tick()
        expect(host.runs).toBe(2)
    })

    test('a failed run does not block later ticks', async () => {
        const host = new FakeHost()
        host.failRuns = true
        const serializer = new PeriodicSerializer(host, new FakeTimers())
        await serializer.tick()
        await serializer.tick()
        expect(host.runs).toBe(2)
    })
})
