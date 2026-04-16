// ===========================================
// BelFed Auth — Shared Identity Module (RU)
// ===========================================
// Include AFTER supabase-js CDN script.
// Each page must define: onAuthReady(profile, session)
// and onAuthSignedOut()

var SUPABASE_URL = 'https://obujqvqqmyfcfflhqvud.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9idWpxdnFxbXlmY2ZmbGhxdnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDgxNjYsImV4cCI6MjA4OTkyNDE2Nn0.syl4YBLbf8aBitxyK3gCL51pPYxWjEW99mMTXJaQQ8w';
var supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var currentProfile = null;
var currentSubscription = null;

// --- Auth UI helpers ---
function showAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  document.getElementById('signinForm').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('loginMsg').style.display = 'none';
  var fpBlock = document.getElementById('forgotPasswordBlock');
  var fpLink = document.getElementById('forgotPasswordLink');
  if (fpBlock) fpBlock.style.display = 'none';
  if (fpLink) fpLink.style.display = 'block';
  var rs = document.getElementById('resetStatus');
  if (rs) rs.style.display = 'none';
}

async function handleSignIn() {
  var email = document.getElementById('siEmail').value.trim();
  var pw = document.getElementById('siPassword').value;
  var errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!email || !pw) { errEl.textContent = 'Введите email и пароль'; errEl.style.display = 'block'; return; }
  try {
    var res = await supaClient.auth.signInWithPassword({ email: email, password: pw });
    if (res.error) throw res.error;
  } catch (err) { errEl.textContent = err.message || 'Ошибка входа'; errEl.style.display = 'block'; }
}

async function handleSignUp() {
  var email = document.getElementById('suEmail').value.trim();
  var pw = document.getElementById('suPassword').value;
  var pw2 = document.getElementById('suPassword2').value;
  var errEl = document.getElementById('loginError');
  var msgEl = document.getElementById('loginMsg');
  errEl.style.display = 'none'; msgEl.style.display = 'none';
  if (!email || !pw || !pw2) { errEl.textContent = 'Заполните все поля'; errEl.style.display = 'block'; return; }
  if (pw !== pw2) { errEl.textContent = 'Пароли не совпадают'; errEl.style.display = 'block'; return; }
  if (pw.length < 6) { errEl.textContent = 'Пароль должен быть не менее 6 символов'; errEl.style.display = 'block'; return; }
  try {
    var res = await supaClient.auth.signUp({ email: email, password: pw });
    if (res.error) throw res.error;
    if (res.data.user && !res.data.session) {
      msgEl.textContent = 'Проверьте почту для подтверждения аккаунта, затем войдите.';
      msgEl.style.display = 'block';
    } else if (res.data.session) {
      await checkProfile();
    }
  } catch (err) { errEl.textContent = err.message || 'Ошибка регистрации'; errEl.style.display = 'block'; }
}

async function handleForgotPassword() {
  var email = document.getElementById('resetEmail').value.trim();
  var statusEl = document.getElementById('resetStatus');
  statusEl.style.display = 'block';
  if (!email) { statusEl.textContent = 'Введите ваш email'; statusEl.style.color = 'var(--red, #c50000)'; return; }
  statusEl.textContent = 'Отправка ссылки...';
  statusEl.style.color = 'var(--gray, #999)';
  try {
    var res = await supaClient.auth.resetPasswordForEmail(email, { redirectTo: 'https://belfed.ru/reset-password.html' });
    if (res.error) throw res.error;
    statusEl.textContent = 'Ссылка отправлена! Проверьте почту.';
    statusEl.style.color = 'var(--green, #1a7a1a)';
  } catch (err) { statusEl.textContent = err.message || 'Ошибка отправки'; statusEl.style.color = 'var(--red, #c50000)'; }
}

async function handleLogout() {
  await supaClient.auth.signOut();
  currentProfile = null;
  currentSubscription = null;
  if (typeof onAuthSignedOut === 'function') onAuthSignedOut();
}

// --- Entitlement engine ---
async function getEntitlement(uid) {
  var subRes = await supaClient.from('subscriptions').select('*').eq('user_id', uid).in('status', ['active', 'trialing']).order('created_at', { ascending: false }).limit(1);
  if (subRes.data && subRes.data.length > 0) {
    var sub = subRes.data[0];
    if (sub.current_period_end && new Date(sub.current_period_end) > new Date()) {
      return { access: true, reason: 'subscription', status: sub.status, subscription: sub };
    }
    return { access: false, reason: 'subscription_expired', status: 'expired', subscription: sub };
  }
  var profRes = await supaClient.from('profiles').select('*').eq('id', uid).single();
  if (profRes.error || !profRes.data) return { access: false, reason: 'no_profile', status: 'none', profile: null };
  var p = profRes.data;
  currentProfile = p;
  if (p.subscription_status === 'admin') return { access: true, reason: 'admin', status: 'admin', profile: p };
  if (p.subscription_status === 'active') return { access: true, reason: 'active', status: 'active', profile: p };
  if (p.subscription_status === 'trial') {
    if (p.trial_end && new Date(p.trial_end) > new Date()) {
      return { access: true, reason: 'trial', status: 'trial', profile: p };
    }
    await supaClient.from('profiles').update({ subscription_status: 'expired' }).eq('id', uid);
    p.subscription_status = 'expired';
    return { access: false, reason: 'trial_expired', status: 'expired', profile: p };
  }
  return { access: false, reason: 'expired', status: p.subscription_status || 'none', profile: p };
}

async function checkProfile() {
  var sess = await supaClient.auth.getSession();
  if (!sess.data.session) { if (typeof onAuthSignedOut === 'function') onAuthSignedOut(); return; }
  var uid = sess.data.session.user.id;
  var ent = await getEntitlement(uid);
  if (!currentProfile) {
    var pr = await supaClient.from('profiles').select('*').eq('id', uid).single();
    if (pr.data) currentProfile = pr.data;
  }
  currentSubscription = ent.subscription || null;
  if (typeof onAuthReady === 'function') onAuthReady(currentProfile, sess.data.session, ent);
}

async function checkAuth() {
  var hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    var params = new URLSearchParams(hash.substring(1));
    var at = params.get('access_token');
    var rt = params.get('refresh_token');
    if (at && rt) {
      await supaClient.auth.setSession({ access_token: at, refresh_token: rt });
      window.location.hash = '';
    }
  }
  var sess = await supaClient.auth.getSession();
  if (sess.data.session) { await checkProfile(); }
  else { if (typeof onAuthSignedOut === 'function') onAuthSignedOut(); }
}

supaClient.auth.onAuthStateChange(function(event, session) {
  if (event === 'SIGNED_IN' && session) { checkProfile(); }
  if (event === 'SIGNED_OUT') {
    currentProfile = null;
    currentSubscription = null;
    if (typeof onAuthSignedOut === 'function') onAuthSignedOut();
  }
});

checkAuth();
