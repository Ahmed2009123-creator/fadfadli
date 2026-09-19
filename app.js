/* =========================================================================
   فضفضلي — متصل بـ Supabase عن طريق دوال RPC مخصصة (من غير Supabase Auth خالص)
   ========================================================================= */
const SUPABASE_URL = 'https://uamzhfcxyzlutbmgvnmv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0yLuurldwAF9g9QhWGXa4Q_nrsRWZqV';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TOKEN_KEY = 'fadfadli_token';
const ACCENTS = ['#c9a66b', '#a8465a', '#7fb0a0', '#8ea8d8', '#c98ea3'];

let me = null;
let token = null;
let editingBlogId = null;
let composingGroupId = null;

function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function stripHtml(html){ const d=document.createElement('div'); d.innerHTML=html; return d.textContent || ''; }
function readingTimeLabel(bodyHtml){
  const words = stripHtml(bodyHtml).trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words/130));
  return mins + ' د قراءة';
}
function sanitizeHtml(html){
  if(typeof DOMPurify === 'undefined') return stripHtml(html); // احتياطي: لو المكتبة ماتحمّلتش، اعرض نص خام بس من غير أي HTML
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b','i','u','br','span','div','mark','font'],
    ALLOWED_ATTR: ['style']
  });
}
function rpcErrMsg(error){
  const msg = (error && error.message) || '';
  if(msg.includes('username_taken')) return 'اسم المستخدم ده متاخد، جرب اسم تاني';
  if(msg.includes('username_length')) return 'اسم المستخدم لازم يكون بين ٣ و١٢ حرف';
  if(msg.includes('invalid_credentials')) return 'اسم المستخدم أو كلمة المرور غلط';
  if(msg.includes('invalid_input')) return 'البيانات المدخلة مش صح';
  if(msg.includes('user_not_found')) return 'مفيش مستخدم بالاسم ده';
  if(msg.includes('cannot_add_self')) return 'مينفعش تضيف نفسك';
  if(msg.includes('already_exists')) return 'في طلب أو صداقة موجودة بالفعل';
  if(msg.includes('blocked')) return 'المستخدم ده حاجبك';
  if(msg.includes('not_friends')) return 'لازم تكونوا أصحاب الأول عشان تقدر تتفاعل مع مدوناته';
  if(msg.includes('not_group_member')) return 'لازم تكون عضو في الجروب الأول';
  if(msg.includes('already_member')) return 'الشخص ده عضو في الجروب بالفعل';
  if(msg.includes('already_invited')) return 'اتبعتله دعوة للجروب ده بالفعل';
  if(msg.includes('owner_only')) return 'الحذف متاح لصاحب الجروب بس';
  if(msg.includes('need_new_owner')) return 'لازم تختار مالك جديد الأول';
  if(msg.includes('cooldown')) return 'لازم تستنى نص دقيقة بين كل مدونة والتانية';
  if(msg.includes('wrong_password')) return 'كلمة السر غلط';
  return 'حصل خطأ، جرب تاني';
}

/* ---------------- DIALOGS (بدل alert/confirm) ---------------- */
function showAlert(message){
  showDialogHTML(message, [{ label:'حسنًا', cls:'', action: closeDialog }]);
}
function showConfirm(message, onYes){
  showDialogHTML(message, [
    { label:'إلغاء', cls:'ghost', action: closeDialog },
    { label:'نعم', cls:'wine', action: ()=>{ closeDialog(); onYes(); } }
  ]);
}
function showDialogHTML(message, buttons){
  document.getElementById('dialog-message').textContent = message;
  const wrap = document.getElementById('dialog-buttons');
  wrap.innerHTML = '';
  buttons.forEach(b=>{
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls||'');
    btn.textContent = b.label;
    btn.onclick = b.action;
    wrap.appendChild(btn);
  });
  document.getElementById('dialog-overlay').classList.add('open');
}
function closeDialog(){ document.getElementById('dialog-overlay').classList.remove('open'); }

/* ---------------- TOAST + COPY USERNAME ---------------- */
let toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 1400);
}
function copyDisplayedUsername(el){
  const uname = el.textContent.replace(/^@/, '').trim();
  if(!uname || uname === '—') return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(uname).then(()=> showToast('تم نسخ الاسم')).catch(()=> showToast('تعذر النسخ'));
  } else {
    showToast('تعذر النسخ');
  }
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
  if(username.length < 3 || username.length > 12){ err.textContent = 'اسم المستخدم لازم يكون بين ٣ و١٢ حرف'; return; }
  if(pass.length < 6){ err.textContent = 'كلمة المرور لازم تكون ٦ حروف على الأقل'; return; }

  const { data, error } = await sb.rpc('signup_user', { p_username: username, p_password: pass, p_display_name: dn });
  if(error){ err.textContent = rpcErrMsg(error); return; }

  token = data.token; me = data.profile;
  localStorage.setItem(TOKEN_KEY, token);
  showIntroIfNeeded();
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
  showIntroIfNeeded();
}

function confirmLogout(){
  showConfirm('هل تريد تسجيل الخروج فعلاً؟', doLogout);
}
async function doLogout(){
  if(token) await sb.rpc('logout_user', { p_token: token });
  stopNotifPoll();
  localStorage.removeItem(TOKEN_KEY);
  token = null; me = null;
  document.getElementById('app-shell').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  showLogin();
}

function openDeleteAccount(){
  document.getElementById('delacc-pass').value = '';
  document.getElementById('delacc-error').textContent = '';
  document.getElementById('delete-account-overlay').classList.add('open');
}
function confirmDeleteAccount(){
  const pass = document.getElementById('delacc-pass').value;
  const err = document.getElementById('delacc-error');
  err.textContent = '';
  if(!pass){ err.textContent = 'اكتب كلمة السر'; return; }
  showConfirm('متأكد إنك عايز تحذف حسابك نهائيًا؟ الخطوة دي مفيش رجوع فيها.', async ()=>{
    const { error } = await sb.rpc('delete_account', { p_token: token, p_password: pass });
    if(error){ err.textContent = rpcErrMsg(error); return; }
    closeSheet('delete-account-overlay');
    stopNotifPoll();
    localStorage.removeItem(TOKEN_KEY);
    token = null; me = null;
    document.getElementById('app-shell').style.display='none';
    document.getElementById('auth-screen').style.display='flex';
    showLogin();
  });
}

async function changePassword(){
  const oldP = document.getElementById('cp-old').value;
  const newP = document.getElementById('cp-new').value;
  const err = document.getElementById('cp-error');
  err.style.color = ''; err.textContent = '';
  if(newP.length < 6){ err.textContent = 'كلمة المرور الجديدة لازم تكون ٦ حروف على الأقل'; return; }
  const { error } = await sb.rpc('change_password', { p_token: token, p_old_password: oldP, p_new_password: newP });
  if(error){ err.textContent = rpcErrMsg(error); return; }
  document.getElementById('cp-old').value = '';
  document.getElementById('cp-new').value = '';
  err.style.color = '#8fd6b0';
  err.textContent = 'اتغيرت كلمة السر بنجاح';
}

/* ---------------- عدد المدونات (بدون حدود يومية أو مؤقت) ---------------- */
function updateBlogCountDisplay(n){
  document.getElementById('blogs-count').textContent = n;
}

/* ---------------- NOTIFICATION BADGE POLLING ---------------- */
let notifPoll = null;
function startNotifPoll(){
  stopNotifPoll();
  refreshUnreadBadge();
  notifPoll = setInterval(refreshUnreadBadge, 20000);
}
function stopNotifPoll(){ if(notifPoll) clearInterval(notifPoll); notifPoll=null; }
async function refreshUnreadBadge(){
  const { data } = await sb.rpc('get_unread_count', { p_token: token });
  const badge = document.getElementById('notif-badge');
  const n = data || 0;
  badge.textContent = n > 9 ? '9+' : n;
  badge.style.display = n > 0 ? 'flex' : 'none';
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
  updateMyAvatars();

  await Promise.all([renderMyBlogs(), renderFriendsGrid(), renderBlockList()]);
  startNotifPoll();
  switchView('profile');
}

function switchView(v){
  ['profile','blogs','settings','notifs'].forEach(id=>{
    document.getElementById('view-'+id).style.display = (id===v)?'block':'none';
  });
  document.querySelectorAll('nav.bottom button').forEach(b=> b.classList.toggle('active', b.dataset.v === v));
  if(v==='notifs'){
    renderNotifications().then(()=>{
      mark_notifications_read_and_clear();
    });
  }
}
async function mark_notifications_read_and_clear(){
  await sb.rpc('mark_notifications_read', { p_token: token });
  refreshUnreadBadge();
}

/* ---------------- THEME / ACCENT ---------------- */
function applyTheme(theme){ document.documentElement.classList.toggle('light', theme==='light'); }
async function toggleTheme(isLight){
  me.theme = isLight ? 'light' : 'dark';
  applyTheme(me.theme);
  await sb.rpc('update_theme_accent', { p_token: token, p_theme: me.theme, p_accent: me.accent });
}
function applyAccent(hex){ document.documentElement.style.setProperty('--user-accent', hex); }
function avatarInitial(name){ return (name||'?').trim().charAt(0).toUpperCase() || '?'; }
function updateMyAvatars(){
  const letter = avatarInitial(me.display_name || me.username);
  [document.getElementById('header-avatar'), document.getElementById('profile-avatar')].forEach(el=>{
    if(!el) return;
    el.textContent = letter;
    el.classList.add('avatar-badge');
    el.style.background = me.accent;
  });
}
function buildAccentSwatches(){
  const wrap = document.getElementById('accent-swatches');
  wrap.innerHTML = '';
  ACCENTS.forEach(hex=>{
    const s = document.createElement('div');
    s.className = 'swatch' + (me.accent===hex ? ' active':'');
    s.style.background = hex;
    s.onclick = async ()=>{
      me.accent = hex; applyAccent(hex); buildAccentSwatches(); updateMyAvatars();
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
  updateMyAvatars();
  await sb.rpc('update_display_name', { p_token: token, p_name: val });
}

/* ---------------- COMPOSER (إنشاء / تعديل) ---------------- */
let selectedBlogColor = null;

function buildComposerColorSwatches(){
  const wrap = document.getElementById('composer-color-swatches');
  wrap.innerHTML = '';
  const defaultBtn = document.createElement('button');
  defaultBtn.type = 'button';
  defaultBtn.className = 'tb-btn' + (selectedBlogColor ? '' : ' active');
  defaultBtn.textContent = 'افتراضي (لونك)';
  defaultBtn.onclick = ()=>{ selectedBlogColor = null; buildComposerColorSwatches(); };
  wrap.appendChild(defaultBtn);
  ACCENTS.forEach(hex=>{
    const s = document.createElement('span');
    s.className = 'tb-swatch' + (selectedBlogColor===hex ? ' active':'');
    s.style.background = hex;
    s.onclick = ()=>{ selectedBlogColor = hex; buildComposerColorSwatches(); };
    wrap.appendChild(s);
  });
}

function openComposer(){
  editingBlogId = null;
  composingGroupId = null;
  selectedBlogColor = null;
  document.getElementById('composer-heading').textContent = 'مدونة فضفضلي جديدة';
  document.getElementById('composer-submit-btn').textContent = 'نشر المدونة';
  document.getElementById('composer-title').value = '';
  document.getElementById('composer-body').innerHTML = '';
  document.getElementById('composer-font').value = "'Tajawal', sans-serif";
  document.getElementById('composer-error').textContent = '';
  buildComposerColorSwatches();
  hideMarkRow();
  document.getElementById('composer-overlay').classList.add('open');
}

function openEditComposer(blogId, title, bodyHtml, font, color){
  editingBlogId = blogId;
  composingGroupId = null;
  selectedBlogColor = color || null;
  document.getElementById('composer-heading').textContent = 'تعديل المدونة';
  document.getElementById('composer-submit-btn').textContent = 'حفظ التعديل';
  document.getElementById('composer-title').value = title;
  document.getElementById('composer-body').innerHTML = sanitizeHtml(bodyHtml);
  document.getElementById('composer-font').value = font;
  document.getElementById('composer-error').textContent = '';
  buildComposerColorSwatches();
  hideMarkRow();
  document.getElementById('composer-overlay').classList.add('open');
}

function closeSheet(id){ document.getElementById(id).classList.remove('open'); }

/* ---------------- MARKER (تعليم على مقطع من النص) ---------------- */
function hideMarkRow(){
  document.getElementById('mark-row').classList.remove('show');
  document.getElementById('mark-swatches').style.display = 'none';
}
function toggleMarkSwatches(){
  const sw = document.getElementById('mark-swatches');
  sw.style.display = sw.style.display === 'none' ? 'inline-flex' : 'none';
}
function applyMarkColor(color){
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('hiliteColor', false, color);
  // من غير الجزء ده، اللون بيفضل ممتد مع أي كلام تاني تكتبه بعد الجزء المحدد
  const sel = window.getSelection();
  if(sel && sel.rangeCount){
    const range = sel.getRangeAt(0);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('hiliteColor', false, 'transparent');
  }
}
document.addEventListener('selectionchange', ()=>{
  const body = document.getElementById('composer-body');
  if(!body) return;
  const sel = window.getSelection();
  if(!sel || sel.rangeCount === 0 || sel.isCollapsed){ hideMarkRow(); return; }
  const anchor = sel.anchorNode;
  if(anchor && body.contains(anchor)){
    document.getElementById('mark-row').classList.add('show');
  } else {
    hideMarkRow();
  }
});

/* ---------------- اختصارات تنسيق أثناء الكتابة: *كلمة* = سميك، /كلمة/ = مايل ---------------- */
function applyMarkdownShortcuts(containerEl){
  function walk(pattern, tagName){
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let n;
    while(n = walker.nextNode()) textNodes.push(n);
    textNodes.forEach(node=>{
      const text = node.nodeValue;
      pattern.lastIndex = 0;
      if(!pattern.test(text)) return;
      pattern.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIndex = 0, m;
      while((m = pattern.exec(text))){
        if(m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
        const el = document.createElement(tagName);
        el.textContent = m[1];
        frag.appendChild(el);
        lastIndex = pattern.lastIndex;
      }
      if(lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  walk(/\*([^*\n]+)\*/g, 'b');
  walk(/\/([^\/\n]+)\//g, 'i');
}

async function publishBlog(){
  const title = document.getElementById('composer-title').value.trim();
  const bodyEl = document.getElementById('composer-body');
  const clone = bodyEl.cloneNode(true);
  applyMarkdownShortcuts(clone);
  const body = sanitizeHtml(clone.innerHTML.trim());
  const font = document.getElementById('composer-font').value;
  const err = document.getElementById('composer-error');
  if(!title || !body){ err.textContent = 'لازم تكتب عنوان ونص للمدونة'; return; }

  if(editingBlogId){
    const { error } = await sb.rpc('edit_blog', { p_token: token, p_blog_id: editingBlogId, p_title: title, p_body: body, p_font: font, p_color: selectedBlogColor });
    if(error){ err.textContent = rpcErrMsg(error); return; }
  } else {
    const { error } = await sb.rpc('publish_blog', { p_token: token, p_title: title, p_body: body, p_font: font, p_color: selectedBlogColor, p_group_id: composingGroupId });
    if(error){ err.textContent = rpcErrMsg(error); return; }
  }

  const wasGroup = composingGroupId || currentGroupId;
  editingBlogId = null;
  composingGroupId = null;
  closeSheet('composer-overlay');
  if(wasGroup) renderGroupBlogs(wasGroup);
  else renderMyBlogs();
}

function deleteBlog(blogId){
  showConfirm('هل تريد حذف هذه المدونة فعلاً؟', async ()=>{
    const { error } = await sb.rpc('delete_blog', { p_token: token, p_blog_id: blogId });
    if(error){ showAlert(rpcErrMsg(error)); return; }
    renderMyBlogs();
  });
}

async function renderMyBlogs(){
  const list = document.getElementById('my-blogs-list');
  const { data } = await sb.rpc('list_blogs', { p_token: token, p_author_id: me.id });
  const mine = data || [];
  updateBlogCountDisplay(mine.length);
  list.innerHTML = '';
  if(mine.length===0){ list.innerHTML = '<div class="empty-state">لسه معملتش أي مدونة فضفضلي، دوس على الزرار فوق وابدأ</div>'; return; }
  mine.forEach(b=> list.appendChild(renderBlogCard(b, me.id, true)));
}

function renderBlogCard(b, authorId, isMine, authorLabel, groupId){
  const card = document.createElement('div');
  card.className = 'blog-card';
  card.style.borderInlineStartColor = b.color || b.author_accent || 'var(--user-accent)';
  const preview = stripHtml(b.body).slice(0, 90);
  card.innerHTML = `
    <div class="bh">
      <span class="bt" style="font-family:${b.font}">${escapeHtml(b.title)}</span>
      <span class="bd">${new Date(b.created_at).toLocaleDateString('ar-EG')} <span class="dot">·</span> ${readingTimeLabel(b.body)}</span>
    </div>
    ${authorLabel ? `<div style="font-size:11px; color:var(--gold); margin-bottom:4px;">✍️ ${escapeHtml(authorLabel)}</div>` : ''}
    <div class="bp">${escapeHtml(preview)}</div>
    <div class="actions">
      <span class="like-badge">
        <svg viewBox="0 0 24 24" fill="${b.liked_by_me?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
        ${b.like_count}
      </span>
      ${isMine ? `<div class="card-icon-btns">
        <button class="icon-btn" title="تعديل"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="icon-btn danger" title="حذف"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg></button>
      </div>` : ''}
    </div>`;

  card.addEventListener('click', ()=> openBlogReader(b, authorId, groupId));
  if(isMine){
    const [editBtn, delBtn] = card.querySelectorAll('.icon-btn');
    editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openEditComposer(b.id, b.title, b.body, b.font, b.color); });
    delBtn.addEventListener('click', (e)=>{ e.stopPropagation(); deleteBlog(b.id); });
  }
  return card;
}

/* ---------------- BLOG READER (شاشة كاملة) ---------------- */
let readerBlog = null, readerAuthorId = null, readerGroupId = null;
function openBlogReader(b, authorId, groupId){
  const friendSheet = document.getElementById('friend-blogs-overlay');
  if(friendSheet) friendSheet.classList.remove('open');
  readerBlog = b; readerAuthorId = authorId; readerGroupId = groupId || null;
  document.getElementById('reader-title').textContent = b.title;
  document.getElementById('reader-title').style.fontFamily = b.font;
  document.getElementById('reader-text').innerHTML = sanitizeHtml(b.body);
  document.getElementById('reader-text').style.fontFamily = b.font;
  document.getElementById('reader-date').innerHTML = `${new Date(b.created_at).toLocaleDateString('ar-EG')} <span class="dot">·</span> ${readingTimeLabel(b.body)}`;
  updateReaderLikeUI();
  document.getElementById('reader-overlay').classList.add('open');
  if(authorId !== me.id){
    sb.rpc('mark_blog_viewed', { p_token: token, p_blog_id: b.id });
  }
}
function closeReader(){
  document.getElementById('reader-overlay').classList.remove('open');
  readerBlog = null; readerAuthorId = null; readerGroupId = null;
}
function updateReaderLikeUI(){
  const el = document.getElementById('reader-like');
  const icon = document.getElementById('reader-like-icon');
  el.classList.toggle('liked', !!readerBlog.liked_by_me);
  icon.setAttribute('fill', readerBlog.liked_by_me ? 'currentColor' : 'none');
  document.getElementById('reader-like-count').textContent = readerBlog.like_count;
}
async function toggleLikeInReader(){
  if(!readerBlog) return;
  const { data, error } = await sb.rpc('toggle_like', { p_token: token, p_blog_id: readerBlog.id });
  if(error) return;
  readerBlog.liked_by_me = !!data;
  readerBlog.like_count += data ? 1 : -1;
  updateReaderLikeUI();
  if(data){
    const icon = document.getElementById('reader-like-icon');
    icon.classList.remove('pop');
    void icon.offsetWidth; // إعادة تشغيل الأنيميشن
    icon.classList.add('pop');
  }
  if(readerAuthorId === me.id && !readerGroupId) renderMyBlogs();
  if(readerGroupId) renderGroupBlogs(readerGroupId);
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
  renderNotifications();
  refreshUnreadBadge();
}

async function rejectFriendRequest(otherId){
  await sb.rpc('reject_friend_request', { p_token: token, p_other_id: otherId });
  renderFriendsGrid();
  renderNotifications();
  refreshUnreadBadge();
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
    if(f.status === 'pending' && !f.requested_by_me) tag = `<div style="display:flex; gap:6px; justify-content:center; margin-top:6px;">
        <button class="btn" style="padding:6px; font-size:11px;" onclick="event.stopPropagation(); acceptFriend('${f.id}')">قبول</button>
        <button class="btn ghost" style="padding:6px; font-size:11px;" onclick="event.stopPropagation(); rejectFriendRequest('${f.id}')">رفض</button>
      </div>`;

    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `<div class="avatar avatar-badge" style="background:${f.accent || '#c9a66b'}">${avatarInitial(f.display_name)}</div><div class="fn">${escapeHtml(f.display_name)}</div><div class="fu un-copy" onclick="event.stopPropagation(); copyDisplayedUsername(this)">@${escapeHtml(f.username)}</div>${tag}`;
    if(f.status === 'accepted') card.onclick = ()=> openFriendBlogs(f.id, f.display_name);
    grid.appendChild(card);
  });
}

async function openFriendBlogs(otherId, otherDisplayName){
  const { data: blogs, error } = await sb.rpc('list_blogs', { p_token: token, p_author_id: otherId });
  if(error){ showAlert(rpcErrMsg(error)); return; }

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
      <button class="close-x" onclick="document.getElementById('friend-blogs-overlay').remove();">✕</button></div>
      <div id="friend-blogs-list"></div>
    </div>`;

  const list = overlay.querySelector('#friend-blogs-list');
  if(!blogs || blogs.length===0){ list.innerHTML = '<div class="empty-state">لسه مفيش مدونات</div>'; return; }
  [...blogs].forEach(b=> list.appendChild(renderBlogCard(b, otherId, false)));
}

/* ---------------- BLOGS/GROUPS TABS ---------------- */
function switchBlogsSub(sub){
  document.querySelectorAll('.seg-btn').forEach(b=> b.classList.toggle('active', b.dataset.sub === sub));
  document.getElementById('blogs-sub-friends').style.display = sub==='friends' ? 'block' : 'none';
  document.getElementById('blogs-sub-groups').style.display = sub==='groups' ? 'block' : 'none';
  if(sub === 'groups'){ renderGroupsList(); refreshGroupInviteBadge(); }
}

/* ---------------- GROUPS ---------------- */
let currentGroupId = null;
let currentGroupIsOwner = false;

async function doCreateGroup(){
  const { data, error } = await sb.rpc('create_group', { p_token: token });
  if(error){ showAlert(rpcErrMsg(error)); return; }
  await renderGroupsList();
  openGroupDetail(data.id, data.name, true);
}

async function renderGroupsList(){
  const grid = document.getElementById('groups-grid');
  const empty = document.getElementById('groups-empty');
  const { data } = await sb.rpc('list_my_groups', { p_token: token });
  const list = data || [];
  grid.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';
  list.forEach(g=>{
    const card = document.createElement('div');
    card.className = 'friend-card';
    card.innerHTML = `<div class="avatar avatar-badge" style="background:var(--gold);">👥</div><div class="fn">${escapeHtml(g.name)}</div><div class="fu">${g.member_count} عضو</div>`;
    card.onclick = ()=> openGroupDetail(g.id, g.name, g.is_owner);
    grid.appendChild(card);
  });
}

function openGroupDetail(groupId, groupName, isOwner){
  currentGroupId = groupId;
  currentGroupIsOwner = !!isOwner;
  document.getElementById('group-name-input').value = groupName;
  document.getElementById('group-menu-delete').style.display = currentGroupIsOwner ? 'block' : 'none';
  document.getElementById('group-menu').style.display = 'none';
  document.getElementById('group-overlay').classList.add('open');
  renderGroupBlogs(groupId);
}
function closeGroupOverlay(){
  document.getElementById('group-overlay').classList.remove('open');
  document.getElementById('group-menu').style.display = 'none';
  currentGroupId = null;
  currentGroupIsOwner = false;
}
function toggleGroupMenu(){
  const menu = document.getElementById('group-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function menuDeleteGroup(){
  document.getElementById('group-menu').style.display = 'none';
  if(!currentGroupIsOwner) return;
  showConfirm('متأكد إنك عايز تحذف الجروب ده نهائيًا؟ هتتمسح كل مدوناته كمان.', async ()=>{
    const { error } = await sb.rpc('delete_group', { p_token: token, p_group_id: currentGroupId });
    if(error){ showAlert(rpcErrMsg(error)); return; }
    closeGroupOverlay();
    renderGroupsList();
  });
}

async function menuLeaveGroup(){
  document.getElementById('group-menu').style.display = 'none';
  if(!currentGroupIsOwner){
    showConfirm('متأكد إنك عايز تخرج من الجروب؟', async ()=>{
      await sb.rpc('leave_group', { p_token: token, p_group_id: currentGroupId });
      closeGroupOverlay();
      renderGroupsList();
    });
    return;
  }
  const { data } = await sb.rpc('list_group_members', { p_token: token, p_group_id: currentGroupId });
  const others = (data || []).filter(m => m.id !== me.id);
  if(others.length === 0){
    showConfirm('انت لوحدك في الجروب ده، لو خرجت هيتم حذفه نهائيًا. متأكد؟', async ()=>{
      await sb.rpc('leave_group', { p_token: token, p_group_id: currentGroupId });
      closeGroupOverlay();
      renderGroupsList();
    });
    return;
  }
  showDialogHTML('إنت مالك الجروب ده — تحب تعمل إيه قبل ما تخرج؟', [
    { label:'إلغاء', cls:'ghost', action: closeDialog },
    { label:'حذف الجروب', cls:'wine', action: ()=>{ closeDialog(); menuDeleteGroup(); } },
    { label:'نقل الملكية والخروج', cls:'', action: ()=>{ closeDialog(); openTransferOwner(others); } }
  ]);
}

function openTransferOwner(members){
  const wrap = document.getElementById('transfer-owner-list');
  wrap.innerHTML = '';
  members.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<div><div class="rl">${escapeHtml(m.display_name)}</div><div class="rs">@${escapeHtml(m.username)}</div></div>
      <button class="btn" style="width:auto; padding:7px 12px; font-size:12px;">اختار ده</button>`;
    row.querySelector('button').onclick = async ()=>{
      const { error } = await sb.rpc('leave_group', { p_token: token, p_group_id: currentGroupId, p_new_owner_id: m.id });
      if(error){ showAlert(rpcErrMsg(error)); return; }
      closeSheet('transfer-owner-overlay');
      closeGroupOverlay();
      renderGroupsList();
    };
    wrap.appendChild(row);
  });
  document.getElementById('transfer-owner-overlay').classList.add('open');
}

async function renameCurrentGroup(newName){
  newName = newName.trim();
  if(!newName || !currentGroupId) return;
  const { error } = await sb.rpc('rename_group', { p_token: token, p_group_id: currentGroupId, p_name: newName });
  if(error){ showAlert(rpcErrMsg(error)); return; }
  renderGroupsList();
}

async function renderGroupBlogs(groupId){
  const list = document.getElementById('group-blogs-list');
  const empty = document.getElementById('group-blogs-empty');
  const { data, error } = await sb.rpc('list_group_blogs', { p_token: token, p_group_id: groupId });
  if(error){ showAlert(rpcErrMsg(error)); return; }
  const blogs = data || [];
  list.innerHTML = '';
  empty.style.display = blogs.length ? 'none' : 'block';
  blogs.forEach(b=>{
    const card = renderBlogCard(b, b.author_id, b.author_id === me.id, b.author_id === me.id ? null : b.author_name, groupId);
    list.appendChild(card);
  });
}

function openGroupComposer(){
  openComposer();
  composingGroupId = currentGroupId;
}

async function openGroupInvitePicker(){
  const { data, error } = await sb.rpc('list_group_invitable_friends', { p_token: token, p_group_id: currentGroupId });
  if(error){ showAlert(rpcErrMsg(error)); return; }
  const list = data || [];
  const wrap = document.getElementById('invitable-friends-list');
  const empty = document.getElementById('invitable-friends-empty');
  wrap.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';
  list.forEach(f=>{
    const row = document.createElement('div');
    row.className = 'row-item';
    row.innerHTML = `<div><div class="rl">${escapeHtml(f.display_name)}</div><div class="rs">@${escapeHtml(f.username)}</div></div>
      <button class="btn" style="width:auto; padding:7px 12px; font-size:12px;">ادعُ</button>`;
    row.querySelector('button').onclick = async ()=>{
      const { error: e2 } = await sb.rpc('invite_to_group', { p_token: token, p_group_id: currentGroupId, p_target_user_id: f.id });
      if(e2){ showAlert(rpcErrMsg(e2)); return; }
      row.remove();
      showToast('اتبعتت الدعوة');
    };
    wrap.appendChild(row);
  });
  document.getElementById('group-invite-picker-overlay').classList.add('open');
}

async function refreshGroupInviteBadge(){
  const { data } = await sb.rpc('count_group_invites', { p_token: token });
  const badge = document.getElementById('group-invite-badge');
  const n = data || 0;
  badge.textContent = n > 9 ? '9+' : n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}

async function openGroupInvites(){
  const { data } = await sb.rpc('list_group_invites', { p_token: token });
  const list = data || [];
  const wrap = document.getElementById('group-invites-list');
  const empty = document.getElementById('group-invites-empty');
  wrap.innerHTML = '';
  empty.style.display = list.length ? 'none' : 'block';
  list.forEach(inv=>{
    const row = document.createElement('div');
    row.className = 'notif-item';
    row.innerHTML = `<div class="ni-ico">👥</div>
      <div class="ni-body">
        <div class="ni-txt">${escapeHtml(inv.inviter_name)} دعاك للانضمام لجروب "${escapeHtml(inv.group_name)}"</div>
        <div class="ni-actions">
          <button class="btn">قبول</button>
          <button class="btn ghost">رفض</button>
        </div>
      </div>`;
    const [acceptBtn, rejectBtn] = row.querySelectorAll('button');
    acceptBtn.onclick = async ()=>{
      await sb.rpc('respond_group_invite', { p_token: token, p_invite_id: inv.id, p_accept: true });
      row.remove();
      renderGroupsList();
      refreshGroupInviteBadge();
    };
    rejectBtn.onclick = async ()=>{
      await sb.rpc('respond_group_invite', { p_token: token, p_invite_id: inv.id, p_accept: false });
      row.remove();
      refreshGroupInviteBadge();
    };
    wrap.appendChild(row);
  });
  document.getElementById('group-invites-overlay').classList.add('open');
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
    row.innerHTML = `<div><div class="rl">${escapeHtml(f.display_name)}</div><div class="rs un-copy" onclick="copyDisplayedUsername(this)">@${escapeHtml(f.username)}</div></div>
      <div style="display:flex; gap:6px;">
        <button class="btn ghost" style="width:auto; padding:7px 10px; font-size:11.5px;" onclick="confirmUnfriend('${f.id}','${escapeHtml(f.display_name).replace(/'/g,"\\'")}')">إلغاء الصداقة</button>
        <button class="btn ${isBlocked?'ghost':'wine'}" style="width:auto; padding:7px 10px; font-size:11.5px;" onclick="toggleBlock('${f.id}')">${isBlocked?'إلغاء الحجب':'حجب هذا المستخدم'}</button>
      </div>`;
    wrap.appendChild(row);
  });
}

function confirmUnfriend(otherId, otherName){
  showConfirm(`هل تريد إلغاء الصداقة مع ${otherName}؟ هتحتاجوا تضيفوا بعض تاني لو غيرتوا رأيكم.`, async ()=>{
    await sb.rpc('unfriend', { p_token: token, p_other_id: otherId });
    renderBlockList();
    renderFriendsGrid();
  });
}

async function toggleBlock(otherId){
  await sb.rpc('toggle_block', { p_token: token, p_other_id: otherId });
  renderBlockList();
}

/* ---------------- NOTIFICATIONS ---------------- */
const NOTIF_ICON = { accept:'🤝', reject:'🙅', block:'🚫', unblock:'🔓', unfriend:'💔', newblog:'📝', view:'👁️', like:'❤️', request:'➕', group_owner:'👑', group_invite:'👥', group_deleted:'🗑️', group_left:'🚪', group_blog_deleted:'🗑️' };

function groupNotifications(rows){
  const map = new Map();
  const order = [];
  rows.forEach(n=>{
    const key = n.type + '|' + n.text;
    if(!map.has(key)){ map.set(key, { ...n, count:1, ids:[n.id] }); order.push(key); }
    else {
      const g = map.get(key);
      g.count += 1;
      g.ids.push(n.id);
      if(new Date(n.created_at) > new Date(g.created_at)) g.created_at = n.created_at;
    }
  });
  return order.map(k=> map.get(k));
}

async function renderNotifications(){
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');
  const { data } = await sb.rpc('list_notifications', { p_token: token });
  const rows = data || [];
  const groups = groupNotifications(rows);
  list.innerHTML = '';
  empty.style.display = groups.length ? 'none' : 'block';
  groups.forEach(g=>{
    const el = document.createElement('div');
    el.className = 'notif-item';
    const idsJson = JSON.stringify(g.ids).replace(/"/g, '&quot;');
    let actionsHtml = '';
    if(g.type === 'request' && g.related_id){
      actionsHtml = `<div class="ni-actions">
        <button class="btn" onclick='resolveRequestNotif(true, "${g.related_id}", ${idsJson})'>قبول</button>
        <button class="btn ghost" onclick='resolveRequestNotif(false, "${g.related_id}", ${idsJson})'>رفض</button>
      </div>`;
    }
    const multBadge = g.count > 1 ? `<span class="notif-mult">×${g.count}</span>` : '';
    el.innerHTML = `<div class="ni-ico">${NOTIF_ICON[g.type]||'🔔'}</div>
      <div class="ni-body">
        <div class="ni-txt">${escapeHtml(g.text)}${multBadge}</div>
        <div class="ni-time">${new Date(g.created_at).toLocaleString('ar-EG')}</div>
        ${actionsHtml}
      </div>
      <button class="notif-del" title="حذف" onclick='deleteNotificationGroup(${idsJson}, this)'>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>`;
    list.appendChild(el);
  });
}

async function resolveRequestNotif(accept, otherId, ids){
  if(accept) await sb.rpc('accept_friend', { p_token: token, p_other_id: otherId });
  else await sb.rpc('reject_friend_request', { p_token: token, p_other_id: otherId });
  for(const id of ids){ await sb.rpc('delete_notification', { p_token: token, p_notification_id: id }); }
  renderFriendsGrid();
  renderNotifications();
  refreshUnreadBadge();
}

async function deleteNotificationGroup(ids, btnEl){
  for(const id of ids){ await sb.rpc('delete_notification', { p_token: token, p_notification_id: id }); }
  const item = btnEl.closest('.notif-item');
  if(item) item.remove();
  const list = document.getElementById('notif-list');
  document.getElementById('notif-empty').style.display = list.children.length ? 'none' : 'block';
  refreshUnreadBadge();
}

function confirmClearNotifications(){
  showConfirm('هل تريد مسح كل الإشعارات؟', async ()=>{
    await sb.rpc('clear_notifications', { p_token: token });
    renderNotifications();
    refreshUnreadBadge();
  });
}

/* ---------------- BOOTSTRAP ---------------- */
(async function init(){
  const saved = localStorage.getItem(TOKEN_KEY);
  if(!saved) return;
  const { data, error } = await sb.rpc('get_session_profile', { p_token: saved });
  if(error || !data){ localStorage.removeItem(TOKEN_KEY); return; }
  token = saved; me = data;
  showIntroIfNeeded();
})();

/* ---------------- INTRO / ONBOARDING (تظهر مرة واحدة فقط لكل حساب) ---------------- */
function showIntroIfNeeded(){
  if(me.seen_intro){ enterApp(); return; }
  document.getElementById('intro-step1').style.display='block';
  document.getElementById('intro-step2').style.display='none';
  document.getElementById('intro-agree-checkbox').checked = false;
  document.getElementById('intro-start-btn').disabled = true;
  document.getElementById('intro-overlay').classList.add('open');
}
function introNext(){
  document.getElementById('intro-step1').style.display='none';
  document.getElementById('intro-step2').style.display='block';
}
function introAgreeChanged(checked){
  document.getElementById('intro-start-btn').disabled = !checked;
}
async function introFinish(){
  await sb.rpc('mark_intro_seen', { p_token: token });
  me.seen_intro = true;
  document.getElementById('intro-overlay').classList.remove('open');
  enterApp();
}