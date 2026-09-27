(function () {
  // "Copy BibTeX" buttons: copy the text of the element named by data-copy.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-copy]");
    if (!btn) return;
    var src = document.getElementById(btn.getAttribute("data-copy"));
    if (!src || !navigator.clipboard) return;
    navigator.clipboard.writeText(src.textContent).then(function () {
      var label = btn.textContent;
      btn.textContent = "Copied";
      btn.classList.add("is-done");
      setTimeout(function () {
        btn.textContent = label;
        btn.classList.remove("is-done");
      }, 1600);
    });
  });
})();
