/* ==========================================================================
   LK OS — smsadapters.js
   Provider-adapter architecture for texting. LocalSmsAdapter is real and
   active today (sms: link + copy-to-clipboard — it cannot prove delivery,
   only open the customer's messaging app). TwilioAdapter is a structural
   stub only: it never runs, and this file must never contain — and never
   will contain — an account SID, auth token, API key, or secret. A real
   provider requires a backend; see settings.messaging.backendEndpoint.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  const LocalSmsAdapter = {
    name: 'local',
    status: 'active',
    // Opens the OS-level SMS/Messages app via an sms: link. Works on iOS/Android
    // and macOS Messages (via Handoff / SMS-over-Mac); does NOT work as a native
    // compose sheet on plain desktop Chrome — there we just surface the number
    // and message for the user to send manually. Either way this never confirms
    // delivery — only LOG AS SENT (a manual user action) writes to the timeline.
    openCompose(phone, message) {
      const digits = (phone || '').replace(/[^0-9+]/g, '');
      const url = 'sms:' + digits + (/iphone|ipad|mac/i.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(message);
      window.location.href = url;
      return { opened: true, provesDelivery: false };
    },
  };

  // Structural placeholder only. Never instantiate with real credentials —
  // those must live server-side (serverless function + protected env vars),
  // never in this frontend file or in localStorage.
  const TwilioAdapter = {
    name: 'twilio',
    status: 'disabled',
    openCompose() { throw new Error('TwilioAdapter is disabled until a secure backend is configured.'); },
    send() { throw new Error('TwilioAdapter is disabled until a secure backend is configured.'); },
  };

  function activeAdapter() {
    const provider = LK.db.settings.messaging.providerStatus;
    return provider === 'twilio' ? TwilioAdapter : LocalSmsAdapter;
  }

  LK.sms = { LocalSmsAdapter, TwilioAdapter, activeAdapter };
})();
