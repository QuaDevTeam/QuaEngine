declare module 'lzma-native' {
  export function decompress(data: Buffer | Uint8Array, options?: unknown): Promise<Buffer>
}
