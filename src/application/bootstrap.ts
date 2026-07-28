import { randomUUID } from 'node:crypto';
import type { Database } from '../infrastructure/db.js';

export async function ensureSeedData(database: Database, rulesetVersion: string): Promise<void> {
  await database.transaction(async (client) => {
    await client.query(
      'UPDATE governance.rule_versions SET active = false WHERE active = true AND version <> $1',
      [rulesetVersion],
    );
    await client.query(
      `INSERT INTO governance.rule_versions(version, name, description, parameters, active)
       VALUES ($1, $2, $3, $4::jsonb, true)
       ON CONFLICT (version) DO UPDATE SET active = true`,
      [
        rulesetVersion,
        'MVP 日常决策规则',
        '硬门槛、主要矛盾与瓶颈贡献、资源适配、人因状态、证据规模与 WIP 限制。',
        JSON.stringify({ reserve_default: 20, wip_limit: 3, low_capacity_threshold: 3 }),
      ],
    );

    const objectiveCount = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM core.objectives');
    if (Number(objectiveCount.rows[0]?.count ?? 0) === 0) {
      await client.query(
        `INSERT INTO core.objectives(id, title, horizon, acceptance, non_goals)
         VALUES ($1,$2,'stage',$3,$4)`,
        [
          randomUUID(),
          '建立可持续、可验证的实践—反馈闭环',
          '连续四周完成日常决策与结果复盘，维护成本不超过主动投入的 10%。',
          '首版不追求覆盖全部十四个模块。',
        ],
      );
    }

    await client.query(
      `INSERT INTO core.knowledge_objects(id, object_type, title, status, attributes)
       SELECT id, 'objective', title, status, jsonb_build_object('horizon', horizon)
       FROM core.objectives
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = now()`,
    );
    await client.query(
      `INSERT INTO core.knowledge_objects(id, object_type, title, status, attributes)
       SELECT id, 'project', title, status, jsonb_build_object('kind', kind)
       FROM core.projects
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = now()`,
    );
    await client.query(
      `INSERT INTO core.knowledge_objects(id, object_type, title, status, attributes)
       SELECT id, 'decision', main_action, lifecycle_status, jsonb_build_object('checkin_date', checkin_date)
       FROM decision.daily_checkins
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status, updated_at = now()`,
    );
  });
}
