(function(){
  const DATA = window.__TRACKME_DATA__;
  const STORAGE_KEY = 'trackme_offline_progress_v1';
  const root = document.getElementById('root');
  const expandedQuestions = new Set();

  const AI_PROVIDERS = {
    claude:     { name: 'Claude',     newChatUrl: 'https://claude.ai/new',             prefillParam: null },
    chatgpt:    { name: 'ChatGPT',    newChatUrl: 'https://chatgpt.com/',              prefillParam: 'q' },
    gemini:     { name: 'Gemini',     newChatUrl: 'https://gemini.google.com/app',     prefillParam: 'q' },
    perplexity: { name: 'Perplexity', newChatUrl: 'https://www.perplexity.ai/',        prefillParam: 'q' },
    grok:       { name: 'Grok',       newChatUrl: 'https://grok.com/',                 prefillParam: 'q' },
  };
  function buildProviderUrl(providerId, promptText){
    const p = AI_PROVIDERS[providerId] || AI_PROVIDERS.claude;
    if(p.prefillParam){
      const url = new URL(p.newChatUrl);
      url.searchParams.set(p.prefillParam, promptText);
      return url.toString();
    }
    return p.newChatUrl;
  }

  // Exact templates extracted from the original app bundle
  function buildTopicPrompt(domain, t){
    return `Teach me this placement topic step by step.\n\nDomain: ${domain}\n\nUnit: ${t.unit}\n\nTopic: ${t.title}\n\nSubtopic / Concepts: ${t.subtopic}\n\nLearning goals: ${t.learningGoal}\n\nInterview questions to cover: ${t.interviewQuestions}\n\nTeach me in this format:\n\n1. Simple explanation\n3. Core concepts in brief\n4. Real-life example\n5. Interview-ready answers\n6. Common mistakes\n7. 5 MCQs with answers\n8. 3 short-answer questions\n9. Final 10-line revision summary\n\nKeep it precise, beginner-friendly, and placement-focused.\nAt the end, test me with questions.`;
  }
  function buildCourseSetupPrompt(domain, topics){
    return `I am preparing for placements.\n\nCourse: ${domain}\n\nThese are my topics:\n\n${topics.map((t,i)=>`${i+1}. [${t.unit}] ${t.title} - ${t.subtopic}`).join('\n')}\n\nYour task:\nOnly set up this course structure for my placement preparation.\n\nImportant rules:\n1. Do NOT start teaching any topic now.\n2. Do NOT explain Topic 1 automatically.\n3. Do NOT give MCQs or answers now.\n4. Just understand the course structure.\n5. After setup, reply only with:\n\n"Setup complete for ${domain}. Tell me which topic number you want to start."\n\nLater, when I send a topic-specific prompt, teach only that topic.`;
  }
  function copyToClipboard(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(showToast, () => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text){
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); showToast(); }catch(e){}
    document.body.removeChild(ta);
  }
  function showToast(){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = 'Copied to clipboard';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 1800);
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        parsed.settings = parsed.settings || { unlockAll:false, aiProvider:'claude' };
        if(!parsed.settings.aiProvider) parsed.settings.aiProvider = 'claude';
        return parsed;
      }
    }catch(e){}
    return { courses:{}, dsa:{}, settings:{ unlockAll:false, aiProvider:'claude' } };
  }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  let state = loadState();

  function getTopicState(courseId, topicId){
    state.courses[courseId] = state.courses[courseId] || {};
    if(!state.courses[courseId][topicId]){
      state.courses[courseId][topicId] = { status:'not_started', revisionCount:0, forRevision:false };
    }
    return state.courses[courseId][topicId];
  }

  function courseProgress(courseId){
    const topics = DATA.courses[courseId] || [];
    const st = state.courses[courseId] || {};
    let completed = 0;
    topics.forEach(t => { if(st[t.id] && st[t.id].status === 'completed') completed++; });
    return { total: topics.length, completed, pct: topics.length ? Math.round(completed/topics.length*100) : 0 };
  }

  function dsaProgress(){
    let total = 0, solved = 0;
    DATA.dsa.forEach(g => {
      g.problems.forEach(p => {
        total++;
        if(state.dsa[p.id]) solved++;
      });
    });
    return { total, solved, pct: total ? Math.round(solved/total*100) : 0, groups: DATA.dsa.length };
  }

  function esc(s){
    return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function navigate(hash){ window.location.hash = hash; }

  function render(){
    const hash = window.location.hash || '#/';
    if(hash === '#/' || hash === ''){
      renderDashboard();
    } else if(hash === '#/dsa'){
      renderDSAOverview();
    } else if(hash.startsWith('#/dsa/')){
      renderDSATopic(decodeURIComponent(hash.replace('#/dsa/','')));
    } else if(hash.startsWith('#/course/')){
      renderCourse(decodeURIComponent(hash.replace('#/course/','')));
    } else {
      renderDashboard();
    }
  }
  function renderAndScroll(){ render(); window.scrollTo(0,0); }

  function topbarHtml(extraButtons){
    return `
      <div class="topbar">
        <div class="brand" onclick="TrackMe.go('#/')" role="button" tabindex="0">
          <div class="logo">&#9889;</div><span>Ignite</span>
        </div>
        <div class="topbar-controls">
          <select class="ai-picker" onchange="TrackMe.setAiProvider(this.value)">
            ${Object.keys(AI_PROVIDERS).map(id => `<option value="${id}" ${state.settings.aiProvider===id?'selected':''}>Learn with: ${AI_PROVIDERS[id].name}</option>`).join('')}
          </select>
          <label class="switch-wrap">
            <span class="switch-label">Unlock all</span>
            <span class="switch">
              <input type="checkbox" ${state.settings.unlockAll ? 'checked' : ''} onchange="TrackMe.toggleUnlockAll()">
              <span class="switch-slider"></span>
            </span>
          </label>
          ${extraButtons || ''}
        </div>
      </div>`;
  }

  function courseCardHtml(c){
    const p = courseProgress(c.id);
    return `
        <div class="course-card" onclick="TrackMe.go('#/course/${c.id}')" role="button" tabindex="0">
          <div class="top-row">
            <h3>${esc(c.name)}</h3>
            <span class="pct-badge">${p.pct}%</span>
          </div>
          <div class="mini-stats">
            <div>Total<br><b>${p.total}</b></div>
            <div>Completed<br><b>${p.completed}</b></div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${p.pct}%"></div></div>
          <span class="back-link">Open Tracker &rarr;</span>
        </div>`;
  }
  function dsaCardHtml(){
    const dp = dsaProgress();
    return `
      <div class="course-card" onclick="TrackMe.go('#/dsa')" role="button" tabindex="0">
        <div class="top-row">
          <h3>DSA</h3>
          <span class="pct-badge">${dp.pct}%</span>
        </div>
        <div class="mini-stats">
          <div>Groups<br><b>${dp.groups}</b></div>
          <div>Solved<br><b>${dp.solved}/${dp.total}</b></div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${dp.pct}%"></div></div>
        <span class="back-link">Open DSA Tracker &rarr;</span>
      </div>`;
  }

  function renderDashboard(){
    // Dashboard card order: Java, Spring Boot, OOPs, DSA, SQL, OS, DBMS, CN, Aptitude, HR
    let cards = '';
    DATA.coursesMeta.forEach(c => {
      cards += courseCardHtml(c);
      if(c.id === 'oops') cards += dsaCardHtml();
    });

    let overallTotal = 0, overallDone = 0;
    const dp = dsaProgress();
    DATA.coursesMeta.forEach(c => { const p = courseProgress(c.id); overallTotal += p.total; overallDone += p.completed; });
    overallTotal += dp.total; overallDone += dp.solved;
    const overallPct = overallTotal ? Math.round(overallDone/overallTotal*100) : 0;

    root.innerHTML = `
      <div class="wrap">
        ${topbarHtml(`
          <button class="btn btn-ghost" onclick="TrackMe.exportBackup()">Export Backup</button>
          <button class="btn btn-danger" onclick="TrackMe.resetAll()">Reset All Progress</button>
        `)}
        <h1>Welcome back</h1>
        <div class="stats-row">
          <div class="stat-card"><div class="label">Courses</div><div class="num">${DATA.coursesMeta.length + 1}</div></div>
          <div class="stat-card"><div class="label">Overall Progress</div><div class="num">${overallPct}%</div></div>
          <div class="stat-card"><div class="label">Topics Completed</div><div class="num">${overallDone}</div></div>
          <div class="stat-card"><div class="label">Total Topics</div><div class="num">${overallTotal}</div></div>
        </div>
        <div class="section-title">Your Courses</div>
        <div class="grid">${cards}</div>
        <div class="footer-note">This is a local, offline copy. Data lives only in this browser's storage (localStorage) &mdash; it is not synced anywhere. Use "Export Backup" from any tracker page to save a JSON copy.</div>
      </div>`;
  }

  function renderCourse(courseId){
    const meta = DATA.coursesMeta.find(c => c.id === courseId);
    const topics = DATA.courses[courseId] || [];
    const p = courseProgress(courseId);

    // determine current step (first not completed)
    let currentIdx = topics.findIndex(t => {
      const ts = state.courses[courseId] && state.courses[courseId][t.id];
      return !ts || ts.status !== 'completed';
    });
    if(currentIdx === -1) currentIdx = topics.length;
    const nextTarget = currentIdx < topics.length ? topics[currentIdx].title : null;

    let lastUnit = null;
    const topicHtml = topics.map((t, idx) => {
      const ts = getTopicState(courseId, t.id);
      const isDone = ts.status === 'completed';
      const isCurrent = idx === currentIdx;
      const isLocked = !state.settings.unlockAll && idx > currentIdx;
      let unitHtml = '';
      if(t.unit !== lastUnit){ unitHtml = `<div class="unit-heading">${esc(t.unit||'')}</div>`; lastUnit = t.unit; }

      const badgeClass = isDone ? 'done' : (isCurrent ? 'current' : 'locked');
      const badgeContent = isDone ? '&check;' : (idx+1);

      let actions = `
        <button class="btn btn-primary btn-sm" onclick="TrackMe.copyPrompt('${courseId}','${t.id}')">Copy Prompt</button>
        <button class="btn btn-blue btn-sm" onclick="TrackMe.learnNow('${courseId}','${t.id}')">Learn Now &rarr;</button>`;
      if(isLocked){
        actions += `<span style="color:var(--muted);font-size:13px;margin-left:8px">Complete the previous topic to unlock this topic.</span>`;
      } else if(isDone){
        actions += `
          <button class="btn btn-green btn-sm" disabled>Completed</button>
          <button class="btn btn-ghost btn-sm" onclick="TrackMe.toggleQuestions('${t.id}')">${expandedQuestions.has(t.id) ? 'Hide Questions' : 'Open Questions'}</button>
          <button class="btn btn-blue btn-sm" onclick="TrackMe.reviseAgain('${courseId}','${t.id}')">Revise Again</button>
          <button class="btn btn-ghost btn-sm" onclick="TrackMe.toggleRevision('${courseId}','${t.id}')">${ts.forRevision ? 'Unmark Revision' : 'Mark for Revision'}</button>
          <button class="btn btn-outline btn-sm" onclick="TrackMe.markIncomplete('${courseId}','${t.id}')">Mark Incomplete</button>`;
      } else {
        actions += `
          <button class="btn btn-green btn-sm" onclick="TrackMe.markComplete('${courseId}','${t.id}')">Mark Complete</button>
          <button class="btn btn-ghost btn-sm" onclick="TrackMe.toggleQuestions('${t.id}')">${expandedQuestions.has(t.id) ? 'Hide Questions' : 'Open Questions'}</button>`;
      }

      const qList = (t.interviewQuestions||'').split('?').map(q=>q.trim()).filter(Boolean).map(q=>q+'?');
      const questionsBox = expandedQuestions.has(t.id) ? `
        <div class="interview-box">
          <div class="iq-title">Interview Questions</div>
          <ol>${qList.map(q=>`<li>${esc(q)}</li>`).join('')}</ol>
        </div>` : '';

      return `
        ${unitHtml}
        <div class="topic-card ${isLocked?'locked':''} ${isDone?'done':''} ${isCurrent?'current':''}">
          <div class="topic-top">
            <div class="step-badge ${badgeClass}">${badgeContent}</div>
            ${isCurrent ? '<span class="pill pill-current">Current Topic</span>' : ''}
            ${ts.forRevision ? '<span class="pill">For Revision</span>' : ''}
            <span class="status-pill ${isDone?'status-completed':'status-notstarted'}">${isDone?'Completed':'Not Started'}</span>
          </div>
          <div class="topic-title">${esc(t.title)}</div>
          ${t.subtopic ? `<div class="topic-field"><b>Concepts:</b> ${esc(t.subtopic)}</div>` : ''}
          ${t.learningGoal ? `<div class="topic-field"><b>Learning goal:</b> ${esc(t.learningGoal)}</div>` : ''}
          <div class="topic-actions">${actions}</div>
          ${questionsBox}
          <div class="topic-meta">
            <span>Revision count: ${ts.revisionCount}</span>
            <span>Topic ${idx+1} of ${topics.length}</span>
          </div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="wrap">
        ${topbarHtml(`<button class="btn btn-primary btn-sm" onclick="TrackMe.copyCourseSetupPrompt('${courseId}')">Copy Course Setup Prompt</button>`)}
        <div class="tracker-header">
          <div class="tt">Course Tracker</div>
          <h1>${esc(meta ? meta.name : courseId)}</h1>
          <div style="color:var(--muted)">Complete topics one by one. Completing a topic unlocks the next.</div>
          <div class="stats-row" style="margin-top:16px">
            <div class="stat-card"><div class="label">Total Topics</div><div class="num">${p.total}</div></div>
            <div class="stat-card"><div class="label">Completed</div><div class="num">${p.completed}</div></div>
            <div class="stat-card"><div class="label">Current Step</div><div class="num">${Math.min(currentIdx+1, p.total)}</div></div>
          </div>
          <div class="progress-bar" style="margin-top:14px"><div class="progress-fill" style="width:${p.pct}%"></div></div>
          ${nextTarget ? `<div class="next-target">Next target: <b>${esc(nextTarget)}</b></div>` : `<div class="next-target">All topics completed &#127881;</div>`}
        </div>
        <div class="section-title">Topic Tracker</div>
        <div class="topic-rail">${topicHtml}</div>
      </div>`;
  }

  function renderDSAOverview(){
    const dp = dsaProgress();
    const cards = DATA.dsa.map(g => {
      const solved = g.problems.filter(p => state.dsa[p.id]).length;
      const pct = g.problems.length ? Math.round(solved/g.problems.length*100) : 0;
      return `
        <div class="course-card" onclick="TrackMe.go('#/dsa/${encodeURIComponent(g.id)}')" role="button" tabindex="0">
          <div class="top-row">
            <h3>${esc(g.name)}</h3>
            <span class="pct-badge">${pct}%</span>
          </div>
          <div style="color:var(--muted);font-size:13px">LeetCode question tracker</div>
          <div class="mini-stats">
            <div>Total Questions<br><b>${g.problems.length}</b></div>
            <div>Completed<br><b>${solved}</b></div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="back-link">Open Questions &rarr;</span>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="wrap">
        ${topbarHtml()}
        <div class="tracker-header">
          <div class="tt">DSA Tracker</div>
          <h1>Data Structures &amp; Algorithms</h1>
          <div style="color:var(--muted)">Select a DSA topic. Each topic contains LeetCode questions that you can complete in sequence.</div>
          <div class="stats-row" style="margin-top:16px">
            <div class="stat-card"><div class="label">Total Questions</div><div class="num">${dp.total}</div></div>
            <div class="stat-card"><div class="label">Completed</div><div class="num">${dp.solved}</div></div>
            <div class="stat-card"><div class="label">Progress</div><div class="num">${dp.pct}%</div></div>
          </div>
        </div>
        <div class="section-title">DSA Topics</div>
        <div class="grid">${cards}</div>
      </div>`;
  }

  function renderDSATopic(groupId){
    const g = DATA.dsa.find(x => x.id === groupId);
    if(!g){ renderDSAOverview(); return; }
    const solved = g.problems.filter(p => state.dsa[p.id]).length;
    const pct = g.problems.length ? Math.round(solved/g.problems.length*100) : 0;

    const rows = g.problems.map((p, idx) => {
      const checked = !!state.dsa[p.id];
      return `
        <div class="problem-row">
          <input type="checkbox" class="checkbox" ${checked?'checked':''} onchange="TrackMe.toggleDsa('${p.id}')">
          <span style="width:26px;color:var(--muted)">${idx+1}.</span>
          <a href="${esc(p.leetcodeLink)}" target="_blank" rel="noopener">${esc(p.title)}</a>
          <span style="color:var(--muted);font-size:12px">${esc(p.pattern||'')}</span>
          <span class="diff diff-${esc(p.difficulty)}">${esc(p.difficulty)}</span>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="wrap">
        ${topbarHtml(`<a class="back-link" onclick="TrackMe.go('#/dsa')">&larr; Back to DSA Topics</a>`)}
        <div class="tracker-header">
          <div class="tt">DSA Topic</div>
          <h1>${esc(g.name)}</h1>
          <div class="stats-row" style="margin-top:16px">
            <div class="stat-card"><div class="label">Total Questions</div><div class="num">${g.problems.length}</div></div>
            <div class="stat-card"><div class="label">Completed</div><div class="num">${solved}</div></div>
            <div class="stat-card"><div class="label">Progress</div><div class="num">${pct}%</div></div>
          </div>
          <div class="progress-bar" style="margin-top:14px"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="dsa-group" style="padding:8px 18px">${rows}</div>
      </div>`;
  }

  window.TrackMe = {
    go(hash){ navigate(hash); },
    copyPrompt(courseId, topicId){
      const meta = DATA.coursesMeta.find(c => c.id === courseId);
      const t = (DATA.courses[courseId]||[]).find(x => x.id === topicId);
      if(!t) return;
      copyToClipboard(buildTopicPrompt(meta ? meta.name : courseId, t));
    },
    copyCourseSetupPrompt(courseId){
      const meta = DATA.coursesMeta.find(c => c.id === courseId);
      const topics = DATA.courses[courseId] || [];
      copyToClipboard(buildCourseSetupPrompt(meta ? meta.name : courseId, topics));
    },
    setAiProvider(providerId){
      state.settings.aiProvider = providerId;
      saveState(); render();
    },
    learnNow(courseId, topicId){
      const meta = DATA.coursesMeta.find(c => c.id === courseId);
      const t = (DATA.courses[courseId]||[]).find(x => x.id === topicId);
      if(!t) return;
      const promptText = buildTopicPrompt(meta ? meta.name : courseId, t);
      const providerId = state.settings.aiProvider || 'claude';
      const provider = AI_PROVIDERS[providerId];
      copyToClipboard(promptText);
      window.open(buildProviderUrl(providerId, promptText), '_blank');
      setTimeout(() => showToast(`Prompt copied. Paste (Ctrl+V) into ${provider.name} and press Enter.`), 300);
    },
    toggleUnlockAll(){
      state.settings.unlockAll = !state.settings.unlockAll;
      saveState(); render();
    },
    toggleQuestions(topicId){
      if(expandedQuestions.has(topicId)) expandedQuestions.delete(topicId);
      else expandedQuestions.add(topicId);
      render();
    },
    markComplete(courseId, topicId){
      const ts = getTopicState(courseId, topicId);
      ts.status = 'completed';
      saveState(); render();
    },
    markIncomplete(courseId, topicId){
      const ts = getTopicState(courseId, topicId);
      ts.status = 'not_started';
      saveState(); render();
    },
    reviseAgain(courseId, topicId){
      const ts = getTopicState(courseId, topicId);
      ts.revisionCount = (ts.revisionCount||0) + 1;
      saveState(); render();
    },
    toggleRevision(courseId, topicId){
      const ts = getTopicState(courseId, topicId);
      ts.forRevision = !ts.forRevision;
      saveState(); render();
    },
    toggleDsa(problemId){
      state.dsa[problemId] = !state.dsa[problemId];
      saveState(); render();
    },
    resetAll(){
      if(confirm('This will erase ALL local progress. This cannot be undone. Continue?')){
        state = { courses:{}, dsa:{}, settings: state.settings };
        saveState(); render();
      }
    },
    exportBackup(){
      const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ignite-backup.json';
      a.click();
    }
  };

  window.addEventListener('hashchange', renderAndScroll);
  renderAndScroll();
})();
