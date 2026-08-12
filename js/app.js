"use strict";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START_HOUR = 8;
const END_HOUR = 17;
const STORAGE_KEY = "weekline-classes-v2";

const state = {
  classes: [],
  query: "",
  subject: "all",
  view: window.innerWidth <= 800 ? "day" : "week",
  selectedDay: preferredDay()
  ,activeClassId: null,
  selectedWeek: mondayOf(new Date())
};

const elements = {
  grid: document.querySelector("#schedule-grid"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  subject: document.querySelector("#subject-filter"),
  tabs: document.querySelector("#day-tabs"),
  viewButtons: document.querySelectorAll("[data-view]"),
  dialog: document.querySelector("#class-dialog"),
  formDialog: document.querySelector("#class-form-dialog"),
  nowCard: document.querySelector("#now-card"),
  toast: document.querySelector("#toast")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  updateClock();
  setInterval(updateClock, 30_000);
  setWeekHeading();
  bindEvents();

  try {
    const response = await fetch("data/timetable.json");
    if (!response.ok) throw new Error(`Could not load timetable (${response.status})`);
    const sampleClasses = await response.json();
    state.classes = loadSavedClasses(sampleClasses);
    populateSubjects();
    renderDayTabs();
    setView(state.view);
    updateCurrentClass();
  } catch (error) {
    elements.grid.innerHTML = `<p class="load-error">The timetable could not be loaded. Please serve this folder through a local web server.</p>`;
    showToast(error.message);
  }
}

function bindEvents() {
  let searchTimer;
  elements.search.addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = event.target.value.trim().toLowerCase();
      renderSchedule();
    }, 120);
  });

  elements.subject.addEventListener("change", (event) => {
    state.subject = event.target.value;
    renderSchedule();
  });

  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelector("#empty-action").addEventListener("click", handleEmptyAction);
  document.querySelector("#add-class").addEventListener("click", () => openClassForm());
  document.querySelector("#edit-class").addEventListener("click", editActiveClass);
  document.querySelector("#delete-class").addEventListener("click", deleteActiveClass);
  document.querySelector("#reset-data").addEventListener("click", resetTimetable);
  document.querySelector("#previous-week").addEventListener("click", () => changeWeek(-7));
  document.querySelector("#next-week").addEventListener("click", () => changeWeek(7));
  document.querySelector("#current-week").addEventListener("click", goToCurrentWeek);
  document.querySelector("#week-picker").addEventListener("change", chooseWeekFromDate);
  document.querySelector("#class-form").addEventListener("submit", saveClassFromForm);
  document.querySelector(".form-close").addEventListener("click", () => elements.formDialog.close());
  document.querySelector(".dialog-close").addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
  document.querySelector("#dialog-link").addEventListener("click", (event) => {
    if (event.currentTarget.getAttribute("href") === "#") {
      event.preventDefault();
      showToast("A classroom link can be added to the local timetable data.");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.search) {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape" && document.activeElement === elements.search) {
      elements.search.value = "";
      state.query = "";
      renderSchedule();
      elements.search.blur();
    }
  });
}

function preferredDay() {
  const todayIndex = new Date().getDay() - 1;
  return DAYS[todayIndex] || "Monday";
}

function populateSubjects() {
  const subjects = [...new Set(state.classes.map((item) => item.subject))].sort();
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    elements.subject.append(option);
  });
}

function renderDayTabs() {
  elements.tabs.replaceChildren();
  DAYS.forEach((day, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = DAY_SHORT[index];
    button.classList.toggle("active", day === state.selectedDay);
    button.setAttribute("aria-pressed", String(day === state.selectedDay));
    button.addEventListener("click", () => {
      state.selectedDay = day;
      renderDayTabs();
      renderSchedule();
    });
    elements.tabs.append(button);
  });
}

function setView(view) {
  state.view = view;
  elements.viewButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  elements.tabs.classList.toggle("visible", view === "day");
  renderSchedule();
}

function filteredClasses() {
  return state.classes.filter((item) => {
    const matchesSubject = state.subject === "all" || item.subject === state.subject;
    const searchable = `${item.subject} ${item.teacher} ${item.code}`.toLowerCase();
    const matchesQuery = !state.query || searchable.includes(state.query);
    const matchesDay = state.view === "week" || item.day === state.selectedDay;
    return matchesSubject && matchesQuery && matchesDay;
  });
}

function renderSchedule() {
  const shownDays = state.view === "day" ? [state.selectedDay] : DAYS;
  const visibleClasses = filteredClasses();
  const fragment = document.createDocumentFragment();
  elements.grid.replaceChildren();
  elements.grid.classList.toggle("day-view", state.view === "day");

  const corner = document.createElement("div");
  corner.className = "grid-corner";
  corner.style.gridArea = "1 / 1";
  fragment.append(corner);

  shownDays.forEach((day, index) => {
    const heading = document.createElement("div");
    heading.className = "day-heading";
    if (isActualToday(day)) heading.classList.add("today");
    heading.style.gridArea = `1 / ${index + 2}`;
    heading.setAttribute("role", "columnheader");
    heading.innerHTML = `<strong>${day}</strong><span>${isActualToday(day) ? "Today" : dateForDay(day)}</span>`;
    fragment.append(heading);
  });

  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    const row = 2 + ((hour - START_HOUR) * 2);
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.gridArea = `${row} / 1 / span 2`;
    label.textContent = formatHour(hour);
    label.setAttribute("role", "rowheader");
    fragment.append(label);

    shownDays.forEach((day, index) => {
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      if (isActualToday(day)) cell.classList.add("is-today");
      cell.style.gridArea = `${row} / ${index + 2} / span 2`;
      cell.setAttribute("role", "gridcell");
      fragment.append(cell);
    });
  }

  visibleClasses.forEach((item) => {
    const dayIndex = shownDays.indexOf(item.day);
    if (dayIndex < 0) return;
    fragment.append(createClassCard(item, dayIndex + 2));
  });

  elements.grid.append(fragment);
  elements.grid.hidden = visibleClasses.length === 0;
  elements.empty.hidden = visibleClasses.length > 0;
  updateEmptyState();
}

function updateEmptyState() {
  const hasClasses = state.classes.length > 0;
  const title = document.querySelector("#empty-title");
  const copy = document.querySelector("#empty-copy");
  const action = document.querySelector("#empty-action");
  const icon = document.querySelector("#empty-icon");
  if (!hasClasses) {
    icon.textContent = "+";
    title.textContent = "Your timetable is empty";
    copy.textContent = "Add your first class to get started.";
    action.textContent = "Add a class";
  } else {
    icon.textContent = "⌕";
    title.textContent = "No classes found";
    copy.textContent = "Try a different subject, lecturer, or day.";
    action.textContent = "Clear filters";
  }
}

function handleEmptyAction() {
  if (state.classes.length) clearFilters();
  else openClassForm();
}

function createClassCard(item, column) {
  const startRow = 2 + halfHourOffset(item.start);
  const durationRows = Math.max(1, halfHourOffset(item.end) - halfHourOffset(item.start));
  const card = document.createElement("button");
  card.type = "button";
  card.className = "class-card";
  card.dataset.color = item.color;
  card.style.gridArea = `${startRow} / ${column} / span ${durationRows}`;
  card.title = `${item.subject} · ${item.teacher}\n${formatTime(item.start)}–${formatTime(item.end)} · ${item.room}`;
  card.setAttribute("aria-label", card.title.replace("\n", ". "));
  if (isCurrent(item)) card.classList.add("is-current");
  card.innerHTML = `
    <span class="card-time">${formatTime(item.start)}–${formatTime(item.end)}</span>
    <strong>${item.subject}</strong>
    <span class="card-code">${item.code}</span>
    <span class="card-room">${item.room}</span>`;
  card.addEventListener("click", () => openDetails(item));
  return card;
}

function halfHourOffset(time) {
  const [hour, minute] = time.split(":").map(Number);
  return ((hour - START_HOUR) * 2) + Math.round(minute / 30);
}

function openDetails(item) {
  state.activeClassId = item.id;
  document.querySelector("#dialog-type").textContent = `${item.type} · ${item.code}`;
  document.querySelector("#dialog-title").textContent = item.subject;
  document.querySelector("#dialog-teacher").textContent = item.teacher;
  document.querySelector("#dialog-time").textContent = `${item.day}, ${formatTime(item.start)}–${formatTime(item.end)}`;
  document.querySelector("#dialog-room").textContent = item.room;
  document.querySelector("#dialog-code").textContent = item.code;
  document.querySelector("#dialog-link").href = item.link;
  elements.dialog.querySelector(".dialog-accent").style.background = getComputedStyle(document.querySelector(`.class-card[data-color="${item.color}"]`)).getPropertyValue("--accent");
  elements.dialog.showModal();
}

function openClassForm(item = null) {
  const form = document.querySelector("#class-form");
  form.reset();
  document.querySelector("#form-error").textContent = "";
  document.querySelector("#class-id").value = item?.id ?? "";
  document.querySelector("#form-kicker").textContent = item ? "Edit class" : "New class";
  document.querySelector("#form-title").textContent = item ? "Update timetable entry" : "Add to timetable";

  if (item) {
    document.querySelector("#class-subject").value = item.subject;
    document.querySelector("#class-code").value = item.code;
    document.querySelector("#class-teacher").value = item.teacher;
    document.querySelector("#class-day").value = item.day;
    document.querySelector("#class-type").value = item.type;
    document.querySelector("#class-start").value = item.start;
    document.querySelector("#class-end").value = item.end;
    document.querySelector("#class-room").value = item.room;
  }
  elements.formDialog.showModal();
}

function editActiveClass() {
  const item = state.classes.find((entry) => entry.id === state.activeClassId);
  if (!item) return;
  elements.dialog.close();
  openClassForm(item);
}

function deleteActiveClass() {
  const item = state.classes.find((entry) => entry.id === state.activeClassId);
  if (!item || !window.confirm(`Delete ${item.subject} from the timetable?`)) return;
  state.classes = state.classes.filter((entry) => entry.id !== item.id);
  persistClasses();
  elements.dialog.close();
  refreshInterface();
  showToast(`${item.subject} was removed.`);
}

function saveClassFromForm(event) {
  event.preventDefault();
  const idValue = document.querySelector("#class-id").value;
  const start = document.querySelector("#class-start").value;
  const end = document.querySelector("#class-end").value;
  const error = document.querySelector("#form-error");

  if (toMinutes(end) <= toMinutes(start)) {
    error.textContent = "End time must be later than start time.";
    return;
  }

  const entry = {
    id: idValue ? Number(idValue) : nextClassId(),
    code: document.querySelector("#class-code").value.trim().toUpperCase(),
    subject: document.querySelector("#class-subject").value.trim(),
    teacher: document.querySelector("#class-teacher").value.trim(),
    day: document.querySelector("#class-day").value,
    start,
    end,
    room: document.querySelector("#class-room").value.trim(),
    type: document.querySelector("#class-type").value,
    color: idValue ? state.classes.find((item) => item.id === Number(idValue))?.color || "blue" : colorForSubject(document.querySelector("#class-subject").value),
    link: "#"
  };

  const conflict = state.classes.find((item) => item.id !== entry.id && item.day === entry.day && toMinutes(entry.start) < toMinutes(item.end) && toMinutes(entry.end) > toMinutes(item.start));
  if (conflict) {
    error.textContent = `This time overlaps with ${conflict.subject} (${formatTime(conflict.start)}–${formatTime(conflict.end)}).`;
    return;
  }

  const existingIndex = state.classes.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) state.classes[existingIndex] = entry;
  else state.classes.push(entry);
  persistClasses();
  elements.formDialog.close();
  refreshInterface();
  showToast(existingIndex >= 0 ? "Class updated." : "Class added to the timetable.");
}

function nextClassId() {
  return state.classes.reduce((highest, item) => Math.max(highest, Number(item.id) || 0), 0) + 1;
}

function colorForSubject(subject) {
  const colors = ["indigo", "amber", "teal", "rose", "blue", "violet", "coral", "green", "slate"];
  const total = [...subject].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return colors[total % colors.length];
}

function persistClasses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.classes));
}

function loadSavedClasses(samples) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return samples;
    const saved = JSON.parse(stored);
    return Array.isArray(saved) ? saved : samples;
  } catch {
    return samples;
  }
}

async function resetTimetable() {
  if (!state.classes.length) {
    showToast("The timetable is already empty.");
    return;
  }
  if (!window.confirm("Clear every class from the timetable?")) return;
  state.classes = [];
  persistClasses();
  refreshInterface();
  showToast("Timetable cleared.");
}

function refreshInterface() {
  const selected = state.subject;
  elements.subject.innerHTML = '<option value="all">All subjects</option>';
  populateSubjects();
  if ([...elements.subject.options].some((option) => option.value === selected)) elements.subject.value = selected;
  else state.subject = "all";
  renderSchedule();
  updateCurrentClass();
}

function clearFilters() {
  state.query = "";
  state.subject = "all";
  elements.search.value = "";
  elements.subject.value = "all";
  renderSchedule();
}

function updateClock() {
  const now = new Date();
  document.querySelector("#full-date").textContent = new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long" }).format(now);
  document.querySelector("#live-time").textContent = new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit" }).format(now);
  if (state.classes.length) {
    updateCurrentClass();
    renderSchedule();
  }
}

function updateCurrentClass() {
  if (!state.classes.length) {
    elements.nowCard.classList.add("is-free");
    document.querySelector("#now-label").textContent = "No classes yet";
    document.querySelector("#now-title").textContent = "Build your timetable";
    document.querySelector("#now-meta").textContent = "Add a class to get started.";
    return;
  }
  const now = new Date();
  const today = DAYS[now.getDay() - 1];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const todayClasses = state.classes.filter((item) => item.day === today).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const current = todayClasses.find((item) => minutes >= toMinutes(item.start) && minutes < toMinutes(item.end));
  const next = todayClasses.find((item) => minutes < toMinutes(item.start));

  if (current) {
    elements.nowCard.classList.remove("is-free");
    document.querySelector("#now-label").textContent = "Happening now";
    document.querySelector("#now-title").textContent = current.subject;
    document.querySelector("#now-meta").textContent = `Until ${formatTime(current.end)} · ${current.room}`;
  } else {
    elements.nowCard.classList.add("is-free");
    document.querySelector("#now-label").textContent = next ? "Up next" : "You're clear";
    document.querySelector("#now-title").textContent = next ? next.subject : "No more classes today";
    document.querySelector("#now-meta").textContent = next ? `${formatTime(next.start)} · ${next.room}` : "Use the time well.";
  }
}


function setWeekHeading() {
  const monday = new Date(state.selectedWeek);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const sameMonth = monday.getMonth() === friday.getMonth();
  const start = new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(monday);
  const end = new Intl.DateTimeFormat("en", sameMonth ? { day: "numeric" } : { month: "long", day: "numeric" }).format(friday);
  document.querySelector("#schedule-heading").textContent = `${start}–${end}`;
  document.querySelector("#week-picker").value = toDateInput(monday);
  document.querySelector("#current-week").classList.toggle("is-current-week", isViewingCurrentWeek());
}

function dateForDay(day) {
  const date = new Date(state.selectedWeek);
  date.setDate(date.getDate() + DAYS.indexOf(day));
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function changeWeek(days) {
  const nextWeek = new Date(state.selectedWeek);
  nextWeek.setDate(nextWeek.getDate() + days);
  state.selectedWeek = nextWeek;
  refreshSelectedWeek();
}

function goToCurrentWeek() {
  state.selectedWeek = mondayOf(new Date());
  state.selectedDay = preferredDay();
  refreshSelectedWeek();
}

function chooseWeekFromDate(event) {
  if (!event.target.value) return;
  const [year, month, day] = event.target.value.split("-").map(Number);
  const chosenDate = new Date(year, month - 1, day);
  state.selectedWeek = mondayOf(chosenDate);
  const chosenDayIndex = chosenDate.getDay() - 1;
  if (DAYS[chosenDayIndex]) state.selectedDay = DAYS[chosenDayIndex];
  refreshSelectedWeek();
}

function refreshSelectedWeek() {
  setWeekHeading();
  renderDayTabs();
  renderSchedule();
}

function isViewingCurrentWeek() {
  return state.selectedWeek.getTime() === mondayOf(new Date()).getTime();
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayOf(date) {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isActualToday(day) { return isViewingCurrentWeek() && DAYS[new Date().getDay() - 1] === day; }
function isCurrent(item) {
  if (!isActualToday(item.day)) return false;
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  return minute >= toMinutes(item.start) && minute < toMinutes(item.end);
}
function toMinutes(time) { const [h, m] = time.split(":").map(Number); return (h * 60) + m; }
function minutesToTime(total) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
function formatHour(hour) { return new Intl.DateTimeFormat("en-NG", { hour: "numeric" }).format(new Date(2020, 0, 1, hour)); }
function formatTime(time) { const [h, m] = time.split(":").map(Number); return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date(2020, 0, 1, h, m)); }
function formatDuration(minutes) { return minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes / 60}h`; }

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800);
}
