import { Injectable } from '@angular/core'
import { APIResponse, AssertionResult, ResponseAssertion } from '../api/interfaces'
import { getByPath } from './jsonPath'

/**
 * Quick-assertion engine. Sibling of `postScript` — gives the user a
 * structured "status === 200, body has `id`" UI without making them
 * write JS. Each assertion compiles to a single boolean check and
 * returns a labeled result for the response panel.
 *
 * Errors during evaluation (e.g. JSON parse fails on a non-JSON
 * response) bubble up as a failed result with a `detail` so the user
 * can spot the cause.
 */
@Injectable({ providedIn: 'root' })
export class AssertionsService {
    run (response: APIResponse, assertions: ResponseAssertion[] | undefined): AssertionResult[] {
        if (!assertions?.length) {
            return []
        }
        return assertions
            .filter(a => a.enabled)
            .map(a => this.evaluate(response, a))
    }

    private evaluate (response: APIResponse, a: ResponseAssertion): AssertionResult {
        try {
            switch (a.kind) {
                case 'status': {
                    const actual = response.status
                    const expected = Number(a.expected)
                    return this.compareNumber({ label: `status ${a.op} ${a.expected}`, op: a.op, actual, expected })
                }
                case 'header': {
                    const actual = response.headers[a.target?.toLowerCase() ?? ''] ?? ''
                    return this.compareString({
                        label: `header ${a.target} ${a.op} ${a.expected}`,
                        op: a.op,
                        actual,
                        expected: a.expected,
                    })
                }
                case 'body-contains': {
                    const ok = (response.body).includes(a.expected)
                    return { label: `body contains "${a.expected}"`, pass: ok }
                }
                case 'json-path-equals': {
                    const root = JSON.parse(response.body)
                    const v = getByPath(root, a.target ?? '')
                    const ok = String(v) === a.expected
                    return {
                        label: `${a.target} == ${a.expected}`,
                        pass: ok,
                        detail: ok ? undefined : `actual: ${JSON.stringify(v)}`,
                    }
                }
                default: {
                    return { label: 'unknown assertion', pass: false }
                }
            }
        } catch (e: any) {
            return { label: a.kind, pass: false, detail: e?.message ?? 'evaluation error' }
        }
    }

    private compareNumber (args: { label: string, op: ResponseAssertion['op'], actual: number, expected: number }): AssertionResult {
        const { label, op, actual, expected } = args
        let pass = false
        switch (op) {
            case 'eq': pass = actual === expected; break
            case 'neq': pass = actual !== expected; break
            case 'lt': pass = actual < expected; break
            case 'gt': pass = actual > expected; break
            default: pass = false
        }
        return { label, pass, detail: pass ? undefined : `actual: ${actual}` }
    }

    private compareString (args: { label: string, op: ResponseAssertion['op'], actual: string, expected: string }): AssertionResult {
        const { label, op, actual, expected } = args
        let pass = false
        switch (op) {
            case 'eq': pass = actual === expected; break
            case 'neq': pass = actual !== expected; break
            case 'contains': pass = actual.includes(expected); break
            case 'exists': pass = actual.length > 0; break
            default: pass = false
        }
        return { label, pass, detail: pass ? undefined : `actual: ${actual}` }
    }
}
