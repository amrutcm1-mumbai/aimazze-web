// functions/_middleware.js
//
// Cloudflare Pages Function — runs on EVERY request to aimazze-web before
// the static index.html is served. Reads Cloudflare's CF-IPCountry header
// (present natively on every request that passes through Cloudflare's edge
// — no external API call needed) and sets a short-lived, non-HttpOnly
// cookie so client-side JS in index.html can read the visitor's region
// without making its own network call.
//
// Day 11 decision: binary geo split only. India -> "IN" (INR pricing),
// everyone else -> "INTL" (USD pricing). EUR/GBP-specific tiers are
// explicitly deferred (see Day 11 backlog) until after Batch 1 traction
// signals — until then, all non-India traffic sees the same USD pricing.

export async function onRequest(context) {
    const { request, next } = context;
  
    const country = request.headers.get("CF-IPCountry") || "XX";
    const region = country === "IN" ? "IN" : "INTL";
  
    const response = await next();
  
    // Only attach the cookie to actual page loads (HTML), not to asset
    // requests (css/js/images), to avoid unnecessary header churn on every
    // static file fetch.
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      const newHeaders = new Headers(response.headers);
      // 1 day expiry — cheap enough to recompute on return visits, short
      // enough that someone traveling/VPNing doesn't get stuck on a stale
      // region for long. Not HttpOnly: index.html's inline script needs to
      // read this directly via document.cookie.
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
  }