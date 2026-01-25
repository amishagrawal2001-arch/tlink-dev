declare module 'zod/v3' {
  export const z: any;
  export default z;

  export namespace z {
    export type ZodRawShape = Record<string, unknown>;
    export type ZodType<T = unknown> = unknown;
  }

  export type ZodRawShape = z.ZodRawShape;
  export type ZodType<T = unknown> = z.ZodType<T>;
}

declare module 'zod/v4' {
  const z: any;
  export default z;
}

declare module 'zod/v4/*' {
  const z: any;
  export default z;
}

export {};
