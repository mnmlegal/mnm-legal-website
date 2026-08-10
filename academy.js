(() => {
  const config = window.MNM_ACADEMY_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let client = null;

  function message(target, text, kind = "error") {
    if (!target) return;
    target.textContent = text;
    target.className = `academy-message show ${kind}`;
  }

  function getClient() {
    if (!configured) return null;
    if (!client && window.supabase) client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return client;
  }

  async function requireStudent() {
    const supabase = getClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    if (!data.session) window.location.replace("academy-login.html");
    return data.session;
  }

  async function renderCourses() {
    const grid = document.getElementById("academyCourseGrid");
    const supabase = getClient();
    if (!grid || !supabase) return;
    const { data: courses, error } = await supabase.from("academy_courses").select("id,title,short_description,price_inr,duration_label").eq("published", true).order("created_at", { ascending: false });
    if (error || !courses?.length) return;
    grid.innerHTML = courses.map((course) => `<article class="academy-card"><div class="academy-card-top"><i class="fa-solid fa-graduation-cap"></i></div><div class="academy-card-body"><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.short_description || "Course details will be available after enrolment.")}</p><div class="academy-meta"><span>${course.duration_label || "Self-paced"}</span><span>₹${Number(course.price_inr).toLocaleString("en-IN")}</span></div><p><a class="academy-button secondary" href="academy-login.html?course=${encodeURIComponent(course.id)}">View & enrol</a></p></div></article>`).join("");
  }

  function escapeHtml(value) {
    const el = document.createElement("div");
    el.textContent = value || "";
    return el.innerHTML;
  }

  function deviceId() {
    let id = localStorage.getItem("mnmAcademyDeviceId");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("mnmAcademyDeviceId", id); }
    return id;
  }

  async function claimPlayback(courseId, lessonId) {
    const supabase = getClient();
    if (!supabase) throw new Error("Academy configuration is incomplete.");
    const { data, error } = await supabase.rpc("academy_claim_playback", { p_course_id: courseId, p_lesson_id: lessonId, p_device_id: deviceId() });
    if (error || !data?.allowed) throw new Error(data?.reason || error?.message || "Unable to start secure playback.");
    return data;
  }

  async function heartbeatPlayback(courseId, lessonId) {
    const supabase = getClient();
    const { data, error } = await supabase.rpc("academy_playback_heartbeat", { p_course_id: courseId, p_lesson_id: lessonId, p_device_id: deviceId() });
    if (error || !data?.allowed) throw new Error("This account is playing on another device.");
  }

  async function setupLogin() {
    const form = document.getElementById("academyLoginForm");
    const signup = document.getElementById("academySignupForm");
    const forgot = document.getElementById("academyForgotForm");
    const status = document.getElementById("academyAuthMessage");
    const supabase = getClient();
    if (!configured) message(status, "Academy backend is not connected yet. Add Supabase public settings in academy-config.js before accepting student accounts.");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!supabase) return;
      const email = form.email.value.trim(), password = form.password.value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return message(status, error.message);
      window.location.href = "academy-dashboard.html";
    });
    signup?.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!supabase) return;
      const email = signup.email.value.trim(), password = signup.password.value, fullName = signup.fullName.value.trim(), mobile = signup.mobile.value.trim();
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, mobile } } });
      if (error) return message(status, error.message);
      message(status, "Account created. Please confirm your email, then log in.", "success");
    });
    forgot?.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!supabase) return;
      const { error } = await supabase.auth.resetPasswordForEmail(forgot.email.value.trim(), { redirectTo: `${window.location.origin}${window.location.pathname.replace("academy-login.html", "academy-login.html")}` });
      if (error) return message(status, error.message);
      message(status, "Password reset link sent. Please check your email.", "success");
    });
  }

  function setupTabs() {
    document.querySelectorAll("[data-academy-tab]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-academy-tab]").forEach((item) => item.classList.toggle("active", item === button));
      document.querySelectorAll("[data-academy-panel]").forEach((panel) => panel.classList.toggle("academy-hidden", panel.dataset.academyPanel !== button.dataset.academyTab));
    }));
  }

  async function setupDashboard() {
    const session = await requireStudent();
    const supabase = getClient();
    if (!session || !supabase) return;
    const name = document.getElementById("academyStudentName");
    const { data: profile } = await supabase.from("academy_profiles").select("full_name").eq("id", session.user.id).maybeSingle();
    if (name) name.textContent = profile?.full_name || session.user.email;
    const { data: enrolments } = await supabase.from("academy_enrolments").select("course_id,academy_courses(id,title,short_description,duration_label)").eq("student_id", session.user.id).eq("status", "active");
    const grid = document.getElementById("academyEnrolmentGrid");
    const count = document.getElementById("academyCourseCount");
    if (count) count.textContent = enrolments?.length || 0;
    if (grid && enrolments?.length) grid.innerHTML = enrolments.map(({ course_id: courseId, academy_courses: course }) => `<article class="academy-card"><div class="academy-card-body"><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.short_description || "Continue learning securely.")}</p><div class="academy-progress"><span style="width:0%"></span></div><p class="academy-note">Progress will update as lessons are completed.</p><button class="academy-button" data-course="${courseId}">Open course</button></div></article>`).join("");
    grid?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-course]"); if (!button) return;
      alert("Course player is enabled when the first protected lesson is uploaded by the Academy admin.");
    });
    document.getElementById("academyLogout")?.addEventListener("click", async () => { await supabase.auth.signOut(); window.location.href = "academy.html"; });
  }

  document.addEventListener("DOMContentLoaded", () => { renderCourses(); setupTabs(); setupLogin(); if (document.body.dataset.academyPage === "dashboard") setupDashboard(); });
  window.MNMAcademy = { claimPlayback, heartbeatPlayback, deviceId };
})();
