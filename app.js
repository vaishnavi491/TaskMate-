let tasks = []; // The list of all tasks
let currentView = "list"; // Current active tab ('list', 'board', 'timer', 'analytics')
let timerInterval = null; // The timer's "heartbeat"
let timeLeft = 25 * 60; // Time remaining in seconds (default 25m)
let initialTime = 25 * 60; // Starting time (to calculate progress ring)
let focusedTaskId = null; // The task we are currently focusing on
let currentChart = null; // The chart instance for analytics

// 2. DOM ELEMENTS (References to HTML tags)
const taskForm = document.getElementById("taskForm");
const tasksContainer = document.getElementById("tasks"); // List View
const subtaskList = document.getElementById("subtaskList"); // Subtask inputs
const viewButtons = document.querySelectorAll(".nav-btn[data-view]"); // Sidebar buttons (Excluding theme btn)
const viewSections = document.querySelectorAll(".view-section"); // The page sections

// 3. STARTUP (What happens when the page loads)
document.addEventListener("DOMContentLoaded", () => {
  loadTasks(); // Load saved tasks from browser storage
  setupEventListeners(); // Activate buttons and forms
  setupTheme(); // Apply Dark/Light mode
  renderApp(); // Draw the UI
});

// 4. CORE FUNCTIONS (The Logic)

function loadTasks() {
  // Get data from LocalStorage
  const data = localStorage.getItem("taskmate_data");
  if (data) {
    tasks = JSON.parse(data); // Convert String back to Array
  }
}

function saveTasks() {
  // Save data to LocalStorage
  localStorage.setItem("taskmate_data", JSON.stringify(tasks));
  renderApp(); // Update the UI whenever data changes
}

function renderApp() {
  // This function acts as the "Traffic Cop", directing updates
  updateSidebarCount();

  // Safety: Ensure correct view is visible
  viewSections.forEach((el) => el.classList.remove("active"));
  const activeSection = document.getElementById(`view-${currentView}`);
  if (activeSection) activeSection.classList.add("active");

  // Update Nav Buttons
  viewButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });

  // Only render the active view to save performance
  if (currentView === "list") renderListView();
  if (currentView === "board") renderKanbanBoard();
  if (currentView === "timer") updateTimerUI();
  if (currentView === "analytics") renderCharts();

  // Refresh icons (Lucide library)
  if (window.lucide) lucide.createIcons();
}

// 5. VIEW SPECIFIC CODE

// --- LIST VIEW ---
function renderListView() {
  tasksContainer.innerHTML = ""; // Clear list

  // 1. Filter tasks (Search & Dropdowns)
  const searchTerm = document.getElementById("search").value.toLowerCase();
  const filterStatus = document.getElementById("filterStatus").value;

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm);
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "active" && task.status !== "done") ||
      (filterStatus === "completed" && task.status === "done");
    return matchesSearch && matchesFilter;
  });

  if (filteredTasks.length === 0) {
    tasksContainer.innerHTML = `<div style="text-align:center; padding: 2rem; opacity: 0.6;">No tasks found.</div>`;
    return;
  }

  // 2. Create HTML for each task
  filteredTasks.forEach((task) => {
    const taskElement = createTaskElement(task);
    tasksContainer.appendChild(taskElement);
  });
}

function createTaskElement(task) {
  const div = document.createElement("div");
  div.className = `task ${task.status === "done" ? "completed" : ""}`;

  // Calculate Progress (e.g., "2/4 steps")
  const totalSteps = task.subtasks ? task.subtasks.length : 0;
  const doneSteps = task.subtasks
    ? task.subtasks.filter((s) => s.done).length
    : 0;
  const progressPercent = totalSteps > 0 ? (doneSteps / totalSteps) * 100 : 0;

  div.innerHTML = `
        <div style="flex:1">
            <div class="title">${task.title}</div>
            <div class="meta">${task.notes || ""}</div>
            
            ${
              totalSteps > 0
                ? `
            <div class="subtask-progress">
                <div class="progress-track">
                    <div class="progress-bar" style="width: ${progressPercent}%"></div>
                </div>
                <small>${doneSteps}/${totalSteps} steps</small>
            </div>`
                : ""
            }

            <div class="actions" style="margin-top: 8px;">
                <span class="chip">${task.priority}</span>
                <button class="btn ghost sm" onclick="fillEditForm('${task.id}')">Edit</button>
                <button class="btn ghost sm" onclick="deleteTask('${task.id}')">Delete</button>
            </div>
        </div>
        <input type="checkbox" ${task.status === "done" ? "checked" : ""} 
               onchange="toggleTaskStatus('${task.id}')">
    `;
  return div;
}

// --- KANBAN BOARD ---
function renderKanbanBoard() {
  // Columns
  const columns = {
    todo: document.querySelector("#col-todo .kanban-list"),
    doing: document.querySelector("#col-doing .kanban-list"),
    done: document.querySelector("#col-done .kanban-list"),
  };

  // Clear columns
  Object.values(columns).forEach((col) => (col.innerHTML = ""));

  // Distribute tasks to columns
  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "task";
    card.draggable = true; // Make it draggable
    card.innerHTML = `<div class="title">${task.title}</div> <small>${task.priority}</small>`;

    // Drag Events (Simple Version)
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", task.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    if (columns[task.status]) {
      columns[task.status].appendChild(card);
    }
  });

  // Setup Drop Zones
  Object.values(columns).forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault(); // Allow dropping
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");
      const newStatus = col.dataset.status; // 'todo', 'doing', or 'done'
      updateTaskStatus(taskId, newStatus);
    });
  });
}

// --- FOCUS TIMER ---
function setupFocusListeners() {
  const select = document.getElementById("timerTaskSelect");
  const changeBtn = document.getElementById("changeTaskBtn");

  // Dropdown Selection
  if (select) {
    select.addEventListener("change", (e) => {
      if (e.target.value) startFocusSession(e.target.value);
    });
  }

  // "Change Task" button
  if (changeBtn) {
    changeBtn.addEventListener("click", () => {
      focusedTaskId = null;
      document.getElementById("timerTaskSelect").parentElement.style.display =
        "block";
      document.getElementById("activeTaskDisplay").style.display = "none";
      document.getElementById("timerTaskSelect").value = "";
    });
  }
}

function refreshFocusDropdown() {
  const select = document.getElementById("timerTaskSelect");
  if (!select) return;

  // Save current selection if any (though usually we are in 'change' mode if seeing this)
  const currentVal = select.value;

  // Clear and Rebuid
  let html = '<option value="">Select a task to focus on...</option>';
  tasks
    .filter((t) => t.status !== "done")
    .forEach((t) => {
      html += `<option value="${t.id}">${t.title}</option>`;
    });
  select.innerHTML = html;

  select.value = currentVal;
}

function startFocusSession(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (task) {
    focusedTaskId = taskId;
    document.getElementById("focusTaskTitle").innerText = task.title;

    // UI Swap
    document.getElementById("timerTaskSelect").parentElement.style.display =
      "none";
    document.getElementById("activeTaskDisplay").style.display = "block";
  }
}

function updateTimerUI() {
  // 1. Update Time Text
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  document.getElementById("timerDisplay").textContent =
    `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  // 2. Update Ring Progress
  const circle = document.querySelector(".ring-progress");
  const totalCircumference = 848;
  const progress = (initialTime - timeLeft) / initialTime;
  circle.style.strokeDashoffset = totalCircumference * progress;

  // 3. Always refresh dropdown to show new tasks
  refreshFocusDropdown();
}

function startTimer() {
  if (timerInterval) return;

  // Auto-select first active task if none selected
  if (!focusedTaskId) {
    const first = tasks.find((t) => t.status !== "done");
    if (first) startFocusSession(first.id);
  }

  document.getElementById("timerToggle").innerHTML =
    `<i data-lucide="pause"></i> Pause`;
  if (window.lucide) lucide.createIcons();

  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateTimerUI();
    } else {
      stopTimer("Focus Session Complete! Take a break.");
    }
  }, 1000);
}

function stopTimer(message) {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById("timerToggle").innerHTML =
    `<i data-lucide="play"></i> Start Focus`;
  if (window.lucide) lucide.createIcons();

  if (message) {
    // Notification API
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("TaskMate", { body: message });
    } else {
      alert(message);
    }

    // Ask to complete task
    if (focusedTaskId && confirm("Mark focussed task as done?")) {
      updateTaskStatus(focusedTaskId, "done");
    }
  }
}

// 6. EVENT LISTENERS (Interactions)

function setupEventListeners() {
  // 1. Navigation Switching
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentView = btn.dataset.view;
      renderApp();
    });
  });

  // 2. Add New Task
  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();

    // Get Subtasks
    const subtaskItems = [];
    document.querySelectorAll(".subtask-text").forEach((input) => {
      if (input.value) subtaskItems.push({ text: input.value, done: false });
    });

    const newTask = {
      id: document.getElementById("editingId").value || Date.now().toString(),
      title: document.getElementById("title").value,
      priority: document.getElementById("priority").value,
      notes: document.getElementById("notes").value,
      dueDate: document.getElementById("due").value,
      status: "todo",
      subtasks: subtaskItems,
      createdAt: new Date().toISOString(),
    };

    // Check if editing or new
    const existingIndex = tasks.findIndex((t) => t.id === newTask.id);
    if (existingIndex >= 0) {
      tasks[existingIndex] = newTask; // Update existing
    } else {
      tasks.unshift(newTask); // Add new to top
    }

    saveTasks();
    taskForm.reset();
    document.getElementById("subtaskList").innerHTML = ""; // Clear subtasks
    document.getElementById("editingId").value = ""; // Clear edit ID
  });

  // 3. Add Subtask Button
  document.getElementById("addSubtaskBtn").addEventListener("click", () => {
    const div = document.createElement("div");
    div.className = "subtask-row";
    div.innerHTML = `
            <input type="checkbox" disabled>
            <input type="text" class="subtask-text" placeholder="Step...">
            <button type="button" onclick="this.parentElement.remove()">×</button>
        `;
    subtaskList.appendChild(div);
  });

  // 4. Timer Buttons
  document.getElementById("timerToggle").addEventListener("click", () => {
    if (timerInterval) stopTimer();
    else startTimer();
  });

  document.getElementById("timerReset").addEventListener("click", () => {
    stopTimer();
    timeLeft = initialTime;
    updateTimerUI();
  });

  // 5. Timer Presets (15m, 25m, 45m)
  window.setTimer = (mins) => {
    stopTimer();
    timeLeft = mins * 60;
    initialTime = mins * 60;
    updateTimerUI();
  };

  // 6. Data Export
  document.getElementById("exportBtn")?.addEventListener("click", () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(tasks));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "mytasks.json");
    downloadAnchor.click();
  });

  // 7. Focus Mode Events
  setupFocusListeners();
}

// Helper: Setup Theme Toggle
function setupTheme() {
  const savedTheme = localStorage.getItem("taskmate_theme") || "dark";
  applyTheme(savedTheme);

  document.getElementById("themeBtn").addEventListener("click", () => {
    const currentTheme = document.body.dataset.theme;
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
    localStorage.setItem("taskmate_theme", newTheme);
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const btn = document.getElementById("themeBtn");
  if (btn) {
    const icon = theme === "light" ? "moon" : "sun";
    btn.innerHTML = `<i data-lucide="${icon}"></i> Theme`;
    if (window.lucide) lucide.createIcons();
  }
}

// 7. HELPER FUNCTIONS (Shortcuts)

function updateSidebarCount() {
  document.getElementById("count").textContent = tasks.length;
}

// Global functions (called from HTML onclick)
window.toggleTaskStatus = (id) => {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.status = task.status === "done" ? "todo" : "done";
    saveTasks();
  }
};

window.deleteTask = (id) => {
  if (confirm("Are you sure?")) {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
  }
};

window.fillEditForm = (id) => {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  document.getElementById("title").value = task.title;
  document.getElementById("notes").value = task.notes;
  document.getElementById("priority").value = task.priority;
  document.getElementById("due").value = task.dueDate;
  document.getElementById("editingId").value = task.id;

  // Switch to List view to see form
  viewButtons[0].click();
};

window.updateTaskStatus = (id, newStatus) => {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.status = newStatus;
    saveTasks();
  }
};

// Analytics (Weekly Progress Chart)
function renderCharts() {
  const ctx = document.getElementById("chartWeekly");
  if (!window.Chart || !ctx) return;

  // Count status
  const counts = { todo: 0, doing: 0, done: 0 };
  tasks.forEach((t) => counts[t.status]++);

  // Destroy previous chart to prevent layering/lagginess
  if (currentChart) {
    currentChart.destroy();
  }

  // Create New Chart
  currentChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["To Do", "In Progress", "Done"],
      datasets: [
        {
          label: "Tasks",
          data: [counts.todo, counts.doing, counts.done],
          backgroundColor: ["#f4c95d", "#43b39b", "#f28f7b"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 300 }, // Snappy animation
      plugins: {
        legend: { display: false }, // Cleaner look
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}