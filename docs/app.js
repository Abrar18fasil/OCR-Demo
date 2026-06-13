const DATA_INDEX_URL = "./data/index.json";

const state = {
  index: null,
  document: null,
  imageKey: "original",
  corrections: {},
};

const elements = {
  documentSelect: document.querySelector("#documentSelect"),
  documentImage: document.querySelector("#documentImage"),
  imageFallback: document.querySelector("#imageFallback"),
  documentTitle: document.querySelector("#documentTitle"),
  documentMeta: document.querySelector("#documentMeta"),
  lineCount: document.querySelector("#lineCount"),
  reviewCount: document.querySelector("#reviewCount"),
  lineList: document.querySelector("#lineList"),
  lineTemplate: document.querySelector("#lineTemplate"),
  downloadTextButton: document.querySelector("#downloadTextButton"),
  downloadJsonButton: document.querySelector("#downloadJsonButton"),
  imageButtons: [...document.querySelectorAll("[data-image-key]")],
};

init();

async function init() {
  bindEvents();
  try {
    state.index = await fetchJson(DATA_INDEX_URL);
    renderDocumentPicker();
    const first = state.index.documents?.[0];
    if (first) {
      await loadDocument(first.document_id);
    } else {
      renderEmpty("No exported documents found. Run scripts/export_static_demo.py first.");
    }
  } catch (error) {
    renderEmpty(`Could not load static data: ${error.message}`);
  }
}

function bindEvents() {
  elements.documentSelect.addEventListener("change", async (event) => {
    await loadDocument(event.target.value);
  });

  elements.imageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.imageKey = button.dataset.imageKey;
      elements.imageButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      renderPreviewImage();
    });
  });

  elements.downloadTextButton.addEventListener("click", downloadCorrectedText);
  elements.downloadJsonButton.addEventListener("click", downloadTrainingJson);
}

async function loadDocument(documentId) {
  const item = state.index.documents.find((document) => document.document_id === documentId);
  if (!item) {
    renderEmpty("Document not found in static index.");
    return;
  }
  state.document = await fetchJson(`./data/${item.manifest_url}`);
  state.corrections = loadSavedCorrections(documentId);
  elements.documentSelect.value = documentId;
  renderDocument();
}

function renderDocumentPicker() {
  elements.documentSelect.innerHTML = "";
  for (const documentItem of state.index.documents || []) {
    const option = document.createElement("option");
    option.value = documentItem.document_id;
    option.textContent = `${documentItem.title || documentItem.document_id} (${documentItem.line_count} lines)`;
    elements.documentSelect.append(option);
  }
}

function renderDocument() {
  const documentData = state.document;
  elements.documentTitle.textContent = documentTitle(documentData);
  elements.documentMeta.textContent = [
    documentData.document_id,
    documentData.language ? `lang ${documentData.language}` : "",
    documentData.psm ? `psm ${documentData.psm}` : "",
    documentData.updated_at ? `updated ${documentData.updated_at}` : "",
  ].filter(Boolean).join(" · ");
  elements.lineCount.textContent = `${documentData.lines.length} lines`;
  renderPreviewImage();
  renderLines();
  updateReviewCount();
}

function renderPreviewImage() {
  const documentData = state.document;
  const imageUrl = documentData?.assets?.[state.imageKey];
  if (!imageUrl) {
    elements.documentImage.hidden = true;
    elements.imageFallback.hidden = false;
    return;
  }
  elements.documentImage.hidden = false;
  elements.imageFallback.hidden = true;
  elements.documentImage.src = `./data/${documentData.document_id}/${imageUrl}`;
}

function renderLines() {
  elements.lineList.innerHTML = "";
  for (const line of state.document.lines) {
    const saved = state.corrections[line.line_id] || {};
    const lineNode = elements.lineTemplate.content.firstElementChild.cloneNode(true);
    const crop = lineNode.querySelector(".line-crop");
    const ocrText = lineNode.querySelector(".ocr-text");
    const correctedText = lineNode.querySelector(".corrected-text");
    const unclearCheck = lineNode.querySelector(".unclear-check");

    lineNode.querySelector(".line-id").textContent = line.line_id;
    lineNode.querySelector(".confidence").textContent = confidenceLabel(line.confidence);
    crop.alt = `${line.line_id} crop`;
    if (line.crop_url) {
      crop.src = `./data/${state.document.document_id}/${line.crop_url}`;
    } else {
      crop.remove();
    }

    ocrText.value = line.ocr_text || "";
    correctedText.value = saved.corrected_text ?? line.corrected_text ?? line.ocr_text ?? "";
    unclearCheck.checked = saved.unclear ?? Boolean(line.unclear);

    correctedText.addEventListener("input", () => {
      updateCorrection(line.line_id, correctedText.value, unclearCheck.checked);
    });
    unclearCheck.addEventListener("change", () => {
      updateCorrection(line.line_id, correctedText.value, unclearCheck.checked);
    });

    elements.lineList.append(lineNode);
  }
}

function updateCorrection(lineId, correctedText, unclear) {
  state.corrections[lineId] = { corrected_text: correctedText, unclear };
  saveCorrections();
  updateReviewCount();
}

function updateReviewCount() {
  const reviewed = state.document.lines.filter((line) => {
    const saved = state.corrections[line.line_id];
    const corrected = saved?.corrected_text ?? line.corrected_text;
    const unclear = saved?.unclear ?? line.unclear;
    return Boolean((corrected || "").trim()) || Boolean(unclear);
  }).length;
  elements.reviewCount.textContent = `${reviewed} reviewed`;
}

function downloadCorrectedText() {
  if (!state.document) return;
  const lines = state.document.lines.map((line) => {
    const saved = state.corrections[line.line_id];
    return saved?.corrected_text ?? line.corrected_text ?? line.ocr_text ?? "";
  });
  downloadBlob(lines.join("\n") + "\n", `${state.document.document_id}_corrected.txt`, "text/plain");
}

function downloadTrainingJson() {
  if (!state.document) return;
  const payload = {
    document_id: state.document.document_id,
    exported_at: new Date().toISOString(),
    language: state.document.language,
    psm: state.document.psm,
    lines: state.document.lines.map((line) => {
      const saved = state.corrections[line.line_id] || {};
      return {
        line_id: line.line_id,
        crop_url: line.crop_url,
        bounding_box: line.bounding_box,
        ocr_text: line.ocr_text || "",
        corrected_text: saved.corrected_text ?? line.corrected_text ?? "",
        unclear: saved.unclear ?? Boolean(line.unclear),
        confidence: line.confidence ?? null,
      };
    }),
  };
  downloadBlob(JSON.stringify(payload, null, 2) + "\n", `${state.document.document_id}_training.json`, "application/json");
}

function loadSavedCorrections(documentId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(documentId)) || "{}");
  } catch {
    return {};
  }
}

function saveCorrections() {
  if (!state.document) return;
  localStorage.setItem(storageKey(state.document.document_id), JSON.stringify(state.corrections));
}

function storageKey(documentId) {
  return `arabic-ocr-review:${documentId}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function documentTitle(documentData) {
  const original = documentData.assets?.original;
  return original ? original.split("/").pop() : documentData.document_id;
}

function confidenceLabel(confidence) {
  if (confidence === null || confidence === undefined || Number.isNaN(Number(confidence))) {
    return "confidence n/a";
  }
  return `confidence ${Number(confidence).toFixed(1)}%`;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderEmpty(message) {
  elements.documentTitle.textContent = message;
  elements.documentMeta.textContent = "";
  elements.lineCount.textContent = "0 lines";
  elements.reviewCount.textContent = "0 reviewed";
  elements.lineList.innerHTML = "";
  elements.documentImage.hidden = true;
  elements.imageFallback.hidden = false;
  elements.imageFallback.textContent = message;
}
