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

  window.EpiModal = { show: show, hide: hide };
})();
