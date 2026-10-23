// Light or dark look for the studio. Runs in <head>, before the page draws, so there is no flash.
// The choice is saved once ("light", "dark" or "auto" = follow the system); dark by default, the stage is projector light on black.
(function () {
  var KEY = "heartstudio.theme", root = document.documentElement, dark = matchMedia("(prefers-color-scheme: dark)");
  function pref() { try { return localStorage.getItem(KEY) || "dark"; } catch (e) { return "dark"; } }
  function apply() {
    var p = pref(), t = p === "auto" ? (dark.matches ? "dark" : "light") : p;
    root.setAttribute("data-theme", t);
  }
  apply();
  addEventListener("storage", function (e) { if (e.key === KEY) apply(); });
  if (dark.addEventListener) dark.addEventListener("change", apply);
  window.heartTheme = { get: pref, set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} apply(); } };
})();
