// Focused independent-backend SQL contention; temporary local PostgreSQL only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { payoutNativeFixture } from './lib/payout-native-fixture.mjs';

const { pg, scalar } = await payoutNativeFixture();
let checks = 0;
try {
  const owner = await scalar('insert into app_users(clerk_user_id) values($1) returning id value', [randomUUID()]);
  const project = await scalar("insert into projects(owner_user_id,title,category,creation_type,aspect_ratio,duration,visual_style,tone) values($1,'UGC concurrency','cinematic','ugc','16:9','10','Original','Storytelling') returning id value", [owner]);
  const insert = role => {
    const id = randomUUID();
    return pg.query(`insert into project_assets(id,owner_user_id,project_id,upload_request_id,storage_key,original_filename,mime_type,size_bytes,media_type,studio_role,reference_id)
      values($1,$2,$3,$4,$5,'fixture.png','image/png',12,'image',$6,$7) returning id`,
      [id, owner, project, randomUUID(), `users/${owner}/projects/${project}/${id}/fixture`, role, role === 'freestyle' ? null : randomUUID()], 'service_role');
  };
  for (const role of ['character', 'product']) {
    const outcomes = await Promise.allSettled([insert(role), insert(role)]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1); checks++;
    assert.equal(outcomes.find(result => result.status === 'rejected')?.reason.code, '23514'); checks++;
    assert.equal(await scalar('select count(*)::int value from project_assets where project_id=$1 and studio_role=$2 and not removed_from_draft', [project, role]), 1); checks++;
  }
  const media = await pg.query('select id from project_assets where project_id=$1 and studio_role=$2', [project, 'character']);
  await pg.query('update project_assets set removed_from_draft=true where id=$1', [media.rows[0].id], 'service_role');
  assert.equal((await insert('character')).rows.length, 1); checks++;
  assert.equal((await Promise.allSettled([insert('freestyle'), insert('freestyle')])).filter(result => result.status === 'fulfilled').length, 2); checks++;
  assert.ok(pg.stats().maximumIndependentClients >= 2); checks++;
  console.log(JSON.stringify({ passed: checks, scope: 'Concurrent UGC Character/Product insertion, removal/replacement and unchanged Freestyle; temporary local PostgreSQL only' }));
} finally { await pg.close(); }
