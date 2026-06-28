/**
 * Raiba Panel — Bank transactions for Home Assistant
 * Custom panel element: <raiba-panel>
 */

const ACCOUNTS = [
  { tab: 0, label: "Alle Umsätze", konto: null, icon: "mdi:format-list-bulleted" },
  { tab: 1, label: "Rileg", konto: "1026704", icon: "mdi:bank" },
  { tab: 2, label: "Dkb", konto: "1009491828", icon: "mdi:bank-outline" },
  { tab: 3, label: "Strasslach", konto: "1055437", icon: "mdi:home-city" },
  { tab: 4, label: "DKB TG", konto: "1021344369", icon: "mdi:piggy-bank" },
];

// ────────────────────────────────────────────────────────────────────────────
class RaibaPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._transactions = [];
    this._saldos = {};
    this._unreadCounts = {};
    this._selectedTab = 0;
    this._selectedTx = null;
    this._search = "";
    this._loading = false;
    this._syncing = false;
    this._syncSessionId = null;
    this._syncTimer = null;
    this._rendered = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) {
      this._rendered = true;
      this._buildShell();
      this._fetchTransactions();
    }
  }

  set panel(_p) {}

  connectedCallback() {
    if (this._hass && !this._rendered) {
      this._rendered = true;
      this._buildShell();
      this._fetchTransactions();
    }
  }

  // ── Initial DOM ───────────────────────────────────────────────────────────

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="shell">
        <div class="header">
          <ha-icon-button id="btn-header-back" label="Zurück">
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </ha-icon-button>
          <div class="topbar-title">
            <ha-icon icon="mdi:bank"></ha-icon>
            <span>Raiba</span>
          </div>
          <div class="header-actions">
            <ha-icon-button id="btn-mark-all" label="Alle gelesen/ungelesen">
              <ha-icon icon="mdi:check-all"></ha-icon>
            </ha-icon-button>
            <ha-icon-button id="btn-sync" label="Sync">
              <ha-icon icon="mdi:sync"></ha-icon>
            </ha-icon-button>
          </div>
        </div>
        <div class="body-layout">
          <aside class="sidebar" id="sidebar">
            <div class="sidebar-toolbar">
              <div class="search-wrap" id="search-wrap">
                <ha-icon class="search-icon" icon="mdi:magnify"></ha-icon>
                <input id="search" type="search" placeholder="Suchen…" autocomplete="off">
                <button id="btn-search-clear" class="search-clear" title="Zurücksetzen">
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
            </div>
            <div class="account-list" id="account-list"></div>
          </aside>
          <main class="detail" id="detail">
            <div class="tx-list-container" id="tx-list-container">
              <div class="tx-header" id="tx-header"></div>
              <div class="tx-list" id="tx-list"></div>
            </div>
            <div class="tx-detail" id="tx-detail" style="display:none"></div>
          </main>
        </div>
      </div>
      <div class="toast" id="toast"></div>
      <div class="sync-overlay" id="sync-overlay">
        <div class="sync-dialog">
          <div class="sync-title" id="sync-title">Sync</div>
          <div class="sync-message" id="sync-message"></div>
          <div class="sync-progress-wrap">
            <div class="sync-progress-bar" id="sync-progress-bar"></div>
          </div>
          <button class="btn-secondary" id="btn-sync-cancel">Abbrechen</button>
        </div>
      </div>
    `;

    const root = this.shadowRoot;

    // Search
    const searchEl = root.getElementById("search");
    const searchWrap = root.getElementById("search-wrap");
    searchEl.addEventListener("input", (e) => {
      this._search = e.target.value;
      this._renderTxList();
      this._renderTxHeader();
      searchWrap.classList.toggle("has-value", !!e.target.value);
    });
    root.getElementById("btn-search-clear").addEventListener("click", () => {
      searchEl.value = "";
      this._search = "";
      this._renderTxList();
      this._renderTxHeader();
      searchWrap.classList.remove("has-value");
      searchEl.focus();
    });

    // Header buttons
    root.getElementById("btn-header-back").addEventListener("click", () => this._backToList());
    root.getElementById("btn-sync").addEventListener("click", () => this._startSync());
    root.getElementById("btn-mark-all").addEventListener("click", () => this._markAllToggle());
    root.getElementById("btn-sync-cancel").addEventListener("click", () => this._cancelSync());

    // Account list clicks
    root.getElementById("account-list").addEventListener("click", (e) => {
      const item = e.target.closest(".account-item");
      if (item) {
        this._selectedTab = parseInt(item.dataset.tab, 10);
        this._selectedTx = null;
        this._fetchTransactions();
      }
    });

    // Transaction list clicks
    root.getElementById("tx-list").addEventListener("click", (e) => {
      const item = e.target.closest(".tx-item");
      if (item) {
        const id = item.dataset.id;
        const tx = this._transactions.find(t => t.Id === id);
        if (tx) this._showDetail(tx);
      }
    });

    this._renderAccountList();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  async _fetchTransactions() {
    this._loading = true;
    this._renderTxHeader();
    try {
      const data = await this._callApi("GET", `raiba/transactions?tab=${this._selectedTab}`);
      this._transactions = data.Transactions || [];
      this._saldos = data.Saldos || {};
      this._unreadCounts = data.UnreadCounts || {};
      this._renderAccountList();
      this._renderTxList();
      this._renderTxHeader();
    } catch (err) {
      this._showToast("Fehler beim Laden: " + err.message, "error");
    }
    this._loading = false;
  }

  async _markRead(id) {
    try {
      await this._callApi("GET", `raiba/mark_read?id=${id}`);
      const tx = this._transactions.find(t => t.Id === id);
      if (tx && !tx.ReadAt) {
        tx.ReadAt = "now";
        this._adjustUnreadCount(tx.OwnAccount, -1);
      }
      this._renderTxList();
      this._renderAccountList();
    } catch (err) {
      this._showToast("Fehler: " + err.message, "error");
    }
  }

  async _markIds(ids, read) {
    try {
      await this._callApi("GET", `raiba/mark_ids?ids=${ids.join(",")}&read=${read ? 1 : 0}`);
      for (const id of ids) {
        const tx = this._transactions.find(t => t.Id === id);
        if (tx) {
          const wasUnread = !tx.ReadAt;
          tx.ReadAt = read ? "now" : null;
          if (read && wasUnread) this._adjustUnreadCount(tx.OwnAccount, -1);
          if (!read && !wasUnread) this._adjustUnreadCount(tx.OwnAccount, 1);
        }
      }
      this._renderTxList();
      this._renderAccountList();
    } catch (err) {
      this._showToast("Fehler: " + err.message, "error");
    }
  }

  async _markAllToggle() {
    const visible = this._getFilteredTransactions();
    const hasUnread = visible.some(t => !t.ReadAt);
    const account = ACCOUNTS[this._selectedTab];

    if (hasUnread) {
      // Mark all read
      if (this._search) {
        const ids = visible.filter(t => !t.ReadAt).map(t => t.Id);
        await this._markIds(ids, true);
      } else {
        const konto = account.konto || "";
        try {
          await this._callApi("GET", `raiba/mark_all_read${konto ? "?konto=" + konto : ""}`);
          for (const tx of this._transactions) {
            if (!tx.ReadAt) {
              tx.ReadAt = "now";
            }
          }
          // Reset unread counts
          if (konto) {
            const oldCount = this._unreadCounts[konto] || 0;
            this._unreadCounts[konto] = 0;
            this._unreadCounts["Gesamt"] = Math.max(0, (this._unreadCounts["Gesamt"] || 0) - oldCount);
          } else {
            for (const key of Object.keys(this._unreadCounts)) this._unreadCounts[key] = 0;
          }
          this._renderTxList();
          this._renderAccountList();
          this._showToast("Alle als gelesen markiert", "success");
        } catch (err) {
          this._showToast("Fehler: " + err.message, "error");
        }
      }
    } else {
      // Mark all unread
      if (!confirm("Alle angezeigten Einträge als ungelesen markieren?")) return;
      if (this._search) {
        const ids = visible.map(t => t.Id);
        await this._markIds(ids, false);
      } else {
        const konto = account.konto || "";
        try {
          await this._callApi("GET", `raiba/mark_all_unread${konto ? "?konto=" + konto : ""}`);
          const count = this._transactions.filter(tx => tx.ReadAt).length;
          for (const tx of this._transactions) tx.ReadAt = null;
          // Update unread counts
          if (konto) {
            this._unreadCounts[konto] = (this._unreadCounts[konto] || 0) + count;
            this._unreadCounts["Gesamt"] = (this._unreadCounts["Gesamt"] || 0) + count;
          } else {
            // Recalculate all from transactions
            this._recalcUnreadCounts();
          }
          this._renderTxList();
          this._renderAccountList();
          this._showToast("Alle als ungelesen markiert", "success");
        } catch (err) {
          this._showToast("Fehler: " + err.message, "error");
        }
      }
    }
  }

  _adjustUnreadCount(ownAccount, delta) {
    if (ownAccount) {
      this._unreadCounts[ownAccount] = Math.max(0, (this._unreadCounts[ownAccount] || 0) + delta);
    }
    this._unreadCounts["Gesamt"] = Math.max(0, (this._unreadCounts["Gesamt"] || 0) + delta);
  }

  _recalcUnreadCounts() {
    const counts = { "Gesamt": 0 };
    for (const tx of this._transactions) {
      if (!tx.ReadAt) {
        counts["Gesamt"]++;
        if (tx.OwnAccount) {
          counts[tx.OwnAccount] = (counts[tx.OwnAccount] || 0) + 1;
        }
      }
    }
    // Merge: keep existing keys, overwrite with new values
    for (const key of Object.keys(this._unreadCounts)) {
      if (!(key in counts)) counts[key] = 0;
    }
    this._unreadCounts = counts;
  }

  // ── Sync (2FA flow) ───────────────────────────────────────────────────────

  async _startSync() {
    this._syncing = true;
    this._showSyncOverlay("Verbinde mit Bank…", 0.1);

    try {
      const data = await this._callApi("GET", "raiba/sync/start");
      this._handleSyncResponse(data);
    } catch (err) {
      this._hideSyncOverlay();
      this._syncing = false;
      this._showToast("Sync fehlgeschlagen: " + err.message, "error");
    }
  }

  _handleSyncResponse(json) {
    const status = json.status || "";

    if (status === "waiting_tan") {
      this._syncSessionId = json.session || "";
      const bank = json.bank || "";
      const challenge = json.challenge || "";
      const banksCompleted = json.banksCompleted || 0;
      const progress = (banksCompleted + 1) / Math.max(banksCompleted + 2, 3);
      this._showSyncOverlay(`${bank}\n\n${challenge}`, progress);
      this._startPolling();
    } else if (status === "done") {
      this._stopPolling();
      this._syncing = false;
      const banks = json.banks || [];
      let msg = "";
      let totalNew = 0;
      for (const bank of banks) {
        if (bank.status === "error") {
          msg += `⚠️ ${bank.name}: ${bank.error || "Fehler"}\n`;
          continue;
        }
        for (const acc of (bank.accounts || [])) {
          const newTx = acc.newTransactions || 0;
          totalNew += newTx;
          msg += newTx > 0 ? `${acc.accountNumber}: +${newTx} neu\n` : `${acc.accountNumber}: aktuell\n`;
        }
      }
      msg += totalNew > 0 ? `\n${totalNew} neue Buchungen` : "\nAlles aktuell";
      // Show completion in same overlay, then dismiss
      this._showSyncOverlay("✓ Sync abgeschlossen\n\n" + msg, 1.0);
      setTimeout(() => {
        this._hideSyncOverlay();
        this._fetchTransactions();
      }, 2000);
    } else if (status === "timeout") {
      this._stopPolling();
      this._syncing = false;
      this._hideSyncOverlay();
      this._showToast("Timeout — 2FA nicht rechtzeitig bestätigt", "error");
    } else if (status === "error") {
      this._stopPolling();
      this._syncing = false;
      this._hideSyncOverlay();
      this._showToast("Sync-Fehler: " + (json.message || "Unbekannt"), "error");
    }
  }

  _startPolling() {
    this._stopPolling();
    this._syncTimer = setInterval(() => this._pollSyncStatus(), 3000);
  }

  _stopPolling() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  async _pollSyncStatus() {
    if (!this._syncSessionId) {
      this._stopPolling();
      return;
    }
    try {
      const data = await this._callApi("GET", `raiba/sync/status?session=${this._syncSessionId}`);
      this._handleSyncResponse(data);
    } catch (err) {
      // Ignore polling errors
    }
  }

  _cancelSync() {
    this._stopPolling();
    this._syncing = false;
    this._syncSessionId = null;
    this._hideSyncOverlay();
  }

  _showSyncOverlay(message, progress) {
    const overlay = this.shadowRoot.getElementById("sync-overlay");
    overlay.classList.add("visible");
    this.shadowRoot.getElementById("sync-message").textContent = message;
    this.shadowRoot.getElementById("sync-progress-bar").style.width = `${Math.round(progress * 100)}%`;
  }

  _hideSyncOverlay() {
    this.shadowRoot.getElementById("sync-overlay").classList.remove("visible");
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  _renderAccountList() {
    const list = this.shadowRoot.getElementById("account-list");
    if (!list) return;

    list.innerHTML = ACCOUNTS.map(acc => {
      const active = acc.tab === this._selectedTab ? " active" : "";
      const saldo = acc.konto ? this._saldos[acc.konto] : this._saldos["Gesamt"];
      const unread = acc.konto
        ? (this._unreadCounts[acc.konto] || 0)
        : (this._unreadCounts["Gesamt"] || 0);
      const hasUnread = unread > 0 ? " has-unread" : "";
      const badge = unread > 0 ? `<span class="badge">${unread}</span>` : "";
      const saldoStr = saldo ? this._formatAmount(saldo) : "";

      return `
        <div class="account-item${active}${hasUnread}" data-tab="${acc.tab}">
          <ha-icon icon="${acc.icon}"></ha-icon>
          <div class="account-info">
            <div class="account-name">${_esc(acc.label)}${badge}</div>
            ${saldoStr ? `<div class="account-saldo">${saldoStr} €</div>` : ""}
          </div>
        </div>`;
    }).join("");
  }

  _renderTxHeader() {
    const header = this.shadowRoot.getElementById("tx-header");
    if (!header) return;
    const acc = ACCOUNTS[this._selectedTab];
    let saldoStr = "";
    if (this._search) {
      // During search: sum of filtered entries
      const filtered = this._getFilteredTransactions();
      let sum = 0;
      for (const tx of filtered) {
        const val = parseFloat(tx.Amount) || 0;
        sum += tx.CreditDebit === "S" ? -val : val;
      }
      saldoStr = this._formatAmount(sum.toFixed(2)) + " \u20ac";
    } else {
      const saldo = acc.konto ? this._saldos[acc.konto] : this._saldos["Gesamt"];
      saldoStr = saldo ? this._formatAmount(saldo) + " \u20ac" : "";
    }
    header.innerHTML = `
      <div class="tx-header-title">${_esc(acc.label)}</div>
      ${saldoStr ? `<div class="tx-header-saldo">${saldoStr}</div>` : ""}
    `;
  }

  _getFilteredTransactions() {
    if (!this._search) return this._transactions;
    const q = this._search.toLowerCase();
    return this._transactions.filter(tx =>
      (tx.Name || "").toLowerCase().includes(q) ||
      (tx.Date || "").toLowerCase().includes(q) ||
      (tx.BookingDate || "").toLowerCase().includes(q) ||
      (tx.Amount || "").toLowerCase().includes(q) ||
      (tx.Description || "").toLowerCase().includes(q) ||
      (tx.AccountNumber || "").toLowerCase().includes(q) ||
      (tx.OwnAccount || "").toLowerCase().includes(q)
    );
  }

  _renderTxList() {
    const list = this.shadowRoot.getElementById("tx-list");
    if (!list) return;

    const items = this._getFilteredTransactions();

    if (items.length === 0) {
      list.innerHTML = `<div class="no-results">Keine Umsätze</div>`;
      return;
    }

    // Group by Heute / Gestern / Ältere Buchungen (like iOS app)
    const today = this._isoDate(new Date());
    const yesterday = this._isoDate(new Date(Date.now() - 86400000));

    const groupHeute = [];
    const groupGestern = [];
    const groupAelter = [];

    for (const tx of items) {
      const d = tx.Date || "";
      if (d >= today) groupHeute.push(tx);
      else if (d === yesterday) groupGestern.push(tx);
      else groupAelter.push(tx);
    }

    let html = "";
    if (groupHeute.length > 0) {
      html += `<div class="tx-date-group"><div class="tx-date-header">Heute</div>`;
      for (const tx of groupHeute) html += this._txItemHtml(tx);
      html += `</div>`;
    }
    if (groupGestern.length > 0) {
      html += `<div class="tx-date-group"><div class="tx-date-header">Gestern</div>`;
      for (const tx of groupGestern) html += this._txItemHtml(tx);
      html += `</div>`;
    }
    if (groupAelter.length > 0) {
      html += `<div class="tx-date-group"><div class="tx-date-header">Ältere Buchungen</div>`;
      for (const tx of groupAelter) html += this._txItemHtml(tx);
      html += `</div>`;
    }

    list.innerHTML = html;
  }

  _isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  _txItemHtml(tx) {
    const isUnread = !tx.ReadAt;
    const unreadClass = isUnread ? " unread" : "";
    const amount = this._formatTxAmount(tx.Amount, tx.CreditDebit);
    const amountClass = tx.CreditDebit === "S" ? "amount-negative" : "amount-positive";
    const date = this._formatDate(tx.Date);
    let desc = tx.Description || "";
    // PayPal: strip prefix like iOS app does
    if (tx.Name && tx.Name.toLowerCase().startsWith("paypal")) {
      const slashIdx = desc.indexOf("/. ");
      if (slashIdx >= 0) desc = desc.substring(slashIdx + 3);
    }
    const subtitle = desc ? `${date}: ${desc}` : date;
    const accountIcon = this._accountIcon(tx.OwnAccount);

    return `
      <div class="tx-item${unreadClass}" data-id="${_esc(tx.Id)}">
        <div class="tx-icon">
          <ha-icon icon="${accountIcon}"></ha-icon>
        </div>
        <div class="tx-info">
          <div class="tx-name">${_esc(tx.Name || "(Unbekannt)")}</div>
          <div class="tx-sub">${_esc(subtitle)}</div>
        </div>
        <div class="tx-amount ${amountClass}">${amount}</div>
      </div>`;
  }

  _showDetail(tx) {
    this._selectedTx = tx;

    // Mark as read on first open
    if (!tx.ReadAt) {
      this._markRead(tx.Id);
    }

    this._renderDetailView(tx);
  }

  _renderDetailView(tx) {
    const detail = this.shadowRoot.getElementById("tx-detail");
    const listContainer = this.shadowRoot.getElementById("tx-list-container");

    listContainer.style.display = "none";
    detail.style.display = "";

    const amount = this._formatTxAmount(tx.Amount, tx.CreditDebit);
    const amountClass = tx.CreditDebit === "S" ? "amount-negative" : "amount-positive";
    const accountIcon = this._accountIcon(tx.OwnAccount);
    const accountName = this._accountName(tx.OwnAccount);

    let descriptionHtml = _esc(tx.Description || "").replace(/\n/g, "<br>");
    if (tx.AccountNumber) {
      descriptionHtml += `<br><br>IBAN: ${_esc(tx.AccountNumber)}`;
    }

    detail.innerHTML = `
      <div class="detail-back">
        <button class="btn-back" id="btn-detail-back">
          <ha-icon icon="mdi:arrow-left"></ha-icon> Zurück
        </button>
        <button class="btn-read-toggle" id="btn-read-toggle" title="Gelesen/Ungelesen">
          <ha-icon icon="${tx.ReadAt ? 'mdi:check-circle' : 'mdi:check-circle-outline'}"></ha-icon>
        </button>
      </div>
      <div class="detail-content">
        <div class="detail-icon-row">
          <ha-icon icon="${accountIcon}" class="detail-account-icon ${tx.ReadAt ? '' : 'unread-icon'}"></ha-icon>
          <span class="detail-account-name">${_esc(accountName)}</span>
        </div>
        <h2 class="detail-name">${_esc(tx.Name || "(Unbekannt)")}</h2>
        <div class="detail-amount ${amountClass}">${amount} €</div>
        <div class="detail-dates">
          <div><strong>Datum:</strong> ${_esc(this._formatDate(tx.Date))}</div>
          <div><strong>Valuta:</strong> ${_esc(this._formatDate(tx.BookingDate))}</div>
        </div>
        <div class="detail-description">${descriptionHtml}</div>
      </div>
    `;

    detail.querySelector("#btn-detail-back").addEventListener("click", () => this._hideDetail());
    detail.querySelector("#btn-read-toggle").addEventListener("click", () => this._toggleReadDetail(tx));

    this.shadowRoot.querySelector(".shell")?.classList.add("detail-open");
  }

  async _toggleReadDetail(tx) {
    if (tx.ReadAt) {
      if (!confirm("Diesen Eintrag wieder als ungelesen markieren?")) return;
      await this._markIds([tx.Id], false);
      tx.ReadAt = null;
    } else {
      await this._markRead(tx.Id);
      tx.ReadAt = "now";
    }
    // Re-render detail without triggering auto-markRead
    this._renderDetailView(tx);
  }

  _hideDetail() {
    this._selectedTx = null;
    const detail = this.shadowRoot.getElementById("tx-detail");
    const listContainer = this.shadowRoot.getElementById("tx-list-container");
    detail.style.display = "none";
    listContainer.style.display = "";
    this.shadowRoot.querySelector(".shell")?.classList.remove("detail-open");
  }

  _backToList() {
    if (this._selectedTx) {
      this._hideDetail();
    } else {
      this.shadowRoot.querySelector(".shell")?.classList.remove("detail-open");
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _accountIcon(ownAccount) {
    switch (ownAccount) {
      case "1026704": return "mdi:bank";
      case "1009491828": return "mdi:bank-outline";
      case "1055437": return "mdi:home-city";
      case "1021344369": return "mdi:piggy-bank";
      default: return "mdi:format-list-bulleted";
    }
  }

  _accountName(ownAccount) {
    const acc = ACCOUNTS.find(a => a.konto === ownAccount);
    return acc ? acc.label : ownAccount || "";
  }

  _formatDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0].slice(2)}`;
    }
    return dateStr;
  }

  _formatAmount(amountStr) {
    const val = parseFloat(amountStr);
    if (isNaN(val)) return amountStr || "";
    return val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  _formatTxAmount(amount, creditDebit) {
    const val = parseFloat(amount);
    if (isNaN(val)) return amount || "";
    const sign = creditDebit === "S" ? "-" : "";
    return sign + val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  _callApi(method, path, body) {
    if (this._hass && typeof this._hass.callApi === "function") {
      return this._hass.callApi(method, path, body);
    }
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._hass?.auth?.data?.access_token || ""}`,
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(`/api/${path}`, opts).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  _showToast(msg, type = "info") {
    const toast = this.shadowRoot.getElementById("toast");
    toast.textContent = msg;
    toast.className = "toast visible " + type;
    setTimeout(() => { toast.classList.remove("visible"); }, 3000);
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  _styles() {
    return `
      :host { display: block; height: 100%; background: var(--primary-background-color, #f5f5f5); font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); font-size: 14px; color: var(--primary-text-color, #212121); --sidebar-width: 280px; }

      *, *::before, *::after { box-sizing: border-box; }

      .shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

      /* ── Header ── */
      .header { display: flex; align-items: center; height: var(--header-height); background: var(--app-header-background-color); color: var(--app-header-text-color); border-bottom: var(--app-header-border-bottom); padding: 0; flex-shrink: 0; position: relative; }
      .header ha-icon-button { color: var(--app-header-text-color); --mdc-icon-button-size: var(--header-height); }
      #btn-header-back { display: none; }
      .topbar-title { display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; height: var(--header-height); font-size: var(--app-header-font-size, var(--ha-font-size-xl)); font-weight: var(--ha-font-weight-normal); line-height: var(--header-height); gap: var(--ha-space-1, 4px); }
      .header-actions { display: flex; align-items: center; }

      /* ── Body layout ── */
      .body-layout { display: flex; flex: 1; overflow: hidden; }

      /* ── Sidebar ── */
      .sidebar { width: var(--sidebar-width); min-width: var(--sidebar-width); display: flex; flex-direction: column; border-right: 1px solid var(--divider-color, #e0e0e0); background: var(--card-background-color, #fff); overflow-y: auto; }
      .sidebar-toolbar { padding: 12px; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
      .search-wrap { position: relative; flex: 1; }
      .search-wrap .search-icon { position: absolute; left: 5px; top: 50%; transform: translateY(-50%) scale(0.58); transform-origin: left center; opacity: .5; pointer-events: none; }
      #search { width: 100%; padding: 6px 30px 6px 26px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 20px; background: var(--primary-background-color, #f5f5f5); color: var(--primary-text-color, #212121); font-size: 13px; outline: none; box-sizing: border-box; }
      #search:focus { border-color: var(--primary-color, #03a9f4); }
      #search::-webkit-search-cancel-button { display: none; }
      .search-clear { display: none; position: absolute; right: 4px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 0; color: var(--secondary-text-color, #757575); align-items: center; justify-content: center; width: 22px; height: 22px; }
      .search-clear ha-icon { transform: scale(0.58); }
      .search-wrap.has-value .search-clear { display: flex; }

      .account-list { flex: 1; overflow-y: auto; padding: 8px 0; }
      .account-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
      .account-item:hover { background: var(--secondary-background-color, #f5f5f5); }
      .account-item.active { background: color-mix(in srgb, var(--primary-color, #03a9f4) 12%, transparent); border-right: 3px solid var(--primary-color, #03a9f4); }
      .account-item ha-icon { --mdi-icon-size: 22px; color: var(--secondary-text-color); }
      .account-item.active ha-icon { color: var(--primary-color, #03a9f4); }
      .account-item.has-unread ha-icon { color: var(--primary-color, #03a9f4); }
      .account-info { flex: 1; min-width: 0; }
      .account-name { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
      .account-saldo { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }
      .badge { background: var(--primary-color, #03a9f4); color: #fff; border-radius: 10px; padding: 1px 7px; font-size: 11px; font-weight: 600; }

      /* ── Main area ── */
      .detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

      .tx-list-container { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
      .tx-header { padding: 16px 20px 8px; display: flex; align-items: baseline; gap: 16px; }
      .tx-header-title { font-size: 18px; font-weight: 500; }
      .tx-header-saldo { font-size: 16px; color: var(--secondary-text-color); margin-left: auto; }
      .loading-indicator { font-size: 13px; color: var(--secondary-text-color); }
      .tx-list { flex: 1; overflow-y: auto; padding: 0 8px 16px; }

      .tx-date-group { margin-bottom: 8px; }
      .tx-date-header { font-size: 12px; font-weight: 600; color: var(--secondary-text-color); padding: 8px 12px 4px; text-transform: uppercase; letter-spacing: 0.5px; }

      .tx-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
      .tx-item:hover { background: var(--secondary-background-color, #f5f5f5); }
      .tx-item.unread .tx-name { font-weight: 700; }
      .tx-item.unread .tx-icon ha-icon { color: var(--primary-color, #03a9f4); }
      .tx-icon { flex-shrink: 0; }
      .tx-icon ha-icon { --mdi-icon-size: 22px; color: var(--secondary-text-color); }
      .tx-info { flex: 1; min-width: 0; }
      .tx-name { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tx-sub { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
      .tx-amount { font-size: 14px; font-weight: 500; white-space: nowrap; }
      .amount-negative { color: var(--error-color, #d32f2f); }
      .amount-positive { color: var(--success-color, #388e3c); }

      .no-results { padding: 32px; text-align: center; color: var(--secondary-text-color); }

      /* ── Detail view ── */
      .tx-detail { flex: 1; overflow-y: auto; padding: 16px 24px; }
      .detail-back { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .btn-back { display: flex; align-items: center; gap: 6px; background: none; border: none; color: var(--primary-color, #03a9f4); cursor: pointer; font-size: 14px; padding: 8px 12px; border-radius: 6px; }
      .btn-back:hover { background: color-mix(in srgb, var(--primary-color, #03a9f4) 8%, transparent); }
      .btn-read-toggle { background: none; border: none; cursor: pointer; padding: 8px; border-radius: 6px; color: var(--secondary-text-color); }
      .btn-read-toggle:hover { background: var(--secondary-background-color); }
      .detail-content { max-width: 600px; }
      .detail-icon-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .detail-account-icon { --mdi-icon-size: 28px; color: var(--secondary-text-color); }
      .detail-account-icon.unread-icon { color: var(--primary-color, #03a9f4); }
      .detail-account-name { font-size: 13px; color: var(--secondary-text-color); }
      .detail-name { font-size: 22px; font-weight: 500; margin: 0 0 8px; }
      .detail-amount { font-size: 28px; font-weight: 600; margin-bottom: 16px; }
      .detail-dates { font-size: 14px; color: var(--secondary-text-color); margin-bottom: 16px; line-height: 1.8; }
      .detail-description { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; background: var(--card-background-color, #fff); padding: 16px; border-radius: 8px; border: 1px solid var(--divider-color, #e0e0e0); }

      /* ── Sync overlay ── */
      .sync-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
      .sync-overlay.visible { opacity: 1; pointer-events: auto; }
      .sync-dialog { background: var(--card-background-color, #fff); border-radius: 12px; padding: 24px; width: 340px; max-width: 90vw; text-align: center; }
      .sync-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
      .sync-message { font-size: 14px; white-space: pre-wrap; margin-bottom: 16px; color: var(--primary-text-color); min-height: 40px; }
      .sync-progress-wrap { height: 4px; background: var(--divider-color, #e0e0e0); border-radius: 2px; margin-bottom: 16px; overflow: hidden; }
      .sync-progress-bar { height: 100%; background: var(--primary-color, #03a9f4); border-radius: 2px; transition: width 0.3s; width: 0%; }
      .btn-secondary { background: none; border: 1px solid var(--divider-color, #e0e0e0); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; color: var(--primary-text-color); }
      .btn-secondary:hover { background: var(--secondary-background-color); }

      /* ── Toast ── */
      .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(80px); background: var(--primary-text-color, #333); color: var(--primary-background-color, #fff); padding: 10px 20px; border-radius: 8px; font-size: 14px; z-index: 200; transition: transform 0.3s, opacity 0.3s; opacity: 0; pointer-events: none; }
      .toast.visible { transform: translateX(-50%) translateY(0); opacity: 1; }
      .toast.error { background: var(--error-color, #d32f2f); color: #fff; }
      .toast.success { background: var(--success-color, #388e3c); color: #fff; }

      /* ── Responsive (mobile) ── */
      #btn-header-back { display: none; }

      @media (max-width: 640px) {
        .body-layout { position: relative; overflow: hidden; }

        .sidebar {
          width: 100%;
          min-width: 0;
          border-right: none;
          position: absolute;
          inset: 0;
          transform: translateX(0);
          transition: transform 0.3s cubic-bezier(.4,0,.2,1);
          will-change: transform;
          z-index: 2;
        }

        .detail {
          width: 100%;
          position: absolute;
          inset: 0;
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(.4,0,.2,1);
          will-change: transform;
          background: var(--primary-background-color, #f5f5f5);
          z-index: 3;
          overflow-y: auto;
          height: 100%;
        }

        .shell.detail-open .sidebar { transform: translateX(-100%); }
        .shell.detail-open .detail  { transform: translateX(0); }

        .shell.detail-open #btn-header-back { display: inline-flex; }
        .shell.detail-open .topbar-title { display: none; }
        .shell.detail-open .header > .header-actions { display: none; }
      }
    `;
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function _esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

customElements.define("raiba-panel", RaibaPanel);
