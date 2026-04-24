// Angular DI stubs for the sanity tests. The services we exercise are
// annotated with @Injectable but we never actually call the decorator;
// exporting a no-op is enough for ts-jest to resolve the import.
export function Injectable(): any {
    return () => undefined;
}
export function Inject(): any {
    return () => undefined;
}
