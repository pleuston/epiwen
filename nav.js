(function () {
  "use strict";

  function init() {
    var groups = Array.from(document.querySelectorAll(".nav-group"));

    // Mark button as having an active child
    groups.forEach(function (group) {
      if (group.querySelector(".sitenav-link.active")) {
        var btn = group.querySelector(".nav-group-btn");
        if (btn) btn.classList.add("has-active");
      }
    });

    // Toggle open on click
    groups.forEach(function (group) {
      var btn = group.querySelector(".nav-group-btn");
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = group.classList.contains("open");
        groups.forEach(function (g) { g.classList.remove("open"); });
        if (!isOpen) group.classList.add("open");
      });
    });

    // Close on outside click or Escape
    document.addEventListener("click", function () {
      groups.forEach(function (g) { g.classList.remove("open"); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        groups.forEach(function (g) { g.classList.remove("open"); });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
