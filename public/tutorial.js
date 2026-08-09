(function () {
  const steps = [
    {
      title: '看懂仪表盘',
      body: '<p>每次登录首先看到今日工作台。三大核心指标：</p>' +
        '<div class="step-illustration"><strong>核心在制品（≤3）</strong>——同时推进的项目不超过3个，超了就先把旧的暂停。<br>' +
        '<strong>待结果复盘</strong>——做了决定要回头看结果，好决策和好运气分开看。<br>' +
        '<strong>近7日已闭环</strong>——实践才是检验，不堆积不遗忘。</div>' +
        '<p>点「开始今日决策」进入下一步——实际上手比看教程快。</p>',
    },
    {
      title: '填写真实状态',
      body: '<p>日期自动填今天，可用时间填<strong>真正能自由支配的分钟数</strong>，不要填理想值。</p>' +
        '<div class="step-illustration">安全储备建议20%——今天不确定性高就调到30%-40%；稳定重复任务可以降到10%。<br>' +
        '精力/注意力用滑块打分：<strong>0-3 低、4-6 正常、7-8 好、9-10 亢奋</strong>。直觉选，别纠结。</div>' +
        '<p>这些数字不是为了考核，而是让未来的你能回忆起"当时状态好不好"。</p>',
    },
    {
      title: '定位关键问题',
      body: '<p>三个字段，想不清也可以先填"暂不明确"：</p>' +
        '<div class="step-illustration"><strong>阶段目标</strong>——这个阶段要达成什么？<br>' +
        '<strong>主要矛盾</strong>——什么和什么在冲突？例：故障持续出现 vs 运维人力不足。<br>' +
        '<strong>瓶颈</strong>——只改善一个环节就能带动全局？例：单日最多处理3台。</div>' +
        '<p>系统不强求你写出完美答案。重点是让决策依据显性化。</p>',
    },
    {
      title: '缩小到一件事',
      body: '<p>今天只推进<strong>一件</strong>。分四部分定义：</p>' +
        '<div class="step-illustration"><strong>具体动作+对象</strong>——例：完成B02POD9内3台RH2288H V3数据盘更换<br>' +
        '<strong>可观察交付物</strong>——做完后外部能看到什么？<br>' +
        '<strong>停止条件</strong>——出现什么情况就停、缩小或改为调查？<br>' +
        '<strong>明确不做</strong>——防止范围膨胀。</div>' +
        '<p>关联已有项目后，这条决策会自动进入关系图谱。</p>',
    },
    {
      title: '独立评分',
      body: '<p>三个分数<strong>各自独立</strong>，不需要凑固定总分。可以同时是8、8、8，也可以是2、7、4：</p>' +
        '<div class="step-illustration"><strong>主要矛盾贡献</strong>——这件事缩小的差距有多大？0-2几乎无关，7-8能直接说明因果路径。<br>' +
        '<strong>瓶颈贡献</strong>——是否释放当前最阻塞的环节？绕过瓶颈做非瓶颈工作应打低分。<br>' +
        '<strong>证据强度</strong>——支持这个判断的事实有多可靠？想法或单次观察约2-4，可复现数据约7-9。</div>' +
        '<p>高分必须有一句可以说出口的依据。</p>',
    },
    {
      title: '执行后复盘',
      body: '<p>完整闭环：</p>' +
        '<div class="step-illustration"><strong>1. 点"分析当前行动"</strong>→ 系统检查硬门槛、WIP容量 → 输出 READY/CAUTION/BLOCKED<br>' +
        '<strong>2. 保存</strong>→ 记录输入、规则版本、分析快照和审计事件<br>' +
        '<strong>3. 执行</strong>→ 推进状态到"执行中"<br>' +
        '<strong>4. 记结果</strong>→ 推进到"待复盘"，分别给决策过程质量和执行质量打分<br>' +
        '<strong>5. 周复盘</strong>→ 每周汇总，区分计算值与人工调整</div>' +
        '<p><strong>核心原则</strong>：坏结果不等于坏决策，好结果也不等于好决策。分开看计划、执行、环境和随机性哪部分造成了偏差。</p>',
    },
  ];

  let currentStep = 0;

  const panel = document.getElementById('tutorial-panel');
  const overlay = document.getElementById('tutorial-overlay');
  const body = document.getElementById('tutorial-body');
  const counter = document.getElementById('tutorial-counter');
  const prevBtn = document.getElementById('tutorial-prev');
  const nextBtn = document.getElementById('tutorial-next');

  function render() {
    const s = steps[currentStep];
    body.innerHTML = '<h3>' + s.title + '</h3>' + s.body;
    counter.textContent = '第 ' + (currentStep + 1) + '/' + steps.length + ' 步';
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : '';
    if (currentStep === steps.length - 1) {
      nextBtn.textContent = '✓ 完成';
      nextBtn.className = 'button small primary';
    } else {
      nextBtn.textContent = '下一步 →';
      nextBtn.className = 'button small primary';
    }
  }

  function open() {
    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
    currentStep = 0;
    render();
  }

  function close() {
    panel.classList.add('hidden');
    overlay.classList.add('hidden');
  }

  function next() {
    if (currentStep < steps.length - 1) { currentStep++; render(); }
    else close();
  }

  function prev() {
    if (currentStep > 0) { currentStep--; render(); }
  }

  document.getElementById('tutorial-trigger').addEventListener('click', function(e){ e.preventDefault(); open(); });
  document.getElementById('tutorial-close').addEventListener('click', function(e){ e.preventDefault(); close(); });
  overlay.addEventListener('click', function(e){ e.preventDefault(); close(); });
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);

  document.addEventListener('keydown', function (e) {
    if (panel.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  });
})();
