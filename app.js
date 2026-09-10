pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const dropzone = document.getElementById('dropzone');
const dropzoneHint = document.getElementById('dropzoneHint');
const fileInput = document.getElementById('fileInput');
const filenameEl = document.getElementById('filename');

const stepDrop = document.getElementById('step-drop');
const stepPassword = document.getElementById('step-password');
const stepProcessing = document.getElementById('step-processing');
const stepDone = document.getElementById('step-done');
const stepError = document.getElementById('step-error');

const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');
const unlockBtn = document.getElementById('unlockBtn');
const cancelBtn = document.getElementById('cancelBtn');

const progressLabel = document.getElementById('progressLabel');
const progressCount = document.getElementById('progressCount');
const progressBar = document.getElementById('progressBar');

const downloadBtn = document.getElementById('downloadBtn');
const restartBtn = document.getElementById('restartBtn');
const errorRestartBtn = document.getElementById('errorRestartBtn');
const generalError = document.getElementById('generalError');
const doneSub = document.getElementById('doneSub');

const installBtn = document.getElementById('installBtn');
const iosHint = document.getElementById('iosHint');

let currentFile = null;
let outputBytes = null;
let outputName = 'document-deverrouille.pdf';

function showStep(step) {
  [stepDrop, stepPassword, stepProcessing, stepDone, stepError].forEach(s => s.classList.add('hidden'));
  step.classList.remove('hidden');
}

function resetAll() {
  currentFile = null;
  outputBytes = null;
  passwordInput.value = '';
  passwordError.classList.add('hidden');
  filenameEl.classList.add('hidden');
  dropzoneHint.textContent = "Dépose ton PDF ici";
  fileInput.value = '';
  showStep(stepDrop);
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    generalError.textContent = "Ce fichier ne semble pas être un PDF.";
    showStep(stepError);
    return;
  }
  currentFile = file;
  filenameEl.textContent = file.name;
  filenameEl.classList.remove('hidden');
  outputName = file.name.replace(/\.pdf$/i, '') + '-deverrouille.pdf';
  attemptUnlock(null);
}

cancelBtn.addEventListener('click', resetAll);
restartBtn.addEventListener('click', resetAll);
errorRestartBtn.addEventListener('click', resetAll);

unlockBtn.addEventListener('click', () => {
  const pwd = passwordInput.value;
  if (!pwd) return;
  passwordError.classList.add('hidden');
  attemptUnlock(pwd);
});

async function attemptUnlock(password) {
  showStep(stepProcessing);
  progressLabel.textContent = "Ouverture du fichier…";
  progressCount.textContent = "";
  progressBar.style.width = "0%";

  try {
    const arrayBuffer = await currentFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password || undefined
    });
    const pdf = await loadingTask.promise;
    await rasterizeAndRebuild(pdf);
  } catch (err) {
    if (err && err.name === 'PasswordException') {
      if (err.code === 1) {
        showStep(stepPassword);
      } else {
        passwordError.classList.remove('hidden');
        showStep(stepPassword);
      }
      return;
    }
    generalError.textContent = "Impossible de lire ce PDF. Le fichier est peut-être corrompu.";
    showStep(stepError);
  }
}

async function rasterizeAndRebuild(pdf) {
  const { PDFDocument } = PDFLib;
  const numPages = pdf.numPages;
  const outDoc = await PDFDocument.create();

  progressLabel.textContent = "Reconstruction des pages…";

  for (let i = 1; i <= numPages; i++) {
    progressCount.textContent = i + " / " + numPages;
    progressBar.style.width = Math.round((i - 1) / numPages * 100) + "%";

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const jpgBytes = await (await fetch(jpgDataUrl)).arrayBuffer();
    const jpgImage = await outDoc.embedJpg(jpgBytes);

    const pdfPage = outDoc.addPage([viewport.width, viewport.height]);
    pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: viewport.width, height: viewport.height });

    canvas.width = 0;
    canvas.height = 0;
  }

  progressBar.style.width = "100%";
  progressLabel.textContent = "Finalisation…";
  progressCount.textContent = "";

  outputBytes = await outDoc.save();
  doneSub.textContent = numPages + (numPages > 1 ? " pages traitées" : " page traitée");
  showStep(stepDone);
}

downloadBtn.addEventListener('click', () => {
  if (!outputBytes) return;
  const blob = new Blob([outputBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

/* ---- Installation comme application (PC + téléphone) ---- */

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden');
});

// iOS Safari ne déclenche pas beforeinstallprompt : on affiche une astuce à la place
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
if (isIos && !isStandalone) {
  iosHint.classList.remove('hidden');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
