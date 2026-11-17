import { describe, expect, it } from 'vitest';
import {
  CREATE_ERRORS,
  END_REASONS,
  ERROR_CODES,
  EVENTS,
  FRAME_ERRORS,
  isCreateResult,
  isErrorCode,
  isFrame,
  isFrameResult,
  isJoinRequest,
  isJoinResult,
  isPeerEvent,
  isResumeRequest,
  isResumeResult,
  isSessionEndedEvent,
  JOIN_ERRORS,
  PEER_STATES,
  RESUME_ERRORS,
} from '../src/events.js';
import { ciphertext, IV, JUNK, SESSION_ID, TOKEN, withOwnKey } from './fixtures.js';

const frame = () => ({ v: 1, seq: 1, iv: IV, ct: ciphertext() });

/** Every validator must reject the valid object with any one key removed, added or replaced by junk. */
function expectStrictShape(guard: (value: unknown) => boolean, valid: Record<string, unknown>) {
  expect(guard(valid)).toBe(true);
  expect(guard(JSON.parse(JSON.stringify(valid)))).toBe(true);
  for (const key of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[key];
    expect(guard(missing)).toBe(false);
    for (const junk of JUNK) {
      if (junk === valid[key]) continue;
      expect(guard({ ...valid, [key]: junk })).toBe(false);
    }
  }
  for (const extra of ['extra', '__proto__', 'constructor', 'prototype', 'toString']) {
    expect(guard(withOwnKey(valid, extra))).toBe(false);
  }
  expect(guard({ ...valid, extra: undefined })).toBe(false);
  for (const junk of JUNK) expect(guard(junk)).toBe(false);
  expect(guard([valid])).toBe(false);
}

describe('event names', () => {
  it('match docs/architecture.md', () => {
    expect(EVENTS).toEqual({
      create: 'session:create',
      join: 'session:join',
      resume: 'session:resume',
      frame: 'frame',
      peer: 'peer',
      ended: 'session:ended',
    });
    expect(Object.isFrozen(EVENTS)).toBe(true);
  });

  it('per-event error lists are subsets of the error code union', () => {
    for (const list of [CREATE_ERRORS, JOIN_ERRORS, RESUME_ERRORS, FRAME_ERRORS]) {
      for (const code of list) expect(isErrorCode(code)).toBe(true);
    }
    expect(isErrorCode('nope')).toBe(false);
    expect(ERROR_CODES).toContain('not_found');
    expect(JOIN_ERRORS).toEqual(expect.arrayContaining(['not_found', 'full']));
  });
});

describe('isJoinRequest', () => {
  it('is strict', () => expectStrictShape(isJoinRequest, { sessionId: SESSION_ID }));

  it('rejects a session id that is not base64url', () => {
    expect(isJoinRequest({ sessionId: 'a.b' })).toBe(false);
    expect(isJoinRequest({ sessionId: '../../etc/passwd' })).toBe(false);
  });
});

describe('isResumeRequest', () => {
  it('is strict', () =>
    expectStrictShape(isResumeRequest, { sessionId: SESSION_ID, token: TOKEN }));

  it('rejects a token of the wrong length', () => {
    expect(isResumeRequest({ sessionId: SESSION_ID, token: TOKEN + 'A' })).toBe(false);
  });
});

describe('isFrame', () => {
  it('is strict', () => expectStrictShape(isFrame, frame()));

  it('accepts only protocol version 1', () => {
    for (const v of [0, 2, '1', 1.0000001, true]) expect(isFrame({ ...frame(), v })).toBe(false);
  });

  it('rejects bad seq values', () => {
    for (const seq of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null]) {
      expect(isFrame({ ...frame(), seq })).toBe(false);
    }
  });

  it('rejects bad iv and ct values', () => {
    expect(isFrame({ ...frame(), iv: IV.slice(1) })).toBe(false);
    expect(isFrame({ ...frame(), iv: IV.slice(0, -1) + '+' })).toBe(false);
    expect(isFrame({ ...frame(), ct: ciphertext().slice(1) })).toBe(false);
    expect(isFrame({ ...frame(), ct: ciphertext() + 'AAAA' })).toBe(false);
    expect(isFrame({ ...frame(), ct: '' })).toBe(false);
    expect(isFrame({ ...frame(), ct: 'A'.repeat(100_000) })).toBe(false);
  });

  it('accepts the largest bucket', () => {
    expect(isFrame({ ...frame(), ct: ciphertext(65536) })).toBe(true);
  });
});

describe('server events', () => {
  it('peer: every state, strictly', () => {
    for (const state of PEER_STATES) expectStrictShape(isPeerEvent, { state });
    expect(isPeerEvent({ state: 'online' })).toBe(false);
    expect(isPeerEvent({ state: 'Connected' })).toBe(false);
  });

  it('session:ended: every reason, strictly', () => {
    for (const reason of END_REASONS) expectStrictShape(isSessionEndedEvent, { reason });
    expect(isSessionEndedEvent({ reason: 'because' })).toBe(false);
  });
});

describe('ack results', () => {
  it('create', () => {
    expectStrictShape(isCreateResult, { ok: true, sessionId: SESSION_ID, senderToken: TOKEN });
    for (const error of CREATE_ERRORS) expectStrictShape(isCreateResult, { ok: false, error });
    expect(isCreateResult({ ok: false, error: 'full' })).toBe(false);
    expect(isCreateResult({ ok: true })).toBe(false);
    expect(isCreateResult({ ok: false, sessionId: SESSION_ID, senderToken: TOKEN })).toBe(false);
    expect(isCreateResult({ ok: true, error: 'busy' })).toBe(false);
  });

  it('join', () => {
    expectStrictShape(isJoinResult, { ok: true, receiverToken: TOKEN });
    for (const error of JOIN_ERRORS) expectStrictShape(isJoinResult, { ok: false, error });
    expect(isJoinResult({ ok: false, error: 'unauthorized' })).toBe(false);
  });

  it('resume', () => {
    expectStrictShape(isResumeResult, { ok: true });
    for (const error of RESUME_ERRORS) expectStrictShape(isResumeResult, { ok: false, error });
    // Resume never distinguishes "no session" from "wrong token".
    expect(isResumeResult({ ok: false, error: 'unauthorized' })).toBe(false);
  });

  it('frame', () => {
    expectStrictShape(isFrameResult, { ok: true });
    for (const error of FRAME_ERRORS) expectStrictShape(isFrameResult, { ok: false, error });
    expect(isFrameResult({ ok: 'true' })).toBe(false);
    expect(isFrameResult({ ok: 1 })).toBe(false);
  });
});
