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

  function getElement(id) {
    return document.getElementById(id);
  }

  function isAppInStandaloneMode() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      (window.navigator && window.navigator.standalone === true);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    window.addEventListener("load", function () {
      navigator.serviceWorker.register("service-worker.js")
        .catch(function () {
          // Ignore registration errors to avoid breaking the app
        });
    });
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
    mobileWizardActive = isMobileWizard();
    var invoiceWrapper = document.querySelector(".invoice-wrapper");

    if (!mobileWizardActive) {
      if (invoiceWrapper) {
        invoiceWrapper.classList.remove("mobile-visible");
      }
      resetMobileInvoiceScale();
      currentStep = 1;
      return;
    }

    goToStep(currentStep, false);
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
    }
  }

  function goToStep(step, scrollToTop) {
    if (scrollToTop === undefined) {
      scrollToTop = true;
    }

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

    updateStepperUI();

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function validateStep(step) {
    var errorBox = getElement("errorBox");
    errorBox.innerText = "";

    if (step === 2) {
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

    if (currentStep < totalSteps) {
      goToStep(currentStep + 1);
    }
  }

  function prevStep() {
    if (!mobileWizardActive || currentStep <= 1) {
      return;
    }

    getElement("errorBox").innerText = "";
    goToStep(currentStep - 1);
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

    if (isMobileWizard()) {
      setTimeout(updateMobileInvoiceScale, 50);
    }
  }

  function printInvoice() {
    generateInvoice(true);

    if (getElement("errorBox").innerText.trim() !== "") {
      return;
    }

    var needsMobileRestore = document.querySelector(".invoice-wrapper.mobile-visible") !== null;
    resetMobileInvoiceScale();

    var invoiceDate = getElement("invoiceDate").value;
    var invoiceNo = getElement("invoiceNo").value;
    var formattedDate = formatDate(invoiceDate);
    var trimmedInvoiceNo = invoiceNo.trim();
    var titleParts = ["S.S. Engineers Invoice"];

    if (formattedDate) {
      titleParts.push(formattedDate);
    }

    if (trimmedInvoiceNo) {
      titleParts.push(trimmedInvoiceNo);
    }

    document.title = titleParts.join(" ");

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
    var source = getElement("invoice");
    var root = document.createElement("div");
    var page = source.cloneNode(true);

    root.className = "pdf-export-root";
    page.removeAttribute("id");
    page.removeAttribute("style");
    root.appendChild(page);
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
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: "#ffffff"
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
    var exportEl = createPdfExportElement();

    return new Promise(function (resolve, reject) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          html2pdf()
            .set(buildInvoicePdfOptions(fileName))
            .from(exportEl.page)
            .toPdf()
            .output("blob")
            .then(function (blob) {
              destroyPdfExportElement(exportEl);
              resolve(blob);
            })
            .catch(function (err) {
              destroyPdfExportElement(exportEl);
              reject(err);
            });
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
    var fileName = "S.S.Engineers_Invoice_" + invoiceNo + "_" + invoiceDate.replace(/\//g, "-") + ".pdf";

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
        showError("Failed to generate PDF. Please try again.");
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

  window.onload = function () {
    registerServiceWorker();
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

    setupInstallPrompt();
    updateMobileWizardLayout();

    window.addEventListener("resize", function () {
      updateMobileWizardLayout();
      updateMobileInvoiceScale();
    });
  };