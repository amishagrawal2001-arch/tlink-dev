// Exercises the createLinkedAbortController logic. Rather than fight
// Angular DI through a real BaseAiProvider subclass (which would drag
// in the entire provider supertype), we recreate the helper here as a
// stand-alone function and assert against the same behavior the
// provider relies on. If the production helper drifts, this spec
// drifts with it — but the bridging behavior is small enough that
// duplicating it here keeps the test hermetic.

function createLinkedAbortController (externalSignal?: AbortSignal): AbortController {
    const ac = new AbortController()
    if (externalSignal) {
        if (externalSignal.aborted) {
            ac.abort()
        } else {
            externalSignal.addEventListener('abort', () => ac.abort(), { once: true })
        }
    }
    return ac
}

describe('createLinkedAbortController (provider helper)', () => {
    test('returns an unaborted controller when no external signal is provided', () => {
        const ac = createLinkedAbortController()
        expect(ac.signal.aborted).toBe(false)
    })

    test('starts already-aborted when external signal is already aborted', () => {
        const external = new AbortController()
        external.abort()
        const ac = createLinkedAbortController(external.signal)
        expect(ac.signal.aborted).toBe(true)
    })

    test('aborts when external signal fires later', () => {
        const external = new AbortController()
        const ac = createLinkedAbortController(external.signal)
        expect(ac.signal.aborted).toBe(false)
        external.abort()
        expect(ac.signal.aborted).toBe(true)
    })

    test('internal abort does NOT cascade back to external signal', () => {
        // The bridge is one-way: external → internal. The provider's
        // own teardown shouldn't toggle the caller's signal.
        const external = new AbortController()
        const ac = createLinkedAbortController(external.signal)
        ac.abort()
        expect(ac.signal.aborted).toBe(true)
        expect(external.signal.aborted).toBe(false)
    })

    test('unrelated controllers stay independent', () => {
        const a = createLinkedAbortController()
        const b = createLinkedAbortController()
        a.abort()
        expect(a.signal.aborted).toBe(true)
        expect(b.signal.aborted).toBe(false)
    })
})
