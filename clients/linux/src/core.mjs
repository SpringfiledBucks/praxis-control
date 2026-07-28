export const SUPPORTED_API_VERSION = 1;

export function resolveRuntimeStatePath(environment, homeDirectory) {
  const base = environment.XDG_RUNTIME_DIR?.trim()
    || environment.XDG_STATE_HOME?.trim()
    || `${homeDirectory}/.local/state`;
  return `${base.replace(/\/$/, '')}/praxis-control/service.json`;
}

export function assertCompatibleMeta(meta) {
  if (!meta || meta.apiVersion !== SUPPORTED_API_VERSION) {
    const actual = meta?.apiVersion ?? '未知';
    throw new Error(`服务 API 版本为 ${actual}，客户端仅支持 ${SUPPORTED_API_VERSION}。请升级客户端或服务。`);
  }
  return meta;
}

export function createDashboardViewModel(dashboard, graph) {
  const latest = dashboard?.latestCheckin;
  return {
    activeWip: `${dashboard?.activeWip ?? 0} / 3`,
    awaitingReview: String(dashboard?.awaitingReview ?? 0),
    reviewedLast7Days: String(dashboard?.reviewedLast7Days ?? 0),
    graphSummary: `${graph?.nodes?.length ?? 0} 点 · ${graph?.edges?.length ?? 0} 边`,
    latestAction: latest?.main_action || '尚无日常决策记录',
  };
}
