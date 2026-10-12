
"use strict";

/* ==========================================
   SCAM EMPIRE 3D
   Fictional single-player tycoon prototype
   ========================================== */

const $ = (id) => document.getElementById(id);

const SAVE_KEY = "scam_empire_3d_save_v1";

const STARTING_STATE = {
  cash: 500,
  employees: 0,
  officeLevel: 1,
  reputation: 100,
  businesses: 0,
  investments: 0,
  investmentCost: 0,
  totalEarned: 0,
  totalLost: 0,
  leaks: 0,
  raids: 0,
  recovered: 0,
  lastInvestigation: Date.now(),
  lastSaved: Date.now(),
  rank: "Street Starter",
  staff: [],
  properties: [],
  flags: {}
};

let state = loadGame();
let scene, camera, renderer, player, playerGroup;
let animationFrame = 0;
let lastFrame = 0;
let lastIncomeTick = Date.now();
let lastToast = 0;
let activePage = "home";
let currentLocation = "headquarters";
let isMoving = false;
let raidActive = false;
let investigation = null;
let modalOpen = false;
let pointerLocked = false;
let keys = {};
let movement = { forward: 0, backward: 0, left: 0, right: 0 };
let velocity = 0;
let gameTime = Date.now();
let sessionStart = Date.now();
let lastInvestigationCheck = Date.now();
let worldObjects = [];
let toastTimeout = null;

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(STARTING_STATE);

    const saved = JSON.parse(raw);
    return {
      ...structuredClone(STARTING_STATE),
      ...saved,
      staff: Array.isArray(saved.staff) ? saved.staff : [],
      properties: Array.isArray(saved.properties) ? saved.properties : [],
      flags: saved.flags || {}
    };
  } catch (error) {
    console.warn("Save could not be loaded:", error);
    return structuredClone(STARTING_STATE);
  }
}

function saveGame() {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    showToast("Progress saved successfully");
  } catch (error) {
    console.warn("Save failed:", error);
    showToast("Save failed. Check your browser storage.");
  }
}

function money(amount) {
  const safeAmount = Math.floor(Number(amount) || 0);
  return "₹" + safeAmount.toLocaleString("en-IN");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function updateRank() {
  const wealth = getWealth();

  if (wealth >= 10000000) state.rank = "Global Tycoon";
  else if (wealth >= 1000000) state.rank = "City Mogul";
  else if (wealth >= 100000) state.rank = "Business Boss";
  else if (wealth >= 10000) state.rank = "Rising Owner";
  else state.rank = "Street Starter";
}

function getWealth() {
  return Math.max(
    0,
    state.cash +
      state.investments +
      state.properties.reduce((sum, p) => sum + (p.value || 0), 0)
  );
}

function getIncomePerMinute() {
  const businessIncome = state.businesses * 85;
  const staffBonus = state.employees * 35;
  const officeBonus = (state.officeLevel - 1) * 100;
  const investmentIncome = Math.floor(state.investments * 0.015);

  return Math.max(
    0,
    businessIncome + staffBonus + officeBonus + investmentIncome
  );
}

function updateHUD() {
  updateRank();

  if ($("wealth")) $("wealth").textContent = money(getWealth());
  if ($("income")) {
    $("income").textContent = money(getIncomePerMinute());
  }
  if ($("employees")) {
    $("employees").textContent = state.employees;
  }
  if ($("office-level")) {
    $("office-level").textContent = state.officeLevel;
  }
  if ($("rank")) {
    $("rank").textContent = state.rank.toUpperCase();
  }
}

function renderPage(page = activePage) {
  activePage = page;

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.page === activePage
    );
  });

  const titles = {
    home: "Your Headquarters",
    business: "Business Empire",
    staff: "Staff Management",
    city: "Explore the City",
    pc: "Your Computer"
  };

  if ($("panel-title")) {
    $("panel-title").textContent = titles[page] || "Your Empire";
  }

  const content = $("panel-content");
  if (!content) return;

  const cards = {
    home: [
      card("⌂", "Headquarters", "Your central office. Upgrade it to unlock better income.", "Upgrade office", "upgradeOffice", officeUpgradeCost(), "primary"),
      card("▦", "Business portfolio", `${state.businesses} active businesses.`, "Open business manager", "openBusiness", null),
      card("♙", "Your employees", `${state.employees} employees currently hired.`, "Hire employee", "hireEmployee", staffCost(), "primary"),
      card("▣", "Information security", `${state.leaks} information leaks recorded.`, "Run security check", "securityCheck")
    ],
    business: [
      card("▦", "New business", "Start a fictional company and increase passive income.", "Buy business", "buyBusiness", businessCost(), "primary"),
      card("₹", "Investments", `Current investment portfolio: ${money(state.investments)}.`, "Invest ₹500", "invest", 500),
      card("⌂", "Office upgrade", `Office level ${state.officeLevel}.`, "Upgrade office", "upgradeOffice", officeUpgradeCost(), "primary"),
      card("↗", "Business report", "Review your empire's finances.", "View report", "report")
    ],
    staff: [
      card("♙", "Hire employee", "Recruit another employee to grow your business income.", "Hire for " + money(staffCost()), "hireEmployee", staffCost(), "primary"),
      card("★", "Staff training", "Improve your team's productivity.", "Train staff", "trainStaff", trainingCost()),
      card("▤", "Payroll", `${state.employees} staff members. Estimated salaries: ${money(state.employees * 20)} per minute.`, "Pay salaries", "paySalaries"),
      card("♥", "Recovery", "Recover after business losses using your available cash.", "Open recovery", "recovery")
    ],
    city: [
      card("☕", "City cafe", "Purchase a small cafe and generate additional income.", "Buy cafe", "buyCafe", cafeCost(), "primary"),
      card("🏪", "Retail shop", "Own a local shop in your growing city.", "Buy shop", "buyShop", shopCost()),
      card("🏢", "Office building", "Purchase a commercial property.", "Buy building", "buyProperty", propertyCost()),
      card("⌖", "Travel", "Move between your headquarters and city locations.", "Visit city", "visitCity")
    ],
    pc: [
      card("▣", "Finance dashboard", "Review cash, wealth, income and business statistics.", "Open finances", "report", null, "primary"),
      card("🔒", "Security centre", "Review your fictional company's security status.", "Check security", "securityCheck"),
      card("💾", "Save game", "Store your progress on this device.", "Save now", "saveGame"),
      card("↻", "Recovery centre", "Review losses and your rebuilding options.", "Recover", "recovery"),
      card("⚙", "Game settings", "Manage your game session.", "Settings", "settings"),
      card("!", "Investigation status", "An investigation event occurs every 20 minutes of active game time.", "Check status", "investigationStatus")
    ]
  };

  content.innerHTML = (cards[page] || cards.home).join("");

  content.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const cost = button.dataset.cost;
      runAction(action, cost === "" ? null : Number(cost));
    });
  });

  updateHUD();
}

function card(icon, title, description, buttonText, action, cost = null, type = "") {
  const disabled =
    cost !== null &&
    cost !== undefined &&
    Number.isFinite(Number(cost)) &&
    state.cash < Number(cost);

  return `
    <article class="game-card">
      <div class="card-icon">${icon}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
      <button
        class="game-button ${type}"
        data-action="${escapeHTML(action)}"
        data-cost="${cost === null ? "" : Number(cost)}"
        ${disabled ? "disabled" : ""}
      >${escapeHTML(buttonText)}</button>
    </article>
  `;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function officeUpgradeCost() {
  return 1000 * state.officeLevel * state.officeLevel;
}

function staffCost() {
  return 300 + state.employees * 150;
}

function businessCost() {
  return 1500 + state.businesses * 1000;
}

function trainingCost() {
  return Math.max(250, state.employees * 150);
}

function cafeCost() {
  return 2500 + state.properties.length * 500;
}

function shopCost() {
  return 5000 + state.properties.length * 1000;
}

function propertyCost() {
  return 12000 + state.properties.length * 2500;
}

function spend(amount) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));

  if (state.cash < amount) {
    showToast("Not enough cash!");
    return false;
  }

  state.cash -= amount;
  return true;
}

function runAction(action, cost) {
  switch (action) {
    case "upgradeOffice":
      upgradeOffice();
      break;
    case "hireEmployee":
      hireEmployee();
      break;
    case "buyBusiness":
      buyBusiness();
      break;
    case "invest":
      invest();
      break;
    case "trainStaff":
      trainStaff();
      break;
    case "paySalaries":
      paySalaries();
      break;
    case "securityCheck":
      securityCheck();
      break;
    case "report":
      showReport();
      break;
    case "recovery":
      openRecovery();
      break;
    case "buyCafe":
      buyProperty("Cafe", cafeCost(), 75);
      break;
    case "buyShop":
      buyProperty("Retail Shop", shopCost(), 130);
      break;
    case "buyProperty":
      buyProperty("Office Building", propertyCost(), 250);
      break;
    case "visitCity":
      visitCity();
      break;
    case "saveGame":
      saveGame();
      break;
    case "settings":
      showSettings();
      break;
    case "investigationStatus":
      showInvestigationStatus();
      break;
    case "openBusiness":
      renderPage("business");
      break;
    default:
      showToast("This feature is not available yet.");
  }
}

function upgradeOffice() {
  const cost = officeUpgradeCost();
  if (!spend(cost)) return;

  state.officeLevel++;
  state.reputation = clamp(state.reputation + 2, 0, 100);
  state.totalLost += cost;

  updateHUD();
  renderPage();
  saveSilently();
  showToast("Headquarters upgraded to level " + state.officeLevel);
  updateOfficeVisuals();
}

function hireEmployee() {
  const cost = staffCost();
  if (!spend(cost)) return;

  state.employees++;
  state.staff.push({
    id: Date.now() + Math.random(),
    name: ["Alex", "Sam", "Jordan", "Taylor", "Riley", "Morgan"][
      randomBetween(0, 5)
    ],
    role: "Business Associate",
    salary: 20,
    productivity: 1
  });

  state.totalLost += cost;
  updateHUD();
  renderPage();
  saveSilently();
  showToast("Employee hired successfully!");
}

function buyBusiness() {
  const cost = businessCost();
  if (!spend(cost)) return;

  state.businesses++;
  state.totalLost += cost;
  state.reputation = clamp(state.reputation + 3, 0, 100);

  updateHUD();
  renderPage();
  saveSilently();
  showToast("New business acquired!");
}

function invest() {
  const cost = 500;
  if (!spend(cost)) return;

  state.investments += cost;
  state.investmentCost += cost;

  updateHUD();
  renderPage();
  saveSilently();
  showToast("₹500 invested in your portfolio.");
}

function trainStaff() {
  if (state.employees < 1) {
    showToast("Hire an employee first.");
    return;
  }

  const cost = trainingCost();
  if (!spend(cost)) return;

  state.staff.forEach((employee) => {
    employee.productivity = Math.min(
      3,
      (employee.productivity || 1) + 0.1
    );
  });

  state.totalLost += cost;
  updateHUD();
  renderPage();
  saveSilently();
  showToast("Staff productivity improved.");
}

function paySalaries() {
  const salary = state.employees * 20;

  if (salary === 0) {
    showToast("You have no employees to pay.");
    return;
  }

  if (!spend(salary)) return;

  state.totalLost += salary;
  updateHUD();
  renderPage();
  saveSilently();
  showToast("Staff salaries paid.");
}

function buyProperty(name, cost, income) {
  if (!spend(cost)) return;

  state.properties.push({
    name,
    value: cost,
    income,
    level: 1
  });

  state.totalLost += cost;
  updateHUD();
  renderPage();
  saveSilently();
  showToast(name + " purchased!");
}

function securityCheck() {
  showModal(`
    <h2>Security Centre</h2>
    <p>Review your fictional company's security and reputation.</p>
    <p><strong>Reputation:</strong> ${state.reputation}/100</p>
    <p><strong>Recorded leaks:</strong> ${state.leaks}</p>
    <p><strong>Raid incidents:</strong> ${state.raids}</p>
    <p>Security checks help you manage fictional business risks.</p>
    <button class="game-button primary" id="security-upgrade">Upgrade Security — ₹750</button>
  `);

  $("security-upgrade").addEventListener("click", () => {
    if (!spend(750)) return;

    state.flags.securityLevel = (state.flags.securityLevel || 0) + 1;
    state.totalLost += 750;
    closeModal();
    saveSilently();
    renderPage();
    showToast("Security upgraded.");
  });
}

function showReport() {
  showModal(`
    <h2>Financial Report</h2>
    <p>Current wealth: <strong>${money(getWealth())}</strong></p>
    <p>Available cash: <strong>${money(state.cash)}</strong></p>
    <p>Investment portfolio: <strong>${money(state.investments)}</strong></p>
    <p>Passive income: <strong>${money(getIncomePerMinute())}/minute</strong></p>
    <p>Businesses owned: <strong>${state.businesses}</strong></p>
    <p>Properties owned: <strong>${state.properties.length}</strong></p>
    <p>Total recorded earnings: <strong>${money(state.totalEarned)}</strong></p>
    <p>Total recorded spending: <strong>${money(state.totalLost)}</strong></p>
  `);
}

function openRecovery() {
  const lost = state.totalLost;
  showModal(`
    <h2>Recovery Centre</h2>
    <p>Rebuild your fictional empire after losses.</p>
    <p>Available cash: <strong>${money(state.cash)}</strong></p>
    <p>Previous spending: <strong>${money(lost)}</strong></p>
    <button class="game-button primary" id="recovery-work">Complete recovery contract (+₹500)</button>
    <button class="game-button" id="recovery-save">Save current progress</button>
  `);

  $("recovery-work").addEventListener("click", () => {
    state.cash += 500;
    state.totalEarned += 500;
    updateHUD();
    closeModal();
    saveSilently();
    renderPage();
    showToast("Recovery contract completed: +₹500");
  });

  $("recovery-save").addEventListener("click", () => {
    saveSilently();
    closeModal();
    showToast("Progress saved.");
  });
}

function visitCity() {
  currentLocation = "city";
  if ($("location-name")) $("location-name").textContent = "CITY DISTRICT";
  if ($("location-description")) {
    $("location-description").textContent = "Explore shops and properties";
  }

  renderPage("city");
  buildCityVisuals();
  showToast("Welcome to the city district.");
}

function showSettings() {
  showModal(`
    <h2>Game Settings</h2>
    <p>Manage your local game progress.</p>
    <button class="game-button primary" id="settings-save">Save game</button>
    <button class="game-button" id="settings-export">Export save data</button>
    <button class="game-button danger" id="settings-reset">Reset all progress</button>
  `);

  $("settings-save").addEventListener("click", () => {
    saveSilently();
    closeModal();
    showToast("Game saved.");
  });

  $("settings-export").addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(state, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scam-empire-save.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Save data exported.");
  });

  $("settings-reset").addEventListener("click", () => {
    if (!confirm("Reset your entire SCAM EMPIRE save? This cannot be undone.")) {
      return;
    }

    localStorage.removeItem(SAVE_KEY);
    location.reload();
  });
}

function showInvestigationStatus() {
  const elapsed = Date.now() - lastInvestigationCheck;
  const remaining = Math.max(0, 20 * 60 * 1000 - elapsed);

  showModal(`
    <h2>Investigation Status</h2>
    <p>Investigation events can occur every 20 minutes of active play.</p>
    <p>Recorded raids: <strong>${state.raids}</strong></p>
    <p>Recorded leaks: <strong>${state.leaks}</strong></p>
    <p>Reputation: <strong>${state.reputation}/100</strong></p>
    <p>Next event window: <strong>${Math.ceil(remaining / 60000)} minutes</strong></p>
    <button class="game-button primary" id="start-investigation">Start practice interview</button>
  `);

  $("start-investigation").addEventListener("click", () => {
    closeModal();
    startInvestigation(true);
  });
}

function showModal(html) {
  if (!$("event-modal") || !$("modal-content")) return;

  $("modal-content").innerHTML = html;
  $("event-modal").classList.remove("hidden");
  modalOpen = true;
}

function closeModal() {
  if ($("event-modal")) $("event-modal").classList.add("hidden");
  modalOpen = false;
}

function saveSilently() {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not save game:", error);
  }
}

/* ==========================================
   INVESTIGATION AND RAID SYSTEM
   ========================================== */

const QUESTIONS = [
  {
    question: "Which department manages company finances?",
    answers: ["Finance", "Catering", "Gardening"],
    correct: 0
  },
  {
    question: "What should a responsible company do after finding an accounting error?",
    answers: ["Hide it", "Correct and document it", "Ignore it"],
    correct: 1
  },
  {
    question: "Which record tracks business income and expenses?",
    answers: ["A ledger", "A music playlist", "A photo album"],
    correct: 0
  },
  {
    question: "What is the best way to protect legitimate customer information?",
    answers: ["Share it publicly", "Use access controls", "Leave it unprotected"],
    correct: 1
  },
  {
    question: "What should a company do when it discovers a security incident?",
    answers: ["Investigate and respond responsibly", "Delete all records", "Ignore every warning"],
    correct: 0
  },
  {
    question: "What is profit?",
    answers: ["Revenue minus expenses", "All expenses added twice", "The number of employees"],
    correct: 0
  },
  {
    question: "Why should employees have clear responsibilities?",
    answers: ["To improve accountability", "To create confusion", "To avoid all records"],
    correct: 0
  },
  {
    question: "What is a business budget used for?",
    answers: ["Planning income and spending", "Predicting the weather", "Replacing every employee"],
    correct: 0
  }
];

function startInvestigation(practice = false) {
  if (investigation || raidActive) {
    showToast("An event is already in progress.");
    return;
  }

  const selected = [...QUESTIONS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  investigation = {
    questions: selected,
    index: 0,
    correct: 0,
    practice
  };

  showQuestion();
}

function showQuestion() {
  if (!investigation) return;

  const q = investigation.questions[investigation.index];

  if (!q) {
    finishInvestigation();
    return;
  }

  const count = investigation.index + 1;

  showModal(`
    <div class="level-badge">INVESTIGATION · ${count}/5</div>
    <h2>${escapeHTML(q.question)}</h2>
    <p>Answer at least 3 of 5 questions correctly to pass.</p>
    <div id="answer-options">
      ${q.answers.map((answer, index) => `
        <button class="question-option" data-answer="${index}">
          ${escapeHTML(answer)}
        </button>
      `).join("")}
    </div>
    <p id="answer-feedback"></p>
  `);

  $("answer-options").querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const answer = Number(button.dataset.answer);
      const correct = answer === q.correct;

      if (correct) investigation.correct++;

      $("answer-options").querySelectorAll("button").forEach((option) => {
        option.disabled = true;
        if (Number(option.dataset.answer) === q.correct) {
          option.classList.add("correct");
        }
      });

      if (!correct) button.classList.add("incorrect");

      $("answer-feedback").textContent = correct
        ? "Correct answer!"
        : "Not quite. The correct answer is highlighted.";

      const next = document.createElement("button");
      next.className = "game-button primary";
      next.textContent = count === 5 ? "View result" : "Next question";
      next.style.marginTop = "15px";
      next.addEventListener("click", () => {
        investigation.index++;
        showQuestion();
      });

      $("modal-content").appendChild(next);
    });
  });
}

function finishInvestigation() {
  if (!investigation) return;

  const result = investigation;
  investigation = null;
  closeModal();

  if (result.correct >= 3) {
    state.reputation = clamp(state.reputation + 2, 0, 100);
    saveSilently();

    showModal(`
      <h2>Investigation Passed</h2>
      <p>You answered ${result.correct} out of 5 questions correctly.</p>
      <p>Your company continues operating.</p>
      <button class="game-button primary" id="result-close">Continue</button>
    `);

    $("result-close").addEventListener("click", closeModal);
  } else if (!result.practice) {
    triggerRaid("You answered fewer than 3 questions correctly.");
  } else {
    showModal(`
      <h2>Practice Complete</h2>
      <p>You answered ${result.correct} out of 5 correctly.</p>
      <p>This was practice, so no raid or financial penalty occurred.</p>
      <button class="game-button primary" id="practice-close">Continue</button>
    `);

    $("practice-close").addEventListener("click", closeModal);
  }

  saveSilently();
  updateHUD();
}

function triggerRaid(reason = "Investigation failed.") {
  if (raidActive) return;

  raidActive = true;
  state.raids++;

  const wealthBefore = getWealth();
  const loss = Math.floor(wealthBefore * 0.2);

  /*
   * Apply the fictional penalty to available cash first.
   * If cash is insufficient, investments are reduced.
   * No real files, accounts or servers are affected.
   */
  const cashLoss = Math.min(state.cash, loss);
  state.cash -= cashLoss;

  let remainingLoss = loss - cashLoss;
  const investmentLoss = Math.min(state.investments, remainingLoss);
  state.investments -= investmentLoss;
  remainingLoss -= investmentLoss;

  if (remainingLoss > 0) {
    for (const property of state.properties) {
      const reduction = Math.min(property.value, remainingLoss);
      property.value -= reduction;
      remainingLoss -= reduction;
      if (remainingLoss <= 0) break;
    }
  }

  state.totalLost += loss;
  state.reputation = clamp(state.reputation - 15, 0, 100);
  state.lastInvestigation = Date.now();
  lastInvestigationCheck = Date.now();

  if (renderer && renderer.domElement) {
    renderer.domElement.style.filter = "saturate(.4) brightness(.6)";
  }

  showModal(`
    <div class="level-badge">RAID EVENT</div>
    <h2>Headquarters Raided!</h2>
    <p>${escapeHTML(reason)}</p>
    <p>Your fictional empire lost 20% of its wealth.</p>
    <p><strong>Penalty:</strong> ${money(loss)}</p>
    <p><strong>Wealth remaining:</strong> ${money(getWealth())}</p>
    <button class="game-button primary" id="raid-recover">Begin recovery</button>
  `);

  $("raid-recover").addEventListener("click", () => {
    raidActive = false;

    if (renderer && renderer.domElement) {
      renderer.domElement.style.filter = "";
    }

    closeModal();
    renderPage("pc");
    showToast("Operations resumed. Rebuild your empire!");
    saveSilently();
  });

  updateHUD();
  saveSilently();
}

/* Information leaks are fictional game events. */
function triggerInformationLeak() {
  state.leaks++;

  const wealthBefore = getWealth();
  const loss = Math.floor(wealthBefore * 0.2);

  const cashLoss = Math.min(state.cash, loss);
  state.cash -= cashLoss;

  let remainingLoss = loss - cashLoss;
  const investmentLoss = Math.min(state.investments, remainingLoss);
  state.investments -= investmentLoss;
  remainingLoss -= investmentLoss;

  for (const property of state.properties) {
    if (remainingLoss <= 0) break;

    const reduction = Math.min(property.value, remainingLoss);
    property.value -= reduction;
    remainingLoss -= reduction;
  }

  state.totalLost += loss;
  state.reputation = clamp(state.reputation - 10, 0, 100);

  showModal(`
    <h2>Information Leak!</h2>
    <p>Fictional company information has leaked in the game.</p>
    <p>Wealth penalty: <strong>${money(loss)}</strong></p>
    <p>Reputation: <strong>${state.reputation}/100</strong></p>
    <button class="game-button primary" id="leak-recover">Recover operations</button>
  `);

  $("leak-recover").addEventListener("click", () => {
    closeModal();
    renderPage("pc");
    saveSilently();
    updateHUD();
  });

  updateHUD();
  saveSilently();
}

/* ==========================================
   THREE.JS WORLD
   ========================================== */

function init3D() {
  const container = $("scene-container");

  if (!container || !window.THREE) {
    showToast("3D engine unavailable. Check your internet connection.");
    return false;
  }

  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14243a);
    scene.fog = new THREE.Fog(0x14243a, 18, 85);

    camera = new THREE.PerspectiveCamera(
      65,
      container.clientWidth / container.clientHeight,
      0.1,
      200
    );

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xbddcff, 0x182233, 2.1);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(10, 18, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    createWorld();
    createPlayer();
    buildCityVisuals();
    updateOfficeVisuals();
    placeCamera();

    renderer.domElement.addEventListener("click", () => {
      if (window.innerWidth > 700 && !modalOpen) {
        renderer.domElement.focus();
      }
    });

    window.addEventListener("resize", resize3D);
    requestAnimationFrame(animate3D);

    return true;
  } catch (error) {
    console.error("3D initialization error:", error);
    showToast("Could not start 3D mode on this device.");
    return false;
  }
}

function addBox(x, y, z, width, height, depth, color, options = {}) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0.05
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  worldObjects.push(mesh);
  return mesh;
}

function createWorld() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({
      color: 0x243342,
      roughness: 1
    })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Office floor.
  addBox(0, 0.05, 0, 18, 0.25, 14, 0x465361);

  // Exterior walls.
  addBox(-8.7, 0.2, 0, 0.3, 4.2, 14, 0x24364c);
  addBox(8.7, 0.2, 0, 0.3, 4.2, 14, 0x24364c);
  addBox(0, 0.2, -6.8, 17.4, 4.2, 0.3, 0x24364c);

  // Large windows.
  for (let x = -7; x <= 7; x += 3.5) {
    const windowMesh = addBox(
      x, 1.2, -6.57,
      2.8, 2.2, 0.05,
      0x5aa9d7,
      { metalness: 0.2, roughness: 0.25 }
    );

    windowMesh.material.transparent = true;
    windowMesh.material.opacity = 0.45;
  }

  // Office desks.
  for (let x = -5; x <= 5; x += 5) {
    addBox(x, 0.45, -2, 2.3, 0.18, 1.1, 0x5c4638);
    addBox(x, 0.65, -2.1, 0.8, 0.8, 0.08, 0x17202d);
    addBox(x, 0.9, -2.1, 0.68, 0.55, 0.03, 0x2e9cb5);
    addBox(x, 0.1, -1.6, 0.15, 0.6, 0.15, 0x35404e);
  }

  // Central meeting table.
  addBox(0, 0.4, 2.4, 4.2, 0.2, 2.0, 0x3d4a5c);
  for (let x = -1.5; x <= 1.5; x += 1.5) {
    addBox(x, 0.1, 3.8, 0.5, 0.65, 0.5, 0x202c3d);
  }

  // Plants.
  for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
    addBox(x, 0.2, z, 0.7, 0.6, 0.7, 0x795b43);
    addBox(x, 0.8, z, 1.0, 1.5, 1.0, 0x247a59);
  }

  // Entrance and outdoor road.
  addBox(0, 0.02, 9, 24, 0.08, 6, 0x171e29);
  addBox(0, 0.07, 9, 0.15, 0.03, 5.5, 0xd3cba5);
}

function createPlayer() {
  playerGroup = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.65, 4, 8),
    new THREE.MeshStandardMaterial({
      color: 0x36cde8,
      roughness: 0.7
    })
  );

  body.position.y = 1.05;
  body.castShadow = true;
  playerGroup.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xf0c5a3 })
  );

  head.position.y = 1.65;
  head.castShadow = true;
  playerGroup.add(head);

  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x243750 })
  );

  legs.position.y = 0.35;
  playerGroup.add(legs);

  playerGroup.position.set(0, 0.2, 4.5);
  player = playerGroup;
  scene.add(playerGroup);
}

function updateOfficeVisuals() {
  if (!scene) return;

  // A simple visual indication of upgrades.
  const height = 4 + state.officeLevel * 0.2;

  if (playerGroup) {
    playerGroup.scale.setScalar(1);
  }

  // Decorative upgraded office lights.
  const color = state.officeLevel >= 5 ? 0x9d83ff : 0x42e8ff;

  if (scene) {
    scene.traverse((object) => {
      if (
        object.isMesh &&
        object.material &&
        object.userData.isOfficeAccent
      ) {
        object.material.color.setHex(color);
      }
    });
  }
}

function buildCityVisuals() {
  if (!scene) return;

  const existing = scene.getObjectByName("city-buildings");
  if (existing) scene.remove(existing);

  const city = new THREE.Group();
  city.name = "city-buildings";

  const colors = [
    0x304963,
    0x41526a,
    0x344257,
    0x3c536b,
    0x2a3e55
  ];

  for (let i = 0; i < 24; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -10 - Math.floor(i / 2) * 4.5;
    const x = side * (14 + (i % 3) * 2);
    const width = randomBetween(3, 6);
    const height = randomBetween(5, 16);
    const depth = randomBetween(3, 5);

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        roughness: 0.85
      })
    );

    building.position.set(x, height / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    city.add(building);

    // Simplified glowing window rows.
    const windowMaterial = new THREE.MeshBasicMaterial({
      color: 0x75d9ff
    });

    for (let row = 1; row < Math.min(height / 2, 6); row++) {
      for (let col = 0; col < 2; col++) {
        const windowMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.35, 0.04),
          windowMaterial
        );

        windowMesh.position.set(
          x - width / 4 + col * width / 2,
          row * 1.5,
          z + depth / 2 + 0.025
        );

        city.add(windowMesh);
      }
    }
  }

  // Cafe building.
  const cafe = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0x98694d })
  );

  cafe.position.set(-7, 1.5, 15);
  cafe.castShadow = true;
  cafe.name = "cafe-building";
  city.add(cafe);

  // Retail shop.
  const shop = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0x326b79 })
  );

  shop.position.set(7, 1.5, 15);
  shop.castShadow = true;
  shop.name = "shop-building";
  city.add(shop);

  scene.add(city);
}

function placeCamera() {
  if (!camera || !player) return;

  camera.position.set(
    player.position.x + 8,
    player.position.y + 7,
    player.position.z + 10
  );

  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
}

function resize3D() {
  if (!renderer || !camera) return;

  const container = $("scene-container");
  if (!container) return;

  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate3D(timestamp) {
  animationFrame = requestAnimationFrame(animate3D);

  const delta = Math.min(
    0.05,
    lastFrame ? (timestamp - lastFrame) / 1000 : 0.016
  );

  lastFrame = timestamp;

  if (player && !modalOpen && !raidActive) {
    updateMovement(delta);
  }

  if (player && camera) {
    const target = new THREE.Vector3(
      player.position.x + 6,
      player.position.y + 5.5,
      player.position.z + 8
    );

    camera.position.lerp(target, 0.06);
    camera.lookAt(
      player.position.x,
      player.position.y + 1,
      player.position.z
    );
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }

  tickGame();
}

function updateMovement(delta) {
  if (!player) return;

  let dx = 0;
  let dz = 0;

  if (keys.KeyW || keys.ArrowUp || movement.forward) dz -= 1;
  if (keys.KeyS || keys.ArrowDown || movement.backward) dz += 1;
  if (keys.KeyA || keys.ArrowLeft || movement.left) dx -= 1;
  if (keys.KeyD || keys.ArrowRight || movement.right) dx += 1;

  const length = Math.hypot(dx, dz);

  if (length > 0) {
    dx /= length;
    dz /= length;

    const speed = 5 * delta;
    player.position.x += dx * speed;
    player.position.z += dz * speed;

    player.position.x = clamp(player.position.x, -45, 45);
    player.position.z = clamp(player.position.z, -45, 45);

    player.rotation.y = Math.atan2(dx, dz);
    isMoving = true;
  } else {
    isMoving = false;
  }
}

/* ==========================================
   GAME LOOP
   ========================================== */

function tickGame() {
  const now = Date.now();
  const elapsed = Math.max(0, now - lastIncomeTick);

  if (elapsed >= 60000) {
    const minutes = Math.floor(elapsed / 60000);
    const income = getIncomePerMinute() * minutes;
    const propertyIncome = state.properties.reduce(
      (sum, property) => sum + (property.income || 0) * minutes,
      0
    );

    const totalIncome = income + propertyIncome;

    if (totalIncome > 0) {
      state.cash += totalIncome;
      state.totalEarned += totalIncome;
      updateHUD();
      saveSilently();
    }

    lastIncomeTick = now;
  }

  // Trigger investigation every 20 minutes of active play.
  if (
    now - lastInvestigationCheck >= 20 * 60 * 1000 &&
    !investigation &&
    !raidActive &&
    !modalOpen
  ) {
    lastInvestigationCheck = now;
    startInvestigation(false);
  }
}

/* ==========================================
   INPUTS AND INTERFACE
   ========================================== */

function bindControls() {
  document.addEventListener("keydown", (event) => {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        event.code
      )
    ) {
      event.preventDefault();
    }

    keys[event.code] = true;

    if (event.code === "KeyE" && !modalOpen) {
      interact();
    }
  });

  document.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  window.addEventListener("blur", () => {
    keys = {};
    movement = { forward: 0, backward: 0, left: 0, right: 0 };
  });

  document.querySelectorAll("[data-move]").forEach((button) => {
    const direction = button.dataset.move;

    const start = (event) => {
      event.preventDefault();
      movement[direction] = 1;
    };

    const stop = (event) => {
      event.preventDefault();
      movement[direction] = 0;
    };

    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("pointerleave", stop);
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      renderPage(button.dataset.page);
    });
  });

  if ($("interact-btn")) {
    $("interact-btn").addEventListener("click", interact);
  }

  if ($("menu-btn")) {
    $("menu-btn").addEventListener("click", () => {
      showModal(`
        <h2>Empire Menu</h2>
        <p>Choose a management section.</p>
        <button class="game-button" data-menu-page="home">Headquarters</button>
        <button class="game-button" data-menu-page="business">Business</button>
        <button class="game-button" data-menu-page="staff">Staff</button>
        <button class="game-button" data-menu-page="city">City</button>
        <button class="game-button" data-menu-page="pc">My PC</button>
      `);

      $("modal-content").querySelectorAll("[data-menu-page]").forEach((button) => {
        button.addEventListener("click", () => {
          const page = button.dataset.menuPage;
          closeModal();
          renderPage(page);
        });
      });
    });
  }

  if ($("close-modal")) {
    $("close-modal").addEventListener("click", closeModal);
  }

  if ($("event-modal")) {
    $("event-modal").addEventListener("click", (event) => {
      if (event.target === $("event-modal") && !investigation) {
        closeModal();
      }
    });
  }

  // Optional development tool: press L to trigger a fictional leak.
  document.addEventListener("keydown", (event) => {
    if (
      event.code === "KeyL" &&
      !event.repeat &&
      !modalOpen &&
      !raidActive
    ) {
      triggerInformationLeak();
    }
  });
}

function interact() {
  if (modalOpen || raidActive) return;

  const x = player ? player.position.x : 0;
  const z = player ? player.position.z : 0;

  if (currentLocation === "city" && z > 10) {
    if (x < 0) {
      showToast("Cafe district: purchase a cafe from the City menu.");
    } else {
      showToast("Retail district: purchase a shop from the City menu.");
    }
  } else if (Math.abs(x) < 3 && Math.abs(z - 2) < 3) {
    renderPage("pc");
    showToast("Finance computer opened.");
  } else {
    showToast("Explore your headquarters and city.");
  }
}

/* ==========================================
   STARTUP
   ========================================== */

function startGame() {
  bindControls();
  renderPage("home");
  updateHUD();

  const threeReady = init3D();

  if ($("loading-progress")) {
    $("loading-progress").style.width = "100%";
  }

  setTimeout(() => {
    if ($("loading-screen")) {
      $("loading-screen").classList.add("finished");
    }

    if (threeReady) {
      showToast("Welcome to SCAM EMPIRE 3D!");
    }
  }, 700);

  // Basic autosave.
  setInterval(saveSilently, 30000);

  // Test-friendly delayed startup: begin the 20-minute timer from this session.
  lastInvestigationCheck = Date.now();
  sessionStart = Date.now();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startGame);
} else {
  startGame();
}
