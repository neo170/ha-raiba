/**
 * Raiba Panel — Bank transactions for Home Assistant
 * Custom panel element: <raiba-panel>
 */
;(function() {
"use strict";
if (customElements.get("raiba-panel")) return;

const ACCOUNTS = [
  { tab: 0, label: "Alle Umsätze", konto: null, icon: "mdi:format-list-bulleted" },
  { tab: 2, label: "Dkb", konto: "1009491828", icon: "mdi:bank-outline" },
  { tab: 3, label: "Strasslach", konto: "1055437", icon: "mdi:home-city" },
  { tab: 4, label: "DKB TG", konto: "1021344369", icon: "mdi:piggy-bank" },
  { tab: 1, label: "Rileg", konto: "1026704", icon: "mdi:bank" },
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
    const _now = new Date(); const _firstLastMonth = new Date(_now.getFullYear(), _now.getMonth() - 1, 1);
    this._dateFrom = this._isoDate(_firstLastMonth);
    this._dateTo = "";
    this._groupMode = "standard";
    this._groupsCollapsed = false;
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

  disconnectedCallback() {
    if (this._popstateHandler) {
      window.removeEventListener("popstate", this._popstateHandler);
    }
  }

  // ── Initial DOM ───────────────────────────────────────────────────────────

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="shell">
        <div class="header">
          <ha-icon-button id="btn-menu" label="Menü">
            <ha-icon icon="mdi:menu"></ha-icon>
          </ha-icon-button>
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
            <ha-icon-button id="btn-export" label="Excel Export">
              <ha-icon icon="mdi:download"></ha-icon>
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
              <div class="date-filter-row">
                <div class="date-wrap" id="date-from-wrap">
                  <input id="date-from" class="date-input" type="text" placeholder="von…" title="Datum von" readonly>
                  <input id="date-from-picker" type="date" class="date-picker-hidden">
                  <button class="date-clear" id="date-from-clear" title="Zurücksetzen"><ha-icon icon="mdi:close"></ha-icon></button>
                </div>
                <div class="date-wrap" id="date-to-wrap">
                  <input id="date-to" class="date-input" type="text" placeholder="bis…" title="Datum bis" readonly>
                  <input id="date-to-picker" type="date" class="date-picker-hidden">
                  <button class="date-clear" id="date-to-clear" title="Zurücksetzen"><ha-icon icon="mdi:close"></ha-icon></button>
                </div>
              </div>
              <select id="group-mode" class="group-select">
                <option value="standard">Gruppierung: Standard</option>
                <option value="weekly">Gruppierung: Wöchentlich</option>
                <option value="monthly">Gruppierung: Monatlich</option>
                <option value="yearly">Gruppierung: Jährlich</option>
              </select>
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
    let _searchTimer = null;
    searchEl.addEventListener("input", (e) => {
      this._search = e.target.value;
      searchWrap.classList.toggle("has-value", !!e.target.value);
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        this._renderTxList();
        this._renderTxHeader();
      }, 150);
    });
    root.getElementById("btn-search-clear").addEventListener("click", () => {
      searchEl.value = "";
      this._search = "";
      this._renderTxList();
      this._renderTxHeader();
      searchWrap.classList.remove("has-value");
      searchEl.focus();
    });

    // Date range filters
    const dateFromEl = root.getElementById("date-from");
    const dateToEl = root.getElementById("date-to");
    const dateFromPicker = root.getElementById("date-from-picker");
    const dateToPicker = root.getElementById("date-to-picker");
    const dateFromWrap = root.getElementById("date-from-wrap");
    const dateToWrap = root.getElementById("date-to-wrap");

    dateFromEl.addEventListener("click", () => dateFromPicker.showPicker());
    dateToEl.addEventListener("click", () => dateToPicker.showPicker());

    // Set default date-from (today minus 4 weeks)
    dateFromEl.value = this._formatDateDE(this._dateFrom);
    dateFromPicker.value = this._dateFrom;
    dateFromWrap.classList.add("has-value");

    dateFromPicker.addEventListener("change", (e) => {
      const v = e.target.value;
      this._dateFrom = v;
      dateFromEl.value = v ? this._formatDateDE(v) : "";
      dateFromWrap.classList.toggle("has-value", !!v);
      this._renderTxList();
      this._renderTxHeader();
    });
    dateToPicker.addEventListener("change", (e) => {
      const v = e.target.value;
      this._dateTo = v;
      dateToEl.value = v ? this._formatDateDE(v) : "";
      dateToWrap.classList.toggle("has-value", !!v);
      this._renderTxList();
      this._renderTxHeader();
    });
    root.getElementById("date-from-clear").addEventListener("click", (e) => {
      e.stopPropagation();
      dateFromEl.value = "";
      dateFromPicker.value = "";
      this._dateFrom = "";
      dateFromWrap.classList.remove("has-value");
      this._renderTxList();
      this._renderTxHeader();
    });
    root.getElementById("date-to-clear").addEventListener("click", (e) => {
      e.stopPropagation();
      dateToEl.value = "";
      dateToPicker.value = "";
      this._dateTo = "";
      dateToWrap.classList.remove("has-value");
      this._renderTxList();
      this._renderTxHeader();
    });

    // Grouping select
    root.getElementById("group-mode").addEventListener("change", (e) => {
      this._groupMode = e.target.value;
      this._renderTxList();
    });

    // Header buttons
    root.getElementById("btn-menu").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
    });
    root.getElementById("btn-header-back").addEventListener("click", () => this._backToList());
    root.getElementById("btn-sync").addEventListener("click", () => this._startSync());
    root.getElementById("btn-mark-all").addEventListener("click", () => this._markAllToggle());
    root.getElementById("btn-export").addEventListener("click", () => this._exportExcel());
    root.getElementById("btn-sync-cancel").addEventListener("click", () => this._cancelSync());

    // Account list clicks
    root.getElementById("account-list").addEventListener("click", (e) => {
      const item = e.target.closest(".account-item");
      if (item) {
        this._selectedTab = parseInt(item.dataset.tab, 10);
        this._selectedTx = null;
        this._fetchTransactions();
        this._openDetail();
      }
    });

    // Transaction list clicks
    root.getElementById("tx-list").addEventListener("click", (e) => {
      const readBtn = e.target.closest(".tx-read-toggle");
      if (readBtn) {
        e.stopPropagation();
        const id = readBtn.dataset.id;
        const tx = this._transactions.find(t => t.Id === id);
        if (tx) this._toggleReadInline(tx);
        return;
      }
      const item = e.target.closest(".tx-item");
      if (item) {
        const id = item.dataset.id;
        const tx = this._transactions.find(t => t.Id === id);
        if (tx) this._showDetail(tx);
      }
    });

    this._renderAccountList();

    // Handle browser back button
    this._popstateHandler = () => {
      if (this._selectedTx) {
        this._hideDetail();
      }
    };
    window.addEventListener("popstate", this._popstateHandler);
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
    } catch (err) {
      this._showToast("Fehler: " + err.message, "error");
    }
  }

  async _markIds(ids, read) {
    try {
      await this._callApi("GET", `raiba/mark_ids?ids=${ids.join(",")}&read=${read ? 1 : 0}`);
    } catch (err) {
      this._showToast("Fehler: " + err.message, "error");
    }
  }

  async _markAllToggle() {
    const visible = this._getFilteredTransactions();
    const hasUnread = visible.some(t => !t.ReadAt);
    const account = ACCOUNTS.find(a => a.tab === this._selectedTab);

    if (hasUnread) {
      // Mark all read
      if (this._search) {
        const unread = visible.filter(t => !t.ReadAt);
        const ids = unread.map(t => t.Id);
        for (const tx of unread) {
          tx.ReadAt = "now";
          this._adjustUnreadCount(tx.OwnAccount, -1);
        }
        this._renderTxList();
        this._renderAccountList();
        this._showToast("Alle als gelesen markiert", "success");
        this._markIds(ids, true);
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
        for (const tx of visible) {
          if (tx.ReadAt) {
            tx.ReadAt = null;
            this._adjustUnreadCount(tx.OwnAccount, 1);
          }
        }
        this._renderTxList();
        this._renderAccountList();
        this._showToast("Alle als ungelesen markiert", "success");
        this._markIds(ids, false);
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

  _updateBadges() {
    const items = this.shadowRoot.querySelectorAll(".account-item");
    for (const el of items) {
      const tab = parseInt(el.dataset.tab, 10);
      const acc = ACCOUNTS.find(a => a.tab === tab);
      if (!acc) continue;
      const unread = acc.konto ? (this._unreadCounts[acc.konto] || 0) : (this._unreadCounts["Gesamt"] || 0);
      let badge = el.querySelector(".badge");
      if (unread > 0) {
        el.classList.add("has-unread");
        if (badge) { badge.textContent = unread; } else {
          const span = document.createElement("span");
          span.className = "badge";
          span.textContent = unread;
          el.querySelector(".account-name")?.appendChild(span);
        }
      } else {
        el.classList.remove("has-unread");
        if (badge) badge.remove();
      }
    }
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
    this._syncSessionId = null;
    this._showSyncOverlay("Verbinde mit Bank…", 0.1);

    try {
      const data = await this._callApi("GET", `raiba/sync/start?pst=${Date.now()}`);
      console.log("[raiba-sync] start raw:", JSON.stringify(data));
      this._handleSyncResponse(data);
    } catch (err) {
      console.error("[raiba-sync] start error:", err);
      this._hideSyncOverlay();
      this._syncing = false;
      this._showToast("Sync fehlgeschlagen: " + err.message, "error");
    }
  }

  _handleSyncResponse(json) {
    console.log("[raiba-sync] response:", JSON.stringify(json));
    if (!json || typeof json !== "object") {
      this._stopPolling();
      this._syncing = false;
      this._syncSessionId = null;
      this._hideSyncOverlay();
      this._showToast("Sync: Leere oder ungültige Antwort", "error");
      return;
    }
    // Handle error responses that have no status field (e.g. proxy errors)
    if (!json.status && (json.error || json.message)) {
      this._stopPolling();
      this._syncing = false;
      this._syncSessionId = null;
      this._hideSyncOverlay();
      this._showToast("Sync-Fehler: " + (json.error || json.message), "error");
      return;
    }
    const status = json.status || "";

    if (status === "waiting_tan") {
      this._syncSessionId = json.session || this._syncSessionId || "";
      const bank = json.bank || "";
      const challenge = json.challenge || "";
      const banksCompleted = json.banksCompleted || 0;
      const progress = (banksCompleted + 1) / Math.max(banksCompleted + 2, 3);
      this._showSyncOverlay(`${bank}\n\n${challenge}`, progress);
      this._scheduleNextPoll();
    } else if (status === "done") {
      this._stopPolling();
      this._syncing = false;
      this._syncSessionId = null;
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
      this._showSyncOverlay("✓ Sync abgeschlossen\n\n" + msg, 1.0);
      setTimeout(() => {
        this._hideSyncOverlay();
        this._fetchTransactions();
      }, 2000);
    } else if (status === "timeout") {
      this._stopPolling();
      this._syncing = false;
      this._syncSessionId = null;
      this._hideSyncOverlay();
      this._showToast("Timeout — 2FA nicht rechtzeitig bestätigt", "error");
    } else if (status === "error") {
      this._stopPolling();
      this._syncing = false;
      this._syncSessionId = null;
      this._hideSyncOverlay();
      this._showToast("Sync-Fehler: " + (json.message || json.error || "Unbekannt"), "error");
    } else {
      // Unbekannter Status — stoppen
      this._stopPolling();
      this._syncing = false;
      this._syncSessionId = null;
      this._hideSyncOverlay();
      this._showToast("Unerwartete Serverantwort: " + (status || JSON.stringify(json).substring(0, 80)), "error");
    }
  }

  _scheduleNextPoll() {
    this._stopPolling();
    this._syncTimer = setTimeout(() => this._pollSyncStatus(), 3000);
  }

  _stopPolling() {
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
  }

  async _pollSyncStatus() {
    if (!this._syncSessionId) {
      this._stopPolling();
      return;
    }
    try {
      const data = await this._callApi("GET", `raiba/sync/status?session=${this._syncSessionId}&pst=${Date.now()}`);
      this._handleSyncResponse(data);
    } catch (err) {
      // Netzwerkfehler: nochmal versuchen (wie iOS-App)
      this._scheduleNextPoll();
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
    const acc = ACCOUNTS.find(a => a.tab === this._selectedTab);
    header.innerHTML = `
      <div class="tx-header-title">${_esc(acc.label)}</div>
    `;
  }

  _getFilteredTransactions() {
    let items = this._transactions;
    if (this._search) {
      const q = this._search.toLowerCase();
      items = items.filter(tx =>
        (tx.Name || "").toLowerCase().includes(q) ||
        (tx.Date || "").toLowerCase().includes(q) ||
        (tx.BookingDate || "").toLowerCase().includes(q) ||
        (tx.Amount || "").toLowerCase().includes(q) ||
        (tx.Description || "").toLowerCase().includes(q) ||
        (tx.AccountNumber || "").toLowerCase().includes(q) ||
        (tx.OwnAccount || "").toLowerCase().includes(q)
      );
    }
    if (this._dateFrom) {
      items = items.filter(tx => (tx.Date || "") >= this._dateFrom);
    }
    if (this._dateTo) {
      items = items.filter(tx => (tx.Date || "") <= this._dateTo);
    }
    return items;
  }

  _hasActiveFilters() {
    return !!(this._search || this._dateFrom || this._dateTo);
  }

  _formatDateDE(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  _renderTxList() {
    const list = this.shadowRoot.getElementById("tx-list");
    if (!list) return;

    const items = this._getFilteredTransactions();

    if (items.length === 0) {
      list.innerHTML = `<div class="no-results">Keine Umsätze</div>`;
      return;
    }

    let html = "";
    const groups = this._buildGroups(items);
    const collapsed = this._groupsCollapsed;
    for (const g of groups) {
      const saldo = this._calcGroupSaldo(g.items);
      const saldoStr = saldo.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const saldoClass = saldo >= 0 ? "amount-positive" : "amount-negative";
      const showSaldo = this._groupMode !== "standard";
      const collClass = collapsed ? " collapsed" : "";
      html += `<div class="tx-date-group${collClass}"><div class="tx-date-header"><span class="group-toggle">&#x25BE;</span>${g.label}${showSaldo ? `: <span class="group-saldo ${saldoClass}">${saldoStr} €</span>` : ""}</div>`;
      html += `<div class="group-items">`;
      for (const tx of g.items) html += this._txItemHtml(tx);
      html += `</div></div>`;
    }

    list.innerHTML = html;

    // Toggle all groups on chevron click
    list.querySelectorAll(".group-toggle").forEach(toggle => {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        this._groupsCollapsed = !this._groupsCollapsed;
        list.querySelectorAll(".tx-date-group").forEach(g => {
          g.classList.toggle("collapsed", this._groupsCollapsed);
        });
      });
    });
  }

  _buildGroups(items) {
    if (this._groupMode === "weekly") return this._groupWeekly(items);
    if (this._groupMode === "monthly") return this._groupMonthly(items);
    if (this._groupMode === "yearly") return this._groupYearly(items);
    return this._groupStandard(items);
  }

  _groupStandard(items) {
    const today = this._isoDate(new Date());
    const yesterday = this._isoDate(new Date(Date.now() - 86400000));
    const groups = [];
    const groupHeute = items.filter(tx => (tx.Date || "") >= today);
    const groupGestern = items.filter(tx => (tx.Date || "") === yesterday);
    const groupAelter = items.filter(tx => (tx.Date || "") < yesterday);
    if (groupHeute.length) groups.push({ label: "Heute", items: groupHeute });
    if (groupGestern.length) groups.push({ label: "Gestern", items: groupGestern });
    if (groupAelter.length) groups.push({ label: "Ältere Buchungen", items: groupAelter });
    return groups;
  }

  _groupWeekly(items) {
    const map = new Map();
    for (const tx of items) {
      const d = new Date(tx.Date || "2000-01-01");
      const mon = this._getMonday(d);
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
      const key = this._isoDate(mon);
      if (!map.has(key)) map.set(key, { mon, sun, items: [] });
      map.get(key).items.push(tx);
    }
    return Array.from(map.values()).map(g => ({
      label: `${g.mon.getDate()}.${g.mon.getMonth()+1}. - ${g.sun.getDate()}.${g.sun.getMonth()+1}.${g.sun.getFullYear()}`,
      items: g.items
    }));
  }

  _groupMonthly(items) {
    const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const map = new Map();
    for (const tx of items) {
      const d = new Date(tx.Date || "2000-01-01");
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
      if (!map.has(key)) map.set(key, { month: d.getMonth(), year: d.getFullYear(), items: [] });
      map.get(key).items.push(tx);
    }
    return Array.from(map.values()).map(g => ({
      label: `${MONTHS[g.month]} ${g.year}`,
      items: g.items
    }));
  }

  _groupYearly(items) {
    const map = new Map();
    for (const tx of items) {
      const d = new Date(tx.Date || "2000-01-01");
      const key = String(d.getFullYear());
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(tx);
    }
    return Array.from(map.entries()).map(([label, txs]) => ({ label, items: txs }));
  }

  _getMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    dt.setDate(dt.getDate() + diff);
    return dt;
  }

  _calcGroupSaldo(items) {
    let sum = 0;
    for (const tx of items) {
      const val = parseFloat(tx.Amount) || 0;
      sum += tx.CreditDebit === "S" ? -val : val;
    }
    return sum;
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
          <button class="tx-read-toggle" data-id="${_esc(tx.Id)}" title="Gelesen/Ungelesen">
            <ha-icon icon="${isUnread ? 'mdi:check-circle-outline' : 'mdi:check-circle'}"></ha-icon>
          </button>
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
    history.pushState({ raibaDetail: true }, "");
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

    detail.querySelector("#btn-detail-back").addEventListener("click", () => this._hideDetailWithBack());
    detail.querySelector("#btn-read-toggle").addEventListener("click", () => this._toggleReadDetail(tx));

    this.shadowRoot.querySelector(".shell")?.classList.add("detail-open");
  }

  async _toggleReadDetail(tx) {
    this._setTxRead(tx, !tx.ReadAt);
    this._renderDetailView(tx);
  }

  async _toggleReadInline(tx) {
    this._setTxRead(tx, !tx.ReadAt);
  }

  _setTxRead(tx, read) {
    const wasUnread = !tx.ReadAt;
    tx.ReadAt = read ? "now" : null;
    const isUnread = !tx.ReadAt;

    // Only act if state actually changed
    if (wasUnread === isUnread) return;

    this._adjustUnreadCount(tx.OwnAccount, isUnread ? 1 : -1);
    this._patchTxRow(tx);
    this._updateBadges();

    // Fire-and-forget API call
    if (read) {
      this._markRead(tx.Id);
    } else {
      this._markIds([tx.Id], false);
    }
  }

  _patchTxRow(tx) {
    const row = this.shadowRoot.querySelector(`.tx-item[data-id="${tx.Id}"]`);
    if (!row) return;
    row.classList.toggle("unread", !tx.ReadAt);
    const icon = row.querySelector(".tx-read-toggle ha-icon");
    if (icon) icon.setAttribute("icon", tx.ReadAt ? "mdi:check-circle" : "mdi:check-circle-outline");
    const nameEl = row.querySelector(".tx-name");
    if (nameEl) nameEl.style.fontWeight = tx.ReadAt ? "" : "700";
  }

  _hideDetail() {
    const tx = this._selectedTx;
    this._selectedTx = null;
    const detail = this.shadowRoot.getElementById("tx-detail");
    const listContainer = this.shadowRoot.getElementById("tx-list-container");
    detail.style.display = "none";
    listContainer.style.display = "";
    // Sync the row in the list with current read state
    if (tx) this._patchTxRow(tx);
  }

  _hideDetailWithBack() {
    if (this._selectedTx) {
      history.back();
    }
  }

  _openDetail() {
    this.shadowRoot.querySelector(".shell")?.classList.add("detail-open");
  }

  _backToList() {
    if (this._selectedTx) {
      // From tx detail back to tx list - use history so popstate handles it
      history.back();
    } else {
      // From tx list back to account list (mobile)
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
    const duration = type === "error" ? 10000 : 3000;
    setTimeout(() => { toast.classList.remove("visible"); }, duration);
  }

  _exportExcel() {
    const items = this._getFilteredTransactions();
    if (!items.length) { this._showToast("Keine Daten zum Exportieren", "error"); return; }

    const doExport = (XLSX) => {
      const data = items.map(tx => ({
        Datum: this._formatDate(tx.Date),
        Name: tx.Name || "",
        Beschreibung: (tx.Description || "").replace(/\n/g, " "),
        Betrag: parseFloat(tx.Amount) || 0,
        "S/H": tx.CreditDebit === "S" ? "Soll" : "Haben",
        Konto: tx.OwnAccount || ""
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      // Format Betrag column as number with 2 decimals
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 3 })];
        if (cell) cell.z = "#,##0.00";
      }
      ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 50 }, { wch: 12 }, { wch: 6 }, { wch: 15 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Umsätze");
      XLSX.writeFile(wb, `raiba-export-${this._isoDate(new Date())}.xlsx`);
      this._showToast(`${items.length} Buchungen exportiert`);
    };

    if (window.XLSX) {
      doExport(window.XLSX);
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.onload = () => doExport(window.XLSX);
      script.onerror = () => this._showToast("Excel-Bibliothek konnte nicht geladen werden", "error");
      document.head.appendChild(script);
    }
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

      .date-filter-row { display: flex; gap: 8px; margin-top: 8px; }
      .date-wrap { position: relative; flex: 1; }
      .date-picker-hidden { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; overflow: hidden; }
      .date-input { width: 100%; padding: 6px 30px 6px 10px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 20px; background: var(--primary-background-color, #f5f5f5); color: var(--primary-text-color, #212121); font-size: 13px; outline: none; box-sizing: border-box; cursor: pointer; line-height: normal; }
      .date-input:focus { border-color: var(--primary-color, #03a9f4); }
      .date-input::placeholder { color: var(--secondary-text-color, #757575); opacity: 0.7; }
      .date-clear { display: none; position: absolute; right: 4px; top: 50%; transform: translateY(-50%); border: none; background: transparent; cursor: pointer; padding: 0; color: var(--secondary-text-color, #757575); align-items: center; justify-content: center; width: 18px; height: 18px; }
      .date-clear ha-icon { transform: scale(0.5); }
      .date-wrap.has-value .date-clear { display: flex; }

      .group-select { width: 100%; margin-top: 8px; padding: 6px 10px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 20px; background: var(--primary-background-color, #f5f5f5); color: var(--primary-text-color, #212121); font-size: 13px; outline: none; box-sizing: border-box; cursor: pointer; -webkit-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23757575'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 26px; }
      .group-select:focus { border-color: var(--primary-color, #03a9f4); }

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
      .group-toggle { display: inline-block; margin-right: 6px; transition: transform 0.2s; cursor: pointer; font-size: 24px; line-height: 12px; vertical-align: middle; }
      .tx-date-group.collapsed .group-toggle { transform: rotate(-90deg); }
      .group-items { }
      .tx-date-group.collapsed .group-items { display: none; }
      .group-saldo { font-weight: 600; text-transform: none; letter-spacing: 0; }

      .tx-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.15s; }
      .tx-item:hover { background: var(--secondary-background-color, #f5f5f5); }
      .tx-item.unread .tx-name { font-weight: 700; }
      .tx-item.unread .tx-icon ha-icon { color: var(--primary-color, #03a9f4); }
      .tx-icon { flex-shrink: 0; position: relative; width: 22px; height: 22px; }
      .tx-icon ha-icon { --mdi-icon-size: 22px; color: var(--secondary-text-color); }
      .tx-read-toggle { display: none; position: absolute; inset: 0; border: none; background: transparent; cursor: pointer; padding: 0; color: var(--primary-color, #03a9f4); align-items: center; justify-content: center; }
      .tx-read-toggle ha-icon { --mdi-icon-size: 22px; }
      .tx-item:hover .tx-read-toggle { display: flex; }
      .tx-item:hover > .tx-icon > ha-icon:first-child { visibility: hidden; }
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
      #btn-menu { display: none; }

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

        #btn-menu { display: inline-flex; }
        .shell.detail-open #btn-menu { display: none; }
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
})();
