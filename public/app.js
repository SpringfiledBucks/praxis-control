document.querySelectorAll('input[type="range"]').forEach((input) => {
  const output = document.querySelector(`output[data-for="${input.name}"]`);
  const sync = () => { if (output) output.textContent = input.value; };
  input.addEventListener('input', sync);
  sync();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('Praxis Control service worker registration failed.', error);
    });
  });
}

const riskLevel = document.querySelector('#risk-level');
const riskQuestions = document.querySelector('#risk-questions');
if (riskLevel && riskQuestions) {
  const syncRisk = () => { riskQuestions.hidden = riskLevel.value !== 'high'; };
  riskLevel.addEventListener('change', syncRisk);
  syncRisk();
}

const form = document.querySelector('#daily-form');
const analyzeButton = document.querySelector('#analyze-button');
const preview = document.querySelector('#analysis-preview');
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

function formToObject(formElement) {
  const data = new FormData(formElement);
  const result = Object.fromEntries(data.entries());
  formElement.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    result[input.name] = input.checked;
  });
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

if (form && analyzeButton && preview) {
  analyzeButton.addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    analyzeButton.disabled = true;
    analyzeButton.textContent = '分析中…';
    try {
      const response = await fetch('/api/checkins/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(formToObject(form)),
      });
      const analysis = await response.json();
      if (!response.ok) throw new Error(analysis.message || '分析失败');
      const points = [...analysis.reasons, ...analysis.warnings].map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      preview.classList.remove('muted');
      preview.innerHTML = `
        <span class="status ${analysis.status.toLowerCase()}">${analysis.status}</span>
        <h3>${escapeHtml(analysis.recommendation)}</h3>
        <div class="band-row"><span>收益 ${analysis.benefitBand}</span><span>可行性 ${analysis.feasibilityBand}</span><span>风险 ${analysis.riskBand}</span></div>
        <ul>${points}</ul>`;
    } catch (error) {
      preview.classList.remove('muted');
      preview.innerHTML = `<span class="status blocked">未完成</span><h3>${escapeHtml(error.message)}</h3>`;
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.textContent = '重新分析';
    }
  });
}

const shutdownButton = document.querySelector('#shutdown-button');
if (shutdownButton) {
  shutdownButton.addEventListener('click', async () => {
    if (!window.confirm('确认安全关闭 Praxis Control 服务？')) return;
    shutdownButton.disabled = true;
    try {
      const response = await fetch('/api/system/shutdown', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: shutdownButton.dataset.token }),
      });
      if (!response.ok) throw new Error('关闭请求失败');
      document.body.innerHTML = '<main class="shutdown-page"><p class="eyebrow">Praxis Control</p><h1>服务已安全关闭。</h1><p>数据库连接已释放，可以关闭此页面。下次双击启动入口即可继续。</p></main>';
    } catch (error) {
      window.alert(error.message);
      shutdownButton.disabled = false;
    }
  });
}

const objectTypeLabels = { objective: '目标', project: '项目', action: '行动', decision: '决策', assumption: '假设', evidence: '证据', risk: '风险', rule: '规则' };

const graphCanvas = document.querySelector('#graph-canvas');
if (graphCanvas) {
  fetch('/api/graph')
    .then((response) => response.json())
    .then(({ nodes, edges }) => {
      if (!nodes.length) {
        graphCanvas.textContent = '暂无图谱节点。创建目标、项目或决策后会自动出现在这里。';
        return;
      }
      const width = Math.max(720, graphCanvas.clientWidth || 720);
      const height = 520;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('aria-hidden', 'true');
      const positions = new Map();
      nodes.forEach((node, index) => {
        const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
        const radius = Math.min(width, height) * (nodes.length === 1 ? 0 : 0.34);
        positions.set(node.id, {
          x: width / 2 + Math.cos(angle) * radius,
          y: height / 2 + Math.sin(angle) * radius,
        });
      });
      edges.forEach((edge) => {
        const source = positions.get(edge.source_id);
        const target = positions.get(edge.target_id);
        if (!source || !target) return;
        const midpoint = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const length = Math.hypot(dx, dy) || 1;
        const curve = Math.min(42, length * 0.14);
        const control = {
          x: midpoint.x - (dy / length) * curve,
          y: midpoint.y + (dx / length) * curve,
        };
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`);
        path.setAttribute('class', 'graph-edge');
        svg.append(path);
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', (source.x + 2 * control.x + target.x) / 4);
        label.setAttribute('y', (source.y + 2 * control.y + target.y) / 4 - 7);
        label.setAttribute('class', 'graph-edge-label');
        label.textContent = edge.relation_type;
        svg.append(label);
      });
      nodes.forEach((node) => {
        const position = positions.get(node.id);
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', `graph-node ${node.object_type}`);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', position.x);
        circle.setAttribute('cy', position.y);
        circle.setAttribute('r', '34');
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', position.x);
        label.setAttribute('y', position.y + 54);
        label.textContent = node.title.length > 18 ? `${node.title.slice(0, 18)}…` : node.title;
        const kind = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        kind.setAttribute('x', position.x);
        kind.setAttribute('y', position.y + 4);
        kind.setAttribute('class', 'graph-node-kind');
        kind.textContent = objectTypeLabels[node.object_type] || node.object_type;
        group.append(circle, kind, label);
        svg.append(group);
      });
      graphCanvas.replaceChildren(svg);
    })
    .catch(() => { graphCanvas.textContent = '图谱载入失败，请刷新后重试。'; });
}
