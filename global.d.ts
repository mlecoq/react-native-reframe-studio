declare module '*.css';

// whisper.rn ships TypeScript sources (resolved via its "react-native"
// exports condition) that reference the RN runtime global.
declare var global: typeof globalThis;
