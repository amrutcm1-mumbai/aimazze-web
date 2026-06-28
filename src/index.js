// src/index.js
//
// Day 11: real Worker script for aimazze-web, replacing the Pages-only
// functions/_middleware.js approach (which is silently ignored on a
// Worker-with-static-assets project — confirmed via Cloudflare's own docs:
// "if a requested URL matches a file in the static assets directory, that
// file will be served — without invoking Worker code" by default).
//
// With run_worker_first: true set in wrangler.jsonc, this script now runs
// on EVERY request, before any static asset is served. It reads
// Cloudflare's native CF-IPCountry header, sets a short-lived
// aimazze_region cookie (IN or INTL), then defers to the ASSETS binding
// to actually serve the requested file unchanged.

export default {
    async fetch(request, env, ctx) {
      const country = request.headers.get("CF-IPCountry") || "XX";
      const region = country === "IN" ? "IN" : "INTL";
  
      // Serve the actual static asset (index.html, activate.html, etc.)
      // via the ASSETS binding — this is the Worker-with-assets equivalent
      // of "pass the request through to the static file system."
      const response = await env.ASSETS.fetch(request);
  
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType.includes("text/html")) {
        const newHeaders = new Headers(response.headers);
        // 1 day expiry — cheap enough to recompute on return visits, short
        // enough that someone traveling/VPNing doesn't get stuck on a stale
        // region for long. Not HttpOnly: index.html's inline script needs
        // to read this directly via document.cookie.
        newHeaders.append(
          "Set-Cookie",
          `aimazze_region=${region}; Path=/; Max-Age=86400; SameSite=Lax`
        );
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
  
      return response;
    },
  };