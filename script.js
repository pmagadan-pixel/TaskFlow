
// =============================================
// TASKFLOW - SUPABASE CONFIGURATION
// =============================================

const SUPABASE_URL = "https://fzcrvvjbmjagcvonjnqs.supabase.co";
const SUPABASE_KEY = "sb_publishable_k0rX9xfMcAFd9p3UYBMjFg_kapcurTQ";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =============================================
// APPLICATION STATE
// =============================================

let currentUser = null;
let currentProfile = null;
let tasks = [];
let profiles = [];
let authMode = "login";
let currentPage = "dashboard";
let toastTimer = null;

// =============================================
// ELEMENTS
// =============================================

const $ = (id) => document.getElementById(id);

const authScreen = $("authScreen");
const appScreen = $("appScreen");
const authForm = $("authForm");
const authMessage = $("authMessage");
const taskForm = $("taskForm");
const taskModal = $("taskModal");

// =============================================
// HELPERS
// =============================================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function isAdmin() {
  return currentProfile?.role === "admin";
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const date = new Date(dateString + "T00:00:00");

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function displayName(profile) {
  return profile?.email?.split("@")[0] || "User";
}

// =============================================
// AUTHENTICATION
// =============================================

function setAuthMode(mode) {
  authMode = mode;

  const isRegister = mode === "register";

  $("authTitle").textContent = isRegister
    ? "Create your account"
    : "Welcome back!";

  $("authSubtitle").textContent = isRegister
    ? "Register to start organizing your tasks."
    : "Sign in to continue to your workspace.";

  $("nameGroup").classList.toggle("hidden", !isRegister);

  $("authName").required = isRegister;

  $("authSubmit").textContent = isRegister
    ? "Create Account"
    : "Sign In";

  $("authSwitchText").textContent = isRegister
    ? "Already have an account?"
    : "Don't have an account?";

  $("authSwitch").textContent = isRegister
    ? "Sign in"
    : "Create account";

  authMessage.textContent = "";
}

$("authSwitch").addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const fullName = $("authName").value.trim();

  const submitButton = $("authSubmit");
  submitButton.disabled = true;
  submitButton.textContent = "Please wait...";

  authMessage.textContent = "";

  try {
    if (authMode === "register") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        showToast("Account created successfully!");
        await loadApplication(data.session.user);
      } else {
        authMessage.textContent =
          "Account created! Check your email to confirm your registration, then sign in.";
      }

    } else {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      await loadApplication(data.user);
    }

  } catch (error) {
    console.error(error);
    authMessage.textContent = error.message || "Something went wrong.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent =
      authMode === "register" ? "Create Account" : "Sign In";
  }
});

// =============================================
// LOAD USER PROFILE AND APPLICATION
// =============================================

async function loadApplication(user) {
  currentUser = user;

  const { data: profile, error } = await supabaseClient
    .from("taskflow_profiles")
    .select("id, email, role")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Profile error:", error);
    throw new Error(
      "Your profile could not be loaded. Check that the SQL setup completed successfully."
    );
  }

  currentProfile = profile;

  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  $("sidebarName").textContent = displayName(profile);
  $("sidebarAvatar").textContent =
    displayName(profile).charAt(0).toUpperCase();

  $("sidebarRole").textContent = profile.role.toUpperCase();
  $("roleBadge").textContent = profile.role.toUpperCase();

  $("welcomeTitle").textContent = isAdmin()
    ? "Admin Dashboard"
    : "My Dashboard";

  $("welcomeSubtitle").textContent = isAdmin()
    ? "Manage tasks across your TaskFlow workspace."
    : "Here's what's happening with your tasks.";

  $("tasksHeading").textContent = isAdmin()
    ? "All Users' Tasks"
    : "My Tasks";

  $("tasksSubheading").textContent = isAdmin()
    ? "View and manage tasks belonging to all users."
    : "Manage and organize your daily work.";

  $("userSummary").classList.toggle("hidden", !isAdmin());

  $("allTasksNav").classList.toggle("hidden", !isAdmin());

  await loadProfiles();
  await loadTasks();
}

// =============================================
// LOAD USERS / PROFILES
// =============================================

async function loadProfiles() {
  if (!isAdmin()) {
    profiles = [currentProfile];
    return;
  }

  const { data, error } = await supabaseClient
    .from("taskflow_profiles")
    .select("id, email, role")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Profiles error:", error);
    showToast("Could not load user list.", true);
    profiles = [];
    return;
  }

  profiles = data || [];
  $("totalUsers").textContent = profiles.length;
}

// =============================================
// LOAD TASKS FROM SUPABASE
// =============================================

async function loadTasks() {
  $("taskTableBody").innerHTML =
    '<tr><td colspan="7" class="empty-cell">Loading tasks...</td></tr>';

  let query = supabaseClient
    .from("taskflow_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  // RLS restricts regular users to their own tasks.
  // Admins can see all tasks through the SQL policies.
  const { data, error } = await query;

  if (error) {
    console.error("Tasks error:", error);
    showToast("Could not load tasks: " + error.message, true);
    tasks = [];
  } else {
    tasks = data || [];
  }

  renderTasks();
  updateDashboard();
}

// =============================================
// DASHBOARD STATISTICS
// =============================================

function updateDashboard() {
  const total = tasks.length;
  const completed = tasks.filter(task => task.is_completed).length;
  const pending = total - completed;

  const rate = total === 0
    ? 0
    : Math.round((completed / total) * 100);

  $("totalTasks").textContent = total;
  $("completedTasks").textContent = completed;
  $("pendingTasks").textContent = pending;
  $("completionRate").textContent = rate + "%";

  $("progressPercent").textContent = rate + "%";
  $("progressBar").style.width = rate + "%";

  $("progressCaption").textContent = total === 0
    ? "Let's get started!"
    : `${completed} of ${total} tasks completed`;

  $("highTasks").textContent =
    tasks.filter(task => task.priority === "High").length;

  $("mediumTasks").textContent =
    tasks.filter(task => task.priority === "Medium").length;

  $("lowTasks").textContent =
    tasks.filter(task => task.priority === "Low").length;

  if (isAdmin()) {
    $("totalUsers").textContent = profiles.length;
  }
}

// =============================================
// RENDER TASKS
// =============================================

function renderTasks() {
  const search = $("searchInput").value.toLowerCase().trim();
  const priority = $("priorityFilter").value;
  const status = $("statusFilter").value;

  let filteredTasks = tasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(search) ||
      task.category.toLowerCase().includes(search);

    const matchesPriority =
      priority === "all" || task.priority === priority;

    const matchesStatus =
      status === "all" ||
      (status === "completed" && task.is_completed) ||
      (status === "pending" && !task.is_completed);

    return matchesSearch && matchesPriority && matchesStatus;
  });

  const body = $("taskTableBody");

  if (filteredTasks.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty-cell">
          No tasks found. Add a task to get started!
        </td>
      </tr>
    `;
    $("taskCount").textContent = "0 tasks";
    return;
  }

  body.innerHTML = filteredTasks.map(task => {
    const owner = profiles.find(profile => profile.id === task.user_id);
    const ownerName = owner ? displayName(owner) : "User";

    return `
      <tr>
        <td>
          <div class="task-title">${escapeHTML(task.title)}</div>
        </td>

        <td>
          <span class="category-tag">
            ${escapeHTML(task.category)}
          </span>
        </td>

        <td>
          <span class="task-owner">
            ${escapeHTML(isAdmin() ? ownerName : "You")}
          </span>
        </td>

        <td>
          <span class="priority ${escapeHTML(task.priority)}">
            ${escapeHTML(task.priority)}
          </span>
        </td>

        <td>${escapeHTML(formatDate(task.due_date))}</td>

        <td>
          <span class="status ${task.is_completed ? "completed" : "pending"}">
            ${task.is_completed ? "Completed" : "Pending"}
          </span>
        </td>

        <td>
          <div class="action-buttons">
            <button class="icon-btn"
              title="${task.is_completed ? "Mark pending" : "Complete task"}"
              data-action="toggle"
              data-id="${escapeHTML(task.id)}">
              ${task.is_completed ? "↶" : "✓"}
            </button>

            <button class="icon-btn"
              title="Edit task"
              data-action="edit"
              data-id="${escapeHTML(task.id)}">
              ✎
            </button>

            <button class="icon-btn delete"
              title="Delete task"
              data-action="delete"
              data-id="${escapeHTML(task.id)}">
              ×
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  $("taskCount").textContent =
    `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"}`;
}

// =============================================
// TASK MODAL
// =============================================

function openTaskModal(task = null) {
  taskForm.reset();

  $("taskId").value = task?.id || "";
  $("modalTitle").textContent = task ? "Edit Task" : "Create New Task";
  $("saveTaskBtn").textContent = task ? "Update Task" : "Save Task";

  $("taskTitle").value = task?.title || "";
  $("taskCategory").value = task?.category || "Personal";
  $("taskPriority").value = task?.priority || "Medium";
  $("taskDate").value = task?.due_date || "";

  const assignGroup = $("assigneeGroup");

  assignGroup.classList.toggle("hidden", !isAdmin());

  if (isAdmin()) {
    const options = profiles.map(profile => `
      <option value="${escapeHTML(profile.id)}">
        ${escapeHTML(profile.email)}
      </option>
    `).join("");

    $("taskAssignee").innerHTML = options;

    $("taskAssignee").value =
      task?.user_id || currentUser.id;
  }

  taskModal.classList.remove("hidden");
}

function closeTaskModal() {
  taskModal.classList.add("hidden");
}

$("addTaskBtn").addEventListener("click", () => openTaskModal());
$("closeTaskModal").addEventListener("click", closeTaskModal);
$("cancelTask").addEventListener("click", closeTaskModal);

taskModal.addEventListener("click", event => {
  if (event.target === taskModal) closeTaskModal();
});

// =============================================
// ADD OR UPDATE TASK
// =============================================

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) return;

  const taskId = $("taskId").value;

  const taskData = {
    title: $("taskTitle").value.trim(),
    category: $("taskCategory").value,
    priority: $("taskPriority").value,
    due_date: $("taskDate").value
  };

  if (!taskData.title || !taskData.due_date) {
    showToast("Please complete all required fields.", true);
    return;
  }

  if (isAdmin()) {
    taskData.user_id = $("taskAssignee").value;
  }

  $("saveTaskBtn").disabled = true;
  $("saveTaskBtn").textContent = "Saving...";

  try {
    if (taskId) {
      const { error } = await supabaseClient
        .from("taskflow_tasks")
        .update(taskData)
        .eq("id", taskId);

      if (error) throw error;

      showToast("Task updated successfully!");

    } else {
      if (!isAdmin()) {
        taskData.user_id = currentUser.id;
      }

      taskData.is_completed = false;

      const { error } = await supabaseClient
        .from("taskflow_tasks")
        .insert(taskData);

      if (error) throw error;

      showToast("Task added successfully!");
    }

    closeTaskModal();
    await loadTasks();

  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to save task.", true);
  } finally {
    $("saveTaskBtn").disabled = false;
    $("saveTaskBtn").textContent = taskId ? "Update Task" : "Save Task";
  }
});

// =============================================
// TASK ACTIONS
// =============================================

$("taskTableBody").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const taskId = button.dataset.id;
  const action = button.dataset.action;

  const task = tasks.find(item => item.id === taskId);
  if (!task) return;

  if (action === "edit") {
    openTaskModal(task);
    return;
  }

  if (action === "toggle") {
    const { error } = await supabaseClient
      .from("taskflow_tasks")
      .update({ is_completed: !task.is_completed })
      .eq("id", taskId);

    if (error) {
      showToast(error.message, true);
      return;
    }

    showToast(task.is_completed
      ? "Task marked as pending."
      : "Task completed!");

    await loadTasks();
    return;
  }

  if (action === "delete") {
    const confirmed = confirm(
      `Are you sure you want to delete "${task.title}"?`
    );

    if (!confirmed) return;

    const { error } = await supabaseClient
      .from("taskflow_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      showToast(error.message, true);
      return;
    }

    showToast("Task deleted successfully!");
    await loadTasks();
  }
});

// =============================================
// SEARCH AND FILTERS
// =============================================

$("searchInput").addEventListener("input", renderTasks);
$("priorityFilter").addEventListener("change", renderTasks);
$("statusFilter").addEventListener("change", renderTasks);

// =============================================
// NAVIGATION
// =============================================

$("dashboardNav").addEventListener("click", () => {
  currentPage = "dashboard";
  $("dashboardNav").classList.add("active");
  $("allTasksNav").classList.remove("active");
  $("tasksHeading").textContent =
    isAdmin() ? "All Users' Tasks" : "My Tasks";
  renderTasks();
});

$("allTasksNav").addEventListener("click", () => {
  if (!isAdmin()) return;

  currentPage = "all";
  $("allTasksNav").classList.add("active");
  $("dashboardNav").classList.remove("active");
  $("tasksHeading").textContent = "All Users' Tasks";
  renderTasks();
});

// =============================================
// LOGOUT
// =============================================

$("logoutBtn").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showToast(error.message, true);
    return;
  }

  currentUser = null;
  currentProfile = null;
  tasks = [];
  profiles = [];

  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");

  authForm.reset();
  setAuthMode("login");

  showToast("You have signed out.");
});

// =============================================
// CHECK EXISTING SESSION
// =============================================

async function initializeApp() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await loadApplication(data.session.user);
    } else {
      authScreen.classList.remove("hidden");
      appScreen.classList.add("hidden");
    }

  } catch (error) {
    console.error("Initialization error:", error);
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    authMessage.textContent = error.message;
  }
}

// Listen for authentication changes.
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    tasks = [];
    profiles = [];
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
});

// Start TaskFlow
initializeApp();
