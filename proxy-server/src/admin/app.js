(() => {
  const adminTokenEl = document.getElementById('adminToken');
  const adminOtpEl = document.getElementById('adminOtp');
  const baseUrlEl = document.getElementById('baseUrl');
  const statusEl = document.getElementById('status');
  const filterVerifiedEl = document.getElementById('filterVerified');
  const filterActiveEl = document.getElementById('filterActive');
  const filterHasLimitsEl = document.getElementById('filterHasLimits');
  const tableBody = document.querySelector('#usersTable tbody');
  const tokensUserEl = document.getElementById('tokensUser');
  const tokensTableBody = document.querySelector('#tokensTable tbody');
  const tokenStatusEl = document.getElementById('tokenStatus');
  const tokenTtlEl = document.getElementById('tokenTtl');
  const auditTableBody = document.querySelector('#auditTable tbody');
  const auditStatusEl = document.getElementById('auditStatusMsg');
  const auditPageEl = document.getElementById('auditPage');
  const auditPageSizeEl = document.getElementById('auditPageSize');
  const auditReasonEl = document.getElementById('auditReasonFilter');
  const healthTableBody = document.querySelector('#healthTable tbody');
  const healthStatusEl = document.getElementById('healthStatus');
  const usageTableBody = document.querySelector('#usageTable tbody');
  const usageStatusEl = document.getElementById('usageStatus');
  const usagePageEl = document.getElementById('usagePage');
  const usagePageSizeEl = document.getElementById('usagePageSize');
  const polModal = document.getElementById('policiesModal');
  const polUserLabel = document.getElementById('policiesUserLabel');
  const polAllowedModelsEl = document.getElementById('polAllowedModels');
  const polDeniedModelsEl = document.getElementById('polDeniedModels');
  const polAllowedByProviderEl = document.getElementById('polAllowedByProvider');
  const polDeniedByProviderEl = document.getElementById('polDeniedByProvider');
  const polRateLimitEl = document.getElementById('polRateLimit');
  const polRateByProviderEl = document.getElementById('polRateByProvider');
  const polStatusEl = document.getElementById('polStatus');
  const polSaveBtn = document.getElementById('polSaveBtn');
  const polCancelBtn = document.getElementById('polCancelBtn');
  const bulkRateMaxEl = document.getElementById('bulkRateMax');
  const bulkRateWindowEl = document.getElementById('bulkRateWindow');
  const bulkRateByProviderEl = document.getElementById('bulkRateByProvider');
  const bulkQuotaEl = document.getElementById('bulkQuota');
  const bulkStatusEl = document.getElementById('bulkStatus');
  const selfEmailEl = document.getElementById('selfEmail');
  const selfStatusEl = document.getElementById('selfStatus');
  const auditFromEl = document.getElementById('auditFrom');
  const auditToEl = document.getElementById('auditTo');
  const auditPresetTodayBtn = document.getElementById('auditPresetToday');
  const auditPreset7dBtn = document.getElementById('auditPreset7d');
  const auditPresetAllBtn = document.getElementById('auditPresetAll');
  const healthSuppressFailingBtn = document.getElementById('healthSuppressFailing');
  const healthUnsuppressAllBtn = document.getElementById('healthUnsuppressAll');
  const healthActionsStatusEl = document.getElementById('healthActionsStatus');
  const healthFailThresholdEl = document.getElementById('healthFailThreshold');
  const healthErrorMinutesEl = document.getElementById('healthErrorMinutes');
  const healthPageEl = document.getElementById('healthPage');
  const healthPageSizeEl = document.getElementById('healthPageSize');
  const userPageEl = document.getElementById('userPage');
  const userPageSizeEl = document.getElementById('userPageSize');
  const bulkProviderPoliciesEl = document.getElementById('bulkProviderPolicies');
  const usageFromEl = document.getElementById('usageFrom');
  const usageToEl = document.getElementById('usageTo');
  const usagePresetTodayBtn = document.getElementById('usagePresetToday');
  const usagePreset7dBtn = document.getElementById('usagePreset7d');
  const usagePresetAllBtn = document.getElementById('usagePresetAll');
  const suppressButtons = new Map();
  const routingModeEl = document.getElementById('routingMode');
  const routingRulesEl = document.getElementById('routingRules');
  const routingStatusEl = document.getElementById('routingStatus');
  const routingLoadBtn = document.getElementById('routingLoadBtn');
  const routingSaveBtn = document.getElementById('routingSaveBtn');

  let tokensUserId = null;
  let cachedUsers = [];
  let policiesUserId = null;
  let cachedHealth = [];
  let cachedUsage = [];

  const fmtDate = (v) => v ? new Date(v).toLocaleString() : '-';
  const summarizeTokens = (tokens = []) => {
    if (!tokens.length) return '0';
    const expired = tokens.filter(t => t.expired).length;
    const soonest = tokens.map(t => t.expiresAt).filter(Boolean).sort()[0];
    const parts = [`${tokens.length}`];
    if (expired) parts.push(`(${expired} expired)`);
    if (soonest) parts.push(`exp ${new Date(soonest).toLocaleDateString()}`);
    return parts.join(' ');
  };

  function setStatus(msg) { statusEl.textContent = msg; }
  function setCreateStatus(msg) { document.getElementById('createStatus').textContent = msg; }
  function setTokenStatus(msg) { tokenStatusEl.textContent = msg; }
  function setAuditStatus(msg) { auditStatusEl.textContent = msg; }
  function setBulkStatus(msg) { bulkStatusEl.textContent = msg; }
  function setSelfStatus(msg) { selfStatusEl.textContent = msg; }
  function setRoutingStatus(msg) { routingStatusEl.textContent = msg; }

  async function api(path, opts = {}) {
    const base = baseUrlEl.value || `${location.origin}`;
    const url = `${base}/admin/api${path}`;
    const headers = Object.assign({}, opts.headers || {}, {
      'Authorization': `Bearer ${adminTokenEl.value}`,
      'Content-Type': 'application/json'
    });
    if (adminOtpEl.value) headers['x-admin-otp'] = adminOtpEl.value;
    const res = await fetch(url, { ...opts, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function loadUsers() {
    setStatus('Loading...');
    try {
      const search = document.getElementById('search')?.value || '';
      const data = await api(`/users?search=${encodeURIComponent(search)}&page=1&pageSize=500`);
      cachedUsers = data.items || [];
      renderUsers(applyUserFilters(cachedUsers));
      renderStats(applyUserFilters(cachedUsers));
      setStatus(`Loaded ${data.items.length}/${data.total}`);
    } catch (err) {
      console.error(err);
      setStatus('Error loading users');
    }
  }

  function applyUserFilters(users) {
    return (users || []).filter(u => {
      if (filterVerifiedEl.checked && !u.verified) return false;
      if (filterActiveEl.checked && u.active === false) return false;
      if (filterHasLimitsEl.checked) {
        const hasRate = !!u.rateLimit || (u.rateLimitByProvider && Object.keys(u.rateLimitByProvider).length);
        const limits = u.billing?.limits || {};
        const hasQuota = !!limits.maxRequests || !!limits.maxPromptTokens || !!limits.maxCompletionTokens;
        if (!hasRate && !hasQuota) return false;
      }
      return true;
    });
  }

  function paginateUsers(users) {
    const page = Math.max(1, Number(userPageEl?.value || 1));
    const pageSize = Math.max(1, Number(userPageSizeEl?.value || 50));
    const start = (page - 1) * pageSize;
    const slice = users.slice(start, start + pageSize);
    return { page, pageSize, total: users.length, slice };
  }

  function renderUsers(users) {
    const { page, pageSize, total, slice } = paginateUsers(users);
    tableBody.innerHTML = '';
    slice.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.email || '-'}</td>
        <td>${u.name || u.id}</td>
        <td>
          <span class="inline-edit" data-id="${u.id}" data-field="lockedProvider">
            <span class="value">${u.lockedProvider || '-'}</span>
            <button class="icon-btn" data-edit-inline="1" title="Edit">✏️</button>
          </span>
        </td>
        <td><span class="pill ${u.verified ? 'ok' : 'bad'}">${u.verified ? 'yes' : 'no'}</span></td>
        <td>
          <span class="inline-edit" data-id="${u.id}" data-field="allowedProviders">
            <span class="value">${(u.allowedProviders || []).join(', ') || '-'}</span>
            <button class="icon-btn" data-edit-inline="1" title="Edit">✏️</button>
          </span>
        </td>
        <td>
          <span class="inline-edit" data-id="${u.id}" data-field="preferredProvider">
            <span class="value">${u.preferredProvider || '-'}</span>
            <button class="icon-btn" data-edit-inline="1" title="Edit">✏️</button>
          </span>
        </td>
        <td>${fmtDate(u.lastUsedAt)}</td>
        <td>${u.lastProvider || '-'}</td>
        <td>${u.lastModel || '-'}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>${summarizeTokens(u.tokens)}</td>
        <td><span class="pill ${u.active === false ? 'bad' : 'ok'}">${u.active === false ? 'inactive' : 'active'}</span></td>
        <td>${renderLimits(u)}</td>
        <td class="row-actions">
          <select data-action="menu" data-id="${u.id}">
            <option value="">Actions…</option>
            <option value="token">+ token</option>
            <option value="policies">Policies</option>
            <option value="billing">Billing</option>
            <option value="reset-usage">Reset usage</option>
            <option value="deactivate">${u.active === false ? 'Activate' : 'Deactivate'}</option>
            <option value="resend">Resend verify</option>
            <option value="tokens">View tokens</option>
            <option value="test">Test</option>
            <option value="audit">Audit</option>
          </select>
        </td>
      `;
      tableBody.appendChild(tr);
    });
    setStatus(`Users: showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`);
  }

  function renderLimits(u) {
    const pills = [];
    if (u.rateLimit?.max || u.rateLimit?.windowMs) {
      pills.push(`rate:${u.rateLimit.max ?? '?'}@${u.rateLimit.windowMs ? Math.round(u.rateLimit.windowMs/1000)+'s' : '?'}`);
    }
    const rateByProvCount = u.rateLimitByProvider ? Object.keys(u.rateLimitByProvider).length : 0;
    if (rateByProvCount) pills.push(`rate/${rateByProvCount}p`);
    const limits = u.billing?.limits || {};
    if (limits.maxRequests) pills.push(`quota:${limits.maxRequests} req`);
    if (limits.maxPromptTokens) pills.push(`quota:${limits.maxPromptTokens} ptok`);
    if (limits.maxCompletionTokens) pills.push(`quota:${limits.maxCompletionTokens} ctok`);
    return pills.length ? pills.map(p => `<span class="badge-inline"><span class="dot"></span>${p}</span>`).join(' ') : '-';
  }

  function renderStats(users = []) {
    const total = users.length;
    const verified = users.filter(u => u.verified).length;
    const active = users.filter(u => u.active !== false).length;
    const totalRequests = users.reduce((sum, u) => sum + (u.billing?.totalRequests || 0), 0);
    const totalPrompt = users.reduce((sum, u) => sum + (u.billing?.totalPromptTokens || 0), 0);
    const totalCompletion = users.reduce((sum, u) => sum + (u.billing?.totalCompletionTokens || 0), 0);
    document.getElementById('statUsers').textContent = total;
    document.getElementById('statVerified').textContent = `${verified} (${total ? Math.round((verified/total)*100) : 0}%)`;
    document.getElementById('statActive').textContent = `${active} (${total ? Math.round((active/total)*100) : 0}%)`;
    document.getElementById('statRequests').textContent = totalRequests;
    document.getElementById('statPrompt').textContent = totalPrompt;
    document.getElementById('statCompletion').textContent = totalCompletion;
  }

  async function createUser() {
    setCreateStatus('Creating...');
    try {
      const body = {
        email: document.getElementById('newEmail').value || undefined,
        name: document.getElementById('newName').value || undefined,
        allowedProviders: (document.getElementById('newProviders').value || '').split(',').map(s => s.trim()).filter(Boolean),
        allowedModels: (document.getElementById('newModels').value || '').split(',').map(s => s.trim()).filter(Boolean),
        deniedModels: (document.getElementById('newDeniedModels').value || '').split(',').map(s => s.trim()).filter(Boolean),
        preferredProvider: document.getElementById('newPreferred').value || undefined,
        lockedProvider: document.getElementById('newLockedProvider').value || undefined
      };
      const modelsByProviderRaw = document.getElementById('newModelsByProvider').value || '';
      const deniedByProviderRaw = document.getElementById('newDeniedByProvider').value || '';
      const rateByProviderRaw = document.getElementById('newRateByProvider').value || '';
      if (modelsByProviderRaw) {
        try { body.allowedModelsByProvider = JSON.parse(modelsByProviderRaw); } catch (e) { console.error('Invalid allowedModelsByProvider JSON'); }
      }
      if (deniedByProviderRaw) {
        try { body.deniedModelsByProvider = JSON.parse(deniedByProviderRaw); } catch (e) { console.error('Invalid deniedModelsByProvider JSON'); }
      }
      if (rateByProviderRaw) {
        try { body.rateLimitByProvider = JSON.parse(rateByProviderRaw); } catch (e) { console.error('Invalid rateLimitByProvider JSON'); }
      }
      const rateMax = document.getElementById('newRateMax').value;
      const rateWindow = document.getElementById('newRateWindow').value;
      if (rateMax || rateWindow) {
        body.rateLimit = {
          max: rateMax ? Number(rateMax) : undefined,
          windowMs: rateWindow ? Number(rateWindow) : undefined
        };
      }
      const resp = await api('/users', { method: 'POST', body: JSON.stringify(body) });
      const parts = [`Created. Token: ${resp.token || '(hidden)'}`];
      if (resp.verificationUrl) parts.push(`Verify link: ${resp.verificationUrl}`);
      setCreateStatus(parts.join(' • '));
      await loadUsers();
    } catch (err) {
      console.error(err);
      setCreateStatus('Error creating user');
    }
  }

  async function editPolicies(userId) {
    setStatus('Loading user...');
    try {
      const user = await fetchUser(userId);
      policiesUserId = userId;
      polUserLabel.textContent = `User: ${userId}`;
      polAllowedModelsEl.value = (user.allowedModels || []).join(', ');
      polDeniedModelsEl.value = (user.deniedModels || []).join(', ');
      polAllowedByProviderEl.value = JSON.stringify(user.allowedModelsByProvider || {}, null, 2);
      polDeniedByProviderEl.value = JSON.stringify(user.deniedModelsByProvider || {}, null, 2);
      polRateLimitEl.value = user.rateLimit ? JSON.stringify(user.rateLimit, null, 2) : '';
      polRateByProviderEl.value = JSON.stringify(user.rateLimitByProvider || {}, null, 2);
      polStatusEl.textContent = '';
      polModal.classList.remove('hidden');
      setStatus('Ready');
    } catch (err) {
      console.error(err);
      setStatus('Policy load failed');
    }
  }

  async function editBilling(userId) {
    setStatus('Loading billing...');
    try {
      const user = await fetchUser(userId);
      const limits = user.billing?.limits || {};
      const webhookUrl = user.billing?.webhookUrl || '';
      const webhookThreshold = user.billing?.webhookThresholdRequests || '';
      const webhookThresholdPrompt = user.billing?.webhookThresholdPromptTokens || '';
      const webhookThresholdCompletion = user.billing?.webhookThresholdCompletionTokens || '';

      const maxReq = prompt('Max requests (blank for none)', limits.maxRequests ?? '');
      if (maxReq === null) { setStatus('Edit cancelled'); return; }
      const maxPrompt = prompt('Max prompt tokens (blank for none)', limits.maxPromptTokens ?? '');
      if (maxPrompt === null) { setStatus('Edit cancelled'); return; }
      const maxCompletion = prompt('Max completion tokens (blank for none)', limits.maxCompletionTokens ?? '');
      if (maxCompletion === null) { setStatus('Edit cancelled'); return; }
      const hookUrl = prompt('Webhook URL (optional, overrides env)', webhookUrl);
      if (hookUrl === null) { setStatus('Edit cancelled'); return; }
      const hookThresh = prompt('Webhook threshold requests (optional)', webhookThreshold);
      if (hookThresh === null) { setStatus('Edit cancelled'); return; }
      const hookThreshPrompt = prompt('Webhook threshold prompt tokens (optional)', webhookThresholdPrompt);
      if (hookThreshPrompt === null) { setStatus('Edit cancelled'); return; }
      const hookThreshCompletion = prompt('Webhook threshold completion tokens (optional)', webhookThresholdCompletion);
      if (hookThreshCompletion === null) { setStatus('Edit cancelled'); return; }

      const billingLimits = {
        maxRequests: maxReq ? Number(maxReq) : undefined,
        maxPromptTokens: maxPrompt ? Number(maxPrompt) : undefined,
        maxCompletionTokens: maxCompletion ? Number(maxCompletion) : undefined
      };

      await api(`/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          billingLimits,
          billingWebhookUrl: hookUrl || undefined,
          billingWebhookThreshold: hookThresh ? Number(hookThresh) : undefined,
          billingWebhookThresholdPrompt: hookThreshPrompt ? Number(hookThreshPrompt) : undefined,
          billingWebhookThresholdCompletion: hookThreshCompletion ? Number(hookThreshCompletion) : undefined
        })
      });
      setStatus('Billing updated');
      await loadUsers();
    } catch (err) {
      console.error(err);
      setStatus('Billing update failed');
    }
  }

  async function handleAction(e) {
    const btn = e.target.closest('button[data-action]');
    const select = e.target.closest('select[data-action="menu"]');
    if (!btn && !select) return;
    const id = (btn || select).dataset.id;
    const action = btn ? btn.dataset.action : select.value;
    if (!action) return;
    try {
      if (action === 'token') {
        const resp = await api(`/users/${encodeURIComponent(id)}/tokens`, { method: 'POST', body: '{}' });
        alert(`New token for ${id}: ${resp.token}`);
      } else if (action === 'policies') {
        await editPolicies(id);
      } else if (action === 'billing') {
        await editBilling(id);
      } else if (action === 'reset-usage') {
        await resetUsage(id);
      } else if (action === 'deactivate') {
        const makeInactive = btn.textContent.includes('Deactivate');
        await api(`/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active: !makeInactive }) });
      } else if (action === 'resend') {
        const resp = await api(`/users/${encodeURIComponent(id)}/resend`, { method: 'POST', body: '{}' });
        alert(resp.verificationUrl ? `Verification link: ${resp.verificationUrl}` : 'Resend triggered');
      } else if (action === 'tokens') {
        await loadTokens(id);
      } else if (action === 'test') {
        await runTest(id);
      } else if (action === 'audit') {
        document.getElementById('auditSearch').value = id;
        await loadAudit();
        // open filtered audit in new tab
        const base = baseUrlEl.value || `${location.origin}`;
        window.open(`${base}/admin?auditSearch=${encodeURIComponent(id)}`, '_blank');
      }
      await loadUsers();
    } catch (err) {
      console.error(err);
      alert('Action failed');
    }
    if (select) select.value = '';
  }

  async function resetUsage(userId) {
    setStatus('Resetting usage...');
    try {
      await api(`/users/${encodeURIComponent(userId)}/reset-usage`, { method: 'POST', body: '{}' });
      setStatus('Usage reset');
    } catch (err) {
      console.error(err);
      setStatus('Reset failed');
    }
  }

  async function loadTokens(userId) {
    setTokenStatus('Loading tokens...');
    try {
      const data = await api(`/users/${encodeURIComponent(userId)}?includeTokens=1`);
      tokensUserId = userId;
      tokensUserEl.textContent = `${userId}`;
      renderTokens(data.user.tokens || []);
      setTokenStatus(`Loaded ${data.user.tokens?.length || 0}`);
    } catch (err) {
      console.error(err);
      setTokenStatus('Error loading tokens');
    }
  }

  function renderTokens(tokens) {
    tokensTableBody.innerHTML = '';
    (tokens || []).forEach(t => {
      const tr = document.createElement('tr');
      const tokenDisplay = t.token ? `${t.token.slice(0, 6)}…${t.token.slice(-4)}` : '(hidden)';
      const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
      tr.innerHTML = `
        <td>${tokenDisplay}</td>
        <td>${fmtDate(t.createdAt)}</td>
        <td>${t.expiresAt ? fmtDate(t.expiresAt) : '-'}</td>
        <td>${fmtDate(t.lastUsedAt)}</td>
        <td><span class="pill ${expired ? 'bad' : 'ok'}">${expired ? 'expired' : 'active'}</span></td>
        <td class="row-actions">
          <button data-token="${t.token}" data-action="copy-token">Copy</button>
          <button data-token="${t.token}" data-action="revoke-token">Revoke</button>
        </td>
      `;
      tokensTableBody.appendChild(tr);
    });
  }

  async function runTest(userId) {
    try {
      const user = await fetchUser(userId);
      const resp = await api(`/users/${encodeURIComponent(userId)}/test`, {
        method: 'POST',
        body: JSON.stringify({ user })
      });
      alert(`Test OK: provider=${resp.provider} model=${resp.model} status=${resp.status} latency=${resp.latencyMs}ms\n${resp.snippet || ''}`);
    } catch (err) {
      console.error(err);
      alert(`Test failed: ${err.message}`);
    }
  }

  async function fetchUser(userId) {
    const resp = await api(`/users/${encodeURIComponent(userId)}?includeTokens=0`);
    return resp.user;
  }

  async function addToken() {
    if (!tokensUserId) {
      setTokenStatus('Select a user first');
      return;
    }
    setTokenStatus('Adding token...');
    try {
      const ttl = tokenTtlEl.value ? Number(tokenTtlEl.value) : undefined;
      const body = ttl ? { expiresInDays: ttl } : {};
      const resp = await api(`/users/${encodeURIComponent(tokensUserId)}/tokens`, { method: 'POST', body: JSON.stringify(body) });
      setTokenStatus(`New token: ${resp.token}`);
      await loadTokens(tokensUserId);
      await loadUsers();
    } catch (err) {
      console.error(err);
      setTokenStatus('Error adding token');
    }
  }

  tokensTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const token = btn.dataset.token;
    if (!token) return;
    try {
      if (btn.dataset.action === 'copy-token') {
        await navigator.clipboard.writeText(token);
        setTokenStatus('Token copied');
      } else if (btn.dataset.action === 'revoke-token') {
        const ok = confirm('Revoke this token?');
        if (!ok) return;
        await api(`/users/${encodeURIComponent(tokensUserId)}/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
        setTokenStatus('Token revoked');
        await loadTokens(tokensUserId);
        await loadUsers();
      }
    } catch (err) {
      console.error(err);
      setTokenStatus('Token action failed');
    }
  });

  async function loadAudit() {
    setAuditStatus('Loading...');
    try {
      const search = document.getElementById('auditSearch').value || '';
      const provider = document.getElementById('auditProvider').value || '';
      const status = document.getElementById('auditStatusFilter').value || '';
      const reason = auditReasonEl.value || '';
      const page = auditPageEl.value || 1;
      const pageSize = auditPageSizeEl.value || 200;
      const from = auditFromEl.value || '';
      const to = auditToEl.value || '';
      const qs = new URLSearchParams({
        search,
        provider,
        status,
        reason,
        page,
        pageSize,
        from,
        to
      }).toString();
      const data = await api(`/audit?${qs}`, { method: 'GET' });
      renderAudit(data.items || []);
      setAuditStatus(`Loaded ${data.items.length}/${data.total}`);
    } catch (err) {
      console.error(err);
      setAuditStatus('Error loading audit');
    }
  }

  function exportAuditCsv() {
    const rows = Array.from(auditTableBody.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/"/g, '""'))
    );
    if (!rows.length) {
      alert('No audit rows loaded');
      return;
    }
    const header = ['Time', 'User', 'Provider', 'Model', 'Routed', 'Routing reason', 'Status', 'Reason', 'Attempts', 'Latency', 'Error'];
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadHealth() {
    healthStatusEl.textContent = 'Loading...';
    try {
      const data = await api('/providers/health');
      renderHealth(data.items || []);
      healthStatusEl.textContent = `Loaded ${data.items.length}`;
    } catch (err) {
      console.error(err);
      healthStatusEl.textContent = 'Error loading health';
    }
  }

  async function loadUsage() {
    usageStatusEl.textContent = 'Loading...';
    try {
      const data = await api('/usage');
      cachedUsage = data.items || [];
      renderUsage(applyUsageFilters(cachedUsage));
    } catch (err) {
      console.error(err);
      usageStatusEl.textContent = 'Error loading usage';
    }
  }

  async function loadRoutingSettings() {
    try {
      if (!adminTokenEl.value) {
        setRoutingStatus('Add admin token first');
        return;
      }
      setRoutingStatus('Loading...');
      const data = await api('/routing');
      routingModeEl.value = (data.mode || 'auto');
      routingRulesEl.value = JSON.stringify(data.rules || [], null, 2);
      setRoutingStatus('Loaded');
    } catch (err) {
      console.error(err);
      setRoutingStatus('Failed to load');
    }
  }

  async function saveRoutingSettings() {
    try {
      setRoutingStatus('Saving...');
      let rules = [];
      const raw = routingRulesEl.value.trim();
      if (raw) {
        rules = JSON.parse(raw);
        if (!Array.isArray(rules)) throw new Error('Rules must be an array');
      }
      const body = { mode: routingModeEl.value || 'auto', rules };
      const data = await api('/routing', { method: 'POST', body: JSON.stringify(body) });
      routingModeEl.value = data.mode || 'auto';
      routingRulesEl.value = JSON.stringify(data.rules || [], null, 2);
      setRoutingStatus('Saved');
    } catch (err) {
      console.error(err);
      alert(`Failed to save routing: ${err.message}`);
      setRoutingStatus('Error');
    }
  }

  function exportUsageCsv() {
    if (!usageTableBody.querySelector('tr')) {
      alert('No usage rows loaded');
      return;
    }
    const rows = Array.from(usageTableBody.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/"/g, '""'))
    );
    const header = ['User', 'Email', 'Requests', 'Prompt tokens', 'Completion tokens', 'Last provider', 'Last model', 'Updated'];
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function applyUsageFilters(items) {
    const from = usageFromEl?.value ? new Date(usageFromEl.value).getTime() : null;
    const to = usageToEl?.value ? new Date(usageToEl.value).getTime() + 24 * 60 * 60 * 1000 : null;
    return (items || []).filter(r => {
      const ts = r.updatedAt ? new Date(r.updatedAt).getTime() : null;
      if (from && (!ts || ts < from)) return false;
      if (to && (!ts || ts > to)) return false;
      return true;
    });
  }

  function renderUsage(items) {
    const page = Math.max(1, Number(usagePageEl?.value || 1));
    const pageSize = Math.max(1, Number(usagePageSizeEl?.value || 50));
    const start = (page - 1) * pageSize;
    const slice = (items || []).slice(start, start + pageSize);
    usageTableBody.innerHTML = '';
    slice.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.email || '-'}</td>
        <td>${r.totalRequests ?? 0}</td>
        <td>${r.totalPromptTokens ?? 0}</td>
        <td>${r.totalCompletionTokens ?? 0}</td>
        <td>${r.lastProvider || '-'}</td>
        <td>${r.lastModel || '-'}</td>
        <td>${fmtDate(r.updatedAt)}</td>
      `;
      usageTableBody.appendChild(tr);
    });
    usageStatusEl.textContent = `Loaded ${(items || []).length} (showing ${Math.min(start + 1, items.length)}-${Math.min(start + slice.length, items.length)})`;
  }

  function renderHealth(items) {
    cachedHealth = items || [];
    const page = Math.max(1, Number(healthPageEl?.value || 1));
    const pageSize = Math.max(1, Number(healthPageSizeEl?.value || 50));
    const start = (page - 1) * pageSize;
    const slice = cachedHealth.slice(start, start + pageSize);
    healthTableBody.innerHTML = '';
    slice.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.provider}</td>
        <td>${fmtDate(r.lastSuccessAt)}</td>
        <td>${fmtDate(r.lastErrorAt)}</td>
        <td>${r.rollingLatencyMs != null ? r.rollingLatencyMs + ' ms' : '-'}</td>
        <td>${r.successCount || 0}</td>
        <td>${r.failureCount || 0}</td>
        <td>${r.suppressed ? 'yes' : 'no'}</td>
        <td>${r.suppressedUntil ? fmtDate(r.suppressedUntil) : '-'}</td>
        <td>${r.suppressedReason || '-'}</td>
        <td>${r.lastError || '-'}</td>
        <td class="row-actions"><button data-provider="${r.provider}" data-suppressed="${r.suppressed ? '1' : '0'}">${r.suppressed ? 'Unsuppress' : 'Suppress'}</button></td>
      `;
      healthTableBody.appendChild(tr);
    });
    healthTableBody.querySelectorAll('button[data-provider]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.provider;
        const suppressed = btn.dataset.suppressed === '1';
        try {
          await api(`/providers/health/${encodeURIComponent(provider)}/suppress`, {
            method: 'POST',
            body: JSON.stringify({ suppressed: !suppressed })
          });
          await loadHealth();
        } catch (err) {
          console.error(err);
          alert('Failed to update provider suppression');
        }
      });
    });
    healthStatusEl.textContent = `Loaded ${cachedHealth.length} (showing ${Math.min(start + 1, cachedHealth.length)}-${Math.min(start + slice.length, cachedHealth.length)})`;
  }

  async function suppressFailing() {
    if (!cachedHealth.length) return;
    healthActionsStatusEl.textContent = 'Updating...';
    const failThreshold = Math.max(1, Number(healthFailThresholdEl?.value || 1));
    const minutes = Math.max(1, Number(healthErrorMinutesEl?.value || 60));
    const cutoff = Date.now() - minutes * 60 * 1000;
    const failing = cachedHealth.filter(r => {
      const lastErrTs = r.lastErrorAt ? new Date(r.lastErrorAt).getTime() : 0;
      return (r.failureCount || 0) >= failThreshold || (lastErrTs && lastErrTs >= cutoff);
    });
    for (const r of failing) {
      try {
        await api(`/providers/health/${encodeURIComponent(r.provider)}/suppress`, {
          method: 'POST',
          body: JSON.stringify({ suppressed: true, reason: 'auto-failing' })
        });
      } catch (err) {
        console.error('Suppress failed for', r.provider, err);
      }
    }
    healthActionsStatusEl.textContent = 'Done';
    await loadHealth();
  }

  async function unsuppressAll() {
    if (!cachedHealth.length) return;
    healthActionsStatusEl.textContent = 'Updating...';
    for (const r of cachedHealth) {
      if (!r.suppressed) continue;
      try {
        await api(`/providers/health/${encodeURIComponent(r.provider)}/suppress`, {
          method: 'POST',
          body: JSON.stringify({ suppressed: false })
        });
      } catch (err) {
        console.error('Unsuppress failed for', r.provider, err);
      }
    }
    healthActionsStatusEl.textContent = 'Done';
    await loadHealth();
  }

  function renderAudit(items) {
    auditTableBody.innerHTML = '';
    (items || []).forEach(r => {
      const routed = `${r.routedProvider || '-'} / ${r.routedModel || '-'}`;
      const routeReason = r.routingReason || r.routingMode || '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDate(r.timestamp)}</td>
        <td>${r.userId}</td>
        <td>${r.provider}</td>
        <td>${r.model}</td>
        <td>${routed}</td>
        <td>${routeReason}</td>
        <td>${r.status || (r.success ? 'ok' : 'error')}</td>
        <td>${r.reason || r.policyReason || '-'}</td>
        <td>${r.attemptCount || (r.attempts ? r.attempts.length : '')}</td>
        <td>${r.latencyMs != null ? r.latencyMs + ' ms' : '-'}</td>
        <td>${r.error || '-'}</td>
      `;
      auditTableBody.appendChild(tr);
    });
  }

  document.getElementById('loadBtn').addEventListener('click', loadUsers);
  document.getElementById('searchBtn').addEventListener('click', loadUsers);
  filterVerifiedEl.addEventListener('change', () => renderUsers(applyUserFilters(cachedUsers)));
  filterActiveEl.addEventListener('change', () => renderUsers(applyUserFilters(cachedUsers)));
  filterHasLimitsEl.addEventListener('change', () => renderUsers(applyUserFilters(cachedUsers)));
  filterVerifiedEl.addEventListener('change', () => renderStats(applyUserFilters(cachedUsers)));
  filterActiveEl.addEventListener('change', () => renderStats(applyUserFilters(cachedUsers)));
  filterHasLimitsEl.addEventListener('change', () => renderStats(applyUserFilters(cachedUsers)));
  userPageEl?.addEventListener('change', () => renderUsers(applyUserFilters(cachedUsers)));
  userPageSizeEl?.addEventListener('change', () => renderUsers(applyUserFilters(cachedUsers)));
  document.getElementById('createBtn').addEventListener('click', createUser);
  document.getElementById('addTokenBtn').addEventListener('click', addToken);
  document.getElementById('auditLoadBtn').addEventListener('click', loadAudit);
  document.getElementById('auditCsvBtn').addEventListener('click', exportAuditCsv);
  document.getElementById('auditFullBtn').addEventListener('click', async () => {
    try {
      const base = baseUrlEl.value || `${location.origin}`;
      const headers = {
        'Authorization': `Bearer ${adminTokenEl.value}`
      };
      if (adminOtpEl.value) headers['x-admin-otp'] = adminOtpEl.value;
      const res = await fetch(`${base}/admin/api/audit/export?format=csv`, { headers });
      const csv = await res.text();
      if (!res.ok) throw new Error(csv);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-full-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Full export failed');
    }
  });
  document.getElementById('healthLoadBtn').addEventListener('click', loadHealth);
  document.getElementById('usageLoadBtn').addEventListener('click', loadUsage);
  document.getElementById('usageCsvBtn').addEventListener('click', exportUsageCsv);
  routingLoadBtn?.addEventListener('click', loadRoutingSettings);
  routingSaveBtn?.addEventListener('click', saveRoutingSettings);
  healthSuppressFailingBtn.addEventListener('click', suppressFailing);
  healthUnsuppressAllBtn.addEventListener('click', unsuppressAll);
  tableBody.addEventListener('click', handleAction);
  tableBody.addEventListener('change', handleAction);
  tableBody.addEventListener('click', inlineEditHandler);
  document.getElementById('copyAuthBtn').addEventListener('click', async () => {
    try {
      const header = `Authorization: Bearer ${adminTokenEl.value}${adminOtpEl.value ? '\nX-Admin-Otp: ' + adminOtpEl.value : ''}`;
      await navigator.clipboard.writeText(header);
      setStatus('Auth header copied');
    } catch (err) {
      console.error(err);
      setStatus('Copy failed');
    }
  });
  document.querySelectorAll('.pill-btn[data-ttl]').forEach(btn => {
    btn.addEventListener('click', () => {
      tokenTtlEl.value = btn.dataset.ttl;
    });
  });

  // Defaults
  baseUrlEl.value = `${location.origin}`;
  // Preload filters from URL params if provided
  const params = new URLSearchParams(location.search);
  if (params.get('search')) document.getElementById('search').value = params.get('search');
  if (params.get('auditSearch')) document.getElementById('auditSearch').value = params.get('auditSearch');
  if (params.get('auditProvider')) document.getElementById('auditProvider').value = params.get('auditProvider');
  if (params.get('auditStatus')) document.getElementById('auditStatusFilter').value = params.get('auditStatus');
  if (params.get('auditReason')) document.getElementById('auditReasonFilter').value = params.get('auditReason');

  // initial load
  loadUsers();
  loadAudit();
  loadHealth();
  loadUsage();
  loadRoutingSettings();

  polCancelBtn.addEventListener('click', () => {
    polModal.classList.add('hidden');
    policiesUserId = null;
  });

  async function applyBulkLimits() {
    const users = applyUserFilters(cachedUsers);
    if (!users.length) { setBulkStatus('No filtered users'); return; }
    setBulkStatus(`Applying to ${users.length} users...`);
    let rateLimit = null;
    let rateLimitByProvider = {};
    let billingLimits = null;
    const max = bulkRateMaxEl.value ? Number(bulkRateMaxEl.value) : undefined;
    const windowMs = bulkRateWindowEl.value ? Number(bulkRateWindowEl.value) : undefined;
    if (max || windowMs) rateLimit = { max, windowMs };
    if (bulkRateByProviderEl.value) {
      try { rateLimitByProvider = JSON.parse(bulkRateByProviderEl.value); } catch { setBulkStatus('Invalid rateByProvider JSON'); return; }
    }
    if (bulkQuotaEl.value) {
      try { billingLimits = JSON.parse(bulkQuotaEl.value); } catch { setBulkStatus('Invalid quota JSON'); return; }
    }
    for (const u of users) {
      try {
        await api(`/users/${encodeURIComponent(u.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ rateLimit, rateLimitByProvider, billingLimits })
        });
      } catch (err) {
        console.error('Bulk apply failed for', u.id, err);
      }
    }
    setBulkStatus('Bulk apply done');
    await loadUsers();
  }

  document.getElementById('bulkApplyBtn').addEventListener('click', applyBulkLimits);

  async function applyBulkPolicies() {
    const users = applyUserFilters(cachedUsers);
    if (!users.length) { setBulkStatus('No filtered users'); return; }
    let defaults = {};
    try { defaults = bulkProviderPoliciesEl.value ? JSON.parse(bulkProviderPoliciesEl.value) : {}; } catch { setBulkStatus('Invalid provider policies JSON'); return; }
    setBulkStatus(`Applying provider policies to ${users.length} users...`);
    for (const u of users) {
      try {
        await api(`/users/${encodeURIComponent(u.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            allowedModelsByProvider: defaults
          })
        });
      } catch (err) {
        console.error('Bulk policies failed for', u.id, err);
      }
    }
    setBulkStatus('Policy defaults applied');
    await loadUsers();
  }

  document.getElementById('bulkPolicyBtn').addEventListener('click', applyBulkPolicies);

  auditPresetTodayBtn.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    auditFromEl.value = today;
    auditToEl.value = today;
  });
  auditPreset7dBtn.addEventListener('click', () => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    auditFromEl.value = from;
    auditToEl.value = to;
  });
  auditPresetAllBtn.addEventListener('click', () => {
    auditFromEl.value = '';
    auditToEl.value = '';
  });

  usagePresetTodayBtn.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    usageFromEl.value = today;
    usageToEl.value = today;
    renderUsage(applyUsageFilters(cachedUsage));
  });
  usagePreset7dBtn.addEventListener('click', () => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    usageFromEl.value = from;
    usageToEl.value = to;
    renderUsage(applyUsageFilters(cachedUsage));
  });
  usagePresetAllBtn.addEventListener('click', () => {
    usageFromEl.value = '';
    usageToEl.value = '';
    renderUsage(applyUsageFilters(cachedUsage));
  });
  usagePageEl?.addEventListener('change', () => renderUsage(applyUsageFilters(cachedUsage)));
  usagePageSizeEl?.addEventListener('change', () => renderUsage(applyUsageFilters(cachedUsage)));
  healthPageEl?.addEventListener('change', () => renderHealth(cachedHealth));
  healthPageSizeEl?.addEventListener('change', () => renderHealth(cachedHealth));
  routingLoadBtn?.addEventListener('click', loadRoutingSettings);
  routingSaveBtn?.addEventListener('click', saveRoutingSettings);

  async function sendSelfService() {
    const email = (selfEmailEl.value || '').trim();
    if (!email) { setSelfStatus('Email required'); return; }
    setSelfStatus('Sending...');
    try {
      const base = baseUrlEl.value || `${location.origin}`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminTokenEl.value || ''}`
      };
      if (adminOtpEl.value) headers['x-admin-otp'] = adminOtpEl.value;
      const res = await fetch(`${base}/v1/self-service/request-token`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Error');
      setSelfStatus(data.verificationUrl ? `Link: ${data.verificationUrl}` : 'Email sent');
    } catch (err) {
      console.error(err);
      setSelfStatus('Send failed');
    }
  }
  document.getElementById('selfSendBtn').addEventListener('click', sendSelfService);
  polSaveBtn.addEventListener('click', async () => {
    if (!policiesUserId) return;
    polStatusEl.textContent = 'Saving...';
    try {
      const allowedModels = (polAllowedModelsEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
      const deniedModels = (polDeniedModelsEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
      let allowedModelsByProvider = {};
      let deniedModelsByProvider = {};
      let rateLimit = null;
      let rateLimitByProvider = {};
      try { allowedModelsByProvider = polAllowedByProviderEl.value ? JSON.parse(polAllowedByProviderEl.value) : {}; } catch { throw new Error('Invalid allowedByProvider JSON'); }
      try { deniedModelsByProvider = polDeniedByProviderEl.value ? JSON.parse(polDeniedByProviderEl.value) : {}; } catch { throw new Error('Invalid deniedByProvider JSON'); }
      try { rateLimit = polRateLimitEl.value ? JSON.parse(polRateLimitEl.value) : null; } catch { throw new Error('Invalid rateLimit JSON'); }
      try { rateLimitByProvider = polRateByProviderEl.value ? JSON.parse(polRateByProviderEl.value) : {}; } catch { throw new Error('Invalid rateLimitByProvider JSON'); }

      await api(`/users/${encodeURIComponent(policiesUserId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          allowedModels,
          deniedModels,
          allowedModelsByProvider,
          deniedModelsByProvider,
          rateLimit,
          rateLimitByProvider
        })
      });
      polStatusEl.textContent = 'Saved';
      polModal.classList.add('hidden');
      policiesUserId = null;
      await loadUsers();
    } catch (err) {
      console.error(err);
      polStatusEl.textContent = err.message || 'Save failed';
    }
  });

  async function inlineEditHandler(e) {
    const btn = e.target.closest('button[data-edit-inline]');
    if (!btn) return;
    const container = btn.closest('.inline-edit');
    if (!container) return;
    const field = container.dataset.field;
    const userId = container.dataset.id;
    const valueEl = container.querySelector('.value');
    const current = valueEl ? valueEl.textContent.trim() : '';
    // Build inline editor
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current === '-' ? '' : current;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    container.innerHTML = '';
    container.appendChild(input);
    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);

    const reset = () => loadUsers();

    cancelBtn.addEventListener('click', reset);
    saveBtn.addEventListener('click', async () => {
      try {
        const raw = input.value.trim();
        const body = {};
        if (field === 'allowedProviders') {
          body.allowedProviders = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
        } else if (field === 'preferredProvider') {
          body.preferredProvider = raw || null;
        } else if (field === 'lockedProvider') {
          body.lockedProvider = raw || null;
        } else {
          reset();
          return;
        }
        await api(`/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        await loadUsers();
      } catch (err) {
        console.error(err);
        alert('Inline update failed');
        reset();
      }
    });
  }
})();
