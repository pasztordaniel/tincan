/** Product name, used in logs and the health check. */
export const APP_NAME = 'tincan';

export * from './constants.js';
export * from './base64url.js';
export {
  CIPHERTEXT_LENGTHS,
  isCiphertext,
  isIv,
  isKeyString,
  isSeq,
  isSessionId,
  isTimestamp,
  isToken,
} from './guards.js';
export * from './events.js';
export * from './message.js';
export * from './framing.js';
