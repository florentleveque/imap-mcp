/**
 * `bytes` read in the charset their part declares: UTF-8 when it declares
 * none, or one TextDecoder does not know.
 */
export function decodeText(bytes: Buffer, charset: string | undefined): string {
  try {
    // TextDecoder reads an undefined label as UTF-8.
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // A charset label TextDecoder does not know.
    return bytes.toString('utf8');
  }
}
