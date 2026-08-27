/* =========================================================================
   فضفضلي — متصل بـ Supabase عن طريق دوال RPC مخصصة (من غير Supabase Auth خالص)
   حطي بيانات مشروعك هنا (Project Settings → API):
   ========================================================================= */
const SUPABASE_URL = 'https://uamzhfcxyzlutbmgvnmv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0yLuurldwAF9g9QhWGXa4Q_nrsRWZqV';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TOKEN_KEY = 'fadfadli_token';
const ACCENTS = ['#c9a66b', '#a8465a', '#7fb0a0', '#8ea8d8', '#c98ea3'];

let me = null;   // بروفايل المستخدم الحالي
let token = null; // توكن الجلسة

function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function fmtTime(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function rpcErrMsg(error){
  const msg = (error && error.message) || '';
  if(msg.includes('username_taken')) return 'اسم المستخدم ده متاخد، جرب اسم تاني';
  if(msg.includes('invalid_credentials')) return 'اسم المستخدم أو كلمة المرور غلط';
  if(msg.includes('invalid_input')) return 'البيانات المدخلة مش صح';
  if(msg.includes('user_not_found')) return 'مفيش مستخدم بالاسم ده';
  if(msg.includes('cannot_add_self')) return 'مينفعش تضيف نفسك';
  if(msg.includes('already_exists')) return 'في طلب أو صداقة موجودة بالفعل';
  if(msg.includes('blocked')) return 'المستخدم ده حاجبك';
  if(msg.includes('time_over')) return 'خلصت الساعة بتاعتك النهاردة';
  if(msg.includes('blogs_over')) return 'وصلت لحد الـ٧ مدونات المسموحة النهاردة';
  if(msg.includes('wrong_password')) return 'كلمة السر الحالية غلط';
  return 'حصل خطأ، جربي تاني';
}

/* ---------------- PASSWORD VISIBILITY ---------------- */
function togglePass(inputId){
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
}

/* ---------------- AUTH ---------------- */
function showSignup(){
  document.getElementById('login-form').style.display='none';
  document.getElementById('signup-form').style.display='block';
}
function showLogin(){
  document.getElementById('signup-form').style.display='none';
  document.getElementById('login-form').style.display='block';
}

async function doSignup(){
  const username = document.getElementById('signup-name').value.trim();
  const dn = document.getElementById('signup-dn').value.trim() || username;
  const pass = document.getElementById('signup-pass').value;
  const err = document.getElementById('signup-error');
  err.textContent = '';
  if(!username || !pass){ err.textContent = 'لازم تكتب اسم المستخدم وكلمة المرور'; return; }
  if(pass.length < 6){ err.textContent = 'كلمة المرور لازم تكون ٦ حروف على الأقل'; return; }

  const { data, error } = await sb.rpc('signup_user', { p_username: username, p_password: pass, p_display_name: dn });
  if(error){ err.textContent = rpcErrMsg(error); return; }

  token = data.token; me = data.profile;
  localStorage.setItem(TOKEN_KEY, token);
  enterApp();
}

async function doLogin(){
  const username = document.getElementById('login-name').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  if(!username || !pass){ err.textContent = 'اكتب اسم المستخدم وكلمة المرور'; return; }

  const { data, error } = await sb.rpc('login_user', { p_username: username, p_password: pass });
  if(error){ err.textContent = rpcErrMsg(error); return; }

  token = data.token; me = data.profile;
  localStorage.setItem(TOKEN_KEY, token);
  enterApp();
}

async function logout(){
  if(token) await sb.rpc('logout_user', { p_token: token });
  stopUsageTimer();
  localStorage.removeItem(TOKEN_KEY);
  token = null; me = null;
  document.getElementById('app-shell').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  showLogin();
}

async function changePassword(){
  const oldP = document.getElementById('cp-old').value;
  const newP = document.getElementById('cp-new').value;
  const err = document.getElementById('cp-error');
  err.style.color = '';
  err.textContent = '';
  if(newP.length < 6){ err.textContent = 'كلمة المرور الجديدة لازم تكون ٦ حروف على الأقل'; return; }
  const { error } = await sb.rpc('change_password', { p_token: token, p_old_password: oldP, p_new_password: newP });
  if(error){ err.textContent = rpcErrMsg(error); return; }
  document.getElementById('cp-old').value = '';
  document.getElementById('cp-new').value = '';
  err.style.color = '#8fd6b0';
  err.textContent = 'اتغيرت كلمة السر بنجاح';
}

/* ---------------- USAGE (٧ مدونات / ٦٠ دقيقة يوميًا) ---------------- */
let usageTimer = null;
function startUsageTimer(){
  stopUsageTimer();
  usageTimer = setInterval(async ()=>{
    if(me.seconds_used >= 3600) return;
    const { data, error } = await sb.rpc('bump_usage_seconds', { p_token: token, p_delta: 1 });
    if(!error && data){
      me.blogs_used = data.blogs_used;
      me.seconds_used = data.seconds_used;
      renderUsageBar();
    }
  }, 1000);
}
function stopUsageTimer(){ if(usageTimer) clearInterval(usageTimer); usageTimer=null; }

function renderUsageBar(){
  const secLeft = Math.max(0, 3600 - me.seconds_used);
  document.getElementById('time-left').textContent = fmtTime(secLeft);
  document.getElementById('blogs-left').textContent = me.blogs_used + '/7';
  document.getElementById('time-pill').classList.toggle('warn', secLeft <= 300);
  document.getElementById('blogs-pill').classList.toggle('warn', me.blogs_used >= 7);
}
function blogsLeft(){ return Math.max(0, 7 - me.blogs_used); }
function secondsLeft(){ return Math.max(0, 3600 - me.seconds_used); }

/* ---------------- ENTER APP / VIEWS ---------------- */
async function enterApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-shell').style.display='flex';

  document.getElementById('header-dn').textContent = me.display_name;
  document.getElementById('header-un').textContent = '@'+me.username;
  document.getElementById('profile-dn-input').value = me.display_name;
  document.getElementById('profile-un').textContent = '@'+me.username;

  applyTheme(me.theme);
  applyAccent(me.accent);
  document.getElementById('theme-toggle').checked = (me.theme === 'light');
  buildAccentSwatches();

  renderUsageBar();
  await Promise.all([renderMyBlogs(), renderFriendsGrid(), renderBlockList(), renderNotifications()]);
  startUsageTimer();
  switchView('profile');
}

function switchView(v){
  ['profile','blogs','settings','notifs'].forEach(id=>{
    document.getElementById('view-'+id).style.display = (id===v)?'block':'none';
  });
  document.querySelectorAll('nav.bottom button').forEach(b=> b.classList.toggle('active', b.dataset.v === v));
  if(v==='notifs') markNotificationsRead();
}

/* ---------------- THEME / ACCENT ---------------- */
function applyTheme(theme){ document.documentElement.classList.toggle('light', theme==='light'); }
async function toggleTheme(isLight){
  me.theme = isLight ? 'light' : 'dark';
  applyTheme(me.theme);
  await sb.rpc('update_theme_accent', { p_token: token, p_theme: me.theme, p_accent: me.accent });
}
function applyAccent(hex){ document.documentElement.style.setProperty('--user-accent', hex); }
function buildAccentSwatches(){
  const wrap = document.getElementById('accent-swatches');
  wrap.innerHTML = '';
  ACCENTS.forEach(hex=>{
    const s = document.createElement('div');
    s.className = 'swatch' + (me.accent===hex ? ' active':'');
    s.style.background = hex;
    s.onclick = async ()=>{
      me.accent = hex; applyAccent(hex); buildAccentSwatches();
      await sb.rpc('update_theme_accent', { p_token: token, p_theme: me.theme, p_accent: hex });
    };
    wrap.appendChild(s);
  });
}

/* ---------------- PROFILE ---------------- */
async function updateDisplayName(val){
  val = val.trim();
  if(!val) return;
  me.display_name = val;
  document.getElementById('header-dn').textContent = val;
  await sb.rpc('update_display_name', { p_token: token, p_name: val });
}

/* ---------------- COMPOSER ---------------- */
function openComposer(){
  if(secondsLeft() <= 0){ alert('خلصت الساعة بتاعتك النهاردة، اتقابلنا بكرة 🌙'); return; }
  if(blogsLeft() <= 0){ alert('وصلت لحد الـ٧ مدونات المسموحة النهاردة'); return; }
  document.getElementById('composer-title').value = '';
  document.getElementById('composer-body').innerHTML = '';
  document.getElementById('composer-error').textContent = '';
  document.getElementById('composer-overlay').classList.add('open');
}
function closeSheet(id){ document.getElementById(id).classList.remove('open'); }
function highlightSelection(color){ document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, color); }
function clearHighlight(){ document.execCommand('foreColor', false, 'inherit'); }

async function publishBlog(){
  const title = document.getElementById('composer-title').value.trim();
  const body = document.getElementById('composer-body').innerHTML.trim();
  const font = document.getElementById('composer-font').value;
  const err = document.getElementById('composer-error');
  if(!title || !body){ err.textContent = 'لازم تكتب عنوان ونص للمدونة'; return; }

  const { error } = await sb.rpc('publish_blog', { p_token: token, p_title: title, p_body: body, p_font: font });
  if(error){ err.textContent = rpcErrMsg(error); return; }

  me.blogs_used += 1;
  renderUsageBar();
  closeSheet('composer-overlay');
  renderMyBlogs();
}

async function renderMyBlogs(){
  const list = document.getElementById('my-blogs-list');
  const { data } = await sb.rpc('list_blogs', { p_token: token, p_author_id: me.id });
  const mine = data || [];
  list.innerHTML = '';
  if(mine.length===0){ list.innerHTML = '<div class="empty-state">لسه معملتش أي مدونة فضفضلي، دوس على + وابدأ</div>'; return; }
  mine.forEach(b=> list.appendChild(renderBlogCard(b, me.id)));
}

function renderBlogCard(b, authorId){
  const card = document.createElement('div');
  card.className = 'blog-card';
  card.innerHTML = `
    <div class="bh">
      <span class="bt" style="font-family:${b.font}">${escapeHtml(b.title)}</span>
      <span class="bd">${new Date(b.created_at).toLocaleDateString('ar-EG')}</span>
    </div>
    <div class="bx" style="font-family:${b.font}">${b.body}</div>
    <div class="actions">
      <button class="like-btn ${b.liked_by_me?'liked':''}" onclick="toggleLike('${b.id}','${authorId}')">
        <svg viewBox="0 0 24 24" fill="${b.liked_by_me?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
        ${b.like_count}
      </button>
    </div>`;
  return card;
}

async function toggleLike(blogId, authorId){
  await sb.rpc('toggle_like', { p_token: token, p_blog_id: blogId });
  if(authorId === me.id) renderMyBlogs();
  if(openFriendId === authorId) openFriendBlogs(openFriendId, openFriendName);
}

/* ---------------- FRIENDS / REQUESTS ---------------- */
function openAddFriend(){
  document.getElementById('friend-name-input').value='';
  document.getElementById('friend-error').textContent='';
  document.getElementById('friend-overlay').classList.add('open');
}

async function sendFriendRequest(){
  const targetUsername = document.getElementById('friend-name-input').value.trim();
  const err = document.getElementById('friend-error');
  if(!targetUsername){ err.textContent = 'اكتب اسم المستخدم'; return; }

  const { error } = await sb.rpc('send_friend_request', { p_token: token, p_target_username: targetUsername });
  if(error){ err.textContent = rpcErrMsg(error); return; }

  closeSheet('friend-overlay');
  renderFriendsGrid();
}

async function acceptFriend(otherId){
  await sb.rpc('accept_friend', { p_token: token, p_other_id: otherId });
  renderFriendsGrid();
}

async function renderFriendsGrid(){
  const grid = document.getElementById('friends-grid');
  const empty = document.getElementById('friends-empty');
  const { data } = await sb.rpc('list_friends', { p_token: token });
  const list = data || [];
  grid.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';

  list.forEach(f=>{
    let tag = '';
    if(f.status === 'pending' && f.requested_by_me) tag = '<div class="pending-tag">بانتظار الموافقة</div>';
    if(f.status === 'pending' && !f.requested_by_me) tag = `<button class="btn" style="padding:6px; font-size:11px; margin-top:6px;" onclick="acceptFriend('${f.id}')">قبول الطلب</button>`;

    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `<div class="avatar">👤</div><div class="fn">${escapeHtml(f.display_name)}</div><div class="fu">@${escapeHtml(f.username)}</div>${tag}`;
    if(f.status === 'accepted') card.onclick = ()=> openFriendBlogs(f.id, f.display_name);
    grid.appendChild(card);
  });
}

let openFriendId = null, openFriendName = null;
async function openFriendBlogs(otherId, otherDisplayName){
  if(secondsLeft() <= 0){ alert('خلصت الساعة بتاعتك النهاردة'); return; }

  const { data: blogs, error } = await sb.rpc('list_blogs', { p_token: token, p_author_id: otherId });
  if(error){ alert(rpcErrMsg(error)); return; }

  openFriendId = otherId; openFriendName = otherDisplayName;
  let overlay = document.getElementById('friend-blogs-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.className = 'overlay open';
    overlay.id = 'friend-blogs-overlay';
    document.querySelector('.screen').appendChild(overlay);
  }
  overlay.classList.add('open');
  overlay.innerHTML = `<div class="sheet">
      <div class="sheet-head"><h3>مدونات ${escapeHtml(otherDisplayName)}</h3>
      <button class="close-x" onclick="document.getElementById('friend-blogs-overlay').remove(); openFriendId=null;">✕</button></div>
      <div id="friend-blogs-list"></div>
    </div>`;

  const list = overlay.querySelector('#friend-blogs-list');
  if(!blogs || blogs.length===0){ list.innerHTML = '<div class="empty-state">لسه مفيش مدونات</div>'; return; }
  [...blogs].reverse().forEach(b=> list.appendChild(renderBlogCard(b, otherId)));
}

/* ---------------- BLOCKING ---------------- */
async function renderBlockList(){
  const wrap = document.getElementById('block-list');
  const empty = document.getElementById('block-empty');
  const [{ data: friends }, { data: blockedIds }] = await Promise.all([
    sb.rpc('list_friends', { p_token: token }),
    sb.rpc('list_blocked', { p_token: token })
  ]);
  const accepted = (friends||[]).filter(f=>f.status==='accepted');
  const blocked = new Set(blockedIds||[]);
  wrap.innerHTML = '';
  empty.style.display = accepted.length ? 'none' : 'block';

  accepted.forEach(f=>{
    const isBlocked = blocked.has(f.id);
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<div><div class="rl">${escapeHtml(f.display_name)}</div><div class="rs">@${escapeHtml(f.username)}</div></div>
      <button class="btn ${isBlocked?'ghost':'wine'}" style="width:auto; padding:7px 12px; font-size:12px;" onclick="toggleBlock('${f.id}')">${isBlocked?'إلغاء الحجب':'حجب هذا المستخدم'}</button>`;
    wrap.appendChild(row);
  });
}

async function toggleBlock(otherId){
  await sb.rpc('toggle_block', { p_token: token, p_other_id: otherId });
  renderBlockList();
}

/* ---------------- NOTIFICATIONS ---------------- */
const NOTIF_ICON = { accept:'🤝', block:'🚫', newblog:'📝', view:'👁️', like:'❤️' };

async function renderNotifications(){
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');
  const { data } = await sb.rpc('list_notifications', { p_token: token });
  const rows = data || [];
  list.innerHTML = '';
  empty.style.display = rows.length ? 'none' : 'block';
  rows.forEach(n=>{
    const el = document.createElement('div');
    el.className = 'notif-item';
    el.innerHTML = `<div class="ni-ico">${NOTIF_ICON[n.type]||'🔔'}</div>
      <div><div class="ni-txt">${escapeHtml(n.text)}</div><div class="ni-time">${new Date(n.created_at).toLocaleString('ar-EG')}</div></div>`;
    list.appendChild(el);
  });
}
async function markNotificationsRead(){
  await sb.rpc('mark_notifications_read', { p_token: token });
}

/* ---------------- BOOTSTRAP ---------------- */
(async function init(){
  const saved = localStorage.getItem(TOKEN_KEY);
  if(!saved) return;
  const { data, error } = await sb.rpc('get_session_profile', { p_token: saved });
  if(error || !data){ localStorage.removeItem(TOKEN_KEY); return; }
  token = saved; me = data;
  await enterApp();
})();