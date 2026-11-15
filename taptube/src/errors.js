/**
 * Typed failures shared by the UI, the chart generator and the media layer.
 * Each code maps to a translated message in `i18n.js`.
 */

export class TapTubeError extends Error {
  /**
   * @param {string} code translation key (e.g. `error.network`)
   * @param {{cause?: unknown, detail?: string}} [options]
   */
  constructor(code, options = {}) {
    super(
      options.detail ?? code,
      options.cause ? { cause: options.cause } : undefined,
    );
    this.name = "TapTubeError";
    this.code = code;
    this.detail = options.detail ?? null;
  }
}

export const fail = (code, detail, cause) => {
  throw new TapTubeError(code, { detail, cause });
};

/** Wrap an async boundary so callers always see a TapTubeError. */
export async function guard(code, work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TapTubeError) throw error;
    throw new TapTubeError(code, { cause: error, detail: error?.message });
  }
}
