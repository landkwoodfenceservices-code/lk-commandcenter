/* ==========================================================================
   LK OS — integrations.js
   Stub layer for third-party services with no connected API/credentials yet
   (Gmail, Meta, Thumbtack, Google Business, media feeds). Every function
   returns realistic mock data and is the single place to swap in a real
   call later — nothing else in the app should reach for these services
   directly. Each stub documents exactly what real call replaces it.
   Panels using this data are visually tagged "SIM" in the UI so mock
   numbers are never mistaken for live ones.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  LK.integrations = {
    // Real call: GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread
    // (OAuth2, requires a backend token exchange — cannot run from a static file)
    async gmailUnread() {
      await wait(120);
      return {
        unread: 6,
        newest: { from: 'Marcus Reyes', subject: 'Re: Fence install timeline', snippet: 'Looks great, see you Thursday at 8am!', time: '9:14 AM' },
        threads: [
          { from: 'Marcus Reyes', subject: 'Re: Fence install timeline', time: '9:14 AM' },
          { from: 'Thumbtack', subject: 'You have a new lead', time: '8:02 AM' },
          { from: 'Nina Patel', subject: 'Question about sprinkler quote', time: 'Yesterday' },
          { from: 'Home Depot Pro', subject: 'Your order has shipped', time: 'Yesterday' },
          { from: 'Alicia Chen', subject: 'Thank you!', time: 'Mon' },
          { from: 'Google Business', subject: 'You have a new review', time: 'Mon' },
        ],
      };
    },

    // Real call: GET https://graph.facebook.com/v19.0/me/conversations (Meta Graph API, page token)
    async metaEngagement() {
      await wait(120);
      return {
        instagram: { unreadDMs: 3, newComments: 5, followers: 17100 },
        facebook: { unreadMessages: 2, newComments: 3, pageLikes: 4210 },
        recent: [
          { platform: 'Instagram', text: 'Comment on fence reel: "Who did this??"', time: '2h ago' },
          { platform: 'Facebook', text: 'DM: "Do you serve Katy?"', time: '5h ago' },
          { platform: 'Instagram', text: 'New follower spike after TikTok repost', time: 'Today' },
        ],
      };
    },

    // Real call: GET https://api.thumbtack.com/v3/leads (partner API, requires approved integration)
    async thumbtackLeads() {
      await wait(120);
      return {
        newLeads: 2,
        responseRate: 0.94,
        avgResponseMinutes: 11,
        leads: [
          { name: 'Chris Bell', service: 'Cedar fence, ~120ft', time: 'Today 8:02 AM' },
          { name: 'Priya Shah', service: 'Gate repair', time: 'Yesterday 4:40 PM' },
        ],
      };
    },

    // Real call: GET https://mybusinessbusinessinformation.googleapis.com/v1/{name} + Business Profile Performance API
    async googleBusiness() {
      await wait(120);
      return {
        rating: 4.9,
        totalReviews: 214,
        newReviews: [
          { name: 'Alicia C.', rating: 5, text: 'Beautiful staining work, very professional.', time: '2 days ago' },
        ],
        calls: 14,
        websiteClicks: 61,
        directionRequests: 23,
      };
    },

    // "Google Sheets" here reflects your own local lead tracker — this already
    // is the live source of truth (LK.db). Real call would be:
    // GET https://sheets.googleapis.com/v4/spreadsheets/{id}/values/{range}
    async sheetsSummary() {
      await wait(60);
      const db = LK.db;
      return {
        recentEstimates: db.quotes.slice(-5).reverse(),
        openJobs: db.jobs.filter(j => j.stage !== 'completed').length,
        completedJobs: db.jobs.filter(j => j.stage === 'completed').length,
      };
    },

    // Real call: website CMS webhook / RSS, e.g. GET /wp-json/wp/v2/posts
    async mediaFeed() {
      await wait(100);
      return {
        instagram: [
          { caption: 'Fresh 6ft cedar privacy fence in Katy 🌲', likes: 312, time: '1d' },
          { caption: 'Before & after: pressure washing that driveway ✨', likes: 198, time: '3d' },
        ],
        tiktok: [
          { caption: 'POV: your fence finally looks new again', views: '48.2K', time: '2d' },
        ],
        facebook: [
          { caption: 'Now booking fall staining jobs — DM us!', reactions: 44, time: '4d' },
        ],
        googleReviews: [
          { name: 'Alicia C.', rating: 5, text: 'Beautiful staining work, very professional.', time: '2 days ago' },
          { name: 'Pam J.', rating: 5, text: 'Crew was fast and the fence looks incredible.', time: '5 weeks ago' },
        ],
      };
    },
  };
})();
