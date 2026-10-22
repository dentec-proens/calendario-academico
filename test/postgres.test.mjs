import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { openPostgresStore, createPostgresPool } from '../src/postgres-store.mjs';
import { persistentSessions, consumeLoginAttempt } from '../src/session-store.mjs';

// This URL must point only to a dedicated, migrated test database.
test(
  'real relational PostgreSQL preserves concurrent writes, rollback and shared sessions without locking calendars',
  { skip: !process.env.DENTEC_TEST_POSTGRES_URL, timeout: 120000 },
  async (t) => {
    const url = process.env.DENTEC_TEST_POSTGRES_URL;
    const first = await openPostgresStore(url),
      second = await openPostgresStore(url),
      pool = await createPostgresPool(url);
    const tag = randomBytes(8).toString('hex'),
      userId = 'fixture-' + tag,
      counter = 'testCounter_' + tag,
      token = randomBytes(32).toString('hex'),
      key = 'synthetic-' + tag;
    const attemptId = createHash('sha256').update(key).digest('hex');
    t.after(async () => {
      try {
        await persistentSessions(first).delete(token);
        await first.change(
          (db) => {
            db.users = db.users.filter((u) => u.id !== userId);
          },
          { fields: ['users'] },
        );
        await first.change(
          (db) => {
            db.loginAttempts = (db.loginAttempts || []).filter((item) => item.id !== attemptId);
          },
          { fields: ['loginAttempts'] },
        );
        await first.change(
          (db) => {
            delete db[counter];
          },
          { fields: [counter] },
        );
      } finally {
        await first.close();
        await second.close();
        await pool.end();
      }
    });
    await first.change(
      (db) => {
        db[counter] = 0;
      },
      { fields: [counter] },
    );
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? first : second).change(
          async (db) => {
            const value = db[counter];
            await new Promise((r) => setTimeout(r, 5));
            db[counter] = value + 1;
          },
          { fields: [counter] },
        ),
      ),
    );
    assert.equal((await second.read({ fields: [counter] }))[counter], 12);
    await assert.rejects(
      first.change(
        (db) => {
          db[counter] = 999;
          throw Error('rollback fixture');
        },
        { fields: [counter] },
      ),
    );
    assert.equal((await second.read({ fields: [counter] }))[counter], 12);
    await first.change(
      (db) => {
        db.users.push({
          id: userId,
          name: 'Integration fixture',
          email: `fixture-${tag}@ifpr.edu.br`,
          role: 'ADMIN',
          campusId: null,
          active: true,
          loginMethod: 'local',
        });
      },
      { fields: ['users'] },
    );
    const hold = await pool.connect();
    try {
      await hold.query('BEGIN');
      await hold.query('LOCK TABLE dentec.calendars IN ACCESS EXCLUSIVE MODE');
      let timeout;
      try {
        await Promise.race([
          persistentSessions(first).set(token, { userId, expires: Date.now() + 600000 }),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(Error('Session write was blocked by an unrelated calendar lock.')),
              4000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      await hold.query('ROLLBACK');
      hold.release();
    }
    assert.equal((await persistentSessions(second).get(token)).userId, userId);
    await persistentSessions(second).delete(token);
    assert.equal(await persistentSessions(first).get(token), undefined);
    const allowed = await Promise.all(
      Array.from({ length: 20 }, (_, i) => consumeLoginAttempt(i % 2 ? first : second, key)),
    );
    assert.equal(allowed.filter(Boolean).length, 15);
    const { rows } = await pool.query(
      "SELECT EXISTS(SELECT 1 FROM pg_namespace n,LATERAL aclexplode(n.nspacl) a WHERE n.nspname='dentec' AND a.grantee=0 AND a.privilege_type='USAGE') AS exposed",
    );
    assert.equal(rows[0].exposed, false);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema='dentec' AND data_type IN ('json','jsonb')",
        )
      ).rows[0].n,
      0,
    );
  },
);
