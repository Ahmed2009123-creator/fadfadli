/* =========================================================================
   فضفضلي — متصل بـ Supabase
   حط بيانات مشروعك هنا (Project Settings → API في Supabase):
   ========================================================================= */
const SUPABASE_URL = 'ضع_رابط_مشروعك_هنا';
const SUPABASE_ANON_KEY = 'ضع_anon_public_key_هنا';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EMAIL_DOMAIN = '@fadfadli.app'; // بريد وهمي مبني على اسم المستخدم، مش هيتبعتله أي إيميل حقيقي
const ACCENTS = ['#c9a66b', '#a8465a', '#7fb0a0', '#8ea8d8', '#c98ea3'];

let me = null; // صف البروفايل الحالي (profiles row)

function todayStr(){ return new Date().toISOString().slice(0,10); }
function emailFor(username){ return username.trim().toLowerCase() + EMAIL_DOMAIN; }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function pairKey(a,b){ return a < b ? [a,b] : [b,a]; } // ترتيب ثابت للزوج في friendships/blocks

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
  const usernameRaw = document.getElementById('signup-name').value.trim();
  const username = usernameRaw.toLowerCase();
  const dn = document.getElementById('signup-dn').value.trim() || usernameRaw;
  const pass = document.getElementById('signup-pass').value;
  const err = document.getElementById('signup-error');
  err.textContent = '';

  if(!username || !pass){ err.textContent = 'لازم تكتب اسم المستخدم وكلمة المرور'; return; }
  if(pass.length < 6){ err.textContent = 'كلمة المرور لازم تكون ٦ حروف على الأقل'; return; }

  const { data: existing } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
  if(existing){ err.textContent = 'اسم المستخدم ده متاخد، جرب اسم تاني'; return; }

  const { data: signUpData, error: signUpErr } = await sb.auth.signUp({ email: emailFor(username), password: pass });
  if(signUpErr){ err.textContent = 'حصل خطأ: ' + signUpErr.message; return; }
  if(!signUpData.session){ err.textContent = 'الحساب اتعمل، بس محتاج تأكيد إيميل — راجع خطوة "عطّل تأكيد الإيميل" في إعدادات Supabase'; return; }

  const uid = signUpData.user.id;
  const { error: profErr } = await sb.from('profiles').insert({
    id: uid, username, display_name: dn
  });
  if(profErr){ err.textContent = 'حصل خطأ في إنشاء البروفايل: ' + profErr.message; return; }

  await loadMyProfile(uid);
  enterApp();
}

async function doLogin(){
  const username = document.getElementById('login-name').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  if(!username || !pass){ err.textContent = 'اكتب اسم المستخدم وكلمة المرور'; return; }

  const { data, error } = await sb.auth.signInWithPassword({ email: emailFor(username), password: pass });
  if(error){ err.textContent = 'اسم المستخدم أو كلمة المرور غلط'; return; }

  await loadMyProfile(data.user.id);
  enterApp();
}

async function logout(){
  await sb.auth.signOut();
  stopUsageTimer();
  me = null;
  document.getElementById('app-shell').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  showLogin();
}

async function loadMyProfile(uid){
  const { data, error } = await sb.from('profiles').select('*').eq('id', uid).single();
  if(error){ console.error(error); return; }
  me = data;
  await ensureFreshDay();
}

/* ---------------- USAGE RULES (٧ مدونات / ٦٠ دقيقة يوميًا) ---------------- */
async function ensureFreshDay(){
  if(me.usage_date !== todayStr()){
    me.usage_date = todayStr();
    me.blogs_used = 0;
    me.seconds_used = 0;
    await sb.from('profiles').update({ usage_date: me.usage_date, blogs_used: 0, seconds_used: 0 }).eq('id', me.id);
  }
}
function blogsLeft(){ return Math.max(0, 7 - me.blogs_used); }
function secondsLeft(){ return Math.max(0, 3600 - me.seconds_used); }

let usageTimer = null, unsavedSeconds = 0;
function startUsageTimer(){
  stopUsageTimer();
  usageTimer = setInterval(async ()=>{
    await ensureFreshDay();
    if(secondsLeft() <= 0) return;
    me.seconds_used += 1;
    unsavedSeconds += 1;
    renderUsageStrip();
    if(unsavedSeconds >= 5){ // نبعت التحديث لـ Supabase كل ٥ ثواني بدل كل ثانية
      unsavedSeconds = 0;
      await sb.from('profiles').update({ seconds_used: me.seconds_used }).eq('id', me.id);
    }
  }, 1000);
}
function stopUsageTimer(){ if(usageTimer) clearInterval(usageTimer); usageTimer=null; }

function renderUsageStrip(){
  document.getElementById('blogs-left').textContent = blogsLeft();
  document.getElementById('time-left').textContent = Math.ceil(secondsLeft()/60);
}

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

  renderUsageStrip();
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
  await sb.from('profiles').update({ theme: me.theme }).eq('id', me.id);
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
      await sb.from('profiles').update({ accent: hex }).eq('id', me.id);
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
  await sb.from('profiles').update({ display_name: val }).eq('id', me.id);
}

/* ---------------- COMPOSER ---------------- */
async function openComposer(){
  await ensureFreshDay();
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
  if(blogsLeft() <= 0){ err.textContent = 'وصلت لحد المدونات المسموح بيها النهاردة'; return; }

  const { error } = await sb.from('blogs').insert({ author_id: me.id, title, body, font });
  if(error){ err.textContent = 'حصل خطأ: ' + error.message; return; }

  me.blogs_used += 1;
  await sb.from('profiles').update({ blogs_used: me.blogs_used }).eq('id', me.id);
  await notifyFriendsAboutNewBlog(title);

  closeSheet('composer-overlay');
  renderUsageStrip();
  renderMyBlogs();
}

async function fetchBlogsWithLikes(authorId){
  const { data: blogs, error } = await sb.from('blogs').select('*').eq('author_id', authorId).order('created_at', { ascending:false });
  if(error || !blogs) return [];
  const ids = blogs.map(b=>b.id);
  let likesRows = [];
  if(ids.length){
    const { data } = await sb.from('likes').select('*').in('blog_id', ids);
    likesRows = data || [];
  }
  return blogs.map(b=>({
    ...b,
    likeCount: likesRows.filter(l=>l.blog_id===b.id).length,
    likedByMe: likesRows.some(l=>l.blog_id===b.id && l.user_id===me.id)
  }));
}

async function renderMyBlogs(){
  const list = document.getElementById('my-blogs-list');
  const mine = await fetchBlogsWithLikes(me.id);
  list.innerHTML = '';
  if(mine.length===0){ list.innerHTML = '<div class="empty-state">لسه معملتش أي مدونة فضفضلي، دوس على + وابدأ</div>'; return; }
  mine.forEach(b=> list.appendChild(renderBlogCard(b)));
}

function renderBlogCard(b){
  const card = document.createElement('div');
  card.className = 'blog-card';
  card.innerHTML = `
    <div class="bh">
      <span class="bt" style="font-family:${b.font}">${escapeHtml(b.title)}</span>
      <span class="bd">${new Date(b.created_at).toLocaleDateString('ar-EG')}</span>
    </div>
    <div class="bx" style="font-family:${b.font}">${b.body}</div>
    <div class="actions">
      <button class="like-btn ${b.likedByMe?'liked':''}" onclick="toggleLike('${b.id}','${b.author_id}','${escapeHtml(b.title).replace(/'/g,"\\'")}')">
        <svg viewBox="0 0 24 24" fill="${b.likedByMe?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
        ${b.likeCount}
      </button>
    </div>`;
  return card;
}

async function toggleLike(blogId, authorId, title){
  const { data: existing } = await sb.from('likes').select('*').eq('blog_id', blogId).eq('user_id', me.id).maybeSingle();
  if(existing){
    await sb.from('likes').delete().eq('blog_id', blogId).eq('user_id', me.id);
  } else {
    await sb.from('likes').insert({ blog_id: blogId, user_id: me.id });
    if(authorId !== me.id){
      await pushNotification(authorId, 'like', `${me.display_name} عمل إعجاب بمدونتك "${title}"`);
    }
  }
  renderMyBlogs();
  if(openFriendId === authorId) openFriendBlogs(openFriendId, openFriendName);
}

/* ---------------- FRIENDS / REQUESTS ---------------- */
function openAddFriend(){
  document.getElementById('friend-name-input').value='';
  document.getElementById('friend-error').textContent='';
  document.getElementById('friend-overlay').classList.add('open');
}

async function sendFriendRequest(){
  const targetUsername = document.getElementById('friend-name-input').value.trim().toLowerCase();
  const err = document.getElementById('friend-error');
  if(!targetUsername){ err.textContent = 'اكتب اسم المستخدم'; return; }
  if(targetUsername === me.username){ err.textContent = 'مينفعش تضيف نفسك'; return; }

  const { data: target } = await sb.from('profiles').select('id, username').eq('username', targetUsername).maybeSingle();
  if(!target){ err.textContent = 'مفيش مستخدم بالاسم ده'; return; }

  const [a,b] = pairKey(me.id, target.id);
  const { data: existing } = await sb.from('friendships').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
  if(existing){ err.textContent = 'في طلب أو صداقة موجودة بالفعل مع الشخص ده'; return; }

  const { error } = await sb.from('friendships').insert({ user_a:a, user_b:b, requested_by: me.id, status:'pending' });
  if(error){ err.textContent = 'حصل خطأ: ' + error.message; return; }

  closeSheet('friend-overlay');
  renderFriendsGrid();
}

async function acceptFriend(otherId, otherName){
  const [a,b] = pairKey(me.id, otherId);
  await sb.from('friendships').update({ status:'accepted' }).eq('user_a', a).eq('user_b', b);
  await pushNotification(otherId, 'accept', `${me.display_name} قبل طلب صداقتك`);
  renderFriendsGrid();
}

async function renderFriendsGrid(){
  const grid = document.getElementById('friends-grid');
  const empty = document.getElementById('friends-empty');
  grid.innerHTML = '';

  const { data: rows } = await sb.from('friendships').select('*').or(`user_a.eq.${me.id},user_b.eq.${me.id}`);
  const list = rows || [];
  empty.style.display = list.length ? 'none' : 'block';

  for(const row of list){
    const otherId = row.user_a === me.id ? row.user_b : row.user_a;
    const { data: other } = await sb.from('profiles').select('*').eq('id', otherId).single();
    if(!other) continue;

    let tag = '';
    if(row.status === 'pending' && row.requested_by === me.id) tag = '<div class="pending-tag">بانتظار الموافقة</div>';
    if(row.status === 'pending' && row.requested_by !== me.id) tag = `<button class="btn" style="padding:6px; font-size:11px; margin-top:6px;" onclick="acceptFriend('${otherId}','${escapeHtml(other.username)}')">قبول الطلب</button>`;

    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `<div class="avatar">👤</div><div class="fn">${escapeHtml(other.display_name)}</div><div class="fu">@${other.username}</div>${tag}`;
    if(row.status === 'accepted') card.onclick = ()=> openFriendBlogs(other.id, other.display_name);
    grid.appendChild(card);
  }
}

let openFriendId = null, openFriendName = null;
async function openFriendBlogs(otherId, otherDisplayName){
  await ensureFreshDay();
  if(secondsLeft() <= 0){ alert('خلصت الساعة بتاعتك النهاردة'); return; }

  const { data: iAmBlocked } = await sb.from('blocks').select('*').eq('blocker_id', otherId).eq('blocked_id', me.id).maybeSingle();
  if(iAmBlocked){ alert('المستخدم ده حاجبك، مش هتقدر تشوف مدوناته'); return; }

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

  const blogs = await fetchBlogsWithLikes(otherId);
  const list = overlay.querySelector('#friend-blogs-list');
  if(blogs.length===0){ list.innerHTML = '<div class="empty-state">لسه مفيش مدونات</div>'; return; }
  blogs.reverse().forEach(async b=>{
    list.appendChild(renderBlogCard(b));
    await pushNotification(otherId, 'view', `${me.display_name} شاف مدونتك "${b.title}"`);
  });
}

async function notifyFriendsAboutNewBlog(title){
  const { data: rows } = await sb.from('friendships').select('*').eq('status','accepted').or(`user_a.eq.${me.id},user_b.eq.${me.id}`);
  for(const row of (rows||[])){
    const otherId = row.user_a === me.id ? row.user_b : row.user_a;
    await pushNotification(otherId, 'newblog', `${me.display_name} ضاف مدونة فضفضلي جديدة`);
  }
}

/* ---------------- BLOCKING ---------------- */
async function renderBlockList(){
  const wrap = document.getElementById('block-list');
  const empty = document.getElementById('block-empty');
  const { data: rows } = await sb.from('friendships').select('*').eq('status','accepted').or(`user_a.eq.${me.id},user_b.eq.${me.id}`);
  const list = rows || [];
  wrap.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';

  const { data: myBlocks } = await sb.from('blocks').select('blocked_id').eq('blocker_id', me.id);
  const blockedIds = new Set((myBlocks||[]).map(x=>x.blocked_id));

  for(const row of list){
    const otherId = row.user_a === me.id ? row.user_b : row.user_a;
    const { data: other } = await sb.from('profiles').select('*').eq('id', otherId).single();
    if(!other) continue;
    const isBlocked = blockedIds.has(otherId);
    const r = document.createElement('div');
    r.className = 'row-item';
    r.innerHTML = `<div><div class="rl">${escapeHtml(other.display_name)}</div><div class="rs">@${other.username}</div></div>
      <button class="btn ${isBlocked?'ghost':'wine'}" style="width:auto; padding:7px 12px; font-size:12px;" onclick="toggleBlock('${otherId}')">${isBlocked?'إلغاء الحجب':'حجب هذا المستخدم'}</button>`;
    wrap.appendChild(r);
  }
}

async function toggleBlock(otherId){
  const { data: existing } = await sb.from('blocks').select('*').eq('blocker_id', me.id).eq('blocked_id', otherId).maybeSingle();
  if(existing){
    await sb.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', otherId);
  } else {
    await sb.from('blocks').insert({ blocker_id: me.id, blocked_id: otherId });
    await pushNotification(otherId, 'block', `${me.display_name} قام بحجبك`);
  }
  renderBlockList();
}

/* ---------------- NOTIFICATIONS ---------------- */
async function pushNotification(toUserId, type, text){
  await sb.from('notifications').insert({ user_id: toUserId, type, text });
}
const NOTIF_ICON = { accept:'🤝', block:'🚫', newblog:'📝', view:'👁️', like:'❤️' };

async function renderNotifications(){
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');
  const { data: items } = await sb.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending:false }).limit(50);
  list.innerHTML = '';
  const rows = items || [];
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
  await sb.from('notifications').update({ read:true }).eq('user_id', me.id).eq('read', false);
}

/* ---------------- BOOTSTRAP ---------------- */
(async function init(){
  const { data } = await sb.auth.getSession();
  if(data.session){
    await loadMyProfile(data.session.user.id);
    if(me) await enterApp();
  }
})();
