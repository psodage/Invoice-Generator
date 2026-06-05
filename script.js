var items = [
    {
      productName: "",
      sac: "",
      qty: "",
      rate: ""
    }
  ];

  // PWA install prompt support (Android Chrome)
  var deferredInstallPromptEvent = null;
  var installButtons = [];

  // Mobile wizard state
  var currentStep = 1;
  var totalSteps = 3;
  var mobileWizardActive = false;
  var currentProductIndex = 0;
  var lastLayoutWidth = window.innerWidth;

  function getElement(id) {
    return document.getElementById(id);
  }

  function isAppInStandaloneMode() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      (window.navigator && window.navigator.standalone === true);
  }

  var swRegistration = null;
  var SW_STATIC_CACHE = "invoice-static-v2.1.0";
  var SW_READY_KEY = "invoice-sw-ready-v2";

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!window._swWaitingForReload) {
        return;
      }
      window.location.reload();
    });

    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .then(function (registration) {
        swRegistration = registration;
        listenForServiceWorkerUpdates(registration);

        return navigator.serviceWorker.ready.then(function () {
          if (!navigator.serviceWorker.controller && !sessionStorage.getItem(SW_READY_KEY)) {
            sessionStorage.setItem(SW_READY_KEY, "1");

            if (registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }

            window.location.reload();
            return;
          }

          warmOfflineCache(registration);
        });
      })
      .catch(function (err) {
        console.warn("Service worker registration failed:", err);
      });
  }

  function listenForServiceWorkerUpdates(registration) {
    function onWaitingWorker(worker) {
      if (!worker || worker.state !== "installed") {
        return;
      }
      if (!navigator.serviceWorker.controller) {
        return;
      }
      showPwaUpdateBar();
    }

    if (registration.waiting) {
      onWaitingWorker(registration.waiting);
    }

    registration.addEventListener("updatefound", function () {
      var newWorker = registration.installing;
      if (!newWorker) {
        return;
      }
      newWorker.addEventListener("statechange", function () {
        if (newWorker.state === "installed") {
          onWaitingWorker(newWorker);
        }
      });
    });
  }

  function showPwaUpdateBar() {
    var bar = getElement("pwaUpdateBar");
    if (!bar) {
      return;
    }
    bar.hidden = false;
  }

  function hidePwaUpdateBar() {
    var bar = getElement("pwaUpdateBar");
    if (bar) {
      bar.hidden = true;
    }
  }

  function applyServiceWorkerUpdate() {
    window._swWaitingForReload = true;
    var worker = swRegistration && swRegistration.waiting;
    if (!worker) {
      window.location.reload();
      return;
    }
    worker.postMessage({ type: "SKIP_WAITING" });
  }

  function setupPwaUpdateBar() {
    var updateBtn = getElement("pwaUpdateBtn");
    var dismissBtn = getElement("pwaUpdateDismiss");

    if (updateBtn) {
      updateBtn.addEventListener("click", applyServiceWorkerUpdate);
    }
    if (dismissBtn) {
      dismissBtn.addEventListener("click", hidePwaUpdateBar);
    }
  }

  function refreshServiceWorkerCache() {
    if (!swRegistration || !swRegistration.update) {
      return Promise.resolve();
    }

    return swRegistration.update().catch(function () {
      return null;
    });
  }

  function warmOfflineCache(registration) {
    if (!registration || !window.caches || !navigator.onLine) {
      return;
    }

    function cacheLocalAsset(path) {
      var url = new URL(path, window.location.href).href;

      return fetch(url)
        .then(function (response) {
          if (!response.ok) {
            return;
          }

          return caches.open(SW_STATIC_CACHE).then(function (cache) {
            var jobs = [cache.put(url, response.clone())];

            if (path === "index.html") {
              if (registration.scope) {
                jobs.push(cache.put(registration.scope, response.clone()));
              }
              jobs.push(cache.put(new URL("./", window.location.href).href, response.clone()));
            }

            return Promise.all(jobs);
          });
        })
        .catch(function () {
          return null;
        });
    }

    function runWarmup() {
      var assets = [
        "index.html",
        "styles.css",
        "script.js",
        "manifest.json",
        "offline.html",
        "vendor/html2pdf.bundle.min.js",
        "web/favicon.ico",
        "web/apple-touch-icon.png",
        "web/icon-192.png",
        "web/icon-512.png",
        "web/icon-192-maskable.png",
        "web/icon-512-maskable.png"
      ];

      return Promise.all(assets.map(cacheLocalAsset)).then(function () {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "CACHE_SHELL" });
        }
      });
    }

    if (registration.active || registration.waiting) {
      runWarmup();
    }

    if (registration.installing) {
      registration.installing.addEventListener("statechange", function () {
        if (registration.installing && registration.installing.state === "activated") {
          runWarmup();
        }
      });
    }
  }

  function setupOfflineIndicator() {
    var offlineBar = getElement("pwaOfflineBar");
    var onlineBar = getElement("pwaOnlineBar");
    var connectionText = getElement("pwaConnectionText");
    var wasOffline = !navigator.onLine;
    var onlineHideTimer = null;

    function hideOnlineBar() {
      if (onlineBar) {
        onlineBar.hidden = true;
      }
      if (onlineHideTimer) {
        clearTimeout(onlineHideTimer);
        onlineHideTimer = null;
      }
    }

    function showOnlineBar() {
      if (!onlineBar) {
        return;
      }
      onlineBar.hidden = false;
      onlineHideTimer = setTimeout(hideOnlineBar, 5000);
    }

    function syncOnlineState() {
      var online = navigator.onLine;

      if (offlineBar) {
        offlineBar.hidden = online;
      }

      if (connectionText) {
        connectionText.innerText = online
          ? "You're online."
          : "You're offline — forms, preview, and print still work.";
      }

      document.documentElement.classList.toggle("is-offline", !online);
      document.documentElement.classList.toggle("is-online", online);

      if (online && wasOffline) {
        wasOffline = false;
        showOnlineBar();
        refreshServiceWorkerCache();
      }

      if (!online) {
        wasOffline = true;
        hideOnlineBar();
      }
    }

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    syncOnlineState();
  }

  function setupInstallPrompt() {
    installButtons = [
      getElement("installBtn"),
      getElement("installBtnDesktop")
    ].filter(function (btn) {
      return btn !== null;
    });

    if (installButtons.length === 0) {
      return;
    }

    function hideInstallButtons() {
      for (var i = 0; i < installButtons.length; i++) {
        installButtons[i].style.display = "none";
      }
    }

    function showInstallButtons() {
      for (var i = 0; i < installButtons.length; i++) {
        installButtons[i].style.display = "inline-block";
      }
    }

    // Hide if already installed / running standalone
    if (isAppInStandaloneMode()) {
      hideInstallButtons();
      return;
    }

    function handleInstallClick() {
      if (!deferredInstallPromptEvent) {
        return;
      }

      deferredInstallPromptEvent.prompt();

      deferredInstallPromptEvent.userChoice
        .then(function () {
          deferredInstallPromptEvent = null;
          hideInstallButtons();
        })
        .catch(function () {
          deferredInstallPromptEvent = null;
        });
    }

    for (var j = 0; j < installButtons.length; j++) {
      installButtons[j].addEventListener("click", handleInstallClick);
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstallPromptEvent = e;
      showInstallButtons();
    });

    window.addEventListener("appinstalled", function () {
      deferredInstallPromptEvent = null;
      hideInstallButtons();
    });
  }

  function isMobileWizard() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function resetMobileInvoiceScale() {
    var page = getElement("invoice");
    var viewport = getElement("invoiceMobileViewport");
    var inner = getElement("invoiceScaleInner");

    if (page) {
      page.style.transform = "";
      page.style.transformOrigin = "";
      page.style.width = "";
      page.style.position = "";
    }

    if (inner) {
      inner.style.width = "";
      inner.style.height = "";
    }

    if (viewport) {
      viewport.style.height = "";
      viewport.scrollLeft = 0;
    }
  }

  function updateMobileInvoiceScale() {
    var wrapper = document.querySelector(".invoice-wrapper");
    var viewport = getElement("invoiceMobileViewport");
    var page = getElement("invoice");

    if (!wrapper || !viewport || !page) {
      return;
    }

    if (!wrapper.classList.contains("mobile-visible")) {
      resetMobileInvoiceScale();
      return;
    }

    resetMobileInvoiceScale();
    viewport.scrollLeft = 0;
  }

  function updateMobileWizardLayout() {
    var wasMobile = mobileWizardActive;
    mobileWizardActive = isMobileWizard();
    var invoiceWrapper = document.querySelector(".invoice-wrapper");

    if (!mobileWizardActive) {
      if (invoiceWrapper) {
        invoiceWrapper.classList.remove("mobile-visible");
      }
      resetMobileInvoiceScale();

      if (wasMobile) {
        currentStep = 1;
      }

      return;
    }

    if (!wasMobile) {
      goToStep(currentStep, false);
      return;
    }

    if (invoiceWrapper) {
      if (currentStep === totalSteps) {
        invoiceWrapper.classList.add("mobile-visible");
      } else {
        invoiceWrapper.classList.remove("mobile-visible");
        resetMobileInvoiceScale();
      }
    }

    updateStepperUI();
  }

  function updateStepperUI() {
    var steps = document.querySelectorAll(".stepper-step");

    for (var i = 0; i < steps.length; i++) {
      var stepNum = parseInt(steps[i].getAttribute("data-step"), 10);
      steps[i].classList.remove("active", "completed");

      if (stepNum === currentStep) {
        steps[i].classList.add("active");
      } else if (stepNum < currentStep) {
        steps[i].classList.add("completed");
      }
    }

    var prevBtn = getElement("prevStepBtn");
    var nextBtn = getElement("nextStepBtn");

    if (prevBtn) {
      prevBtn.classList.toggle("hidden", currentStep === 1);
    }

    if (nextBtn) {
      nextBtn.style.display = currentStep === totalSteps ? "none" : "block";
      updateMobileNavLabels();
    }
  }

  function updateMobileNavLabels() {
    var nextBtn = getElement("nextStepBtn");
    var prevBtn = getElement("prevStepBtn");

    if (!nextBtn || !prevBtn) {
      return;
    }

    nextBtn.innerText = "Next";
    prevBtn.innerText = "Back";

    if (currentStep === 2 && mobileWizardActive) {
      if (currentProductIndex < items.length - 1) {
        nextBtn.innerText = "Next Product";
      } else {
        nextBtn.innerText = "Preview";
      }

      if (currentProductIndex > 0) {
        prevBtn.innerText = "Previous";
      }
    }
  }

  function readProductCountFromInput() {
    var countInput = getElement("productCount");

    if (!countInput) {
      return null;
    }

    var raw = String(countInput.value).trim();

    if (raw === "") {
      return null;
    }

    var count = parseInt(raw, 10);

    if (isNaN(count)) {
      return null;
    }

    return count;
  }

  function getProductCount() {
    var count = readProductCountFromInput();

    if (count === null || count < 1) {
      return 1;
    }

    if (count > 50) {
      return 50;
    }

    return count;
  }

  function normalizeProductCountInput() {
    var countInput = getElement("productCount");

    if (!countInput) {
      return;
    }

    var count = getProductCount();
    countInput.value = String(count);
    syncItemsToProductCount(true);
  }

  function syncItemsToProductCount(forceSync) {
    var parsed = readProductCountFromInput();

    if (parsed === null && !forceSync) {
      return;
    }

    var count = getProductCount();
    var countInput = getElement("productCount");

    if (countInput && forceSync) {
      countInput.value = String(count);
    }

    while (items.length < count) {
      items.push({
        productName: "",
        sac: "",
        qty: "",
        rate: ""
      });
    }

    while (items.length > count) {
      items.pop();
    }

    if (currentProductIndex >= items.length) {
      currentProductIndex = Math.max(0, items.length - 1);
    }
  }

  function updateProductProgress() {
    var progress = getElement("productProgress");

    if (!progress) {
      return;
    }

    progress.innerText = "Product " + (currentProductIndex + 1) + " of " + items.length;
  }

  function renderMobileProductForm() {
    var container = getElement("productSingleForm");

    if (!container || !mobileWizardActive) {
      return;
    }

    var activeElement = document.activeElement;

    if (activeElement && container.contains(activeElement)) {
      return;
    }

    syncItemsToProductCount();

    var item = items[currentProductIndex];

    if (!item) {
      return;
    }

    var amount = calculateRowAmount(item);
    var index = currentProductIndex;

    container.innerHTML =
      '<div class="form-group">' +
        '<label for="mobileProductName">Product Name</label>' +
        '<input type="text" id="mobileProductName" placeholder="Enter product name" value="' + safeText(item.productName) + '" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="mobileProductSac">SAC</label>' +
        '<input type="text" id="mobileProductSac" placeholder="Enter SAC" value="' + safeText(item.sac) + '" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="mobileProductQty">Quantity</label>' +
        '<input type="number" id="mobileProductQty" min="0" step="1" inputmode="numeric" placeholder="Qty" value="' + safeText(item.qty) + '" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="mobileProductRate">Rate</label>' +
        '<input type="number" id="mobileProductRate" min="0" step="0.01" inputmode="decimal" placeholder="Rate" value="' + safeText(item.rate) + '" />' +
      '</div>' +
      '<div class="amount-display">Amount: <span id="mobileProductAmount">' + formatAmount(amount) + '</span></div>';

    getElement("mobileProductName").oninput = function () {
      updateItemField(index, "productName", this.value);
    };

    getElement("mobileProductSac").oninput = function () {
      updateItemField(index, "sac", this.value);
    };

    getElement("mobileProductQty").oninput = function () {
      updateItemField(index, "qty", this.value);
    };

    getElement("mobileProductRate").oninput = function () {
      updateItemField(index, "rate", this.value);
    };

    updateProductProgress();
    updateMobileNavLabels();
  }

  function updateItemField(index, field, value) {
    if (!items[index]) {
      return;
    }

    items[index][field] = value;

    var amountEl = getElement("mobileProductAmount");

    if (amountEl) {
      amountEl.innerText = formatAmount(calculateRowAmount(items[index]));
    }

    if (!mobileWizardActive) {
      renderItemInputs();
    }

    generateInvoice(false);
  }

  function buildPdfFileName() {
    var invoiceDate = formatDate(getElement("invoiceDate").value);

    if (!invoiceDate) {
      var today = new Date();
      var day = today.getDate();
      var month = today.getMonth() + 1;
      invoiceDate = (day < 10 ? "0" + day : String(day)) + "-" +
        (month < 10 ? "0" + month : String(month)) + "-" +
        today.getFullYear();
    } else {
      invoiceDate = invoiceDate.replace(/\//g, "-");
    }

    return "SS Engineers " + invoiceDate + ".pdf";
  }

  function goToStep(step, scrollToTop) {
    if (scrollToTop === undefined) {
      scrollToTop = true;
    }

    var previousStep = currentStep;
    var previousProductIndex = currentProductIndex;

    currentStep = Math.max(1, Math.min(totalSteps, step));

    var formSteps = document.querySelectorAll(".form-step");
    for (var i = 0; i < formSteps.length; i++) {
      var stepNum = parseInt(formSteps[i].getAttribute("data-step"), 10);
      formSteps[i].classList.toggle("active", stepNum === currentStep);
    }

    var invoiceWrapper = document.querySelector(".invoice-wrapper");

    if (invoiceWrapper) {
      if (mobileWizardActive && currentStep === totalSteps) {
        invoiceWrapper.classList.add("mobile-visible");
        generateInvoice(false);
        setTimeout(updateMobileInvoiceScale, 50);
      } else if (mobileWizardActive) {
        invoiceWrapper.classList.remove("mobile-visible");
        resetMobileInvoiceScale();
      }
    }

    if (mobileWizardActive && currentStep === 2) {
      if (previousStep !== 2 || previousProductIndex !== currentProductIndex) {
        renderMobileProductForm();
      }
    }

    updateStepperUI();

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function validateStep1() {
    var errorBox = getElement("errorBox");
    var count = readProductCountFromInput();

    errorBox.innerText = "";

    if (count === null || count < 1) {
      errorBox.innerText = "Please enter number of products (at least 1).";
      return false;
    }

    if (count > 50) {
      errorBox.innerText = "Maximum 50 products allowed.";
      return false;
    }

    return true;
  }

  function validateCurrentProduct() {
    var errorBox = getElement("errorBox");
    var item = items[currentProductIndex];

    errorBox.innerText = "";

    if (!item) {
      return true;
    }

    var productLabel = "product " + (currentProductIndex + 1);

    if (String(item.productName).trim() === "") {
      errorBox.innerText = "Please enter product name for " + productLabel + ".";
      return false;
    }

    if (String(item.qty).trim() === "" || parseFloat(item.qty) < 0 || isNaN(parseFloat(item.qty))) {
      errorBox.innerText = "Please enter valid quantity for " + productLabel + ".";
      return false;
    }

    if (String(item.rate).trim() === "" || parseFloat(item.rate) < 0 || isNaN(parseFloat(item.rate))) {
      errorBox.innerText = "Please enter valid rate for " + productLabel + ".";
      return false;
    }

    return true;
  }

  function validateStep(step) {
    if (step === 1) {
      return validateStep1();
    }

    if (step === 2) {
      if (mobileWizardActive) {
        return validateCurrentProduct();
      }

      return validateItems();
    }

    return true;
  }

  function nextStep() {
    if (!mobileWizardActive) {
      return;
    }

    if (!validateStep(currentStep)) {
      return;
    }

    if (currentStep === 1) {
      normalizeProductCountInput();
      currentProductIndex = 0;
      goToStep(2);
      return;
    }

    if (currentStep === 2) {
      if (currentProductIndex < items.length - 1) {
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
        }

        currentProductIndex++;
        renderMobileProductForm();
        getElement("errorBox").innerText = "";
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      goToStep(3);
      return;
    }
  }

  function prevStep() {
    if (!mobileWizardActive || currentStep <= 1) {
      return;
    }

    getElement("errorBox").innerText = "";

    if (currentStep === 2 && currentProductIndex > 0) {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }

      currentProductIndex--;
      renderMobileProductForm();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (currentStep === 2) {
      goToStep(1);
      return;
    }

    if (currentStep === 3) {
      currentProductIndex = Math.max(0, items.length - 1);
      goToStep(2);
    }
  }

  function safeText(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(dateValue) {
    if (!dateValue) {
      return "";
    }

    var parts = dateValue.split("-");

    if (parts.length !== 3) {
      return "";
    }

    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function parseNumber(value) {
    var num = parseFloat(value);

    if (isNaN(num) || num < 0) {
      return 0;
    }

    return num;
  }

  function formatAmount(amount) {
    var num = parseFloat(amount);

    if (isNaN(num)) {
      num = 0;
    }

    return num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " /-";
  }

  function calculateRowAmount(item) {
    return parseNumber(item.qty) * parseNumber(item.rate);
  }

  function renderItemInputs() {
    var tbody = getElement("itemsInputBody");

    tbody.innerHTML = "";

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var amount = calculateRowAmount(item);

      var row = document.createElement("tr");

      row.innerHTML =
        '<td data-label="Product Name">' +
          '<input type="text" placeholder="Enter product name" value="' + safeText(item.productName) + '" oninput="updateItemNoRender(' + i + ', \'productName\', this.value, this)" />' +
        '</td>' +

        '<td data-label="SAC">' +
          '<input type="text" placeholder="Enter SAC" value="' + safeText(item.sac) + '" oninput="updateItemNoRender(' + i + ', \'sac\', this.value, this)" />' +
        '</td>' +

        '<td data-label="Qty">' +
          '<input type="number" min="0" step="1" inputmode="numeric" placeholder="Qty" value="' + safeText(item.qty) + '" oninput="updateItemNoRender(' + i + ', \'qty\', this.value, this)" />' +
        '</td>' +

        '<td data-label="Rate">' +
          '<input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Rate" value="' + safeText(item.rate) + '" oninput="updateItemNoRender(' + i + ', \'rate\', this.value, this)" />' +
        '</td>' +

        '<td data-label="Amount" class="row-amount">' + formatAmount(amount) + '</td>' +

        '<td data-label="Action">' +
          '<button type="button" class="btn-danger" onclick="removeItem(' + i + ')">Remove</button>' +
        '</td>';

      tbody.appendChild(row);
    }
  }

  function updateItemNoRender(index, field, value, inputElement) {
    if (!items[index]) {
      return;
    }

    items[index][field] = value;

    var row = inputElement.parentNode.parentNode;
    var amountCell = row.querySelector(".row-amount");

    if (amountCell) {
      amountCell.innerText = formatAmount(calculateRowAmount(items[index]));
    }

    generateInvoice(false);
  }

  function addItem() {
    items.push({
      productName: "",
      sac: "",
      qty: "",
      rate: ""
    });

    renderItemInputs();
    generateInvoice(false);

    setTimeout(function () {
      var inputs = document.querySelectorAll("#itemsInputBody tr:last-child input");
      if (inputs.length > 0) {
        inputs[0].focus();
      }
    }, 100);
  }

  function removeItem(index) {
    if (items.length === 1) {
      items[0] = {
        productName: "",
        sac: "",
        qty: "",
        rate: ""
      };
    } else {
      items.splice(index, 1);
    }

    renderItemInputs();
    generateInvoice(false);
  }

  function validateItems() {
    var errorBox = getElement("errorBox");
    errorBox.innerText = "";

    syncItemsToProductCount();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      if (String(item.productName).trim() === "") {
        errorBox.innerText = "Please enter product name in row " + (i + 1);
        return false;
      }

      if (String(item.qty).trim() === "" || parseFloat(item.qty) < 0 || isNaN(parseFloat(item.qty))) {
        errorBox.innerText = "Please enter valid quantity in row " + (i + 1);
        return false;
      }

      if (String(item.rate).trim() === "" || parseFloat(item.rate) < 0 || isNaN(parseFloat(item.rate))) {
        errorBox.innerText = "Please enter valid rate in row " + (i + 1);
        return false;
      }
    }

    return true;
  }

  function formatSerial(number) {
    if (number < 10) {
      return "0" + number;
    }

    return String(number);
  }

  function generateInvoice(showError) {
    if (showError === undefined) {
      showError = true;
    }

    syncItemsToProductCount();

    var invoiceNo = getElement("invoiceNo").value;
    var invoiceDate = getElement("invoiceDate").value;
    var poNo = getElement("poNo").value;
    var poDate = getElement("poDate").value;

    getElement("previewInvoiceNo").innerText = invoiceNo.trim();
    getElement("previewInvoiceDate").innerText = formatDate(invoiceDate);
    getElement("previewPoNo").innerText = poNo.trim();
    getElement("previewPoDate").innerText = formatDate(poDate);

    var invoiceItemsBody = getElement("invoiceItemsBody");
    invoiceItemsBody.innerHTML = "";

    if (showError) {
      if (!validateItems()) {
        getElement("previewTotal").innerText = formatAmount(0);
        getElement("beforeTax").innerText = formatAmount(0);
        getElement("amountWords").innerText = "Zero only.";
        return;
      }
    } else {
      getElement("errorBox").innerText = "";
    }

    var total = 0;
    var serialNumber = 1;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      var hasAnyValue =
        String(item.productName).trim() !== "" ||
        String(item.sac).trim() !== "" ||
        String(item.qty).trim() !== "" ||
        String(item.rate).trim() !== "";

      if (!hasAnyValue) {
        continue;
      }

      var qty = parseNumber(item.qty);
      var rate = parseNumber(item.rate);
      var amount = qty * rate;

      total += amount;

      var row = document.createElement("tr");

      row.innerHTML =
        '<td>' + formatSerial(serialNumber) + '</td>' +
        '<td class="product-col bold">' + safeText(item.productName) + '</td>' +
        '<td>' + safeText(item.sac) + '</td>' +
        '<td>' + qty + '</td>' +
        '<td>' + formatAmount(rate) + '</td>' +
        '<td class="bold">' + formatAmount(amount) + '</td>';

      invoiceItemsBody.appendChild(row);
      serialNumber++;
    }

    getElement("previewTotal").innerText = formatAmount(total);
    getElement("beforeTax").innerText = formatAmount(total);
    getElement("amountWords").innerText = numberToWords(total) + " only.";

    if (mobileWizardActive && currentStep === totalSteps) {
      setTimeout(updateMobileInvoiceScale, 50);
    }
  }

  var PDF_PAGE_WIDTH_PX = 794;
  var PDF_PAGE_PADDING_PX = 30;

  function prepareInvoiceForExport() {
    resetMobileInvoiceScale();
    generateInvoice(false);
  }

  function applyPdfExportInlineStyles(root, page) {
    if (root) {
      root.style.position = "fixed";
      root.style.left = "0";
      root.style.top = "0";
      root.style.width = PDF_PAGE_WIDTH_PX + "px";
      root.style.opacity = "0";
      root.style.pointerEvents = "none";
      root.style.zIndex = "-1";
      root.style.overflow = "visible";
      root.style.background = "#ffffff";
    }

    if (page) {
      page.style.width = PDF_PAGE_WIDTH_PX + "px";
      page.style.minWidth = PDF_PAGE_WIDTH_PX + "px";
      page.style.maxWidth = PDF_PAGE_WIDTH_PX + "px";
      page.style.padding = PDF_PAGE_PADDING_PX + "px";
      page.style.margin = "0";
      page.style.boxSizing = "border-box";
      page.style.background = "#ffffff";
      page.style.transform = "none";
      page.style.position = "static";
      page.style.boxShadow = "none";
      page.style.fontSize = "14px";
      page.style.color = "#111111";
    }
  }

  function applyPdfLayoutOnClone(clonedDoc) {
    if (!clonedDoc) {
      return;
    }

    var page = clonedDoc.querySelector(".pdf-export-root .invoice-page") ||
      clonedDoc.querySelector(".invoice-page");
    var root = clonedDoc.querySelector(".pdf-export-root");

    applyPdfExportInlineStyles(root, page);

    if (root) {
      root.style.opacity = "1";
      root.style.position = "static";
      root.style.left = "auto";
      root.style.top = "auto";
    }
  }

  function printInvoice() {
    generateInvoice(true);

    if (getElement("errorBox").innerText.trim() !== "") {
      return;
    }

    var needsMobileRestore = document.querySelector(".invoice-wrapper.mobile-visible") !== null;
    prepareInvoiceForExport();

    document.title = buildPdfFileName().replace(/\.pdf$/i, "");

    function restoreMobilePreview() {
      if (needsMobileRestore) {
        updateMobileInvoiceScale();
      }
    }

    window.addEventListener("afterprint", function onAfterPrint() {
      window.removeEventListener("afterprint", onAfterPrint);
      restoreMobilePreview();
    });

    setTimeout(function () {
      window.print();
    }, 300);
  }

  function createPdfExportElement() {
    prepareInvoiceForExport();

    var source = getElement("invoice");
    var root = document.createElement("div");
    var page = source.cloneNode(true);

    root.className = "pdf-export-root";
    page.removeAttribute("id");
    page.removeAttribute("style");
    root.appendChild(page);
    applyPdfExportInlineStyles(root, page);
    document.body.appendChild(root);

    return { root: root, page: page };
  }

  function destroyPdfExportElement(exportEl) {
    if (exportEl && exportEl.root && exportEl.root.parentNode) {
      exportEl.root.parentNode.removeChild(exportEl.root);
    }
  }

  function buildInvoicePdfOptions(fileName) {
    return {
      margin: 0,
      filename: fileName,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: false,
        allowTaint: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: "#ffffff",
        onclone: applyPdfLayoutOnClone
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true
      },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] }
    };
  }

  function generateInvoicePdfBlob(fileName) {
    if (typeof html2pdf === "undefined") {
      return Promise.reject(new Error("PDF library not loaded"));
    }

    var needsMobileRestore = document.querySelector(".invoice-wrapper.mobile-visible") !== null;
    var exportEl = createPdfExportElement();

    var captureDelay = navigator.onLine ? 200 : 450;

    return new Promise(function (resolve, reject) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            html2pdf()
              .set(buildInvoicePdfOptions(fileName))
              .from(exportEl.page)
              .toPdf()
              .output("blob")
              .then(function (blob) {
                destroyPdfExportElement(exportEl);
                if (needsMobileRestore) {
                  setTimeout(updateMobileInvoiceScale, 50);
                }
                resolve(blob);
              })
              .catch(function (err) {
                destroyPdfExportElement(exportEl);
                if (needsMobileRestore) {
                  setTimeout(updateMobileInvoiceScale, 50);
                }
                reject(err);
              });
          }, captureDelay);
        });
      });
    });
  }

  function shareOnWhatsApp() {
    generateInvoice(true);

    if (getElement("errorBox").innerText.trim() !== "") {
      return;
    }

    var invoiceNo = getElement("invoiceNo").value.trim() || "Invoice";
    var invoiceDate = formatDate(getElement("invoiceDate").value) || new Date().toLocaleDateString();
    var fileName = buildPdfFileName();

    generateInvoicePdfBlob(fileName)
      .then(function (pdfBlob) {
        var pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          navigator.share({
            files: [pdfFile],
            title: "S.S. Engineers Invoice",
            text: "Invoice No: " + invoiceNo + "\nInvoice Date: " + invoiceDate
          })
            .catch(function (err) {
              if (err.name !== "AbortError") {
                console.log("Share failed:", err);
                downloadPDF(pdfBlob, fileName);
              }
            });
        } else {
          downloadPDF(pdfBlob, fileName);
        }
      })
      .catch(function (err) {
        console.error("PDF generation error:", err);
        var msg = "Failed to generate PDF. Please try again.";
        if (!navigator.onLine) {
          msg = "PDF export needs a cached copy of the app. Open once online, or use Print / Save PDF.";
        }
        showError(msg);
      });
  }

  function downloadPDF(blob, fileName) {
    // Create a download link for the PDF
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function showError(message) {
    var errorBox = getElement("errorBox");
    if (errorBox) {
      errorBox.innerText = message;
    }
  }

  function numberToWords(num) {
    num = Math.floor(Number(num));

    if (num === 0) {
      return "Zero";
    }

    var ones = [
      "",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
      "thirteen",
      "fourteen",
      "fifteen",
      "sixteen",
      "seventeen",
      "eighteen",
      "nineteen"
    ];

    var tens = [
      "",
      "",
      "twenty",
      "thirty",
      "forty",
      "fifty",
      "sixty",
      "seventy",
      "eighty",
      "ninety"
    ];

    function convertBelowHundred(n) {
      if (n < 20) {
        return ones[n];
      }

      return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    }

    function convertBelowThousand(n) {
      var word = "";

      if (n >= 100) {
        word += ones[Math.floor(n / 100)] + " hundred";
        n = n % 100;

        if (n) {
          word += " ";
        }
      }

      if (n > 0) {
        word += convertBelowHundred(n);
      }

      return word;
    }

    var words = "";

    if (num >= 10000000) {
      words += convertBelowThousand(Math.floor(num / 10000000)) + " crore ";
      num = num % 10000000;
    }

    if (num >= 100000) {
      words += convertBelowThousand(Math.floor(num / 100000)) + " lakh ";
      num = num % 100000;
    }

    if (num >= 1000) {
      words += convertBelowThousand(Math.floor(num / 1000)) + " thousand ";
      num = num % 1000;
    }

    if (num > 0) {
      words += convertBelowThousand(num);
    }

    words = words.trim();

    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  registerServiceWorker();

  window.onload = function () {
    syncItemsToProductCount(true);
    renderItemInputs();
    generateInvoice(false);

    getElement("invoiceNo").oninput = function () {
      generateInvoice(false);
    };

    getElement("invoiceDate").oninput = function () {
      generateInvoice(false);
    };

    getElement("poNo").oninput = function () {
      generateInvoice(false);
    };

    getElement("poDate").oninput = function () {
      generateInvoice(false);
    };

    getElement("productCount").oninput = function () {
      syncItemsToProductCount(false);
      renderItemInputs();
      generateInvoice(false);

      if (mobileWizardActive && currentStep === 2) {
        renderMobileProductForm();
      }
    };

    getElement("productCount").onblur = function () {
      normalizeProductCountInput();
      renderItemInputs();
      generateInvoice(false);

      if (mobileWizardActive && currentStep === 2) {
        renderMobileProductForm();
      }
    };

    setupInstallPrompt();
    setupPwaUpdateBar();
    setupOfflineIndicator();
    updateMobileWizardLayout();

    window.addEventListener("resize", function () {
      var currentWidth = window.innerWidth;

      // Mobile keyboard open/close changes height only — ignore those resizes
      if (currentWidth === lastLayoutWidth) {
        return;
      }

      lastLayoutWidth = currentWidth;
      updateMobileWizardLayout();
      updateMobileInvoiceScale();
    });
  };