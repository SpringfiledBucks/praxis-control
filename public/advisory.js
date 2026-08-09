// Advisory page logic.
// Lives in /static/ (external file) because the app's strict CSP
// (script-src 'self'; script-src-attr 'none') blocks inline <script> blocks
// and inline onclick attributes. All interaction is wired via addEventListener
// / event delegation instead.
// The CSRF token is read from <meta name="csrf-token"> emitted by the head partial.
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('advisory-form');
  const statusEl = document.getElementById('submit-status');
  const selectEl = document.getElementById('useCaseSelect');
  const currentCase = document.getElementById('currentCase');
  const textarea = document.querySelector('textarea[name="userInstruction"]');
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content || '';

  const caseLabels = {
    checkin_structure: '日常结构化 — 从项目上下文中提取候选行动',
    weekly_review_draft: '周复盘草稿 — 根据本周记录生成进展摘要',
    evidence_relations: '证据关系 — 分析证据记录之间的关联',
    rule_explanation: '规则解释 — 解释已触发规则的逻辑',
  };

  const statusLabels = { queued: '排队中', running: '运行中', succeeded: '已完成', failed: '失败', pending_user: '待处理', accepted: '已接受', accepted_modified: '已修改', rejected: '已拒绝', expired: '已过期', cancelled: '已取消' };

  function statusClass(s) {
    return { pending_user: 'caution', accepted: 'ready', accepted_modified: 'ready', rejected: 'blocked', failed: 'blocked', running: 'caution' }[s] || '';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function caseLabel(useCase) {
    return escapeHtml(caseLabels[useCase] || useCase);
  }

  const sceneDescriptions = {
    checkin_structure: '<p style="margin:0"><strong>顾问将分析</strong>：项目标题、阶段目标、瓶颈、停止条件 → <strong>输出</strong>：主行动、交付物、停止条件建议，每条含依据和不确定项。适用于"今天该做什么"的结构化。</p>',
    weekly_review_draft: '<p style="margin:0"><strong>顾问将分析</strong>：本周决策记录和上周复盘 → <strong>输出</strong>：进展摘要、偏差归因（决策/执行/环境/随机性）、瓶颈转移、下周建议。不会覆盖你手动修改的报告统计。</p>',
    evidence_relations: '<p style="margin:0"><strong>顾问将分析</strong>：你选中的证据记录 → <strong>输出</strong>：关系类型（支持/矛盾/补充/前置条件）、强度（强 / 弱 / 条件性）、不确定项。</p>',
    rule_explanation: '<p style="margin:0"><strong>顾问将分析</strong>：已触发规则的输入和输出摘要 → <strong>输出</strong>：输入→规则→输出→为什么，不重新评估规则结果。</p>',
  };

  const sceneDesc = document.getElementById('sceneDescription');
  selectEl.addEventListener('change', function () {
    currentCase.innerHTML = '<strong>当前选择：</strong>' + (caseLabels[selectEl.value] || escapeHtml(selectEl.value));
    sceneDesc.innerHTML = sceneDescriptions[selectEl.value] || '';
  });

  textarea.addEventListener('input', function () {
    document.getElementById('charCount').textContent = String(textarea.value.length);
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    statusEl.textContent = '提交中…';
    statusEl.className = 'submit-feedback';
    try {
      const recordIds = form.recordIds.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      const res = await fetch('/api/advisory', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ useCase: form.useCase.value, recordIds: recordIds, userInstruction: form.userInstruction.value || undefined, records: [] }),
      });
      const data = await res.json();
      if (res.ok) {
        statusEl.innerHTML = '✓ 已提交 <code>' + escapeHtml(data.taskId) + '</code>';
        statusEl.className = 'submit-feedback success';
        pollTick(); // immediately refresh and switch to fast polling
      } else {
        statusEl.textContent = '错误: ' + (data.message || res.status);
        statusEl.className = 'submit-feedback error';
      }
    } catch (err) {
      statusEl.textContent = '网络错误，请重试';
      statusEl.className = 'submit-feedback error';
    }
  });

  function copyId(id) {
    navigator.clipboard.writeText(id).then(function () {
      form.recordIds.value = form.recordIds.value ? form.recordIds.value + ', ' + id : id;
      form.recordIds.focus();
    });
  }

  async function showTask(taskId) {
    try {
      const res = await fetch('/api/advisory/' + taskId, { credentials: 'same-origin' });
      const data = await res.json();
      const t = data.task;
      const detail = document.getElementById('task-detail');
      const content = document.getElementById('task-detail-content');
      let html = '<span class="status ' + statusClass(t.status) + '" style="margin-bottom:12px">' + (statusLabels[t.status] || escapeHtml(t.status)) + '</span>'
        + '<h3 style="margin:12px 0 4px">' + caseLabel(t.use_case) + '</h3>'
        + '<small style="color:var(--muted)">' + new Date(t.created_at).toLocaleString('zh-CN') + '</small>';
      if (t.error_code) html += '<p class="warning-box">错误: ' + escapeHtml(t.error_code) + '</p>';
      if (t.output && t.output.suggestions) {
        html += '<div class="detail-list" style="margin-top:16px">' + t.output.suggestions.map(function (s, i) {
          return '<div><dt>建议 ' + (i + 1) + ' · ' + escapeHtml(s.targetField) + ' · <span class="status ' + (s.confidence === 'high' ? 'ready' : s.confidence === 'medium' ? 'caution' : 'blocked') + '">' + ({ high: '高', medium: '中', low: '低' }[s.confidence] || escapeHtml(s.confidence)) + '</span></dt><dd><strong>' + escapeHtml(s.proposedValue) + '</strong></dd><dd style="color:var(--muted);font-size:13px;margin-top:4px">' + escapeHtml(s.rationale) + '</dd>'
            + (s.uncertainties && s.uncertainties.length ? '<dd style="color:var(--amber);font-size:12px;margin-top:4px">不确定: ' + s.uncertainties.map(escapeHtml).join('；') + '</dd>' : '')
            + '</div>';
        }).join('') + '</div>';
      }
      if (t.status === 'pending_user') {
        html += '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">'
          + '<button class="button primary small" data-decide="accepted" data-task-id="' + escapeHtml(t.id) + '">接受全部</button>'
          + '<button class="button secondary small" data-decide="rejected" data-task-id="' + escapeHtml(t.id) + '">拒绝</button>'
          + '</div>';
      }
      content.innerHTML = html;
      detail.style.display = 'block';
      detail.scrollIntoView({ behavior: 'smooth' });
    } catch (err) { console.error(err); }
  }

  async function decide(taskId, decision) {
    const reason = decision === 'rejected' ? prompt('拒绝理由（必填）：') : '用户接受全部建议';
    if (!reason) return;
    try {
      const res = await fetch('/api/advisory/' + taskId + '/decision', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ decision: decision, reason: reason }),
      });
      if (res.ok) { document.getElementById('task-detail').style.display = 'none'; pollTick(); }
      else { const d = await res.json(); alert('失败: ' + (d.message || res.status)); }
    } catch (err) { alert('网络错误'); }
  }

  // Returns poll-state info for the managed poller:
  //   'transient' — at least one queued/running task (poll fast)
  //   'idle'      — no tasks at all (lazy heartbeat)
  //   'final'     — tasks exist but all reached final states (stop)
  //   null        — request failed (keep current cadence)
  async function loadPending() {
    const container = document.getElementById('pending-list');
    try {
      const res = await fetch('/api/advisory/pending', { credentials: 'same-origin' });
      if (!res.ok) { container.innerHTML = '<p style="color:#aebbb4;margin:0">需要登录后才能查看。</p>'; return 'final'; }
      const data = await res.json();
      if (!data.tasks || !data.tasks.length) {
        container.innerHTML = '<p style="color:#aebbb4;margin:0">没有待处理的建议。</p>';
        return 'idle';
      }
      container.innerHTML = data.tasks.map(function (t) {
        const sc = statusClass(t.status);
        const sl = statusLabels[t.status] || escapeHtml(t.status);
        const date = new Date(t.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return '<div class="pending-task" data-task-id="' + escapeHtml(t.id) + '"><div class="pt-header"><span class="status ' + sc + '">' + sl + '</span><small>' + date + '</small></div><strong>' + caseLabel(t.use_case) + '</strong>'
          + (t.error_code ? '<p class="pt-error">错误: ' + escapeHtml(t.error_code) + '</p>' : '')
          + '</div>';
      }).join('');
      return data.tasks.some(function (t) { return isTransient(t.status); }) ? 'transient' : 'final';
    } catch (err) {
      container.innerHTML = '<p style="color:#aebbb4;margin:0">加载失败</p>';
      return null;
    }
  }

  async function loadRecentRecords() {
    const container = document.getElementById('recent-records');
    try {
      const res = await fetch('/api/dashboard', { credentials: 'same-origin' });
      if (!res.ok) { container.innerHTML = '<p class="empty">需要登录后查看。</p>'; return; }
      const data = await res.json();
      let html = '';
      if (data.activeProjects && data.activeProjects.length) {
        html += '<table class="guide-table" style="margin-top:0"><thead><tr><th>类型</th><th>标题</th><th>UUID</th></tr></thead><tbody>';
        data.activeProjects.forEach(function (p) {
          html += '<tr><td><span class="status ready">项目</span></td><td>' + escapeHtml(p.title) + '</td><td><code style="cursor:pointer;font-size:11px" data-copy-id="' + escapeHtml(p.id) + '">' + escapeHtml(p.id).slice(0, 12) + '…</code></td></tr>';
        });
        html += '</tbody></table>';
      }
      if (data.latestCheckin) {
        if (!html) html = '<table class="guide-table" style="margin-top:0"><thead><tr><th>类型</th><th>内容</th><th>UUID</th></tr></thead><tbody>';
        const c = data.latestCheckin;
        html += '<tr><td><span class="status caution">决策</span></td><td>' + escapeHtml((c.main_action || '(空)').slice(0, 60)) + '</td><td><code style="cursor:pointer;font-size:11px" data-copy-id="' + escapeHtml(c.id) + '">' + escapeHtml(c.id).slice(0, 12) + '…</code></td></tr>';
      }
      if (!html) {
        container.innerHTML = '<div class="warning-box"><strong>暂无记录</strong> — 先去<a href="/checkins/new" style="color:var(--green)">今日决策</a>或<a href="/projects" style="color:var(--green)">项目</a>创建记录，再回来使用顾问。</div>';
      } else {
        html += '</tbody></table>';
        container.innerHTML = html;
      }
    } catch (err) {
      container.innerHTML = '<p class="empty">加载失败，请刷新重试</p>';
    }
  }

  // ── Managed auto-refresh poller ──
  // Replaces the old unconditional `setInterval(loadPending, 5000)`:
  //  • 5s while tasks are still in flight (queued / running)
  //  • 30s lazy heartbeat when there are no tasks at all
  //  • stops entirely once every task has reached a final state
  //  • pauses while the page is hidden, resumes with an immediate
  //    refresh when it becomes visible again
  const POLL_ACTIVE_MS = 5000;
  const POLL_IDLE_MS = 30000;

  let pollTimer = null;     // handle of the current setInterval (null = stopped)
  let pollInterval = 0;     // ms of the current interval (0 = stopped)
  let pollActive = false;   // whether the poll loop is currently running
  let pollInFlight = false; // guard against overlapping requests

  function isTransient(status) {
    return status === 'queued' || status === 'running';
  }

  function startPolling(ms) {
    if (pollTimer !== null) {
      if (pollInterval === ms) return; // already on the right cadence
      clearInterval(pollTimer);
    }
    pollInterval = ms;
    pollActive = true;
    pollTimer = setInterval(pollTick, ms);
  }

  function stopPolling() {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
    pollInterval = 0;
    pollActive = false;
  }

  async function pollTick() {
    if (pollInFlight) return;
    if (document.hidden) { stopPolling(); return; }
    pollInFlight = true;
    let state;
    try {
      state = await loadPending(); // also re-renders the list
    } finally {
      pollInFlight = false;
    }
    if (document.hidden) { stopPolling(); return; } // page hidden mid-request
    if (state === 'transient') startPolling(POLL_ACTIVE_MS);
    else if (state === 'idle') startPolling(POLL_IDLE_MS);
    else if (state === 'final') stopPolling();
    // state === null (fetch failed): keep current cadence, retry next tick
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
    } else {
      pollTick(); // immediate refresh, then resume at the right cadence
    }
  });

  // ── Event delegation (inline onclick handlers are blocked by CSP) ──
  document.getElementById('close-task-detail').addEventListener('click', function () {
    document.getElementById('task-detail').style.display = 'none';
  });

  document.getElementById('pending-list').addEventListener('click', function (event) {
    const task = event.target.closest('.pending-task[data-task-id]');
    if (task) showTask(task.dataset.taskId);
  });

  document.getElementById('recent-records').addEventListener('click', function (event) {
    const code = event.target.closest('[data-copy-id]');
    if (code) copyId(code.dataset.copyId);
  });

  document.getElementById('task-detail-content').addEventListener('click', function (event) {
    const button = event.target.closest('[data-decide]');
    if (button) decide(button.dataset.taskId, button.dataset.decide);
  });

  loadRecentRecords();
  pollTick(); // initial load + managed auto-refresh
});
