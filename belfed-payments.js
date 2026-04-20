// belfed-payments.js
// YooKassa payment integration for BelFed Analytics members area.
// Loaded after belfed-auth.js. Exposes window.BelfedPayments.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://obujqvqqmyfcfflhqvud.supabase.co';
  var CREATE_PAYMENT_URL = SUPABASE_URL + '/functions/v1/yookassa-create-payment';
  var DEFAULT_RETURN_URL = window.location.origin + '/members.html?payment=success';

  function getSupabaseClient() {
    if (typeof supaClient !== 'undefined') return supaClient; if (window.supaClient) return window.supaClient;
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

  async function getAccessToken() {
    var client = getSupabaseClient();
    if (!client || !client.auth) throw new Error('Supabase клиент не инициализирован');
    var res = await client.auth.getSession();
    var session = res && res.data && res.data.session;
    if (!session) throw new Error('Войдите в аккаунт, чтобы оплатить');
    return session.access_token;
  }

  async function createPayment(opts) {
    opts = opts || {};
    var plan = opts.plan || 'month';
    var returnUrl = opts.return_url || DEFAULT_RETURN_URL;
    var token = await getAccessToken();
    var body = { plan: plan, return_url: returnUrl };
    var resp = await fetch(CREATE_PAYMENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await resp.json(); } catch (e) {}
    if (!resp.ok) {
      var msg = (data && (data.error || data.message)) || ('HTTP ' + resp.status);
      throw new Error(msg);
    }
    if (!data || !data.confirmation_url) throw new Error('Нет confirmation_url в ответе');
    return data;
  }

  async function startCheckout(opts) {
    var data = await createPayment(opts);
    window.location.assign(data.confirmation_url);
  }

  function bindButton(btn, opts) {
    if (!btn) return;
    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      btn.disabled = true;
      var origText = btn.textContent;
      btn.textContent = 'Перенаправление...';
      try { await startCheckout(opts); }
      catch (err) {
        console.error('[BelfedPayments] checkout failed', err);
        var status = document.getElementById('payStatus');
        var text = 'Ошибка оплаты: ' + (err && err.message ? err.message : err);
        if (status) { status.textContent = text; status.style.color = 'var(--red)'; } else { alert(text); }
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  }

  function autoBind() {
    var btns = document.querySelectorAll('[data-plan]');
    for (var i = 0; i < btns.length; i++) {
      bindButton(btns[i], { plan: btns[i].getAttribute('data-plan') });
    }
  }

  function handleReturn() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.get('payment') === 'success') {
        if (typeof window.belfedRefreshProfile === 'function') window.belfedRefreshProfile();
      }
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () { autoBind(); handleReturn(); });

  window.BelfedPayments = { createPayment: createPayment, startCheckout: startCheckout, bindButton: bindButton, autoBind: autoBind };
})();
