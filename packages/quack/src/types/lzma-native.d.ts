declare module 'lzma-native' {
  export function compress(data: Buffer | Uint8Array, options?: any): Promise<Buffer>
  export function decompress(data: Buffer | Uint8Array, options?: any): Promise<Buffer>
  export function compressSync(data: Buffer | Uint8Array, options?: any): Buffer
  export function decompressSync(data: Buffer | Uint8Array, options?: any): Buffer
}
