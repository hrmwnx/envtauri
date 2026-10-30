import { invoke } from "@tauri-apps/api/core";
import type { EnvEntry } from "./types";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let entries: EnvEntry[] = [];
let original: EnvEntry[] = [];
let selectedSource = "dotenv";
let filePath = ".env";
let elevated = false;
let editingKey: string | null = null;
let toastTimer = 0;
let pathValues: string[] = [];
let editingPath = false;
let selectedPathIndex = 0;
let editingPathIndex: number | null = null;
let addingPathEntry = false;
let editingPathOriginal = "";

const list = $("#variable-list");
const backdrop = $("#modal-backdrop");
const keyInput = $("#key-input") as HTMLInputElement;
const valueInput = $("#value-input") as HTMLTextAreaElement;
const searchInput = $("#search") as HTMLInputElement;
const filePathInput = $("#file-path") as HTMLInputElement;

function visibleEntries() {
  const query = searchInput.value.trim().toLowerCase();
  return entries.filter((entry) => entry.source === selectedSource &&
    (!query || entry.key.toLowerCase().includes(query) || entry.value.toLowerCase().includes(query)));
}
function isPath(entry: EnvEntry) { return entry.key.toLowerCase() === "path" || entry.value.includes(";"); }
function escapeHtml(text: string) { return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function dirty() { return JSON.stringify(entries) !== JSON.stringify(original); }
function render() {
  const matching = visibleEntries();
  const names: Record<string, string> = { dotenv: ".env variables", user: "User variables", system: "System variables" };
  $("#table-heading").textContent = names[selectedSource] ?? "Environment variables";
  $("#row-total").textContent = `${matching.length} ${matching.length === 1 ? "variable" : "variables"}`;
  $("#footer-summary").textContent = `Showing ${matching.length} ${matching.length === 1 ? "variable" : "variables"}`;
  for (const source of ["dotenv", "user", "system"]) $(`#count-${source}`).textContent = String(entries.filter((entry) => entry.source === source).length);
  $("#lock-indicator").textContent = !elevated ? "⌑" : "";
  const systemLocked = selectedSource === "system" && !elevated;
  $("#permission-notice").classList.toggle("hidden", !systemLocked);
  $("#add-button").toggleAttribute("disabled", systemLocked);
  $("#empty-add").toggleAttribute("disabled", systemLocked);
  list.innerHTML = matching.map((entry) => {
    const path = isPath(entry);
    const secret = /SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY/i.test(entry.key);
    const value = entry.value.replace(/\s+/g, " ");
    return `<div class="variable-row" data-key="${escapeHtml(entry.key)}"><div class="key-cell"><span class="key-icon">${path ? "↗" : "{·}"}</span><span class="key-name" title="${escapeHtml(entry.key)}">${escapeHtml(entry.key)}</span></div><span class="value-cell ${secret ? "masked" : ""}" title="${escapeHtml(entry.value)}">${secret && value ? "••••••••••••" : escapeHtml(value || "Empty value")}</span><div class="row-actions"><button class="row-action edit-row" aria-label="Edit ${escapeHtml(entry.key)}" title="Edit">✎</button><button class="row-action delete delete-row" aria-label="Delete ${escapeHtml(entry.key)}" title="Delete">×</button></div></div>`;
  }).join("");
  $("#empty-state").classList.toggle("hidden", matching.length !== 0);
  list.classList.toggle("hidden", matching.length === 0);
  $("#save-button").toggleAttribute("disabled", !dirty());
  $("#save-state").classList.toggle("dirty", dirty());
  $("#save-state").innerHTML = dirty() ? "<i></i>Unsaved changes" : "<i></i>All changes saved";
  $("#scope-summary").textContent = selectedSource === "dotenv" ? "Local file · comments preserved" : elevated ? "Windows registry · administrator access" : "Windows registry · System is read-only";
}
function showToast(message: string) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.remove("hidden");
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 2800);
}
function setSource(source: string) {
  selectedSource = source;
  document.querySelectorAll<HTMLButtonElement>(".source-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.source === source));
  searchInput.value = ""; render();
}
function showError(message: string) { const error = $("#modal-error"); error.textContent = message; error.classList.remove("hidden"); }
function hideModal() { backdrop.classList.add("hidden"); editingKey = null; editingPath = false; }
function drawPathItems() {
  $("#path-count").textContent = `${pathValues.length} ${pathValues.length === 1 ? "entry" : "entries"}`;
  $("#path-items").innerHTML = pathValues.map((value, index) => editingPathIndex === index
    ? `<div class="path-entry editing"><span class="path-entry-number">${String(index + 1).padStart(2, "0")}</span><input data-path-index="${index}" value="${escapeHtml(value)}" aria-label="Edit path entry" placeholder="C:\\path\\to\\directory"></div>`
    : `<button type="button" class="path-entry ${selectedPathIndex === index ? "selected" : ""}" data-path-index="${index}" role="option" aria-selected="${selectedPathIndex === index}"><span class="path-entry-number">${String(index + 1).padStart(2, "0")}</span><span class="path-entry-value" title="${escapeHtml(value)}">${escapeHtml(value) || "(empty entry)"}</span></button>`).join("");
  const selected = selectedPathIndex >= 0 && selectedPathIndex < pathValues.length;
  $("#path-edit").toggleAttribute("disabled", !selected || editingPathIndex !== null);
  $("#path-delete").toggleAttribute("disabled", !selected || editingPathIndex !== null);
  $("#path-up").toggleAttribute("disabled", !selected || selectedPathIndex === 0 || editingPathIndex !== null);
  $("#path-down").toggleAttribute("disabled", !selected || selectedPathIndex >= pathValues.length - 1 || editingPathIndex !== null);
  if (editingPathIndex !== null) {
    const input = $("#path-items input") as HTMLInputElement;
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
  }
}
function togglePathEditor(force?: boolean) {
  editingPath = force ?? !editingPath;
  $("#path-editor").classList.toggle("hidden", !editingPath);
  valueInput.classList.toggle("hidden", editingPath);
  $("#toggle-path").textContent = editingPath ? "Edit as text ↗" : "Edit as list ↗";
  if (editingPath) {
    pathValues = valueInput.value.split(";").filter(Boolean);
    selectedPathIndex = pathValues.length ? 0 : -1;
    editingPathIndex = null;
    drawPathItems();
  } else {
    valueInput.value = pathValues.join(";");
    editingPathIndex = null;
  }
}
function editSelectedPathEntry(add = false) {
  if (!add && (selectedPathIndex < 0 || selectedPathIndex >= pathValues.length)) return;
  addingPathEntry = add;
  if (add) { pathValues.push(""); selectedPathIndex = pathValues.length - 1; }
  editingPathIndex = selectedPathIndex;
  editingPathOriginal = pathValues[selectedPathIndex] ?? "";
  drawPathItems();
}
function finishPathEntry(cancel = false) {
  if (editingPathIndex === null) return;
  if (cancel) {
    if (addingPathEntry) {
      pathValues.splice(editingPathIndex, 1);
      selectedPathIndex = Math.min(editingPathIndex, pathValues.length - 1);
    } else {
      pathValues[editingPathIndex] = editingPathOriginal;
    }
  }
  editingPathIndex = null; addingPathEntry = false; drawPathItems();
}
function openModal(entry?: EnvEntry) {
  if (selectedSource === "system" && !elevated) { showToast("Run Envtauri as administrator to edit System variables."); return; }
  editingKey = entry?.key ?? null;
  $("#modal-title").textContent = entry ? "Edit variable" : "Add variable";
  $("#modal-description").textContent = entry ? "Update this environment variable." : `Add a new variable to ${selectedSource === "dotenv" ? "your .env file" : `${selectedSource} environment`}.`;
  $("#submit-modal").innerHTML = entry ? "Save variable <span>↗</span>" : "Add variable <span>↗</span>";
  keyInput.value = entry?.key ?? ""; keyInput.disabled = Boolean(entry);
  valueInput.value = entry?.value ?? ""; valueInput.classList.remove("hidden"); $("#path-editor").classList.add("hidden");
  editingPath = false; editingPathIndex = null; selectedPathIndex = 0;
  const pathVariable = Boolean(entry && isPath(entry));
  $("#toggle-path").classList.toggle("hidden", !pathVariable);
  if (pathVariable) togglePathEditor(true);
  $("#modal-error").classList.add("hidden"); backdrop.classList.remove("hidden");
  window.setTimeout(() => {
    if (pathVariable) (document.querySelector<HTMLButtonElement>("#path-items .path-entry") ?? $("#path-add")).focus();
    else (entry ? valueInput : keyInput).focus();
  }, 20);
}
async function loadWorkspace() {
  try {
    const result = await invoke<{entries: EnvEntry[]; source: string; path: string; elevated: boolean}>("load_workspace", { path: filePath });
    entries = result.entries.map((entry) => entry.source === "process" ? { ...entry, source: "dotenv" as const } : entry);
    original = structuredClone(entries); elevated = result.elevated; filePath = result.path;
    filePathInput.value = filePath;
    const hasDotenvEntries = entries.some((entry) => entry.source === "dotenv");
    if (hasDotenvEntries) setSource("dotenv");
    else if (result.source === "windows") setSource("user");
    else setSource("dotenv");
    render();
    if (!entries.length) showToast("No variables found. Add a variable to get started.");
  } catch (error) { entries = []; original = []; render(); showToast(`Could not load environment: ${String(error)}`); }
}
async function loadFile() {
  filePath = filePathInput.value.trim() || ".env";
  try {
    const result = await invoke<EnvEntry[]>("load_dotenv_file", { path: filePath });
    entries = entries.filter((entry) => entry.source !== "dotenv").concat(result);
    original = original.filter((entry) => entry.source !== "dotenv").concat(structuredClone(result));
    setSource("dotenv"); showToast(`Loaded ${result.length} variables from ${filePath}`);
  } catch (error) { showToast(`Could not load file: ${String(error)}`); }
}
async function save() {
  if (!dirty()) return;
  try {
    await invoke("save_workspace", { path: filePath, original, entries });
    original = structuredClone(entries); render(); showToast("Environment changes saved successfully.");
  } catch (error) { showToast(`Could not save changes: ${String(error)}`); }
}

list.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const row = target.closest<HTMLElement>(".variable-row"); if (!row) return;
  const entry = entries.find((item) => item.source === selectedSource && item.key === row.dataset.key); if (!entry) return;
  if (target.closest(".edit-row")) openModal(entry);
  if (target.closest(".delete-row")) {
    if (selectedSource === "system" && !elevated) { showToast("Run Envtauri as administrator to edit System variables."); return; }
    if (window.confirm(`Delete ${entry.key}? This change will apply when you save.`)) { entries = entries.filter((item) => item !== entry); render(); }
  }
});
document.querySelectorAll<HTMLButtonElement>(".source-tab").forEach((tab) => tab.addEventListener("click", () => setSource(tab.dataset.source!)));
searchInput.addEventListener("input", render);
$("#save-button").addEventListener("click", save);
$("#refresh-button").addEventListener("click", loadWorkspace);
$("#load-file").addEventListener("click", loadFile);
$("#open-file").addEventListener("click", loadFile);
$("#add-button").addEventListener("click", () => openModal());
$("#empty-add").addEventListener("click", () => openModal());
$("#dismiss-notice").addEventListener("click", () => $("#permission-notice").classList.add("hidden"));
$("#modal-close").addEventListener("click", hideModal);
$("#cancel-modal").addEventListener("click", hideModal);
backdrop.addEventListener("click", (event) => { if (event.target === backdrop) hideModal(); });
$("#toggle-path").addEventListener("click", () => togglePathEditor());
$("#path-add").addEventListener("click", () => editSelectedPathEntry(true));
$("#path-edit").addEventListener("click", () => editSelectedPathEntry());
$("#path-delete").addEventListener("click", () => {
  if (selectedPathIndex < 0) return;
  pathValues.splice(selectedPathIndex, 1);
  selectedPathIndex = Math.min(selectedPathIndex, pathValues.length - 1);
  drawPathItems();
});
$("#path-up").addEventListener("click", () => {
  if (selectedPathIndex <= 0) return;
  [pathValues[selectedPathIndex - 1], pathValues[selectedPathIndex]] = [pathValues[selectedPathIndex], pathValues[selectedPathIndex - 1]];
  selectedPathIndex--; drawPathItems();
});
$("#path-down").addEventListener("click", () => {
  if (selectedPathIndex < 0 || selectedPathIndex >= pathValues.length - 1) return;
  [pathValues[selectedPathIndex + 1], pathValues[selectedPathIndex]] = [pathValues[selectedPathIndex], pathValues[selectedPathIndex + 1]];
  selectedPathIndex++; drawPathItems();
});
$("#path-text-mode").addEventListener("click", () => togglePathEditor(false));
$("#path-items").addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.pathIndex !== undefined) pathValues[Number(input.dataset.pathIndex)] = input.value;
});
$("#path-items").addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-path-index]");
  if (row && editingPathIndex === null) { selectedPathIndex = Number(row.dataset.pathIndex); drawPathItems(); }
});
$("#path-items").addEventListener("dblclick", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-path-index]");
  if (row && editingPathIndex === null) { selectedPathIndex = Number(row.dataset.pathIndex); editSelectedPathEntry(); }
});
$("#path-items").addEventListener("keydown", (event) => {
  if (editingPathIndex === null) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selectedPathIndex = Math.max(0, Math.min(pathValues.length - 1, selectedPathIndex + (event.key === "ArrowDown" ? 1 : -1)));
      drawPathItems();
    }
    if (event.key === "Enter" && selectedPathIndex >= 0) editSelectedPathEntry();
    return;
  }
  if (event.key === "Enter") { event.preventDefault(); finishPathEntry(); }
  if (event.key === "Escape") { event.preventDefault(); finishPathEntry(true); }
});
$("#path-items").addEventListener("focusout", (event) => {
  if (editingPathIndex !== null && !(event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest(".path-controls"))) finishPathEntry();
});
$("#variable-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const key = keyInput.value.trim(); const value = editingPath ? pathValues.join(";") : valueInput.value;
  if (!key) { showError("Variable key cannot be empty."); return; }
  if (!/^[^=\s]+$/.test(key)) { showError("Keys cannot contain spaces or '=' characters."); return; }
  const duplicate = entries.some((entry) => entry.source === selectedSource && entry.key.toLowerCase() === key.toLowerCase() && entry.key !== editingKey);
  if (duplicate) { showError(`${key} already exists in this environment.`); return; }
  if (editingKey) { const entry = entries.find((item) => item.source === selectedSource && item.key === editingKey); if (entry) entry.value = value; }
  else entries.push({ key, value, source: selectedSource as EnvEntry["source"], expandable: false, leading_lines: [], trailing_lines: [] });
  hideModal(); render(); showToast(editingKey ? "Variable updated. Save to apply your changes." : "Variable added. Save to apply your changes.");
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !backdrop.classList.contains("hidden")) hideModal();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
  if (backdrop.classList.contains("hidden") && event.key.toLowerCase() === "a" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) openModal();
  if (backdrop.classList.contains("hidden") && event.key === "/") { event.preventDefault(); searchInput.focus(); }
});

void loadWorkspace();
