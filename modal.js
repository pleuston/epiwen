/* modal.js — shared "How to" workflow modal, injected into every page.
 * Any element with data-workflow-modal attribute opens it on click.
 * Keyboard: Escape closes. Click-outside closes.
 * Accessible via window.EpiModal.show() / .hide(). */
(function () {
  "use strict";

  var ID = "workflow-modal";

  var HTML = [
    '<div id="' + ID + '" class="modal-overlay" hidden role="dialog"',
    '     aria-modal="true" aria-labelledby="modal-heading">',
    '  <div class="modal-box">',
    '    <button class="modal-close" id="modal-close-btn" aria-label="Close">&#x2715;</button>',
    '    <h2 id="modal-heading" class="modal-title">Workflow guide</h2>',
    '    <div class="workflow-grid modal-workflow">',

    '      <div class="workflow-card">',
    '        <div class="workflow-num">1</div>',
    '        <h3>Adding a new inscription</h3>',
    '        <ol>',
    '          <li>Open the <a href="editor.html"><strong>Editor</strong></a>.</li>',
    '          <li>Fill in metadata, physical description, date &amp; text(s).<br>',
    '              Use <em>Add text</em> for monuments with several faces.</li>',
    '          <li>Click <strong>&#x2460; Copy XML</strong> — the EpiDoc record is on your clipboard.</li>',
    '          <li>Click <strong>&#x2461; Propose to GitHub</strong> — the web editor opens at',
    '              <code>records/your-file.xml</code>.</li>',
    '          <li>Paste the XML and click <em>Propose new file</em>.',
    '              GitHub forks the repo and opens a pull request automatically.</li>',
    '        </ol>',
    '      </div>',

    '      <div class="workflow-card">',
    '        <div class="workflow-num">2</div>',
    '        <h3>Editing an existing inscription</h3>',
    '        <ol>',
    '          <li>Go to the <a href="catalog.html"><strong>Catalog</strong></a>.</li>',
    '          <li>Click <strong>Preview</strong> to inspect the current XML.</li>',
    '          <li>Click <strong>Copy XML</strong> to copy it to your clipboard.</li>',
    '          <li>Click <strong>Edit on GitHub</strong> — the web editor opens the existing file.',
    '              Paste your revised XML.</li>',
    '          <li>Submit a pull request. A project editor reviews and merges.</li>',
    '        </ol>',
    '      </div>',

    '    </div>',
    '  </div>',
    '</div>'
  ].join("\n");

  function inject() {
    if (document.getElementById(ID)) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap.firstElementChild);

    document.getElementById("modal-close-btn")
      .addEventListener("click", hide);

    document.getElementById(ID)
      .addEventListener("click", function (e) {
        if (e.target === this) hide();
      });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hide();
    });
  }

  function show() {
    if (!document.getElementById(ID)) inject();
    var el = document.getElementById(ID);
    el.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("modal-close-btn").focus();
  }

  // Reusable styled confirm dialog. Returns a Promise<boolean>.
  // EpiModal.confirm({ title, message, confirmText, cancelText, danger })
  var CONFIRM_ID = "epi-confirm-modal";
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function confirmDialog(opts) {
    opts = opts || {};
    var danger = opts.danger !== false;   // default: destructive styling
    return new Promise(function (resolve) {
      var old = document.getElementById(CONFIRM_ID);
      if (old) old.remove();
      var wrap = document.createElement("div");
      wrap.innerHTML =
        '<div id="' + CONFIRM_ID + '" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="epi-confirm-title">' +
          '<div class="modal-box" style="max-width:420px">' +
            '<h2 id="epi-confirm-title" class="modal-title">' + esc(opts.title || "Please confirm") + '</h2>' +
            '<p class="modal-desc">' + esc(opts.message || "Are you sure?") + '</p>' +
            '<div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem">' +
              '<button class="btn" id="epi-confirm-cancel">' + esc(opts.cancelText || "Cancel") + '</button>' +
              '<button class="btn ' + (danger ? "btn-danger" : "primary") + '" id="epi-confirm-ok">' + esc(opts.confirmText || "Confirm") + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      var node = wrap.firstElementChild;
      document.body.appendChild(node);
      document.body.style.overflow = "hidden";
      function close(result) {
        node.remove();
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKey);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(false); }
        else if (e.key === "Enter") { e.preventDefault(); close(true); }
      }
      node.querySelector("#epi-confirm-ok").addEventListener("click", function () { close(true); });
      node.querySelector("#epi-confirm-cancel").addEventListener("click", function () { close(false); });
      node.addEventListener("click", function (e) { if (e.target === node) close(false); });
      document.addEventListener("keydown", onKey);
      node.querySelector("#epi-confirm-ok").focus();
    });
  }

  function hide() {
    var el = document.getElementById(ID);
    if (el) el.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    inject();
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-workflow-modal]"),
      function (btn) { btn.addEventListener("click", show); }
    );
  });

  window.EpiModal = { show: show, hide: hide, confirm: confirmDialog };
})();
