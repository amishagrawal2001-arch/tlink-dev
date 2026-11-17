export interface SelectorOption<T> {
    name: string
    description?: string
    group?: string
    result?: T
    icon?: string
    freeInputPattern?: string
    freeInputEquivalent?: string
    color?: string
    weight?: number
    callback?: (string?) => void
    /**
     * When true, this option is excluded from the default (unfiltered)
     * list and only surfaces once the user starts typing in the search
     * box. Used by "New connection" to keep saved-profile entries out
     * of the top-level picker until the user types a name / host — so
     * the default view stays a compact launcher, not a flat dump of
     * every saved session.
     */
    hiddenWithoutFilter?: boolean
}
