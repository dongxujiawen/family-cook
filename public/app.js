/* 家庭点菜 H5 —— 前端逻辑（老公点菜 / 老婆查看） */
(function () {
  'use strict';

  // ---------- 基础工具 ----------
  const $ = (sel) => document.querySelector(sel);
  const ROLE_KEY = 'for_role';

  function todayStr() {
    const d = new Date();
    return fmt(d);
  }
  function tomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return fmt(d);
  }
  function fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function weekday(dateStr) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const d = new Date(dateStr + 'T00:00:00');
    return names[d.getDay()];
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 1600);
  }
  async function api(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) throw new Error('网络错误 ' + res.status);
    return res.json();
  }

  // ---------- 全局状态 ----------
  let role = localStorage.getItem(ROLE_KEY) || null;
  let dishes = [];
  let orders = []; // 当前视图相关的订单
  let selectedDate = tomorrowStr(); // 老公默认点“明天”的菜
  let wifeDate = 'today';

  // ---------- 角色切换 ----------
  function applyRole() {
    const mask = $('#roleMask');
    const hView = $('#husbandView');
    const wView = $('#wifeView');
    const badge = $('#switchRole');
    if (!role) {
      mask.hidden = false;
      hView.hidden = true;
      wView.hidden = true;
      badge.hidden = true;
      return;
    }
    mask.hidden = true;
    badge.hidden = false;
    badge.textContent = role === 'husband' ? '👨 老公' : '👩 老婆';
    hView.hidden = role !== 'husband';
    wView.hidden = role !== 'wife';
    refresh();
  }

  document.querySelectorAll('.role-btn').forEach((b) => {
    b.addEventListener('click', () => {
      role = b.dataset.role;
      localStorage.setItem(ROLE_KEY, role);
      applyRole();
    });
  });
  $('#switchRole').addEventListener('click', () => {
    role = null;
    localStorage.removeItem(ROLE_KEY);
    applyRole();
  });

  // ---------- 老公视图 ----------
  $('#orderDate').value = selectedDate;
  $('#orderDate').addEventListener('change', (e) => {
    selectedDate = e.target.value || tomorrowStr();
    updateDateTip();
    loadOrdersForDate();
  });

  function updateDateTip() {
    const t = selectedDate === todayStr() ? '今天' : selectedDate === tomorrowStr() ? '明天' : '';
    $('#dateTip').textContent = t ? `（${t} · ${weekday(selectedDate)}）` : `（${weekday(selectedDate)}）`;
  }

  function renderPickList() {
    const wrap = $('#dishPickList');
    const chosen = new Set(orders.map((o) => o.dishId));
    if (!dishes.length) {
      wrap.innerHTML = '<div class="empty">还没有菜品，先在下面添加 👇</div>';
      $('#pickCount').textContent = '0 道';
      return;
    }
    wrap.innerHTML = '';
    dishes.forEach((d) => {
      const checked = chosen.has(d.id);
      const el = document.createElement('div');
      el.className = 'pick-item' + (checked ? ' checked' : '');
      el.innerHTML = `<div class="box">${checked ? '✓' : ''}</div><div class="name">${escapeHtml(d.name)}</div>`;
      el.addEventListener('click', () => {
        el.classList.toggle('checked');
        el.querySelector('.box').textContent = el.classList.contains('checked') ? '✓' : '';
        updatePickCount();
      });
      wrap.appendChild(el);
    });
    updatePickCount();
  }
  function updatePickCount() {
    const n = document.querySelectorAll('.pick-item.checked').length;
    $('#pickCount').textContent = n + ' 道';
  }

  function renderManageList() {
    const wrap = $('#dishManageList');
    wrap.innerHTML = '';
    dishes.forEach((d) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span>${escapeHtml(d.name)}</span>`;
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '×';
      del.addEventListener('click', async () => {
        if (!confirm(`删除菜品「${d.name}」？`)) return;
        await api('/api/dishes/' + d.id, { method: 'DELETE' });
        await loadDishes();
        toast('已删除');
      });
      chip.appendChild(del);
      wrap.appendChild(chip);
    });
  }

  $('#addDish').addEventListener('click', async () => {
    const input = $('#newDish');
    const name = input.value.trim();
    if (!name) return;
    await api('/api/dishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    input.value = '';
    await loadDishes();
    toast('已添加');
  });
  $('#newDish').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#addDish').click();
  });

  $('#saveOrder').addEventListener('click', async () => {
    const ids = [];
    document.querySelectorAll('.pick-item.checked').forEach((el, i) => {
      // 通过菜品名反查 id
      const name = el.querySelector('.name').textContent;
      const d = dishes.find((x) => x.name === name);
      if (d) ids.push(d.id);
    });
    await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: selectedDate, dishIds: ids }),
    });
    await loadOrdersForDate();
    toast(ids.length ? `已保存 ${ids.length} 道菜 🍳` : '已清空当天点菜');
  });

  // ---------- 老婆视图 ----------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      wifeDate = tab.dataset.wifedate;
      loadWifeOrders();
    });
  });

  function renderWifeOrders() {
    const wrap = $('#wifeOrderList');
    const label = wifeDate === 'today' ? '今天' : '明天';
    const dateStr = wifeDate === 'today' ? todayStr() : tomorrowStr();
    $('#wifeDateLabel').textContent = label;
    if (!orders.length) {
      wrap.innerHTML = '<div class="empty">老公还没点' + label + '的菜哦~</div>';
      $('#readyCount').textContent = '0/0 已准备';
      return;
    }
    wrap.innerHTML = '';
    orders.forEach((o) => {
      const ready = o.status === 'ready';
      const el = document.createElement('div');
      el.className = 'order-item' + (ready ? ' ready' : '');
      el.innerHTML = `<div class="dot"></div><div class="name">${escapeHtml(o.dishName)}</div><div class="state">${ready ? '已准备' : '未准备'}</div>`;
      el.addEventListener('click', async () => {
        const next = ready ? 'pending' : 'ready';
        await api('/api/orders/' + o.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        o.status = next;
        el.className = 'order-item' + (next === 'ready' ? ' ready' : '');
        el.querySelector('.state').textContent = next === 'ready' ? '已准备' : '未准备';
        updateReadyCount();
      });
      wrap.appendChild(el);
    });
    updateReadyCount();
  }
  function updateReadyCount() {
    const total = orders.length;
    const ready = orders.filter((o) => o.status === 'ready').length;
    $('#readyCount').textContent = `${ready}/${total} 已准备`;
  }

  // ---------- 数据加载 ----------
  async function loadDishes() {
    const r = await api('/api/dishes');
    dishes = r.dishes || [];
  }
  async function loadOrdersForDate() {
    const r = await api('/api/orders?date=' + selectedDate);
    orders = r.orders || [];
    renderPickList();
  }
  async function loadWifeOrders() {
    const dateStr = wifeDate === 'today' ? todayStr() : tomorrowStr();
    const r = await api('/api/orders?date=' + dateStr);
    orders = r.orders || [];
    renderWifeOrders();
  }

  async function refresh() {
    try {
      if (role === 'husband') {
        await loadDishes();
        updateDateTip();
        await loadOrdersForDate();
        renderManageList();
      } else if (role === 'wife') {
        await loadWifeOrders();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 启动 ----------
  applyRole();
  // 每 5 秒轮询，实现两人“实时”同步
  setInterval(() => {
    if (role) refresh();
  }, 5000);
})();
