(function () {
  // Flip between the light and dark palettes; the initial value is set in
  // <head> before paint (Layout.astro).
  var root = document.documentElement;
  function label() {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", "Switch to " + next + " theme");
      b.setAttribute("title", "Switch to " + next + " theme");
    });
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (err) {}
    label();
  });
  label();
})();
