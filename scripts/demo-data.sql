-- ============================================================
-- Praxis Control 演示数据集
-- 项目: B02资源池数据盘故障修复 (kind=maintain, status=active)
-- 周期: 2026-08-04 ~ 2026-08-08 (周一 ~ 周五)
-- 内容: 1 项目 + 5 每日Checkin + 3 Outcome + 5 知识对象 + 1 周复盘
-- 说明: 所有UUID使用 gen_random_uuid(); 脚本可重复执行(带存在性守卫)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 项目 core.projects
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.projects WHERE title = 'B02资源池数据盘故障修复') THEN
    INSERT INTO core.projects (id, title, kind, status, current_bottleneck, exit_condition)
    VALUES (
      gen_random_uuid(),
      'B02资源池数据盘故障修复',
      'maintain',
      'active',
      '现场人力仅1人可用，单日最多更换3台',
      '所有故障盘更换完成且阵列状态正常'
    );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. 每日 Checkin decision.daily_checkins
-- ------------------------------------------------------------

-- 周一 2026-08-04 (reviewed)
WITH mon AS (
  INSERT INTO decision.daily_checkins (
    id, checkin_date, stage_goal, main_contradiction, bottleneck, main_action, deliverable,
    estimated_minutes, stop_condition, explicit_not_do, available_minutes, reserve_percent,
    energy, attention, contradiction_contribution, bottleneck_contribution, evidence_strength,
    risk_level, has_authorization, loss_tolerable, has_recovery_plan, opens_new_core_project,
    active_wip, analysis_status, analysis_snapshot, ruleset_version, lifecycle_status, project_id
  )
  SELECT
    gen_random_uuid(), DATE '2026-08-04',
    '完成B02POD9故障盘更换，恢复阵列冗余',
    '单日最多更换3台的限制与POD9待更换故障盘数量较多、业务恢复时效要求之间的矛盾',
    '现场人力仅1人可用，单日最多更换3台',
    '完成B02POD9内3台RH2288H V3服务器数据盘故障更换',
    '3台换件完成，新盘识别正常，阵列恢复确认',
    480, '当日3台更换完成且阵列状态确认正常',
    '不处理POD10故障盘，不进行数据迁移',
    510, 20, 7, 8, 8, 9, 8,
    'medium', true, true, true, false, 1, 'READY',
    '{"status":"READY","recommendation":"换件流程已明确，风险可控，按计划推进","warnings":[],"triggeredRules":[]}',
    '2026.07.28-mvp1', 'reviewed', p.id
  FROM core.projects p
  WHERE p.title = 'B02资源池数据盘故障修复'
    AND NOT EXISTS (
      SELECT 1 FROM decision.daily_checkins c
      WHERE c.checkin_date = DATE '2026-08-04' AND c.lifecycle_status <> 'cancelled'
    )
  RETURNING id
)
INSERT INTO decision.outcomes (
  id, checkin_id, actual_result, decision_quality, execution_quality,
  environment_impact, variance_source, learning, next_adjustment
)
SELECT
  gen_random_uuid(), id,
  '3台RH2288H V3换件全部完成，新盘识别正常，阵列恢复确认，巡检无新增告警',
  8, 7, 'neutral', 'execution',
  '单台换件实际耗时高于预估，换件前的盘位与序列号确认环节耗时偏长',
  '后续换件任务为换件前盘位确认预留30分钟缓冲时间'
FROM mon;

-- 周二 2026-08-05 (reviewed)
WITH tue AS (
  INSERT INTO decision.daily_checkins (
    id, checkin_date, stage_goal, main_contradiction, bottleneck, main_action, deliverable,
    estimated_minutes, stop_condition, explicit_not_do, available_minutes, reserve_percent,
    energy, attention, contradiction_contribution, bottleneck_contribution, evidence_strength,
    risk_level, has_authorization, loss_tolerable, has_recovery_plan, opens_new_core_project,
    active_wip, analysis_status, analysis_snapshot, ruleset_version, lifecycle_status, project_id
  )
  SELECT
    gen_random_uuid(), DATE '2026-08-05',
    '完成B02POD9剩余故障盘更换，确保阵列重建完成',
    '阵列重建耗时长与当日3台换件任务之间的时间分配矛盾',
    '现场人力仅1人可用，单日最多更换3台',
    '完成B02POD9内3台R4900 G3服务器数据盘故障更换',
    '3台换件完成，阵列重建确认，告警恢复',
    450, '3台更换完成且阵列重建状态正常',
    '不重启未授权业务服务，不处理POD10故障盘',
    480, 15, 8, 8, 8, 9, 8,
    'medium', true, true, true, false, 1, 'READY',
    '{"status":"READY","recommendation":"延续周一换件流程，关注阵列重建耗时","warnings":[],"triggeredRules":[]}',
    '2026.07.28-mvp1', 'reviewed', p.id
  FROM core.projects p
  WHERE p.title = 'B02资源池数据盘故障修复'
    AND NOT EXISTS (
      SELECT 1 FROM decision.daily_checkins c
      WHERE c.checkin_date = DATE '2026-08-05' AND c.lifecycle_status <> 'cancelled'
    )
  RETURNING id
)
INSERT INTO decision.outcomes (
  id, checkin_id, actual_result, decision_quality, execution_quality,
  environment_impact, variance_source, learning, next_adjustment
)
SELECT
  gen_random_uuid(), id,
  '3台R4900 G3换件完成，阵列重建完成，故障告警恢复，无业务影响',
  7, 8, 'neutral', 'planning',
  '当日任务量评估偏乐观，阵列重建等待期间无并行任务安排，时间利用率不高',
  '阵列重建等待期安排巡检或文档整理等并行任务'
FROM tue;

-- 周三 2026-08-06 (reviewed)
WITH wed AS (
  INSERT INTO decision.daily_checkins (
    id, checkin_date, stage_goal, main_contradiction, bottleneck, main_action, deliverable,
    estimated_minutes, stop_condition, explicit_not_do, available_minutes, reserve_percent,
    energy, attention, contradiction_contribution, bottleneck_contribution, evidence_strength,
    risk_level, has_authorization, loss_tolerable, has_recovery_plan, opens_new_core_project,
    active_wip, analysis_status, analysis_snapshot, ruleset_version, lifecycle_status, project_id
  )
  SELECT
    gen_random_uuid(), DATE '2026-08-06',
    '解除B02POD9维护模式并验证业务恢复状态',
    '解除维护后状态验证的完整性与当日时间预算之间的矛盾',
    '现场人力仅1人可用，单日最多更换3台',
    '对B02POD9内5台设备解除维护模式并验证状态',
    '5台全部退出维护，CPU/内存/网络指标正常',
    360, '5台均退出维护且核心指标验证通过',
    '不进行固件升级，不调整业务配置',
    420, 15, 8, 9, 9, 8, 8,
    'low', true, true, true, false, 1, 'READY',
    '{"status":"READY","recommendation":"解除维护模式风险低，验证清单已确认","warnings":[],"triggeredRules":[]}',
    '2026.07.28-mvp1', 'reviewed', p.id
  FROM core.projects p
  WHERE p.title = 'B02资源池数据盘故障修复'
    AND NOT EXISTS (
      SELECT 1 FROM decision.daily_checkins c
      WHERE c.checkin_date = DATE '2026-08-06' AND c.lifecycle_status <> 'cancelled'
    )
  RETURNING id
)
INSERT INTO decision.outcomes (
  id, checkin_id, actual_result, decision_quality, execution_quality,
  environment_impact, variance_source, learning, next_adjustment
)
SELECT
  gen_random_uuid(), id,
  '5台设备全部退出维护，CPU/内存/网络指标均正常，无业务影响',
  8, 8, 'helped', 'environment',
  '维护模式解除流程已跑通，POD10后续可直接复用该流程与检查清单',
  '将解除维护的标准检查清单固化为流程文档'
FROM wed;

-- 周四 2026-08-07 (awaiting_review)
INSERT INTO decision.daily_checkins (
  id, checkin_date, stage_goal, main_contradiction, bottleneck, main_action, deliverable,
  estimated_minutes, stop_condition, explicit_not_do, available_minutes, reserve_percent,
  energy, attention, contradiction_contribution, bottleneck_contribution, evidence_strength,
  risk_level, has_authorization, loss_tolerable, has_recovery_plan, opens_new_core_project,
  active_wip, analysis_status, analysis_snapshot, ruleset_version, lifecycle_status, project_id
)
SELECT
  gen_random_uuid(), DATE '2026-08-07',
  '启动B02POD10故障盘更换，推进项目收尾',
  'POD10剩余故障盘数量与单日3台上限、项目进度压力之间的矛盾',
  '现场人力仅1人可用，单日最多更换3台',
  '完成B02POD10内2台RH2288 V3数据盘更换',
  '2台换件完成运行正常',
  420, '2台更换完成且运行状态正常',
  '不超额更换第3台设备，需保留检修与收尾时间',
  480, 20, 7, 7, 8, 9, 8,
  'medium', true, true, true, false, 1, 'READY',
  '{"status":"READY","recommendation":"POD10换件按既定流程执行，风险可控","warnings":[],"triggeredRules":[]}',
  '2026.07.28-mvp1', 'awaiting_review', p.id
FROM core.projects p
WHERE p.title = 'B02资源池数据盘故障修复'
  AND NOT EXISTS (
    SELECT 1 FROM decision.daily_checkins c
    WHERE c.checkin_date = DATE '2026-08-07' AND c.lifecycle_status <> 'cancelled'
  );

-- 周五 2026-08-08 (executing)
INSERT INTO decision.daily_checkins (
  id, checkin_date, stage_goal, main_contradiction, bottleneck, main_action, deliverable,
  estimated_minutes, stop_condition, explicit_not_do, available_minutes, reserve_percent,
  energy, attention, contradiction_contribution, bottleneck_contribution, evidence_strength,
  risk_level, has_authorization, loss_tolerable, has_recovery_plan, opens_new_core_project,
  active_wip, analysis_status, analysis_snapshot, ruleset_version, lifecycle_status, project_id
)
SELECT
  gen_random_uuid(), DATE '2026-08-08',
  '全量巡检POD9与POD10主机硬件状态，识别遗留风险',
  '巡检覆盖范围与单日时间限制之间的矛盾，需明确巡检重点',
  '现场人力仅1人可用，单日最多更换3台',
  '巡检B02POD9和POD10主机硬件状态',
  '硬件状态检查完成，记录2项需关注风险点',
  300, 'POD9与POD10全部主机巡检完成并输出风险清单',
  '不进行计划外换件，不修改任何配置',
  360, 20, 8, 8, 7, 8, 7,
  'low', true, true, true, false, 1, 'READY',
  '{"status":"READY","recommendation":"巡检任务无高风险操作，按清单执行","warnings":[],"triggeredRules":[]}',
  '2026.07.28-mvp1', 'executing', p.id
FROM core.projects p
WHERE p.title = 'B02资源池数据盘故障修复'
  AND NOT EXISTS (
    SELECT 1 FROM decision.daily_checkins c
    WHERE c.checkin_date = DATE '2026-08-08' AND c.lifecycle_status <> 'cancelled'
  );

-- ------------------------------------------------------------
-- 3. 知识对象 core.knowledge_objects (每Checkin一个, type=decision)
--    状态与对应Checkin的lifecycle_status一致
-- ------------------------------------------------------------
INSERT INTO core.knowledge_objects (id, object_type, title, status, attributes)
SELECT
  gen_random_uuid(), 'decision', dc.main_action, dc.lifecycle_status,
  jsonb_build_object('checkin_date', dc.checkin_date::text)
FROM decision.daily_checkins dc
WHERE dc.project_id = (SELECT id FROM core.projects WHERE title = 'B02资源池数据盘故障修复')
  AND dc.checkin_date BETWEEN DATE '2026-08-04' AND DATE '2026-08-08'
  AND dc.lifecycle_status <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM core.knowledge_objects ko
    WHERE ko.object_type = 'decision' AND ko.status <> 'cancelled'
      AND ko.attributes->>'checkin_date' = dc.checkin_date::text
  );

-- ------------------------------------------------------------
-- 4. 周复盘 decision.weekly_reviews (week_start = 2026-08-04)
--    reviewed=3: 8/4(8,7) 8/5(7,8) 8/6(8,8) -> 均分 7.67
-- ------------------------------------------------------------
INSERT INTO decision.weekly_reviews (
  id, week_start, checkin_count, reviewed_count,
  average_decision_quality, average_execution_quality,
  main_contradiction_status, current_bottleneck, evidence_update,
  portfolio_change, next_breakthrough,
  computed_snapshot, manual_adjustments, reported_snapshot, adjustment_reason
)
SELECT
  gen_random_uuid(), DATE '2026-08-04', 5, 3, 7.67, 7.67,
  'POD9故障盘已全部更换完毕，主要矛盾转向POD10剩余故障盘的处理进度',
  '现场人力仅1人可用，单日最多更换3台',
  '本周完成POD9共6台与POD10共2台故障盘更换，阵列与告警均恢复正常，解除维护后指标验证通过',
  '无新增项目组合调整',
  '下周完成POD10剩余故障盘更换后，验证退出条件：所有故障盘更换完成且阵列状态正常',
  '{"week_start":"2026-08-04","checkin_count":5,"reviewed_count":3,"average_decision_quality":7.67,"average_execution_quality":7.67}',
  '{}',
  '{"week_start":"2026-08-04","checkin_count":5,"reviewed_count":3,"average_decision_quality":7.67,"average_execution_quality":7.67,"summary":"POD9换件与验证闭环完成，POD10已启动，整体进度符合预期"}',
  ''
WHERE NOT EXISTS (SELECT 1 FROM decision.weekly_reviews WHERE week_start = DATE '2026-08-04');

COMMIT;

-- ------------------------------------------------------------
-- 5. 校验输出
-- ------------------------------------------------------------
SELECT 'projects' AS obj, count(*) FROM core.projects WHERE title = 'B02资源池数据盘故障修复'
UNION ALL SELECT 'checkins', count(*) FROM decision.daily_checkins WHERE project_id = (SELECT id FROM core.projects WHERE title = 'B02资源池数据盘故障修复')
UNION ALL SELECT 'outcomes', count(*) FROM decision.outcomes o JOIN decision.daily_checkins c ON c.id = o.checkin_id WHERE c.project_id = (SELECT id FROM core.projects WHERE title = 'B02资源池数据盘故障修复')
UNION ALL SELECT 'knowledge_objects', count(*) FROM core.knowledge_objects ko WHERE ko.attributes->>'checkin_date' BETWEEN '2026-08-04' AND '2026-08-08'
UNION ALL SELECT 'weekly_reviews', count(*) FROM decision.weekly_reviews WHERE week_start = DATE '2026-08-04';
