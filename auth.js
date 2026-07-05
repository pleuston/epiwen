/* auth.js — GitHub-identity session gate.
 * Runs immediately on every protected page.
 * Identity is established at login.html via GET /user with the stored PAT.
 * localStorage holds the identity across browser restarts;
 * sessionStorage holds the live session (cleared when the tab/browser closes). */
(function () {
  var UNGATED = ["login.html", "contribute.html"];
  var USERNAME_KEY = "epiwen_gh_username";
  var SESSION_KEY  = "epiwen_authed";
  var LOGIN        = "login.html";

  var page = window.location.pathname.split("/").pop() || "index.html";
  if (UNGATED.indexOf(page) !== -1) return;

  function redirect() {
    window.location.replace(LOGIN + "?r=" + encodeURIComponent(window.location.href));
  }

  var username = localStorage.getItem(USERNAME_KEY);

  // A stale "guest" identity (from the retired Browse-as-guest button) is
  // never valid, regardless of what sessionStorage says — without this, a
  // browser that was already "signed in" as guest before the button was
  // removed would pass the sessionStorage check below on every reload and
  // never get routed back through login.html's own cleanup, staying stuck
  // on the empty epiwen-workshop backend indefinitely.
  if (username === "guest") {
    sessionStorage.removeItem(SESSION_KEY);
    ["epiwen_gh_username", "epiwen_gh_avatar", "epiwen_gh_name", "epiwen_gh_token"]
      .forEach(function (k) { localStorage.removeItem(k); });
    localStorage.setItem("epiwen_gh_owner",  "pleuston");
    localStorage.setItem("epiwen_gh_repo",   "epiwen-data");
    localStorage.setItem("epiwen_gh_branch", "main");
    redirect();
    return;
  }

  if (!username) { redirect(); return; }
  if (sessionStorage.getItem(SESSION_KEY) !== username) { redirect(); return; }

  // Patch the topbar Sign out button with avatar + @username after DOM loads
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector('[onclick="EpiAuth.signOut()"]');
    if (!btn) return;
    var av = localStorage.getItem("epiwen_gh_avatar") || "";
    var name = localStorage.getItem("epiwen_gh_name") || username;
    var img = av
      ? '<img src="' + av + '" width="18" height="18" alt="" '
        + 'style="border-radius:50%;vertical-align:middle;margin-right:.3rem;display:inline-block"> '
      : "";
    btn.innerHTML = img + "@" + username;
    btn.title = name + " · click to sign out";
  });
})();

window.EpiAuth = {
  getUser: function () {
    return {
      username: localStorage.getItem("epiwen_gh_username") || "",
      avatar:   localStorage.getItem("epiwen_gh_avatar")   || "",
      name:     localStorage.getItem("epiwen_gh_name")     || "",
      token:    localStorage.getItem("epiwen_gh_token")    || ""
    };
  },
  /* full=true clears stored identity + token (switch account);
     full=false (default) keeps identity, just ends the session. */
  signOut: function (full) {
    sessionStorage.removeItem("epiwen_authed");
    if (full) {
      ["epiwen_gh_username", "epiwen_gh_avatar", "epiwen_gh_name",
       "epiwen_gh_token", "epiwen_gh_owner", "epiwen_gh_repo",
       "epiwen_gh_branch", "epiwen_gh_path"
      ].forEach(function (k) { localStorage.removeItem(k); });
    }
    window.location.href = "login.html";
  }
};
