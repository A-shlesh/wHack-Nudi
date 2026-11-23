// Asks Chrome for the microphone once, for the whole Nudi extension.
// We stop the microphone straight away: we only needed the permission.

const statusLine = document.getElementById("status")!;

navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    stream.getTracks().forEach((track) => track.stop());
    statusLine.textContent = "Done. You can close this tab and tap Talk to Nudi again.";
  })
  .catch(() => {
    statusLine.textContent = "The microphone is still blocked. Click the lock icon in the address bar to allow it.";
  });

export {}; // makes this file a module, so its names do not clash with browser globals
