/* واجهة هاني سوفت — لا تُخزّن أسرارًا إدارية في هذا الملف. */
(() => {
  const cfg = window.HANI_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR_PROJECT") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let sb = null, currentUser = null, profile = null, services = [], pendingOtpEmail = "";
  const money = (n, c="USD") => `${Number(n || 0).toLocaleString(undefined,{maximumFractionDigits:2})} ${c}`;
  const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)}
  function msg(el, text){if(el)el.textContent=text}
  function authOpen(){ $("#authModal").classList.remove("hidden"); msg($("#authMessage"),""); }
  function authClose(){ $("#authModal").classList.add("hidden"); }
  function authTab(tab){$$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));$("#loginForm").classList.toggle("hidden",tab!=="login");$("#otpForm").classList.add("hidden");$("#signupForm").classList.toggle("hidden",tab!=="signup");$("#authTitle").textContent=tab==="login"?"تسجيل الدخول":"إنشاء حساب جديد";msg($("#authMessage"),"")}
  function requireLogin(){if(!currentUser){authOpen();return false}return true}
  function navigate(page, updateHash=true){
    const allowed = new Set(["home","services","wallet","orders","profile","reviews","admin"]);
    if(!allowed.has(page)) page="home";
    if(["wallet","orders","profile"].includes(page) && !currentUser){authOpen();page="home";}
    if(page==="admin" && !(can("manage_services")||can("review_deposits")||can("manage_orders"))){toast("هذه الصفحة مخصصة للإدارة");page="home";}
    document.querySelectorAll(".page-home").forEach(el=>el.classList.toggle("hidden",page!=="home"));
    document.querySelectorAll(".page-section").forEach(el=>el.classList.toggle("hidden",el.id!==page));
    $$("#mainNav [data-page]").forEach(a=>a.classList.toggle("nav-active",a.dataset.page===page));
    if(updateHash && location.hash!==`#${page}`) history.replaceState(null,"",`#${page}`);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  async function loadProfile(){
    if(!currentUser){profile=null;return}
    const {data,error}=await sb.from("profiles").select("id,username,display_name,phone,role,permissions,wallet_balance,rank,rank_locked,rank_note").eq("id",currentUser.id).maybeSingle();
    if(error){console.error(error);return}
    profile=data;
  }
  function can(permission){return !!profile && (profile.role==="owner" || profile.role==="admin" && (profile.permissions||[]).includes(permission))}
  function renderUser(){
    $("#profile").classList.toggle("hidden",!currentUser);
    $("#userLabel").textContent=profile?`مرحباً، ${profile.display_name||profile.username}`:"زائر";
    $("#logoutBtn").classList.toggle("hidden",!currentUser);
    if(profile && currentUser){
      $("#profileDisplayName").value=profile.display_name||"";
      $("#profileUsername").value=profile.username||"";
      $("#profileEmail").value=currentUser.email||"";
      $("#profilePhone").value=profile.phone||"";
    }
    const rank=Number(profile?.rank||1);
    if($("#userRank")){ $("#userRank").textContent="★".repeat(rank)+"☆".repeat(5-rank); $("#rankDescription").textContent=`الرتبة ${rank} من 5${profile?.rank_locked?" · مثبتة بواسطة الإدارة":""}`; }
    const isAdmin=can("manage_services")||can("review_deposits")||can("manage_orders");
    $("#admin").classList.toggle("hidden",!isAdmin);
    $("#adminNavLink").classList.toggle("hidden",!isAdmin);
    $("#walletBalance").textContent=profile?money(profile.wallet_balance,cfg.DEFAULT_CURRENCY||"USD"):"—";
    $("#heroBalance").textContent=profile?money(profile.wallet_balance,cfg.DEFAULT_CURRENCY||"USD"):"—";
  }
  async function loadServices(){
    const {data,error}=await sb.from("services").select("id,name,category,description,price,currency,is_active").eq("is_active",true).order("created_at",{ascending:false});
    if(error){console.error(error);$("#serviceGrid").innerHTML='<div class="empty">تعذر تحميل الخدمات. تحقق من schema.sql وسياسات RLS.</div>';return}
    services=data||[];
    let rankPrices=[]; if(currentUser && profile){const rp=await sb.from("service_rank_prices").select("service_id,rank,price").eq("rank",Number(profile.rank||1)); if(!rp.error)rankPrices=rp.data||[];}
    services=services.map(s=>({...s,displayPrice:(rankPrices.find(r=>r.service_id===s.id)?.price ?? s.price)}));
    $("#serviceGrid").innerHTML=services.length?services.map(s=>`<article class="service-card"><div class="service-icon">${esc((s.category||"HS").slice(0,2))}</div><h3>${esc(s.name)}</h3><p>${esc(s.description||s.category||"خدمة رقمية")}</p><div class="service-foot"><span class="price">${money(s.displayPrice,s.currency)}${Number(s.displayPrice)!==Number(s.price)?` <small class="muted">سعر رتبتك</small>`:""}</span><button class="btn outline order-btn" data-id="${s.id}">اطلب الخدمة</button></div></article>`).join(""):'<div class="empty">لا توجد خدمات منشورة حتى الآن.</div>';
    $$(".order-btn").forEach(b=>b.onclick=()=>placeOrder(b.dataset.id));
    await loadAdminServices();
  }
  async function loadAdminServices(){
    const host=$("#adminServices");
    if(!host)return;
    if(!can("manage_services")){host.innerHTML='<div class="empty">لا تملك صلاحية إدارة الخدمات.</div>';return}
    const {data,error}=await sb.from("services").select("id,name,category,description,price,currency,is_active").order("created_at",{ascending:false}).limit(100);
    if(error){host.innerHTML='<div class="empty">تعذر تحميل قائمة الخدمات.</div>';return}
    host.innerHTML=data?.length?data.map(s=>`<div class="list-item"><div class="item-top"><b>${esc(s.name)}</b><span class="status">${s.is_active?'نشطة':'متوقفة'}</span></div><p class="muted">${esc(s.category)} · ${money(s.price,s.currency)}</p><div class="service-admin-actions"><button class="btn outline edit-service" data-id="${s.id}">تعديل</button><button class="btn outline toggle-service" data-id="${s.id}" data-active="${s.is_active}">${s.is_active?'إيقاف':'تفعيل'}</button><button class="btn danger delete-service" data-id="${s.id}">حذف</button></div></div>`).join(""):'<div class="empty">لا توجد خدمات.</div>';
    $$(".edit-service").forEach(b=>b.onclick=async()=>{
      const item=data.find(x=>x.id===b.dataset.id); if(!item)return;
      const name=prompt("اسم الخدمة:",item.name); if(name===null)return;
      const category=prompt("تصنيف الخدمة:",item.category); if(category===null)return;
      const description=prompt("وصف الخدمة:",item.description||""); if(description===null)return;
      const priceText=prompt("السعر:",String(item.price)); if(priceText===null)return;
      const price=Number(priceText); if(!name.trim()||!category.trim()||!Number.isFinite(price)||price<0){toast("تحقق من الاسم والتصنيف والسعر");return}
      const {error}=await sb.from("services").update({name:name.trim(),category:category.trim(),description:description.trim(),price}).eq("id",item.id);
      if(error)toast("تعذر تعديل الخدمة: "+error.message);else{toast("تم تعديل الخدمة");await refresh()}
    });
    $$(".toggle-service").forEach(b=>b.onclick=async()=>{const active=b.dataset.active!=="true";const {error}=await sb.from("services").update({is_active:active}).eq("id",b.dataset.id);if(error)toast("تعذر تغيير حالة الخدمة: "+error.message);else{toast(active?"تم تفعيل الخدمة":"تم إيقاف الخدمة");await refresh()}});
    $$(".delete-service").forEach(b=>b.onclick=async()=>{if(!confirm("هل أنت متأكد من حذف الخدمة؟ قد تمنع علاقات الطلبات حذفها؛ يمكنك إيقافها بدلاً من ذلك."))return;const {error}=await sb.from("services").delete().eq("id",b.dataset.id);if(error)toast("تعذر حذف الخدمة. إذا كانت مرتبطة بطلبات، أوقفها بدلاً من حذفها. "+error.message);else{toast("تم حذف الخدمة");await refresh()}});
  }
  async function loadOrders(){
    if(!currentUser){$("#ordersList").innerHTML='<div class="empty">سجّل الدخول لعرض طلباتك.</div>';$("#heroOrders").textContent="—";return}
    const {data,error}=await sb.from("orders").select("id,order_number,service_name,amount,currency,status,created_at,admin_note,customer_comment,reply_email,admin_reply,customer_name,customer_phone,device_model,imei,serial_number,customer_details,jtag_acknowledged_at").order("created_at",{ascending:false}).limit(30);
    if(error){$("#ordersList").innerHTML='<div class="empty">تعذر تحميل الطلبات.</div>';return}
    $("#heroOrders").textContent=(data||[]).length;
    $("#ordersList").innerHTML=data?.length?data.map(o=>`<div class="list-item"><div class="item-top"><b>${esc(o.service_name)}</b><span class="status">${esc(o.status)}</span></div><span>${money(o.amount,o.currency)} · ${new Date(o.created_at).toLocaleDateString("ar")} · <span class="order-number">${esc(o.order_number||o.id.slice(0,8))}</span><p><b>الجهاز:</b> ${esc(o.device_model||"—")} · <b>الهاتف:</b> ${esc(o.customer_phone||"—")}</p></span>${o.admin_reply?`<div class="reply-box"><b>رد الإدارة</b><p>${esc(o.admin_reply)}</p></div>`:'<p class="muted">لم ترد الإدارة على هذا الطلب بعد.</p>'}<form class="order-comment-form stack" data-id="${o.id}"><label>تعليقك على الطلب<textarea name="comment" rows="2" maxlength="2000" placeholder="اكتب استفسارك أو تفاصيل إضافية...">${esc(o.customer_comment||"")}</textarea></label><label>البريد الإلكتروني للرد<input name="email" type="email" maxlength="254" required value="${esc(o.reply_email||currentUser.email||"")}" placeholder="name@example.com"></label><button class="btn outline" type="submit">حفظ التعليق والبريد</button></form>${o.status==="completed"?`<button class="btn outline rate-btn" data-id="${o.id}">قيّم الخدمة</button>`:""}</div>`).join(""):'<div class="empty">لا توجد طلبات بعد.</div>';
    $$(".order-comment-form").forEach(form=>form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);const {error}=await sb.rpc("submit_order_comment",{p_order_id:form.dataset.id,p_comment:String(f.get("comment")||""),p_reply_email:String(f.get("email")||"").trim()});if(error)toast("تعذر حفظ التعليق: "+error.message);else{toast("تم حفظ تعليقك وبريد الرد");await loadOrders()}});
    $$(".rate-btn").forEach(b=>b.onclick=()=>reviewOrder(b.dataset.id));
  }
  async function loadLedger(){
    if(!currentUser){$("#ledgerList").innerHTML='<div class="empty">سجّل الدخول لعرض الحركات.</div>';return}
    const {data,error}=await sb.from("wallet_transactions").select("id,kind,amount,currency,note,created_at").order("created_at",{ascending:false}).limit(20);
    if(error){$("#ledgerList").innerHTML='<div class="empty">تعذر تحميل الحركات.</div>';return}
    $("#ledgerList").innerHTML=data?.length?data.map(t=>`<div class="list-item"><div class="item-top"><b>${esc(t.kind)}</b><span class="price">${money(t.amount,t.currency)}</span></div><span class="muted">${esc(t.note||"")} · ${new Date(t.created_at).toLocaleString("ar")}</span></div>`).join(""):'<div class="empty">لا توجد حركات مالية.</div>';
  }
  async function loadReviews(){
    const {data,error}=await sb.from("reviews").select("rating,comment,created_at").eq("is_published",true).order("created_at",{ascending:false}).limit(9);
    if(error){console.warn(error);return}
    $("#reviewGrid").innerHTML=data?.length?data.map(r=>`<article class="review"><div class="stars">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</div><p>${esc(r.comment||"تقييم للخدمة")}</p><small class="muted">${"عميل"}</small></article>`).join(""):'<div class="empty">كن أول من يقيّم تجربة استخدام المنصة بعد إتمام طلب.</div>';
  }
  async function loadAdmin(){
    await loadPaymentMethods();
    if(can("review_deposits")){
      const {data}=await sb.from("deposit_requests").select("id,user_id,amount,currency,reference,status,proof_path,admin_reply,created_at,payment_method_id").eq("status","pending").order("created_at",{ascending:true}).limit(50);
      const methodsCache=window.__hsPaymentMethods||[];
      const items=[];
      for(const d of (data||[])){
        let proofUrl=""; if(d.proof_path){const {data:su}=await sb.storage.from("deposit-proofs").createSignedUrl(d.proof_path,300);proofUrl=su?.signedUrl||"";}
        const pm=methodsCache.find(x=>x.id===d.payment_method_id);
        items.push(`<div class="list-item"><div class="item-top"><b>${money(d.amount,d.currency)}</b><span class="status">${esc(d.status)}</span></div><span class="muted">العميل: ${esc(d.user_id)} · ${esc(pm?.name||"طريقة دفع غير معروفة")} · ${esc(d.reference||"بدون مرجع")} · ${new Date(d.created_at).toLocaleString("ar")}</span>${proofUrl?`<a class="btn outline" href="${proofUrl}" target="_blank" rel="noopener">عرض إثبات الدفع</a>`:'<p class="muted">لم يُرفق إثبات دفع.</p>'}<label>رد العميل / نتيجة المراجعة<textarea class="deposit-admin-reply" data-id="${d.id}" rows="2" maxlength="1000" placeholder="مثال: تم التحقق وشحن الرصيد">${esc(d.admin_reply||"")}</textarea><button class="btn outline save-deposit-reply" data-id="${d.id}">حفظ الرد</button><div class="service-admin-actions"><button class="btn gold approve-deposit" data-id="${d.id}">تأكيد الدفع وشحن الرصيد</button><button class="btn danger reject-deposit" data-id="${d.id}">رفض الطلب</button></div></div>`);
      }
      $("#depositQueue").innerHTML=items.length?items.join(""):'<div class="empty">لا توجد طلبات شحن معلقة.</div>';
      $$(".approve-deposit").forEach(b=>b.onclick=async()=>{if(!confirm("تأكدت من وصول المبلغ؟ سيُضاف الرصيد مرة واحدة فقط."))return;const {error}=await sb.rpc("admin_approve_deposit",{p_deposit_id:b.dataset.id});if(error)toast("لم يتم الاعتماد: "+error.message);else{toast("تم تأكيد الدفع وشحن الرصيد وإشعار العميل داخل حسابه");await refresh()}});
      $$(".reject-deposit").forEach(b=>b.onclick=async()=>{const reason=prompt("سبب رفض طلب الشحن:");if(reason===null)return;const {error}=await sb.rpc("admin_reject_deposit",{p_deposit_id:b.dataset.id,p_reply:reason});if(error)toast("تعذر رفض الطلب: "+error.message);else{toast("تم رفض الطلب وإبلاغ العميل داخل حسابه");await refresh()}});
      $$(".save-deposit-reply").forEach(b=>b.onclick=async()=>{const reply=$(`.deposit-admin-reply[data-id="${b.dataset.id}"]`).value;const {error}=await sb.rpc("admin_reply_deposit",{p_deposit_id:b.dataset.id,p_reply:reply});if(error)toast("تعذر حفظ الرد: "+error.message);else{toast("تم حفظ رد الشحن");await refresh()}});
    } else $("#depositQueue").innerHTML='<div class="empty">لا تملك صلاحية مراجعة الشحن.</div>';
    if(currentUser){const {data:mine}=await sb.from("deposit_requests").select("id,amount,currency,reference,status,admin_reply,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(20);$("#myDeposits").innerHTML=mine?.length?mine.map(d=>`<div class="list-item"><div class="item-top"><b>${money(d.amount,d.currency)}</b><span class="status">${d.status==="approved"?"تم شحن الرصيد":d.status==="rejected"?"مرفوض":"قيد المراجعة"}</span></div><span class="muted">${esc(d.reference||"بدون مرجع")} · ${new Date(d.created_at).toLocaleString("ar")}</span>${d.admin_reply?`<div class="reply-box"><b>إشعار الإدارة</b><p>${esc(d.admin_reply)}</p></div>`:""}</div>`).join(""):'<div class="empty">لا توجد طلبات شحن بعد.</div>'}
    if(can("manage_orders")){
      const {data,error:ordersError}=await sb.from("orders").select("id,order_number,user_id,service_name,amount,currency,status,created_at,customer_comment,reply_email,admin_reply,customer_name,customer_phone,device_model,imei,serial_number,customer_details,jtag_acknowledged_at").order("created_at",{ascending:false}).limit(40);
      $("#adminOrders").innerHTML=ordersError?'<div class="empty">تعذر تحميل الطلبات. نفّذ تحديث قاعدة البيانات أولاً.</div>':data?.length?data.map(o=>`<div class="list-item"><div class="item-top"><b>${esc(o.service_name)}</b><span class="status">${esc(o.status)}</span></div><span>${money(o.amount,o.currency)} · <span class="order-number">${esc(o.order_number||o.id.slice(0,8))}</span></span><p><b>العميل:</b> ${esc(o.customer_name||"—")} · <b>الهاتف:</b> ${esc(o.customer_phone||"—")}</p><p><b>الجهاز:</b> ${esc(o.device_model||"—")} · <b>IMEI:</b> ${esc(o.imei||"—")} · <b>SN:</b> ${esc(o.serial_number||"—")}</p><p><b>التفاصيل:</b> ${esc(o.customer_details||"—")}</p>${o.jtag_acknowledged_at?`<p class="gold-text">تم الإقرار بتحذير الجيتاج بتاريخ ${new Date(o.jtag_acknowledged_at).toLocaleString("ar")}</p>`:""}<p><b>معرّف العميل:</b> ${esc(o.user_id)} </p><p><b>تعليق العميل:</b> ${esc(o.customer_comment||"لا يوجد تعليق")}</p><p><b>بريد الرد:</b> ${esc(o.reply_email||"غير مضاف")}</p><label>الرد الرسمي<textarea class="admin-reply" data-id="${o.id}" rows="3" maxlength="4000" placeholder="اكتب رد الإدارة هنا...">${esc(o.admin_reply||"")}</textarea></label><button class="btn gold save-reply" data-id="${o.id}">حفظ الرد</button><label>حالة الطلب<select class="order-status" data-id="${o.id}"><option value="pending" ${o.status==="pending"?"selected":""}>قيد الانتظار</option><option value="processing" ${o.status==="processing"?"selected":""}>جارٍ العمل</option><option value="completed" ${o.status==="completed"?"selected":""}>مكتمل</option><option value="cancelled" ${o.status==="cancelled"?"selected":""}>ملغي</option></select></label><button class="btn outline save-status" data-id="${o.id}">حفظ الحالة</button></div>`).join(""):'<div class="empty">لا توجد طلبات.</div>';
      $$(".save-reply").forEach(b=>b.onclick=async()=>{const reply=$(`.admin-reply[data-id="${b.dataset.id}"]`).value;const {error}=await sb.rpc("admin_reply_to_order",{p_order_id:b.dataset.id,p_reply:reply});if(error)toast("تعذر حفظ الرد: "+error.message);else{toast("تم حفظ الرد الرسمي");await refresh()}});
      $$(".save-status").forEach(b=>b.onclick=async()=>{const status=$(`.order-status[data-id="${b.dataset.id}"]`).value;const {error}=await sb.rpc("admin_update_order_status",{p_order_id:b.dataset.id,p_status:status,p_note:null});if(error)toast("تعذر تعديل الحالة: "+error.message);else{toast("تم تحديث حالة الطلب");await refresh()}})
    }else $("#adminOrders").innerHTML='<div class="empty">لا تملك صلاحية إدارة الطلبات.</div>';
    $("#serviceForm").classList.toggle("hidden",!can("manage_services"));
    await Promise.all([loadAdminRanks(),loadRankPrices(),loadAutoRankRules()]);
  }
  async function loadAdminRanks(){
    const host=$("#adminRanks"); if(!host)return;
    if(!can("manage_orders")){host.innerHTML='<div class="empty">تحتاج صلاحية إدارة الطلبات لإدارة الرتب.</div>';return}
    const {data,error}=await sb.from("profiles").select("id,username,display_name,rank,rank_locked,rank_note,role,can_transfer_wallet").order("created_at",{ascending:false}).limit(100);
    if(error){host.innerHTML='<div class="empty">تعذر تحميل المستخدمين. تأكد من تشغيل تحديث قاعدة البيانات.</div>';return}
    host.innerHTML=(data||[]).map(u=>`<div class="list-item"><div class="item-top"><b>${esc(u.display_name||u.username)} (@${esc(u.username)})</b><span class="status">${"★".repeat(Number(u.rank||1))}</span></div><div class="rank-control"><select class="rank-select" data-id="${u.id}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(u.rank||1)===n?"selected":""}>${"★".repeat(n)} (${n})</option>`).join("")}</select><label><input type="checkbox" class="rank-lock" data-id="${u.id}" ${u.rank_locked?"checked":""}> تثبيت الرتبة يدويًا</label><label><input type="checkbox" class="transfer-allowed" data-id="${u.id}" ${u.can_transfer_wallet?"checked":""}> السماح بالتحويل</label><button class="btn outline save-rank" data-id="${u.id}">حفظ الرتبة</button><button class="btn outline save-transfer" data-id="${u.id}">حفظ التحويل</button></div><small class="muted">${esc(u.rank_note||"بدون ملاحظة")}</small></div>`).join("")||'<div class="empty">لا يوجد مستخدمون.</div>';
    $$(".save-rank").forEach(b=>b.onclick=async()=>{const rank=Number($(`.rank-select[data-id="${b.dataset.id}"]`).value);const locked=$(`.rank-lock[data-id="${b.dataset.id}"]`).checked;const note=prompt("سبب تغيير الرتبة (اختياري):","");if(note===null)return;const {error}=await sb.rpc("admin_set_user_rank",{p_user_id:b.dataset.id,p_rank:rank,p_locked:locked,p_note:note});if(error)toast("تعذر حفظ الرتبة: "+error.message);else{toast("تم تحديث رتبة المستخدم");await refresh()}});
    $$(".save-transfer").forEach(b=>b.onclick=async()=>{const allowed=$(`.transfer-allowed[data-id="${b.dataset.id}"]`).checked;const {error}=await sb.rpc("admin_set_transfer_permission",{p_user_id:b.dataset.id,p_allowed:allowed});if(error)toast("تعذر تحديث صلاحية التحويل: "+error.message);else toast("تم تحديث صلاحية تحويل الرصيد")});
  }
  async function loadAutoRankRules(){
    if(!can("manage_orders"))return;
    const {data,error}=await sb.from("rank_rules").select("rank,min_completed_orders").order("rank");
    if(error){console.warn(error);return}
    for(const row of (data||[])){const input=$(`#autoRankRulesForm [name="rank${row.rank}"]`);if(input)input.value=row.min_completed_orders;}
  }
  async function onAutoRankRulesSave(e){
    e.preventDefault();if(!can("manage_orders")){toast("لا تملك صلاحية تعديل شروط الترقية");return}
    const f=new FormData(e.currentTarget),values=[2,3,4,5].map(rank=>({rank,min_completed_orders:Number(f.get(`rank${rank}`)),updated_by:currentUser.id,updated_at:new Date().toISOString()}));
    if(values.some(v=>!Number.isInteger(v.min_completed_orders)||v.min_completed_orders<1)||!(values[0].min_completed_orders<values[1].min_completed_orders&&values[1].min_completed_orders<values[2].min_completed_orders&&values[2].min_completed_orders<values[3].min_completed_orders)){toast("يجب أن تكون الحدود أعدادًا صحيحة ومتزايدة من الرتبة الثانية إلى الخامسة.");return}
    const {error}=await sb.from("rank_rules").upsert(values,{onConflict:"rank"});if(error)toast("تعذر حفظ الشروط: "+error.message);else{const applied=await sb.rpc("admin_apply_rank_rules");if(applied.error)toast("تم حفظ الشروط لكن تعذر تطبيقها على الحسابات الحالية: "+applied.error.message);else toast("تم حفظ شروط الترقية وتطبيقها على الحسابات غير المثبتة");await loadAutoRankRules();await refresh()}
  }
  async function loadRankPrices(){
    const host=$("#rankPricesList"),sel=$("#rankPriceService");if(!host||!sel)return;
    if(!can("manage_services")){host.innerHTML='<div class="empty">تحتاج صلاحية إدارة الخدمات.</div>';return}
    const {data:svcs}=await sb.from("services").select("id,name").order("name");
    const old=sel.value;sel.innerHTML='<option value="">اختر الخدمة</option>'+(svcs||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");if((svcs||[]).some(x=>x.id===old))sel.value=old;
    const {data,error}=await sb.from("service_rank_prices").select("id,service_id,rank,price,currency,services(name)").order("rank");
    if(error){host.innerHTML='<div class="empty">تعذر تحميل أسعار الرتب. نفّذ schema.sql.</div>';return}
    host.innerHTML=(data||[]).map(x=>`<div class="list-item"><div class="item-top"><b>${esc(x.services?.name||"خدمة")}</b><span class="status">${"★".repeat(Number(x.rank))}</span></div><span>${money(x.price,x.currency)}</span><button class="btn danger delete-rank-price" data-id="${x.id}">حذف السعر الخاص</button></div>`).join("")||'<div class="empty">لا توجد أسعار خاصة؛ سيُستخدم السعر الأساسي.</div>';
    $$(".delete-rank-price").forEach(b=>b.onclick=async()=>{if(!confirm("حذف السعر الخاص لهذه الرتبة؟"))return;const {error}=await sb.from("service_rank_prices").delete().eq("id",b.dataset.id);if(error)toast("تعذر حذف السعر: "+error.message);else{toast("تم حذف السعر الخاص");await loadRankPrices();await loadServices()}});
  }
  async function onRankPriceSave(e){e.preventDefault();if(!can("manage_services")){toast("لا تملك صلاحية إدارة الخدمات");return}const f=new FormData(e.currentTarget),service_id=String(f.get("service_id")),rank=Number(f.get("rank")),price=Number(f.get("price"));if(!service_id||rank<1||rank>5||!Number.isFinite(price)||price<0){toast("تحقق من الخدمة والرتبة والسعر");return}const svc=services.find(x=>x.id===service_id);const {error}=await sb.from("service_rank_prices").upsert({service_id,rank,price,currency:svc?.currency||"USD",updated_by:currentUser.id},{onConflict:"service_id,rank"});if(error)toast("تعذر حفظ السعر: "+error.message);else{toast("تم حفظ سعر الرتبة");e.currentTarget.reset();await loadRankPrices();await loadServices()}}
  async function refresh(){await loadProfile();renderUser();await Promise.all([loadServices(),loadOrders(),loadLedger(),loadReviews()]);await loadAdmin()}
  function placeOrder(id){
    if(!requireLogin())return;
    const service=services.find(s=>s.id===id);if(!service)return;
    const form=$("#serviceOrderForm");form.reset();form.elements.service_id.value=id;
    $("#orderModalTitle").textContent=`طلب خدمة: ${service.name}`;
    $("#orderServiceSummary").textContent=`السعر حسب رتبتك: ${money(service.displayPrice??service.price,service.currency)} — سيتم تثبيت السعر من قاعدة البيانات عند إرسال الطلب.`;
    const isJtag=/jtag|جيتاج/i.test(`${service.name} ${service.category}`);
    $("#jtagWarning").classList.toggle("hidden",!isJtag);
    form.elements.jtag_ack.required=isJtag;
    $("#orderModal").classList.remove("hidden");
  }
  async function onServiceOrderSubmit(e){
    e.preventDefault();if(!requireLogin())return;
    const f=new FormData(e.currentTarget),serviceId=String(f.get("service_id")),customer_name=String(f.get("customer_name")||"").trim(),customer_phone=String(f.get("customer_phone")||"").trim(),device_model=String(f.get("device_model")||"").trim(),imei=String(f.get("imei")||"").trim(),serial_number=String(f.get("serial_number")||"").trim(),details=String(f.get("details")||"").trim(),jtag_ack=!!f.get("jtag_ack");
    const service=services.find(s=>s.id===serviceId);if(!service){toast("الخدمة غير موجودة أو غير متاحة");return}
    if(!customer_name||!customer_phone||!device_model||!details){toast("أكمل اسم العميل ورقم الهاتف وموديل الجهاز والتفاصيل");return}
    if(/jtag|جيتاج/i.test(`${service.name} ${service.category}`)&&!jtag_ack){toast("يجب الموافقة على تحذير الجيتاج قبل المتابعة");return}
    if(!confirm(`تأكيد طلب ${service.name} بسعر ${money(service.displayPrice??service.price,service.currency)}؟`))return;
    const {data,error}=await sb.rpc("create_service_order",{p_service_id:serviceId,p_customer_name:customer_name,p_customer_phone:customer_phone,p_device_model:device_model,p_imei:imei,p_serial_number:serial_number,p_details:details,p_jtag_ack:jtag_ack});
    if(error){toast("لم يتم إنشاء الطلب: "+error.message);return}
    $("#orderModal").classList.add("hidden");e.currentTarget.reset();toast(`تم إنشاء الطلب${data?" رقم "+String(data).slice(0,8):""} بنجاح`);await refresh();
  }
  async function reviewOrder(orderId){
    if(!requireLogin())return;
    const rating=Number(prompt("قيّم الخدمة من 1 إلى 5:","5"));if(!Number.isInteger(rating)||rating<1||rating>5){toast("التقييم يجب أن يكون من 1 إلى 5");return}
    const comment=prompt("اكتب تعليقاً مختصراً (اختياري):","")||"";
    const {error}=await sb.rpc("submit_service_review",{p_order_id:orderId,p_rating:rating,p_comment:comment});
    if(error)toast("تعذر حفظ التقييم: "+error.message);else{toast("شكراً لتقييمك");await loadReviews()}
  }
  async function onLogin(e){
    e.preventDefault();if(!sb){toast("أكمل إعداد config.js أولاً");return}
    const f=new FormData(e.currentTarget),identifier=String(f.get("identifier")||"").trim(),password=String(f.get("password")||"");
    if(!identifier||!password){msg($("#authMessage"),"أدخل اسم المستخدم أو البريد وكلمة المرور.");return}
    msg($("#authMessage"),"جارٍ تسجيل الدخول…");
    if(identifier.includes("@")){
      const {data,error}=await sb.auth.signInWithPassword({email:identifier.toLowerCase(),password});
      if(error||!data?.session){msg($("#authMessage"),"تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور وتأكيد البريد.");return}
    }else{
      const {data,error}=await sb.functions.invoke("username-login",{body:{username:identifier.toLowerCase(),password}});
      if(error||!data?.access_token||!data?.refresh_token){msg($("#authMessage"),"تسجيل الدخول باسم المستخدم يحتاج نشر دالة username-login؛ راجع README_AR.md. إذا لم تنشرها، استخدم البريد الإلكتروني.");return}
      const {error:sessionError}=await sb.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
      if(sessionError){msg($("#authMessage"),"تعذر إنشاء جلسة الدخول. حاول مجددًا.");return}
    }
    authClose();e.currentTarget.reset();await refresh();toast("تم تسجيل الدخول بنجاح");
  }
  async function onVerifyOtp(e){
    e.preventDefault();if(!sb||!pendingOtpEmail){msg($("#authMessage"),"اطلب رمزًا جديدًا أولاً.");return}
    const f=new FormData(e.currentTarget),token=String(f.get("token")||"").trim();
    if(!/^\d{4}$/.test(token)){msg($("#authMessage"),"أدخل رمزًا مكوّنًا من 4 أرقام.");return}
    msg($("#authMessage"),"جارٍ التحقق من الرمز…");
    const {data,error}=await sb.auth.verifyOtp({email:pendingOtpEmail,token,type:"email"});
    if(error||!data?.session){msg($("#authMessage"),"الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.");console.error(error);return}
    authClose();e.currentTarget.reset();$("#loginForm").reset();$("#otpForm").classList.add("hidden");$("#loginForm").classList.remove("hidden");pendingOtpEmail="";await refresh();toast("تم تسجيل الدخول بنجاح");
  }
  async function onSignup(e){
    e.preventDefault();if(!sb){toast("أكمل إعداد config.js أولاً");return}
    const f=new FormData(e.currentTarget),username=String(f.get("username")).toLowerCase(),email=String(f.get("email")).trim().toLowerCase(),password=String(f.get("password"));
    msg($("#authMessage"),"جارٍ إنشاء الحساب…");
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{username,display_name:username}}});
    if(error){msg($("#authMessage"),"تعذر إنشاء الحساب: "+error.message);return}
    if(data.session){authClose();await refresh();toast("تم إنشاء الحساب")}else msg($("#authMessage"),"تم إنشاء الحساب. افتح بريدك لتأكيده، ثم سجّل الدخول.");
    e.currentTarget.reset();
  }
  async function onProfileSave(e){
    e.preventDefault();
    if(!requireLogin())return;
    const f=new FormData(e.currentTarget);
    const display_name=String(f.get("display_name")||"").trim();
    const username=String(f.get("username")||"").trim().toLowerCase();
    const email=String(f.get("email")||"").trim().toLowerCase();
    const phone=String(f.get("phone")||"").trim();
    if(display_name.length<1){msg($("#profileMessage"),"اكتب الاسم أولاً.");return}
    if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)){msg($("#profileMessage"),"اسم المستخدم يجب أن يكون 3–24 حرفًا إنجليزيًا أو رقمًا أو _.");return}
    if(!email || !email.includes("@")){msg($("#profileMessage"),"أدخل بريدًا إلكترونيًا صحيحًا.");return}
    msg($("#profileMessage"),"جارٍ حفظ البيانات…");
    const {error:profileError}=await sb.from("profiles").update({display_name,username,phone}).eq("id",currentUser.id);
    if(profileError){msg($("#profileMessage"),profileError.code==="23505"?"اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.":"تعذر حفظ الملف الشخصي: "+profileError.message);return}
    if(email!==String(currentUser.email||"").toLowerCase()){
      const {error:emailError}=await sb.auth.updateUser({email});
      if(emailError){msg($("#profileMessage"),"تم حفظ بيانات الملف، لكن تعذر طلب تغيير البريد: "+emailError.message);await refresh();return}
      msg($("#profileMessage"),"تم حفظ الملف. تحقق من رسالة Supabase لتأكيد تغيير البريد الإلكتروني.");
    } else msg($("#profileMessage"),"تم حفظ الملف الشخصي بنجاح.");
    await refresh();
  }
  async function onTransfer(e){
    e.preventDefault();if(!requireLogin())return;
    const f=new FormData(e.currentTarget),recipient=String(f.get("recipient")).trim().toLowerCase(),amount=Number(f.get("amount")),note=String(f.get("note")||"");
    const {error}=await sb.rpc("transfer_wallet",{p_recipient_username:recipient,p_amount:amount,p_note:note});
    if(error){toast("تعذر التحويل: "+error.message);return}
    toast("تم تحويل الرصيد");e.currentTarget.reset();await refresh();
  }
  async function onDeposit(e){
    e.preventDefault();if(!requireLogin())return;
    const f=new FormData(e.currentTarget),amount=Number(f.get("amount")),currency=String(f.get("currency")),reference=String(f.get("reference")||""),payment_method_id=String(f.get("payment_method_id")||""),file=f.get("proof");
    if(!payment_method_id){toast("اختر طريقة الدفع أولاً");return} if(!file||!file.size){toast("أرفق صورة أو ملف إثبات الدفع");return} if(file.size>5*1024*1024){toast("حجم الإثبات يجب ألا يتجاوز 5 ميجابايت");return} if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)){toast("نوع الملف غير مدعوم");return} if(!Number.isFinite(amount)||amount<=0){toast("أدخل مبلغًا صحيحًا");return}
    const path=`${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-80)}`;
    const {error:uploadError}=await sb.storage.from("deposit-proofs").upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError){toast("تعذر رفع الإثبات: "+uploadError.message+" — تأكد من تنفيذ إعدادات Storage في schema.sql");return}
    const {error}=await sb.from("deposit_requests").insert({user_id:currentUser.id,amount,currency,reference,payment_method_id,proof_path:path,status:"pending"});
    if(error){await sb.storage.from("deposit-proofs").remove([path]);toast("تعذر إرسال طلب الشحن: "+error.message);return}
    toast("تم إرسال طلب الشحن وإثبات الدفع. سيُشحن الرصيد بعد مراجعة الأدمن.");e.currentTarget.reset();await refresh();
  }
  async function loadPaymentMethods(){
    const {data,error}=await sb.from("payment_methods").select("id,name,account_number,account_name,instructions,currency,is_active,created_at").eq("is_active",true).order("created_at",{ascending:false});
    if(error){$("#paymentMethodsCustomer").innerHTML='<div class="empty">تعذر تحميل طرق الدفع. نفّذ تحديث قاعدة البيانات أولاً.</div>';return}
    window.__hsPaymentMethods=data||[];
    const sel=$("#depositPaymentMethod"),prev=sel.value;sel.innerHTML='<option value="">اختر طريقة الدفع</option>'+data.map(m=>`<option value="${m.id}">${esc(m.name)} — ${esc(m.currency)}</option>`).join("");if(data.some(m=>m.id===prev))sel.value=prev;
    $("#paymentMethodsCustomer").innerHTML=data.length?data.map(m=>`<div class="list-item"><b>${esc(m.name)} · ${esc(m.currency)}</b><span>رقم الدفع: <bdi>${esc(m.account_number)}</bdi></span><span>المستفيد: ${esc(m.account_name)}</span><p>${esc(m.instructions||"")}</p></div>`).join(""):'<div class="empty">لم يضف الأدمن طرق دفع بعد.</div>';
    const chosen=data.find(m=>m.id===sel.value);$("#selectedPaymentDetails").innerHTML=chosen?`<b>${esc(chosen.name)}</b><p>رقم الدفع: <bdi>${esc(chosen.account_number)}</bdi></p><p>المستفيد: ${esc(chosen.account_name)}</p><p>${esc(chosen.instructions||"")}</p>`:"اختر طريقة الدفع لعرض بيانات التحويل.";
    sel.onchange=()=>{const m=window.__hsPaymentMethods.find(x=>x.id===sel.value);$("#selectedPaymentDetails").innerHTML=m?`<b>${esc(m.name)}</b><p>رقم الدفع: <bdi>${esc(m.account_number)}</bdi></p><p>المستفيد: ${esc(m.account_name)}</p><p>${esc(m.instructions||"")}</p>`:"اختر طريقة الدفع لعرض بيانات التحويل."};
    const host=$("#adminPaymentMethods");if(!can("review_deposits")){host.innerHTML='<div class="empty">لا تملك صلاحية إدارة طرق الدفع.</div>';return}
    const {data:all}=await sb.from("payment_methods").select("id,name,account_number,account_name,instructions,currency,is_active").order("created_at",{ascending:false}).limit(50);
    host.innerHTML=all?.length?all.map(m=>`<div class="list-item"><div class="item-top"><b>${esc(m.name)}</b><span class="status">${m.is_active?"مفعلة":"متوقفة"}</span></div><span>${esc(m.account_number)} · ${esc(m.account_name)} · ${esc(m.currency)}</span><div class="service-admin-actions"><button class="btn outline edit-payment-method" data-id="${m.id}">تعديل</button><button class="btn outline toggle-payment-method" data-id="${m.id}" data-active="${m.is_active}">${m.is_active?"إيقاف":"تفعيل"}</button><button class="btn danger delete-payment-method" data-id="${m.id}">حذف</button></div></div>`).join(""):'<div class="empty">لا توجد طرق دفع بعد.</div>';
    $$(".edit-payment-method").forEach(b=>b.onclick=async()=>{const m=all.find(x=>x.id===b.dataset.id);if(!m)return;const name=prompt("اسم طريقة الدفع",m.name);if(name===null)return;const account_number=prompt("رقم الحساب أو الهاتف",m.account_number);if(account_number===null)return;const account_name=prompt("اسم المستفيد",m.account_name);if(account_name===null)return;const instructions=prompt("تعليمات الدفع",m.instructions||"");if(instructions===null)return;const {error}=await sb.from("payment_methods").update({name,account_number,account_name,instructions}).eq("id",m.id);if(error)toast("تعذر التعديل: "+error.message);else{toast("تم تعديل طريقة الدفع");await loadPaymentMethods()}});
    $$(".toggle-payment-method").forEach(b=>b.onclick=async()=>{const {error}=await sb.from("payment_methods").update({is_active:b.dataset.active!=="true"}).eq("id",b.dataset.id);if(error)toast("تعذر التغيير: "+error.message);else await loadPaymentMethods()});
    $$(".delete-payment-method").forEach(b=>b.onclick=async()=>{if(!confirm("حذف طريقة الدفع؟"))return;const {error}=await sb.from("payment_methods").delete().eq("id",b.dataset.id);if(error)toast("تعذر الحذف: "+error.message);else await loadPaymentMethods()});
  }
  async function onPaymentMethodAdd(e){e.preventDefault();if(!can("review_deposits")){toast("لا تملك صلاحية إدارة طرق الدفع");return}const f=new FormData(e.currentTarget);const {error}=await sb.from("payment_methods").insert({name:String(f.get("name")).trim(),account_number:String(f.get("account_number")).trim(),account_name:String(f.get("account_name")).trim(),instructions:String(f.get("instructions")||"").trim(),currency:String(f.get("currency")),is_active:true,created_by:currentUser.id});if(error)toast("تعذر إضافة طريقة الدفع: "+error.message);else{toast("تمت إضافة طريقة الدفع");e.currentTarget.reset();await loadPaymentMethods()}}
  async function onAddService(e){
    e.preventDefault();if(!can("manage_services")){toast("لا تملك صلاحية إضافة الخدمات");return}
    const f=new FormData(e.currentTarget);
    const {error}=await sb.from("services").insert({name:String(f.get("name")).trim(),category:String(f.get("category")).trim(),description:String(f.get("description")||""),price:Number(f.get("price")),currency:String(f.get("currency")),is_active:true,created_by:currentUser.id});
    if(error)toast("تعذر حفظ الخدمة: "+error.message);else{toast("تمت إضافة الخدمة");e.currentTarget.reset();await loadServices()}
  }
  async function init(){
    $("#heroLogin").onclick=authOpen;$("#closeOrderModal").onclick=()=>$("#orderModal").classList.add("hidden");$("#orderModal").onclick=e=>{if(e.target.id==="orderModal")$("#orderModal").classList.add("hidden")};$("#serviceOrderForm").addEventListener("submit",onServiceOrderSubmit);
    $$("#mainNav [data-page]").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();navigate(a.dataset.page)}));
    $$('a[href^="#"]').forEach(a=>{const page=a.getAttribute("href").slice(1);if(["services","wallet","orders","profile","reviews","admin","home"].includes(page)&&!a.dataset.page)a.addEventListener("click",e=>{e.preventDefault();navigate(page)})});
    $("#closeAuth").onclick=authClose;$("#authModal").onclick=e=>{if(e.target.id==="authModal")authClose()};
    $$(".tab").forEach(b=>b.onclick=()=>authTab(b.dataset.tab));$("#loginForm").addEventListener("submit",onLogin);$("#signupForm").addEventListener("submit",onSignup);$("#rankPriceForm").addEventListener("submit",onRankPriceSave);
    $("#profileForm").addEventListener("submit",onProfileSave);$("#autoRankRulesForm").addEventListener("submit",onAutoRankRulesSave);
    $("#transferForm").addEventListener("submit",onTransfer);$("#depositForm").addEventListener("submit",onDeposit);$("#paymentMethodForm").addEventListener("submit",onPaymentMethodAdd);$("#serviceForm").addEventListener("submit",onAddService);
    $("#logoutBtn").onclick=async()=>{await sb.auth.signOut();currentUser=null;profile=null;await refresh();toast("تم تسجيل الخروج")};
    if(!configured||!window.supabase){navigate("home",false);$("#serviceGrid").innerHTML='<div class="empty">الموقع جاهز للتهيئة: عدّل config.js بقيم مشروع Supabase، ثم نفّذ schema.sql.</div>';$("#heroLogin").onclick=()=>toast("أكمل إعداد Supabase في config.js أولاً");return}
    sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    const {data}=await sb.auth.getSession();currentUser=data.session?.user||null;
    sb.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;setTimeout(()=>refresh(),0)});
    await refresh();
    const initial=(location.hash||"#home").slice(1);navigate(initial,false);
  }
  document.addEventListener("DOMContentLoaded",init);
})();
