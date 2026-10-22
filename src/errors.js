/** Only fixed, data-free diagnostics authored by this application use this type. */
export class DigestError extends Error {
  constructor(message) {
    super(message);
    this.name = "DigestError";
  }
}

/** Do not expose external error messages, stacks, causes, or response objects. */
export function digestFailureMessage(error, command) {
  return error instanceof DigestError
    ? error.message
    : `Chat digest ${command} failed; no delivery marker was recorded.`;
}
