// Angular DI stubs for the sanity tests. The services we exercise are
// annotated with @Injectable / @Inject / @Optional but we never actually
// run Angular DI; exporting no-op decorator factories is enough for
// ts-jest to resolve the imports.
export function Injectable(): any {
    return () => undefined;
}
export function Inject(): any {
    return () => undefined;
}
export function Optional(): any {
    return () => undefined;
}
