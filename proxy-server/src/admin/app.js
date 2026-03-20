(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    serverAddress: $('serverAddress'),
    themeSelect: $('themeSelect'),
    baseUrl: $('baseUrl'),
    adminToken: $('adminToken'),
    adminOtp: $('adminOtp'),
    connectBtn: $('connectBtn'),
    refreshAllBtn: $('refreshAllBtn'),
    copyAuthBtn: $('copyAuthBtn'),
    connectionStatus: $('connectionStatus'),
    providerGroqApiKey: $('providerGroqApiKey'),
    providerOpenaiApiKey: $('providerOpenaiApiKey'),
    providerAnthropicApiKey: $('providerAnthropicApiKey'),
    providerGroqModel: $('providerGroqModel'),
    providerOpenaiModel: $('providerOpenaiModel'),
    providerAnthropicModel: $('providerAnthropicModel'),
    providerPersistEnv: $('providerPersistEnv'),
    loadProviderConfigBtn: $('loadProviderConfigBtn'),
    saveProviderConfigBtn: $('saveProviderConfigBtn'),
    providerConfigSummary: $('providerConfigSummary'),
    providerConfigStatus: $('providerConfigStatus'),
    loadEnvFileBtn: $('loadEnvFileBtn'),
    copyEnvFileBtn: $('copyEnvFileBtn'),
    envFileMeta: $('envFileMeta'),
    envFileContent: $('envFileContent'),
    envFileStatus: $('envFileStatus'),

    statUsers: $('statUsers'),
    statVerified: $('statVerified'),
    statActive: $('statActive'),
    statRequests: $('statRequests'),
    statPrompt: $('statPrompt'),
    statCompletion: $('statCompletion'),
    statProviders: $('statProviders'),
    statSuppressed: $('statSuppressed'),
    overviewStatus: $('overviewStatus'),

    userSearch: $('userSearch'),
    userFilterActive: $('userFilterActive'),
    userFilterVerified: $('userFilterVerified'),
    loadUsersBtn: $('loadUsersBtn'),
    usersTableBody: $('usersTableBody'),
    usersStatus: $('usersStatus'),
    usersSelectedLabel: $('usersSelectedLabel'),
    usersVerifyEmail: $('usersVerifyEmail'),
    usersTestIntent: $('usersTestIntent'),
    usersTestPrompt: $('usersTestPrompt'),
    usersActionTokensBtn: $('usersActionTokensBtn'),
    usersActionToggleActiveBtn: $('usersActionToggleActiveBtn'),
    usersActionResetUsageBtn: $('usersActionResetUsageBtn'),
    usersActionResendBtn: $('usersActionResendBtn'),
    usersActionTestBtn: $('usersActionTestBtn'),
    usersActionDeleteBtn: $('usersActionDeleteBtn'),

    newUserEmail: $('newUserEmail'),
    newUserName: $('newUserName'),
    newUserId: $('newUserId'),
    newAllowedProviders: $('newAllowedProviders'),
    newPreferredProvider: $('newPreferredProvider'),
    newLockedProvider: $('newLockedProvider'),
    newUserVerified: $('newUserVerified'),
    newUserActive: $('newUserActive'),
    createUserBtn: $('createUserBtn'),
    createUserStatus: $('createUserStatus'),

    selectedUserId: $('selectedUserId'),
    tokenTtlDays: $('tokenTtlDays'),
    addTokenBtn: $('addTokenBtn'),
    reloadTokensBtn: $('reloadTokensBtn'),
    tokensTableBody: $('tokensTableBody'),
    tokensStatus: $('tokensStatus'),

    routingMode: $('routingMode'),
    routingRules: $('routingRules'),
    loadRoutingBtn: $('loadRoutingBtn'),
    sampleRoutingBtn: $('sampleRoutingBtn'),
    saveRoutingBtn: $('saveRoutingBtn'),
    routingStatus: $('routingStatus'),

    selfServiceEmail: $('selfServiceEmail'),
    sendSelfServiceBtn: $('sendSelfServiceBtn'),
    selfServiceStatus: $('selfServiceStatus'),

    activitySearch: $('activitySearch'),
    activityProvider: $('activityProvider'),
    activityStatusFilter: $('activityStatusFilter'),
    activityAutoRefresh: $('activityAutoRefresh'),
    loadActivityBtn: $('loadActivityBtn'),
    exportAuditBtn: $('exportAuditBtn'),
    activityTableBody: $('activityTableBody'),
    activityStatus: $('activityStatus'),

    loadHealthBtn: $('loadHealthBtn'),
    unsuppressAllBtn: $('unsuppressAllBtn'),
    healthTableBody: $('healthTableBody'),
    healthStatus: $('healthStatus'),

    loadUsageBtn: $('loadUsageBtn'),
    usageTableBody: $('usageTableBody'),
    usageStatus: $('usageStatus'),
    testResultModal: $('testResultModal'),
    testResultBadge: $('testResultBadge'),
    testResultTitle: $('testResultTitle'),
    testResultSummary: $('testResultSummary'),
    testResultAttemptsBody: $('testResultAttemptsBody'),
    testResultCloseBtn: $('testResultCloseBtn'),
    testResultOkBtn: $('testResultOkBtn'),
  };

  const state = {
    users: [],
    selectedUser: null,
    health: [],
    activityInterval: null,
    themePreference: 'system',
  };

  const SAMPLE_ROUTING_RULES = [
    { intent: 'code', provider: 'openai', model: 'gpt-4o' },
    { intent: 'long', provider: 'openai', model: 'gpt-4o' },
    { intent: 'translate', provider: 'openai', model: 'gpt-4o-mini' },
    { intent: 'summarize', provider: 'openai', model: 'gpt-4o-mini' },
    { intent: 'vision', provider: 'openai', model: 'gpt-4o' },
    { intent: 'audio', provider: 'groq', model: 'whisper-large-v3' },
    { intent: 'default', provider: 'groq', model: 'llama-3.1-8b-instant' },
  ];

  const INTENT_TEST_PROMPTS = {
    default: 'Say hello in one line.',
    code: 'Write a Python function to reverse a linked list.',
    long: 'Provide a detailed 20-point architecture review for scaling an SSH proxy service.',
    translate: 'Translate this to Hindi: Network maintenance starts at 9 PM.',
    summarize: 'Summarize this update: We deployed a fix, monitored latency, and found no regressions.',
    vision: 'Describe the image content and key objects.',
    audio: 'Transcribe the attached audio and return plain text.',
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function fmtDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  }

  function maskToken(token) {
    if (!token) return '-';
    if (token.length < 12) return token;
    return `${token.slice(0, 6)}…${token.slice(-4)}`;
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setStatus(el, msg, kind = 'info') {
    if (!el) return;
    el.textContent = msg || '';
    const styles = getComputedStyle(document.documentElement);
    const errorColor = styles.getPropertyValue('--status-error').trim() || '#b2183a';
    const successColor = styles.getPropertyValue('--status-success').trim() || '#0f7a4b';
    const infoColor = styles.getPropertyValue('--muted').trim() || '#9fb0d1';
    el.style.color = kind === 'error' ? errorColor : kind === 'success' ? successColor : infoColor;
  }

  function asText(value, fallback = '-') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
  }

  function trimForUi(value, maxLen = 140) {
    const text = asText(value, '');
    if (!text) return '-';
    return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
  }

  function getTestPromptForIntent(intent) {
    const key = String(intent || '').trim().toLowerCase();
    return INTENT_TEST_PROMPTS[key] || INTENT_TEST_PROMPTS.default;
  }

  function updateUsersTestPromptPlaceholder() {
    if (!els.usersTestPrompt) return;
    const intent = (els.usersTestIntent?.value || 'default').trim().toLowerCase();
    const prompt = getTestPromptForIntent(intent);
    els.usersTestPrompt.placeholder = `Default for ${intent}: ${trimForUi(prompt, 96)}`;
  }

  function setTestModalSummaryField(label, value, options = {}) {
    if (!els.testResultSummary) return;
    const item = document.createElement('div');
    item.className = 'test-modal-item';
    const itemLabel = document.createElement('div');
    itemLabel.className = 'test-modal-item-label';
    itemLabel.textContent = label;
    const itemValue = document.createElement('div');
    itemValue.className = `test-modal-item-value${options.mono ? ' mono' : ''}`;
    itemValue.textContent = asText(value, options.fallback || '-');
    item.appendChild(itemLabel);
    item.appendChild(itemValue);
    els.testResultSummary.appendChild(item);
  }

  function normalizeAttemptRows(payload = {}) {
    if (Array.isArray(payload.attempts) && payload.attempts.length > 0) {
      return payload.attempts;
    }
    if (payload.provider || payload.model || payload.status) {
      return [{
        provider: payload.provider || '-',
        model: payload.model || '-',
        status: payload.status || '-',
        latencyMs: payload.latencyMs,
        error: payload.errorMessage || '',
      }];
    }
    return [];
  }

  function closeTestResultModal() {
    if (!els.testResultModal) return;
    els.testResultModal.classList.remove('open');
    els.testResultModal.setAttribute('aria-hidden', 'true');
  }

  function openTestResultModal(payload = {}) {
    if (!els.testResultModal || !els.testResultSummary || !els.testResultAttemptsBody) return;

    const ok = !!payload.ok;
    const title = payload.title || (ok ? 'Provider Test Succeeded' : 'Provider Test Failed');
    const badgeText = ok ? 'Success' : 'Failed';

    if (els.testResultBadge) {
      els.testResultBadge.textContent = badgeText;
      els.testResultBadge.classList.remove('ok', 'bad');
      els.testResultBadge.classList.add(ok ? 'ok' : 'bad');
    }
    if (els.testResultTitle) {
      els.testResultTitle.textContent = title;
    }

    els.testResultSummary.innerHTML = '';
    const attemptRows = normalizeAttemptRows(payload);
    const attemptCount = payload.attemptCount || attemptRows.length || (ok ? 1 : 0);
    const routingBits = [
      payload.routingMode ? `mode=${payload.routingMode}` : null,
      payload.routingReason ? `reason=${payload.routingReason}` : null,
      payload.routingIntent ? `intent=${payload.routingIntent}` : null,
    ].filter(Boolean).join(' | ');

    setTestModalSummaryField('User', payload.userDisplay || payload.userId || '-');
    if (payload.requestedIntent) {
      setTestModalSummaryField('Requested Intent', payload.requestedIntent);
    }
    setTestModalSummaryField('Provider', payload.provider || '-');
    setTestModalSummaryField('Model', payload.model || '-');
    setTestModalSummaryField('HTTP Status', payload.status || '-');
    setTestModalSummaryField('Attempts', attemptCount);
    setTestModalSummaryField('Routing', routingBits || 'n/a', { mono: true });
    if (payload.requestedPrompt) {
      setTestModalSummaryField('Prompt', trimForUi(payload.requestedPrompt, 180), { mono: true });
    }
    if (payload.errorType || payload.errorCode) {
      const errorMeta = [payload.errorType, payload.errorCode].filter(Boolean).join(' / ');
      setTestModalSummaryField('Error Type', errorMeta || '-', { mono: true });
    }
    if (payload.errorMessage) {
      setTestModalSummaryField('Message', payload.errorMessage, { mono: true });
    } else if (payload.snippet) {
      setTestModalSummaryField('Response Snippet', payload.snippet, { mono: true });
    }

    els.testResultAttemptsBody.innerHTML = '';
    if (!attemptRows.length) {
      const row = document.createElement('tr');
      const col = document.createElement('td');
      col.colSpan = 6;
      col.textContent = ok ? 'No fallback attempts recorded.' : 'No attempt details available.';
      row.appendChild(col);
      els.testResultAttemptsBody.appendChild(row);
    } else {
      attemptRows.forEach((attempt, index) => {
        const row = document.createElement('tr');
        const cells = [
          String(index + 1),
          asText(attempt.provider),
          asText(attempt.model),
          asText(attempt.status),
          attempt.latencyMs != null ? `${attempt.latencyMs}ms` : '-',
          asText(attempt.error, '-'),
        ];
        cells.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value;
          row.appendChild(td);
        });
        els.testResultAttemptsBody.appendChild(row);
      });
    }

    els.testResultModal.classList.add('open');
    els.testResultModal.setAttribute('aria-hidden', 'false');
  }

  function parseTestErrorDetails(error) {
    const rawMessage = error?.message || 'Provider test failed';
    const httpMatch = rawMessage.match(/^HTTP\s+(\d+)\s*:\s*([\s\S]+)$/i);
    let status = null;
    let rawBody = '';
    if (httpMatch) {
      status = Number(httpMatch[1]);
      rawBody = httpMatch[2] || '';
    }

    let body = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
    }

    const errorBody = body?.error || {};
    return {
      status: status || errorBody.status || '-',
      errorMessage: errorBody.message || rawMessage,
      errorType: errorBody.type || 'test_failed',
      errorCode: errorBody.code || '',
      provider: body?.provider || '-',
      model: body?.model || '-',
      routingMode: body?.routingMode || null,
      routingReason: body?.routingReason || null,
      routingIntent: body?.routingIntent || null,
      attempts: Array.isArray(body?.attempts) ? body.attempts : [],
      attemptCount: Number.isFinite(body?.attemptCount) ? body.attemptCount : null,
    };
  }

  async function copyTextToClipboard(value) {
    const text = String(value || '').trim();
    if (!text) {
      throw new Error('Nothing to copy');
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    // Fallback for environments where Clipboard API is unavailable.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (!ok) {
      throw new Error('Clipboard unavailable');
    }
  }

  function resolveThemePreference(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    return media?.matches ? 'dark' : 'light';
  }

  function applyTheme(pref, persist = false) {
    state.themePreference = pref || 'system';
    const resolved = resolveThemePreference(state.themePreference);
    document.documentElement.setAttribute('data-theme', resolved);
    if (els.themeSelect) {
      els.themeSelect.value = state.themePreference;
    }
    if (persist) {
      saveConnectionPrefs();
    }
  }

  function getBaseUrl() {
    return (els.baseUrl.value || location.origin).replace(/\/$/, '');
  }

  function getAuthHeader() {
    const token = (els.adminToken.value || '').trim();
    return token ? `Bearer ${token}` : '';
  }

  function getUrlAdminToken() {
    const params = new URLSearchParams(window.location.search || '');
    return (params.get('adminToken') || params.get('token') || '').trim();
  }

  async function api(path, opts = {}) {
    const url = `${getBaseUrl()}/admin/api${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    const auth = getAuthHeader();
    if (auth) headers.Authorization = auth;
    const otp = (els.adminOtp.value || '').trim();
    if (otp) headers['x-admin-otp'] = otp;

    const response = await fetch(url, { ...opts, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function openEndpoint(path, opts = {}) {
    const response = await fetch(`${getBaseUrl()}${path}`, opts);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response.json();
  }

  function saveConnectionPrefs() {
    const payload = {
      baseUrl: els.baseUrl.value || location.origin,
      adminOtp: els.adminOtp.value || '',
      theme: state.themePreference || 'system',
    };
    localStorage.setItem('tlink-proxy-admin', JSON.stringify(payload));
  }

  function loadConnectionPrefs() {
    try {
      const raw = localStorage.getItem('tlink-proxy-admin');
      if (!raw) {
        els.baseUrl.value = location.origin;
        return;
      }
      const cfg = JSON.parse(raw);
      els.baseUrl.value = cfg.baseUrl || location.origin;
      els.adminOtp.value = cfg.adminOtp || '';
      applyTheme(cfg.theme || 'system', false);
    } catch {
      els.baseUrl.value = location.origin;
      applyTheme('system', false);
    }
  }

  async function connect() {
    setStatus(els.connectionStatus, 'Connecting...');
    try {
      const data = await api('/overview');
      setStatus(els.connectionStatus, `Connected at ${nowIso()}`, 'success');
      saveConnectionPrefs();
      renderOverview(data);
      await Promise.allSettled([
        loadUsers(),
        loadActivity(),
        loadHealth(),
        loadUsage(),
        loadRouting(),
        loadProviderConfig(),
        loadEnvFile(),
      ]);
    } catch (error) {
      console.error(error);
      setStatus(els.connectionStatus, error.message, 'error');
    }
  }

  function renderProviderConfigSummary(data) {
    const providers = data?.providers || {};
    const groq = providers.groq || {};
    const openai = providers.openai || {};
    const anthropic = providers.anthropic || {};
    const resolveLoadedKey = (provider) => {
      if (provider?.singleKey) return provider.singleKey;
      if (Array.isArray(provider?.multiKeys) && provider.multiKeys.length > 0) {
        return provider.multiKeys[0];
      }
      return '';
    };

    const summary = [
      `GROQ: ${groq.hasKey ? `${groq.keyCount} key(s)` : 'not configured'}`,
      `OPENAI: ${openai.hasKey ? `${openai.keyCount} key(s)` : 'not configured'}`,
      `ANTHROPIC: ${anthropic.hasKey ? `${anthropic.keyCount} key(s)` : 'not configured'}`,
    ].join(' | ');
    setStatus(els.providerConfigSummary, summary);

    if (els.providerGroqApiKey) els.providerGroqApiKey.value = resolveLoadedKey(groq);
    if (els.providerOpenaiApiKey) els.providerOpenaiApiKey.value = resolveLoadedKey(openai);
    if (els.providerAnthropicApiKey) els.providerAnthropicApiKey.value = resolveLoadedKey(anthropic);
    if (els.providerGroqModel) els.providerGroqModel.value = groq.defaultModel || '';
    if (els.providerOpenaiModel) els.providerOpenaiModel.value = openai.defaultModel || '';
    if (els.providerAnthropicModel) els.providerAnthropicModel.value = anthropic.defaultModel || '';
    if (els.providerPersistEnv && data?.persistence?.defaultEnabled != null) {
      els.providerPersistEnv.checked = !!data.persistence.defaultEnabled;
    }
  }

  async function loadProviderConfig() {
    setStatus(els.providerConfigStatus, 'Loading provider config...');
    try {
      const data = await api('/providers/config?includeSecrets=true');
      renderProviderConfigSummary(data);
      setStatus(els.providerConfigStatus, 'Provider config loaded', 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.providerConfigStatus, error.message, 'error');
    }
  }

  async function saveProviderConfig() {
    setStatus(els.providerConfigStatus, 'Saving provider config...');
    try {
      const body = {
        persist: !!els.providerPersistEnv?.checked,
      };

      const groqKey = (els.providerGroqApiKey?.value || '').trim();
      const openaiKey = (els.providerOpenaiApiKey?.value || '').trim();
      const anthropicKey = (els.providerAnthropicApiKey?.value || '').trim();
      const groqModel = (els.providerGroqModel?.value || '').trim();
      const openaiModel = (els.providerOpenaiModel?.value || '').trim();
      const anthropicModel = (els.providerAnthropicModel?.value || '').trim();

      if (groqKey) body.groqApiKey = groqKey;
      if (openaiKey) body.openaiApiKey = openaiKey;
      if (anthropicKey) body.anthropicApiKey = anthropicKey;
      if (groqModel) body.groqDefaultModel = groqModel;
      if (openaiModel) body.openaiDefaultModel = openaiModel;
      if (anthropicModel) body.anthropicDefaultModel = anthropicModel;

      if (
        !Object.prototype.hasOwnProperty.call(body, 'groqApiKey') &&
        !Object.prototype.hasOwnProperty.call(body, 'openaiApiKey') &&
        !Object.prototype.hasOwnProperty.call(body, 'anthropicApiKey') &&
        !Object.prototype.hasOwnProperty.call(body, 'groqDefaultModel') &&
        !Object.prototype.hasOwnProperty.call(body, 'openaiDefaultModel') &&
        !Object.prototype.hasOwnProperty.call(body, 'anthropicDefaultModel')
      ) {
        setStatus(els.providerConfigStatus, 'Enter at least one key or default model to save', 'error');
        return;
      }

      const result = await api('/providers/config', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (els.providerGroqApiKey) els.providerGroqApiKey.value = '';
      if (els.providerOpenaiApiKey) els.providerOpenaiApiKey.value = '';
      if (els.providerAnthropicApiKey) els.providerAnthropicApiKey.value = '';

      renderProviderConfigSummary(result.config);
      setStatus(
        els.providerConfigStatus,
        `Saved provider config (${result.updatedKeys?.length || 0} fields${result.persisted ? ', persisted' : ''})`,
        'success',
      );
      await Promise.allSettled([loadOverview(), loadHealth()]);
    } catch (error) {
      console.error(error);
      setStatus(els.providerConfigStatus, error.message, 'error');
    }
  }

  function renderEnvFile(data) {
    if (els.envFileContent) {
      els.envFileContent.value = data?.content || '';
    }
    const parts = [];
    if (data?.envFile) parts.push(data.envFile);
    if (Number.isFinite(data?.lineCount)) parts.push(`${data.lineCount} lines`);
    if (Number.isFinite(data?.sizeBytes)) parts.push(`${data.sizeBytes} bytes`);
    if (data?.mtime) parts.push(`updated ${fmtDate(data.mtime)}`);
    setStatus(els.envFileMeta, parts.join(' | '));
  }

  async function loadEnvFile() {
    setStatus(els.envFileStatus, 'Loading .env...');
    try {
      const data = await api('/env-file');
      renderEnvFile(data);
      setStatus(els.envFileStatus, '.env loaded', 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.envFileStatus, error.message, 'error');
    }
  }

  async function copyEnvFile() {
    const content = (els.envFileContent?.value || '').trim();
    if (!content) {
      setStatus(els.envFileStatus, 'Load .env first', 'error');
      return;
    }

    try {
      await copyTextToClipboard(content);
      setStatus(els.envFileStatus, '.env copied to clipboard', 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.envFileStatus, 'Failed to copy .env', 'error');
    }
  }

  function renderOverview(data) {
    if (!data) return;
    setText(els.statUsers, String(data.users?.total ?? '-'));
    setText(els.statVerified, String(data.users?.verified ?? '-'));
    setText(els.statActive, String(data.users?.active ?? '-'));
    setText(els.statRequests, String(data.usage?.totalRequests ?? '-'));
    setText(els.statPrompt, String(data.usage?.totalPromptTokens ?? '-'));
    setText(els.statCompletion, String(data.usage?.totalCompletionTokens ?? '-'));
    setText(els.statProviders, String(data.providers?.tracked ?? data.providers?.configured ?? '-'));
    setText(els.statSuppressed, String(data.providers?.suppressed ?? '-'));

    const latest = data.latestAudit
      ? `Last audit: ${fmtDate(data.latestAudit.timestamp)} user=${data.latestAudit.userId} provider=${data.latestAudit.provider} status=${data.latestAudit.status}`
      : 'No recent activity';
    setStatus(els.overviewStatus, latest);
  }

  function filteredUsers() {
    const search = (els.userSearch.value || '').trim().toLowerCase();
    const activeFilter = els.userFilterActive.value;
    const verifiedFilter = els.userFilterVerified.value;

    return state.users.filter((u) => {
      if (search) {
        const hay = `${u.id || ''} ${u.name || ''} ${u.email || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (activeFilter === 'active' && u.active === false) return false;
      if (activeFilter === 'inactive' && u.active !== false) return false;
      if (verifiedFilter === 'yes' && !u.verified) return false;
      if (verifiedFilter === 'no' && !!u.verified) return false;
      return true;
    });
  }

  function getUserById(userId) {
    if (!userId) return null;
    return state.users.find((u) => u.id === userId) || null;
  }

  function updateUsersActionBar() {
    const selectedUser = getUserById(state.selectedUser);
    const hasSelection = !!selectedUser;

    if (els.usersSelectedLabel) {
      els.usersSelectedLabel.textContent = hasSelection
        ? `Selected: ${selectedUser.name || selectedUser.id}`
        : 'Selected: none';
    }

    const buttons = [
      els.usersActionTokensBtn,
      els.usersActionToggleActiveBtn,
      els.usersActionResetUsageBtn,
      els.usersActionResendBtn,
      els.usersActionTestBtn,
      els.usersActionDeleteBtn,
    ];
    buttons.forEach((btn) => {
      if (btn) btn.disabled = !hasSelection;
    });
    if (els.usersVerifyEmail) {
      els.usersVerifyEmail.disabled = !hasSelection;
    }

    if (els.usersActionToggleActiveBtn) {
      els.usersActionToggleActiveBtn.textContent = hasSelection && selectedUser.active === false
        ? 'Activate'
        : 'Deactivate';
    }
  }

  async function selectUser(userId, options = {}) {
    const loadTokens = options.loadTokens !== false;
    if (!userId) return;

    state.selectedUser = userId;
    if (els.selectedUserId) {
      els.selectedUserId.value = userId;
    }
    const selectedUser = getUserById(userId);
    if (els.usersVerifyEmail) {
      els.usersVerifyEmail.value = selectedUser?.email || '';
    }
    renderUsers();
    updateUsersActionBar();

    if (loadTokens) {
      await loadSelectedUserTokens();
    }
  }

  async function runSelectedUserAction(action) {
    const userId = (state.selectedUser || '').trim();
    if (!userId) {
      setStatus(els.usersStatus, 'Select a user first', 'error');
      return;
    }

    if (action === 'select') {
      await selectUser(userId);
      return;
    }
    await runUserAction(action, userId);
  }

  function renderUsers() {
    const users = filteredUsers();
    els.usersTableBody.innerHTML = '';

    users.forEach((user) => {
      const tr = document.createElement('tr');
      const statusClass = user.active === false ? 'bad' : 'ok';
      const verifiedClass = user.verified ? 'ok' : 'warn';
      if (user?.id) {
        tr.setAttribute('data-user-row-id', user.id);
      }
      if (state.selectedUser && user.id === state.selectedUser) {
        tr.classList.add('row-selected');
      }
      tr.innerHTML = `
        <td>${user.name || user.id || '-'}</td>
        <td>${user.email || '-'}</td>
        <td>${(user.allowedProviders || []).join(', ') || '-'}</td>
        <td><span class="pill ${statusClass}">${user.active === false ? 'inactive' : 'active'}</span></td>
        <td><span class="pill ${verifiedClass}">${user.verified ? 'verified' : 'pending'}</span></td>
        <td>${user.billing?.totalRequests || 0}</td>
        <td>${fmtDate(user.lastUsedAt)}</td>
      `;
      els.usersTableBody.appendChild(tr);
    });

    updateUsersActionBar();
    setStatus(els.usersStatus, `Loaded ${users.length} users (${state.users.length} total)`);
  }

  async function loadUsers() {
    setStatus(els.usersStatus, 'Loading users...');
    try {
      const data = await api('/users?page=1&pageSize=500');
      state.users = data.items || [];
      if (state.selectedUser && !getUserById(state.selectedUser)) {
        state.selectedUser = null;
        if (els.selectedUserId) {
          els.selectedUserId.value = '';
        }
        if (els.usersVerifyEmail) {
          els.usersVerifyEmail.value = '';
        }
        els.tokensTableBody.innerHTML = '';
      }
      renderUsers();
      setStatus(els.usersStatus, `Loaded ${state.users.length} users`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.usersStatus, error.message, 'error');
    }
  }

  async function createUser() {
    setStatus(els.createUserStatus, 'Creating...');
    try {
      const body = {
        email: (els.newUserEmail.value || '').trim() || undefined,
        name: (els.newUserName.value || '').trim() || undefined,
        id: (els.newUserId.value || '').trim() || undefined,
        allowedProviders: (els.newAllowedProviders.value || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferredProvider: (els.newPreferredProvider.value || '').trim() || undefined,
        lockedProvider: (els.newLockedProvider.value || '').trim() || undefined,
        verified: els.newUserVerified.value === 'true',
        active: els.newUserActive.value !== 'false',
      };

      const result = await api('/users', { method: 'POST', body: JSON.stringify(body) });
      setStatus(
        els.createUserStatus,
        `Created user ${result.user?.id || '-'}${result.token ? ` | token: ${result.token}` : ''}`,
        'success',
      );
      await loadUsers();
      await loadOverview();
    } catch (error) {
      console.error(error);
      setStatus(els.createUserStatus, error.message, 'error');
    }
  }

  async function loadSelectedUserTokens() {
    const userId = (state.selectedUser || '').trim();
    if (!userId) {
      els.tokensTableBody.innerHTML = '';
      setStatus(els.tokensStatus, 'Select a user to manage tokens');
      return;
    }

    setStatus(els.tokensStatus, `Loading tokens for ${userId}...`);
    try {
      const data = await api(`/users/${encodeURIComponent(userId)}?includeTokens=true`);
      const user = data.user;
      const tokens = user.tokens || [];
      els.tokensTableBody.innerHTML = '';
      tokens.forEach((t) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono" title="${t.token || ''}">${maskToken(t.token)}</td>
          <td>${fmtDate(t.createdAt)}</td>
          <td>${fmtDate(t.expiresAt)}</td>
          <td>${fmtDate(t.lastUsedAt)}</td>
          <td class="actions">
            <button class="secondary" data-token-copy="${encodeURIComponent(t.token || '')}">Copy</button>
            <button class="bad" data-token-delete="${encodeURIComponent(t.token || '')}">Revoke</button>
          </td>
        `;
        els.tokensTableBody.appendChild(tr);
      });
      setStatus(els.tokensStatus, `Loaded ${tokens.length} tokens`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.tokensStatus, error.message, 'error');
    }
  }

  async function addToken() {
    const userId = (state.selectedUser || '').trim();
    if (!userId) {
      setStatus(els.tokensStatus, 'Select a user first', 'error');
      return;
    }

    setStatus(els.tokensStatus, 'Adding token...');
    try {
      const ttl = Number(els.tokenTtlDays.value);
      const body = Number.isFinite(ttl) && ttl > 0 ? { expiresInDays: ttl } : {};
      const result = await api(`/users/${encodeURIComponent(userId)}/tokens`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const tokenValue = result.token?.token || result.token || '';
      if (tokenValue) {
        try {
          await copyTextToClipboard(tokenValue);
          setStatus(els.tokensStatus, 'Token added and copied to clipboard', 'success');
        } catch (copyError) {
          console.error(copyError);
          setStatus(els.tokensStatus, `Token added: ${tokenValue}`, 'success');
        }
      } else {
        setStatus(els.tokensStatus, 'Token added', 'success');
      }
      await loadSelectedUserTokens();
    } catch (error) {
      console.error(error);
      setStatus(els.tokensStatus, error.message, 'error');
    }
  }

  async function revokeToken(token) {
    const userId = (state.selectedUser || '').trim();
    if (!userId || !token) return;
    if (!confirm('Revoke this token?')) return;

    setStatus(els.tokensStatus, 'Revoking token...');
    try {
      await api(`/users/${encodeURIComponent(userId)}/tokens/${token}`, { method: 'DELETE' });
      setStatus(els.tokensStatus, 'Token revoked', 'success');
      await loadSelectedUserTokens();
    } catch (error) {
      console.error(error);
      setStatus(els.tokensStatus, error.message, 'error');
    }
  }

  async function runUserAction(action, userId) {
    let testContext = null;
    try {
      if (action === 'select') {
        await selectUser(userId);
        return;
      }

      if (action === 'toggle-active') {
        const user = state.users.find((u) => u.id === userId);
        await api(`/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: user?.active === false }),
        });
      } else if (action === 'reset-usage') {
        await api(`/users/${encodeURIComponent(userId)}/reset-usage`, { method: 'POST', body: '{}' });
      } else if (action === 'resend') {
        const userPayload = state.users.find((u) => u.id === userId);
        const requestedEmail = (els.usersVerifyEmail?.value || '').trim();
        const targetEmail = requestedEmail || (userPayload?.email || '').trim();
        if (!targetEmail) {
          setStatus(els.usersStatus, 'Provide verification email for selected user', 'error');
          return;
        }
        setStatus(els.usersStatus, `Sending verification link to ${targetEmail}...`);
        const result = await api(`/users/${encodeURIComponent(userId)}/resend`, {
          method: 'POST',
          body: JSON.stringify({ email: targetEmail }),
        });
        if (els.usersVerifyEmail && result?.user?.email) {
          els.usersVerifyEmail.value = result.user.email;
        }
        if (result?.verificationUrl) {
          try {
            await copyTextToClipboard(result.verificationUrl);
            setStatus(
              els.usersStatus,
              `${result.message || 'Verification link sent'} | link copied to clipboard`,
              'success',
            );
          } catch {
            setStatus(els.usersStatus, `${result.message || 'Verification link sent'} | ${result.verificationUrl}`, 'success');
          }
        } else {
          setStatus(els.usersStatus, result?.message || 'Verification link requested', 'success');
        }
      } else if (action === 'test') {
        const userPayload = state.users.find((u) => u.id === userId);
        const requestedIntent = (els.usersTestIntent?.value || 'default').trim().toLowerCase();
        const customPrompt = (els.usersTestPrompt?.value || '').trim();
        const prompt = customPrompt || getTestPromptForIntent(requestedIntent);
        testContext = { requestedIntent, requestedPrompt: prompt };
        setStatus(els.usersStatus, `Running ${requestedIntent} intent test for ${userPayload?.name || userId}...`);
        const result = await api(`/users/${encodeURIComponent(userId)}/test`, {
          method: 'POST',
          body: JSON.stringify({
            user: userPayload,
            model: 'auto',
            intent: requestedIntent,
            prompt,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        openTestResultModal({
          ok: true,
          title: 'Provider Test Succeeded',
          userId,
          userDisplay: userPayload?.name || userPayload?.email || userId,
          provider: result.provider,
          model: result.model,
          status: result.status,
          latencyMs: result.latencyMs,
          routingMode: result.routingMode,
          routingReason: result.routingReason,
          routingIntent: result.routingIntent,
          snippet: result.snippet,
          attempts: Array.isArray(result.attempts) ? result.attempts : [],
          attemptCount: result.attemptCount,
          requestedIntent,
          requestedPrompt: prompt,
        });
        setStatus(els.usersStatus, `${requestedIntent} intent test succeeded for ${userPayload?.name || userId}`, 'success');
      } else if (action === 'delete') {
        if (!confirm(`Delete user ${userId}? This removes tokens and usage history for this user.`)) return;
        await api(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
        if (state.selectedUser === userId) {
          state.selectedUser = null;
          els.selectedUserId.value = '';
          if (els.usersVerifyEmail) {
            els.usersVerifyEmail.value = '';
          }
          els.tokensTableBody.innerHTML = '';
          updateUsersActionBar();
        }
      }

      await Promise.allSettled([loadUsers(), loadOverview(), loadActivity(), loadUsage()]);
    } catch (error) {
      console.error(error);
      if (action === 'test') {
        const userPayload = state.users.find((u) => u.id === userId);
        const details = parseTestErrorDetails(error);
        openTestResultModal({
          ok: false,
          title: 'Provider Test Failed',
          userId,
          userDisplay: userPayload?.name || userPayload?.email || userId,
          ...testContext,
          ...details,
        });
      }
      setStatus(els.usersStatus, error.message, 'error');
    }
  }

  function renderActivity(rows = []) {
    els.activityTableBody.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDate(r.timestamp)}</td>
        <td>${r.userId || '-'}</td>
        <td>${r.provider || '-'}</td>
        <td>${r.model || '-'}</td>
        <td>${r.status || '-'}</td>
        <td>${r.reason || '-'}</td>
        <td>${r.latencyMs != null ? `${r.latencyMs}ms` : '-'}</td>
        <td title="${r.error || ''}">${r.error || '-'}</td>
      `;
      els.activityTableBody.appendChild(tr);
    });
  }

  async function loadActivity() {
    setStatus(els.activityStatus, 'Loading activity...');
    try {
      const search = encodeURIComponent((els.activitySearch.value || '').trim());
      const provider = encodeURIComponent((els.activityProvider.value || '').trim());
      const status = encodeURIComponent((els.activityStatusFilter.value || '').trim());
      const data = await api(`/activity?page=1&pageSize=40&search=${search}&provider=${provider}&status=${status}`);
      renderActivity(data.items || []);
      const tele = data.telemetry || {};
      setStatus(
        els.activityStatus,
        `Loaded ${data.items?.length || 0} rows | totalRequests=${tele.totalRequests || 0} errors=${tele.errors || 0}`,
        'success',
      );
    } catch (error) {
      console.error(error);
      setStatus(els.activityStatus, error.message, 'error');
    }
  }

  async function exportAuditCsv() {
    try {
      const auth = getAuthHeader();
      const headers = auth ? { Authorization: auth } : {};
      const otp = (els.adminOtp.value || '').trim();
      if (otp) headers['x-admin-otp'] = otp;
      const response = await fetch(`${getBaseUrl()}/admin/api/audit/export?format=csv`, { headers });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proxy-audit-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(els.activityStatus, 'Audit CSV exported', 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.activityStatus, error.message, 'error');
    }
  }

  function healthButton(row) {
    const suppressed = !!row.suppressed;
    const label = suppressed ? 'Unsuppress' : 'Suppress';
    const klass = suppressed ? 'ok' : 'warn';
    return `<button class="${klass}" data-health-provider="${row.provider}" data-health-target="${suppressed ? 'off' : 'on'}">${label}</button>`;
  }

  function renderHealth(rows = []) {
    state.health = rows;
    els.healthTableBody.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      const suppressedLabel = r.suppressed ? `<span class="pill bad">yes</span>` : `<span class="pill ok">no</span>`;
      tr.innerHTML = `
        <td>${r.provider || '-'}</td>
        <td>${fmtDate(r.lastSuccessAt)}</td>
        <td>${fmtDate(r.lastErrorAt)}</td>
        <td>${r.rollingLatencyMs != null ? `${r.rollingLatencyMs}ms` : '-'}</td>
        <td>${suppressedLabel}</td>
        <td>${r.provider ? healthButton(r) : '-'}</td>
      `;
      els.healthTableBody.appendChild(tr);
    });
  }

  async function loadHealth() {
    setStatus(els.healthStatus, 'Loading health...');
    try {
      const data = await api('/providers/health');
      renderHealth(data.items || []);
      setStatus(els.healthStatus, `Loaded ${data.items?.length || 0} providers`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.healthStatus, error.message, 'error');
    }
  }

  async function setProviderSuppressed(provider, suppressed) {
    if (!provider) return;
    try {
      await api(`/providers/health/${encodeURIComponent(provider)}/suppress`, {
        method: 'POST',
        body: JSON.stringify({ suppressed }),
      });
      await Promise.allSettled([loadHealth(), loadOverview()]);
    } catch (error) {
      console.error(error);
      setStatus(els.healthStatus, error.message, 'error');
    }
  }

  async function unsuppressAllProviders() {
    for (const row of state.health) {
      if (row?.provider && row.suppressed) {
        // eslint-disable-next-line no-await-in-loop
        await setProviderSuppressed(row.provider, false);
      }
    }
    await loadHealth();
  }

  function renderUsage(rows = []) {
    els.usageTableBody.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.id || '-'}</td>
        <td>${r.email || '-'}</td>
        <td>${r.totalRequests || 0}</td>
        <td>${r.totalPromptTokens || 0}</td>
        <td>${r.totalCompletionTokens || 0}</td>
        <td>${r.lastProvider || '-'}</td>
        <td>${r.lastModel || '-'}</td>
        <td>${fmtDate(r.updatedAt)}</td>
      `;
      els.usageTableBody.appendChild(tr);
    });
  }

  async function loadUsage() {
    setStatus(els.usageStatus, 'Loading usage...');
    try {
      const data = await api('/usage');
      renderUsage(data.items || []);
      setStatus(els.usageStatus, `Loaded ${data.items?.length || 0} usage rows`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.usageStatus, error.message, 'error');
    }
  }

  async function loadRouting() {
    setStatus(els.routingStatus, 'Loading routing...');
    try {
      const data = await api('/routing');
      els.routingMode.value = data.mode || 'auto';
      els.routingRules.value = JSON.stringify(data.rules || [], null, 2);
      setStatus(els.routingStatus, 'Routing loaded', 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.routingStatus, error.message, 'error');
    }
  }

  async function saveRouting() {
    setStatus(els.routingStatus, 'Saving routing...');
    try {
      const raw = (els.routingRules.value || '').trim();
      const rules = raw ? JSON.parse(raw) : [];
      const body = { mode: els.routingMode.value || 'auto', rules };
      const data = await api('/routing', { method: 'POST', body: JSON.stringify(body) });
      els.routingMode.value = data.mode || 'auto';
      els.routingRules.value = JSON.stringify(data.rules || [], null, 2);
      setStatus(els.routingStatus, 'Routing saved', 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.routingStatus, error.message, 'error');
    }
  }

  function applySampleRouting() {
    els.routingMode.value = 'auto';
    els.routingRules.value = JSON.stringify(SAMPLE_ROUTING_RULES, null, 2);
    setStatus(els.routingStatus, 'Sample routing loaded. Click Save routing to apply.', 'success');
  }

  async function sendSelfServiceLink() {
    const email = (els.selfServiceEmail.value || '').trim();
    if (!email) {
      setStatus(els.selfServiceStatus, 'Email is required', 'error');
      return;
    }
    setStatus(els.selfServiceStatus, 'Requesting self-service link...');

    try {
      const data = await openEndpoint('/v1/self-service/request-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const details = data.verificationUrl ? ` | ${data.verificationUrl}` : '';
      setStatus(els.selfServiceStatus, `${data.message || 'Done'}${details}`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.selfServiceStatus, error.message, 'error');
    }
  }

  async function loadOverview() {
    setStatus(els.overviewStatus, 'Loading overview...');
    try {
      const data = await api('/overview');
      renderOverview(data);
      setStatus(els.overviewStatus, `Updated at ${fmtDate(data.timestamp)}`, 'success');
    } catch (error) {
      console.error(error);
      setStatus(els.overviewStatus, error.message, 'error');
    }
  }

  function configureActivityAutoRefresh() {
    if (state.activityInterval) {
      clearInterval(state.activityInterval);
      state.activityInterval = null;
    }
    const seconds = Number(els.activityAutoRefresh.value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    state.activityInterval = setInterval(() => {
      void loadActivity();
      void loadOverview();
    }, seconds * 1000);
  }

  async function refreshAll() {
    await Promise.allSettled([
      loadOverview(),
      loadUsers(),
      loadActivity(),
      loadHealth(),
      loadUsage(),
      loadRouting(),
      loadProviderConfig(),
      loadEnvFile(),
    ]);
  }

  function bindEvents() {
    els.connectBtn.addEventListener('click', () => void connect());
    els.refreshAllBtn.addEventListener('click', () => void refreshAll());
    els.loadProviderConfigBtn.addEventListener('click', () => void loadProviderConfig());
    els.saveProviderConfigBtn.addEventListener('click', () => void saveProviderConfig());
    els.loadEnvFileBtn.addEventListener('click', () => void loadEnvFile());
    els.copyEnvFileBtn.addEventListener('click', () => void copyEnvFile());

    els.copyAuthBtn.addEventListener('click', async () => {
      const auth = getAuthHeader();
      if (!auth) {
        setStatus(els.connectionStatus, 'Admin token is empty', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(`Authorization: ${auth}`);
        setStatus(els.connectionStatus, 'Authorization header copied', 'success');
      } catch (error) {
        console.error(error);
        setStatus(els.connectionStatus, 'Failed to copy header', 'error');
      }
    });

    els.loadUsersBtn.addEventListener('click', () => void loadUsers());
    els.userSearch.addEventListener('input', renderUsers);
    els.userFilterActive.addEventListener('change', renderUsers);
    els.userFilterVerified.addEventListener('change', renderUsers);
    els.usersTestIntent?.addEventListener('change', updateUsersTestPromptPlaceholder);

    els.usersTableBody.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-user-row-id]');
      if (!row) return;
      const userId = row.getAttribute('data-user-row-id');
      if (!userId) return;
      void selectUser(userId);
    });

    els.usersActionTokensBtn.addEventListener('click', () => void runSelectedUserAction('select'));
    els.usersActionToggleActiveBtn.addEventListener('click', () => void runSelectedUserAction('toggle-active'));
    els.usersActionResetUsageBtn.addEventListener('click', () => void runSelectedUserAction('reset-usage'));
    els.usersActionResendBtn.addEventListener('click', () => void runSelectedUserAction('resend'));
    els.usersActionTestBtn.addEventListener('click', () => void runSelectedUserAction('test'));
    els.usersActionDeleteBtn.addEventListener('click', () => void runSelectedUserAction('delete'));

    els.createUserBtn.addEventListener('click', () => void createUser());
    els.addTokenBtn.addEventListener('click', () => void addToken());
    els.reloadTokensBtn.addEventListener('click', () => void loadSelectedUserTokens());

    els.tokensTableBody.addEventListener('click', (event) => {
      const copyBtn = event.target.closest('button[data-token-copy]');
      if (copyBtn) {
        const encoded = copyBtn.getAttribute('data-token-copy');
        const token = encoded ? decodeURIComponent(encoded) : '';
        if (!token) return;
        void (async () => {
          try {
            await copyTextToClipboard(token);
            setStatus(els.tokensStatus, 'Token copied to clipboard', 'success');
          } catch (error) {
            console.error(error);
            setStatus(els.tokensStatus, 'Failed to copy token', 'error');
          }
        })();
        return;
      }

      const btn = event.target.closest('button[data-token-delete]');
      if (!btn) return;
      const token = btn.getAttribute('data-token-delete');
      if (!token) return;
      void revokeToken(token);
    });

    els.loadRoutingBtn.addEventListener('click', () => void loadRouting());
    els.sampleRoutingBtn.addEventListener('click', applySampleRouting);
    els.saveRoutingBtn.addEventListener('click', () => void saveRouting());

    els.sendSelfServiceBtn.addEventListener('click', () => void sendSelfServiceLink());

    els.themeSelect?.addEventListener('change', () => {
      applyTheme(els.themeSelect.value || 'system', true);
      setStatus(els.connectionStatus, `Theme set to ${els.themeSelect.value || 'system'}`, 'success');
    });

    els.loadActivityBtn.addEventListener('click', () => void loadActivity());
    els.exportAuditBtn.addEventListener('click', () => void exportAuditCsv());
    els.activityAutoRefresh.addEventListener('change', configureActivityAutoRefresh);

    els.loadHealthBtn.addEventListener('click', () => void loadHealth());
    els.unsuppressAllBtn.addEventListener('click', () => void unsuppressAllProviders());
    els.healthTableBody.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-health-provider]');
      if (!btn) return;
      const provider = btn.getAttribute('data-health-provider');
      const target = btn.getAttribute('data-health-target');
      if (!provider || !target) return;
      void setProviderSuppressed(provider, target === 'on');
    });

    els.loadUsageBtn.addEventListener('click', () => void loadUsage());

    els.testResultCloseBtn?.addEventListener('click', closeTestResultModal);
    els.testResultOkBtn?.addEventListener('click', closeTestResultModal);
    els.testResultModal?.addEventListener('click', (event) => {
      if (event.target === els.testResultModal) {
        closeTestResultModal();
      }
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.testResultModal?.classList.contains('open')) {
        closeTestResultModal();
      }
    });
  }

  function init() {
    els.serverAddress.textContent = location.origin;
    loadConnectionPrefs();
    if (!document.documentElement.getAttribute('data-theme')) {
      applyTheme('system', false);
    }
    const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', () => {
      if (state.themePreference === 'system') {
        applyTheme('system', false);
      }
    });
    bindEvents();
    updateUsersTestPromptPlaceholder();
    configureActivityAutoRefresh();
    const urlToken = getUrlAdminToken();
    if (urlToken) {
      els.adminToken.value = urlToken;
      setStatus(els.connectionStatus, 'Admin token loaded from URL. Connecting...', 'success');
      void connect();
      return;
    }
    setStatus(els.connectionStatus, 'Enter admin token and click Connect');
  }

  init();
})();
