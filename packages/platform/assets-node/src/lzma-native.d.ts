declare module 'lzma-native' {
  export function decompress(input: Buffer): Promise<Buffer>
  const lzma: {
    decompress: typeof decompress
  }
  export default lzma
}
