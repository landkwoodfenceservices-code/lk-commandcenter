/* ==========================================================================
   LK OS — content-studio.js
   One-click content generation. This is a local templating engine, not a
   real LLM call — there's no backend to hold an API key safely from a
   static file. LK.ai.generate() is the single swap point: replace its body
   with a fetch to your backend, which in turn calls the OpenAI or Claude
   Messages API server-side. See claude-api skill / platform docs for the
   real request shape when that's ready.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function latestJobContext() {
    const completed = LK.db.jobs.filter(j => j.stage === 'completed').sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    const job = completed[0] || LK.db.jobs[0];
    const customer = job ? LK.getCustomer(job.customerId) : null;
    return { job, customer, service: job ? job.service : 'fence', city: 'Houston' };
  }

  const TEMPLATES = {
    instagram: (ctx) => pick([
      `Fresh ${ctx.service.toLowerCase()} work wrapped up in ${ctx.city} this week 🌲 Booking now for fall — DM or tap the link in bio for a free estimate.`,
      `Before & after doesn't do this ${ctx.service.toLowerCase()} job justice. Swipe to see the transformation. #HoustonFence #LKWoodFence`,
      `Another happy homeowner in ${ctx.city} 🙌 Custom ${ctx.service.toLowerCase()} built to last. Ready for yours? Link in bio.`,
    ]),
    facebook: (ctx) => pick([
      `Now booking ${ctx.service.toLowerCase()} projects for the coming weeks! We're a licensed & insured Houston crew with 200+ happy homeowners. Comment or message us for a free quote.`,
      `Just finished a beautiful ${ctx.service.toLowerCase()} install for a family in ${ctx.city}. If your fence has seen better days, let's talk — free estimates, no pressure.`,
    ]),
    tiktok: (ctx) => pick([
      `POV: your ${ctx.service.toLowerCase()} finally looks brand new again 🔥`,
      `Wait for the reveal... this ${ctx.service.toLowerCase()} transformation is everything.`,
      `Day in the life of a Houston fence crew — from measuring to install in 60 seconds.`,
    ]),
    googleUpdate: (ctx) => pick([
      `We're booking ${ctx.service.toLowerCase()} projects now! Licensed & insured, 4.9★ rated across 200+ Houston homeowners. Call or click for a free estimate.`,
      `Spring/fall is our busiest season for ${ctx.service.toLowerCase()} work. Book early to lock in your date — free estimates available this week.`,
    ]),
    followUp: (ctx) => pick([
      `Hi ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}, just checking in a few weeks after your ${ctx.service.toLowerCase()} install — everything holding up well? Happy to swing by if anything needs a look.`,
      `Hey ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}! Hope you're loving the new ${ctx.service.toLowerCase()}. If you know anyone else who could use work done, we'd really appreciate the referral 🙏`,
    ]),
    quoteEmail: (ctx) => pick([
      `Hi ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}, thanks for reaching out! I've attached your ${ctx.service.toLowerCase()} estimate — let me know if you'd like to lock in a date or have any questions. Estimate is valid for 30 days.`,
      `Hi ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}, great talking with you today. Here's your ${ctx.service.toLowerCase()} quote — happy to walk through any of the numbers. Looking forward to working with you!`,
    ]),
    reviewRequest: (ctx) => pick([
      `Hi ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}, thanks again for choosing L&K! If you have a minute, a Google review would mean the world to us and helps other Houston homeowners find us: [review link]`,
      `Hey ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}, so glad you're happy with the ${ctx.service.toLowerCase()}! Would you mind leaving us a quick review? It really helps our small crew out: [review link]`,
    ]),
    invoiceMessage: (ctx) => pick([
      `Hi ${ctx.customer ? ctx.customer.name.split(' ')[0] : 'there'}, your invoice for the ${ctx.service.toLowerCase()} project is ready — total ${ctx.job ? LK.fmtMoney(ctx.job.value) : ''}. Let me know if you'd like to pay by card, Zelle, or check.`,
    ]),
  };

  LK.ai = {
    generate(type) {
      const ctx = latestJobContext();
      const fn = TEMPLATES[type];
      const text = fn ? fn(ctx) : '';
      if (text) {
        LK.db.contentHistory.unshift({ id: LK.uid(), type, text, date: new Date().toISOString() });
        LK.db.contentHistory = LK.db.contentHistory.slice(0, 20);
        LK.saveDB(true);
      }
      return text;
    },
  };

  function render(type) {
    const text = LK.ai.generate(type);
    document.getElementById('csOutput').value = text;
    LK.bus.emit('notify', { type: 'content', text: 'Draft generated: ' + type });
  }

  function renderHistory() {
    const el = document.getElementById('csHistory');
    if (!el) return;
    el.innerHTML = LK.db.contentHistory.length
      ? LK.db.contentHistory.map(h => '<div class="cust-line"><span>' + h.type + '</span><span class="cs-hist-text">' + h.text.slice(0, 40) + '…</span></div>').join('')
      : '<div class="log-empty">NO CONTENT GENERATED YET</div>';
  }

  function wire() {
    document.querySelectorAll('.cs-gen-btn').forEach(btn => {
      btn.addEventListener('click', () => { render(btn.dataset.type); renderHistory(); });
    });
    document.getElementById('csCopy').addEventListener('click', () => {
      const text = document.getElementById('csOutput').value;
      if (!text) return;
      navigator.clipboard?.writeText(text)
        .then(() => LK.bus.emit('notify', { type: 'content', text: 'Copied to clipboard.' }))
        .catch(() => LK.bus.emit('notify', { type: 'content', text: 'Could not copy — clipboard unavailable.' }));
    });
    renderHistory();
  }

  LK.contentStudio = { render, renderHistory };
  document.addEventListener('DOMContentLoaded', wire, { once: true });
})();
