import SwiftUI
import WebKit

/// Renders reader-view HTML and reports reading position.
///
/// The server tags every paragraph with data-block="N". A small script reports how far the
/// article body has scrolled into view and the topmost visible block; resuming scrolls back to
/// that block, so a saved place survives font-size and screen changes.
struct ReaderWebView: UIViewRepresentable {
    var html: String
    var baseURL: URL?
    var resumeBlock: Int?
    var onProgress: (_ progress: Double, _ block: Int) -> Void
    var onOpenLink: (URL) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.dataDetectorTypes = []
        let controller = WKUserContentController()
        controller.add(WeakMessageHandler(context.coordinator), name: "progress")
        controller.addUserScript(WKUserScript(source: Self.trackingScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.allowsLinkPreview = true
        webView.loadHTMLString(Self.page(html), baseURL: baseURL)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "progress")
    }

    /// Scroll back to where the reader left off.
    static func resumeScript(block: Int) -> String {
        "window.newswizResume && window.newswizResume(\(block));"
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: ReaderWebView
        private var resumed = false

        init(_ parent: ReaderWebView) { self.parent = parent }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any],
                  let progress = body["progress"] as? Double,
                  let block = body["block"] as? Int else { return }
            parent.onProgress(progress, block)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !resumed else { return }
            resumed = true
            if let block = parent.resumeBlock, block > 0 {
                webView.evaluateJavaScript(ReaderWebView.resumeScript(block: block))
            }
        }

        /// Links inside the article open in Safari, not inside the reader.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            if action.navigationType == .linkActivated, let url = action.request.url {
                parent.onOpenLink(url)
                return .cancel
            }
            return .allow
        }
    }

    /// WKUserContentController retains its handlers; this breaks the cycle.
    final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
        weak var target: WKScriptMessageHandler?
        init(_ target: WKScriptMessageHandler) { self.target = target }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            target?.userContentController(controller, didReceive: message)
        }
    }

    // MARK: Page template

    static func page(_ body: String) -> String {
        """
        <!doctype html><html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light dark">
        <style>
          :root { color-scheme: light dark; --text: #1c1b19; --muted: #6b675f; --accent: #0f5f8c; --rule: #e2dfd8; }
          @media (prefers-color-scheme: dark) { :root { --text: #ecebe7; --muted: #a39f97; --accent: #5fb3e6; --rule: #34322e; } }
          html { -webkit-text-size-adjust: 100%; }
          body { font: -apple-system-body; font-family: ui-serif, 'New York', Georgia, serif; line-height: 1.6;
                 color: var(--text); background: transparent; margin: 0; padding: 8px 20px 120px; overflow-wrap: break-word; }
          h2, h3, h4 { font-family: -apple-system, system-ui, sans-serif; line-height: 1.25; margin: 1.5em 0 .5em; }
          p, li { margin: 0 0 1em; }
          img { max-width: 100%; height: auto; border-radius: 8px; }
          figure { margin: 1.2em 0; }
          figcaption { font-family: -apple-system, system-ui, sans-serif; font-size: .8em; color: var(--muted); margin-top: 6px; }
          blockquote { margin: 1em 0; padding-left: 14px; border-left: 3px solid var(--rule); color: var(--muted); }
          a { color: var(--accent); }
          pre, table { display: block; overflow-x: auto; font-size: .85em; }
        </style></head>
        <body><article id="reader-body">\(body)</article></body></html>
        """
    }

    /// Mirrors the web reader: progress = how far the viewport bottom has moved through the article.
    static let trackingScript = """
    (function () {
      var body = document.getElementById('reader-body');
      if (!body) return;
      var blocks = Array.prototype.slice.call(body.querySelectorAll('[data-block]'));
      var frame = 0;
      function measure() {
        frame = 0;
        var r = body.getBoundingClientRect();
        var p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / r.height));
        var top = blocks.find(function (b) { return b.getBoundingClientRect().bottom > 8; });
        window.webkit.messageHandlers.progress.postMessage({ progress: p, block: top ? parseInt(top.dataset.block, 10) : 0 });
      }
      window.addEventListener('scroll', function () { if (!frame) frame = requestAnimationFrame(measure); }, { passive: true });
      window.newswizResume = function (n) {
        var el = body.querySelector('[data-block="' + n + '"]');
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12);
        measure();
      };
      measure();
    })();
    """
}
