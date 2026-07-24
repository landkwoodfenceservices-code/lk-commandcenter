/* ==========================================================================
   LK OS — scripture-kjv.js  (v2.3)
   A curated set of well-known verses from the King James Version — public
   domain, no permission needed. This is intentionally a smaller, carefully
   checked list rather than a large one, since accuracy matters here: only
   verses with high-confidence, standard KJV wording are included. Users can
   add their own verses in the Scripture Panel (stored separately in
   LK.db.scriptureFavorites) — this file is never edited by the app itself.
   ========================================================================== */
(function () {
  const LK = (window.LK = window.LK || {});

  LK.SCRIPTURE_KJV = [
    { ref: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
    { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
    { ref: 'Proverbs 3:5-6', text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.' },
    { ref: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' },
    { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
    { ref: 'Romans 8:28', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
    { ref: 'Joshua 1:9', text: 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.' },
    { ref: 'Isaiah 41:10', text: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.' },
    { ref: 'Psalm 46:1', text: 'God is our refuge and strength, a very present help in trouble.' },
    { ref: 'Proverbs 16:3', text: 'Commit thy works unto the LORD, and thy thoughts shall be established.' },
    { ref: 'Philippians 4:6', text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.' },
    { ref: 'Philippians 4:19', text: 'But my God shall supply all your need according to his riches in glory by Christ Jesus.' },
    { ref: 'Matthew 6:33', text: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.' },
    { ref: 'Proverbs 22:29', text: 'Seest thou a man diligent in his business? he shall stand before kings; he shall not stand before mean men.' },
    { ref: 'Colossians 3:23', text: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men.' },
    { ref: 'Ecclesiastes 3:1', text: 'To every thing there is a season, and a time to every purpose under the heaven.' },
    { ref: 'Proverbs 12:24', text: 'The hand of the diligent shall bear rule: but the slothful shall be under tribute.' },
    { ref: 'Proverbs 21:5', text: 'The thoughts of the diligent tend only to plenteousness; but of every one that is hasty only to want.' },
    { ref: 'Psalm 37:4', text: 'Delight thyself also in the LORD; and he shall give thee the desires of thine heart.' },
    { ref: 'Psalm 127:1', text: 'Except the LORD build the house, they labour in vain that build it: except the LORD keep the city, the watchman waketh but in vain.' },
    { ref: 'Proverbs 13:11', text: 'Wealth gotten by vanity shall be diminished: but he that gathereth by labour shall increase.' },
    { ref: '2 Corinthians 9:6', text: 'But this I say, He which soweth sparingly shall reap also sparingly; and he which soweth bountifully shall reap also bountifully.' },
    { ref: 'Galatians 6:9', text: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not.' },
    { ref: 'Proverbs 14:23', text: 'In all labour there is profit: but the talk of the lips tendeth only to penury.' },
    { ref: 'Deuteronomy 31:6', text: 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.' },
    { ref: 'Psalm 118:24', text: 'This is the day which the LORD hath made; we will rejoice and be glad in it.' },
    { ref: '1 Corinthians 10:31', text: 'Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God.' },
    { ref: 'Proverbs 11:1', text: 'A false balance is abomination to the LORD: but a just weight is his delight.' },
    { ref: 'Luke 16:10', text: 'He that is faithful in that which is least is faithful also in much: and he that is unjust in the least is unjust also in much.' },
    { ref: 'James 1:5', text: 'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.' },
    { ref: 'Psalm 90:17', text: 'And let the beauty of the LORD our God be upon us: and establish thou the work of our hands upon us; yea, the work of our hands establish thou it.' },
    { ref: 'Proverbs 10:4', text: 'He becometh poor that dealeth with a slack hand: but the hand of the diligent maketh rich.' },
    { ref: 'Nehemiah 8:10', text: '...for the joy of the LORD is your strength.' },
    { ref: 'Psalm 121:1-2', text: 'I will lift up mine eyes unto the hills, from whence cometh my help. My help cometh from the LORD, which made heaven and earth.' },
    { ref: 'Proverbs 19:21', text: "There are many devices in a man's heart; nevertheless the counsel of the LORD, that shall stand." },
    { ref: 'Hebrews 11:1', text: 'Now faith is the substance of things hoped for, the evidence of things not seen.' },
    { ref: 'Proverbs 24:3-4', text: 'Through wisdom is an house builded; and by understanding it is established: and by knowledge shall the chambers be filled with all precious and pleasant riches.' },
    { ref: 'Matthew 5:16', text: 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.' },
    { ref: 'Colossians 3:17', text: 'And whatsoever ye do in word or deed, do all in the name of the Lord Jesus, giving thanks to God and the Father by him.' },
    { ref: 'Proverbs 15:22', text: 'Without counsel purposes are disappointed: but in the multitude of counsellors they are established.' },
    { ref: '2 Timothy 1:7', text: 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.' },
    { ref: 'Psalm 34:8', text: 'O taste and see that the LORD is good: blessed is the man that trusteth in him.' },
    { ref: 'Proverbs 22:6', text: 'Train up a child in the way he should go: and when he is old, he will not depart from it.' },
    { ref: 'Habakkuk 2:2', text: 'And the LORD answered me, and said, Write the vision, and make it plain upon tables, that he may run that readeth it.' },
    { ref: 'Proverbs 29:18', text: 'Where there is no vision, the people perish: but he that keepeth the law, happy is he.' },
    { ref: 'Psalm 143:8', text: 'Cause me to hear thy lovingkindness in the morning; for in thee do I trust: cause me to know the way wherein I should walk; for I lift up my soul unto thee.' },
    { ref: 'Lamentations 3:22-23', text: "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness." },
    { ref: 'Proverbs 3:9-10', text: 'Honour the LORD with thy substance, and with the firstfruits of all thine increase: so shall thy barns be filled with plenty, and thy presses shall burst out with new wine.' },
    { ref: 'Isaiah 40:31', text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.' },
    { ref: 'Proverbs 27:23', text: 'Be thou diligent to know the state of thy flocks, and look well to thy herds.' },
  ];
})();
