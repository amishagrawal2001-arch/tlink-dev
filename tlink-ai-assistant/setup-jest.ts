// Simplified test configuration
// Mock localStorage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
        readText: jest.fn().mockImplementation(() => Promise.resolve())
    }
});

// Mock crypto
Object.defineProperty(global, 'crypto', {
    value: {
        getRandomValues: jest.fn().mockReturnValue(new Uint8Array(32)),
        subtle: {
            digest: jest.fn().mockImplementation(() => Promise.resolve(new ArrayBuffer(32)))
        }
    }
});

// Mock console.log to reduce test output noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};
