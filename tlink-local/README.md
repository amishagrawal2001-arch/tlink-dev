# Tlink Local Plugin

* local shells

Using the API:

```ts
import { ShellProvider } from 'tlink-local'
```

Exporting your subclasses:

```ts
@NgModule({
  ...
  providers: [
    ...
    { provide: ShellProvider, useClass: MyShellPlugin, multi: true },
    ...
  ]
})
```
