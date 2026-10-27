import test from 'node:test';
import assert from 'node:assert/strict';
import { createEjSession, verifyEjCredentials, verifyEjSession } from '../../supabase/functions/_shared/ej-admin.ts';
import { createAdminSessionToken, verifyAdminAccess } from '../../supabase/functions/_shared/admin.ts';

test('EJ credentials and sessions are isolated from existing admin', async () => {
  const env = new Map(Object.entries({ EJ_ADMIN:'eunji', EJ_ADMIN_PASS:'test-ej-password', ADMIN_ID:'owner', ADMIN_PASSWORD:'test-owner-password', ADMIN_SESSION_SECRET:'test-only-signing-secret' }));
  globalThis.Deno = {env:{get: name => env.get(name)}};
  const originalNow = Date.now;
  try {
    assert.equal(await verifyEjCredentials('eunji','test-ej-password'),'eunji');
    await assert.rejects(verifyEjCredentials('owner','test-owner-password'), {status:401});
    await assert.rejects(verifyEjCredentials('eunji','wrong'), {status:401});
    const ej = await createEjSession('eunji');
    assert.equal((await verifyEjSession(ej.token)).admin_id,'eunji');
    const owner = await createAdminSessionToken('owner');
    await assert.rejects(verifyEjSession(owner.token), {status:401});
    await assert.rejects(verifyAdminAccess({admin_session_token:ej.token}), {status:401});
    assert.equal((await verifyAdminAccess({admin_session_token:owner.token})).admin_id,'owner');
    for (const bad of [null,'invalid',ej.token+'.extra',ej.token.slice(0,-5)+'aaaaa']) await assert.rejects(verifyEjSession(bad), {status:401});
    env.set('EJ_ADMIN_PASS','new-password');
    await assert.rejects(verifyEjSession(ej.token), {status:401});
    env.set('EJ_ADMIN_PASS','test-ej-password');
    Date.now = () => originalNow() + 8 * 3600 * 1000;
    await assert.rejects(verifyEjSession(ej.token), {status:401});
    Date.now = originalNow;
    env.delete('EJ_ADMIN');
    await assert.rejects(verifyEjCredentials('owner','test-owner-password'), {status:503});
    assert.equal((await verifyAdminAccess({admin_session_token:owner.token})).admin_id,'owner');
  } finally { Date.now = originalNow; delete globalThis.Deno; }
});
