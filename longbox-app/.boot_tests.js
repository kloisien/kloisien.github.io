/* ------------------------------ assertions ------------------------------ */
(async () => {
  let nPass=0, nFail=0;   // NOT "pass" - the app has a filter function by that name
  /* boot is async (storage probe + load); let it finish or it clobbers state */
  await new Promise(r=>setTimeout(r,400));
  const t=(name,cond,extra)=>{ if(cond){nPass++;console.log("  PASS "+name);} else {nFail++;console.log("  FAIL "+name+(extra?"  -> "+extra:""));} };
  console.log("\n== boot");
  t("BUILD matches the sw.js shell cache name",
    "longbox-shell-"+BUILD.replace(/\./g,"-")===process.env.LB_SW_SHELL,
    BUILD+" vs "+process.env.LB_SW_SHELL);
  t("DATA loaded", Array.isArray(DATA)&&DATA.length>700, DATA&&DATA.length);
  t("helpers defined", typeof coverList==="function"&&typeof coverIMG==="function"&&typeof coverErr==="function");
  t("IMGCACHE matches the sw.js image cache name",
    IMGCACHE===process.env.LB_SW_IMGS, IMGCACHE+" vs "+process.env.LB_SW_IMGS);

  console.log("\n== import keeps candidates alongside a cover URL (the bug)");
  const DEAD="https://images.isbndb.com/covers/original/1.jpg?key=expired";
  const GCD ="https://files1.comics.org/img/gcd/covers_by_id/1657/w400/1657194.jpg";
  await applyDetails({ "1":{ isbn:"9780000000001", pages:176, cover:DEAD,
                             cover_candidates:[GCD], description:"x" } }, "harness");
  const r1=rec(1);
  t("cover imported", r1.cover===DEAD, r1.cover);
  t("coverTry ALSO populated", Array.isArray(r1.coverTry)&&r1.coverTry[0]===GCD, JSON.stringify(r1.coverTry));

  console.log("\n== render-time fallback");
  const d1=view(DATA.find(x=>x.id===1));
  const list=coverList(d1);
  t("list is dead-then-candidate", list[0]===DEAD&&list.indexOf(GCD)>0, JSON.stringify(list));
  const html=coverIMG(d1);
  t("img wired to coverErr", /onerror="coverErr\(this\)"/.test(html));
  t("img starts on the imported url", html.includes(DEAD.replace(/&/g,"&amp;")));

  const img={ dataset:{cid:"1"}, src:DEAD, parentNode:{}, outerHTML:"",
              getAttribute(k){return k==="src"?this.src:null}, remove(){this.removed=true} };
  coverErr(img);
  t("first failure falls through to GCD", img.src===GCD, img.src);
  coverErr(img);
  t("second failure lands on the spine", /class="spine"/.test(img.outerHTML), img.outerHTML.slice(0,60));
  t("bad urls remembered", coverBad.has(DEAD)&&coverBad.has(GCD));
  t("coverList now empty for that entry", coverList(view(DATA.find(x=>x.id===1))).length===0);
  t("cardHTML renders a spine when nothing loads", /class="spine"/.test(cardHTML(view(DATA.find(x=>x.id===1)))));

  console.log("\n== fetch pass verifies what is already on file");
  const r=rec(1); r.cover=DEAD; r.coverFromImport=true; delete r.coverOk;
  r.coverTry=[GCD]; state[1]=r; coverBad.clear();
  const stale = r.cover && r.coverFromImport && !r.coverOk;
  t("a stale imported cover is a target", !!stale);
  t("loadOk rejects the dead url", (await loadOk(DEAD,50))===null);
  t("loadOk accepts the gcd url", (await loadOk(GCD,50))===GCD);

  console.log("\n== drawer");
  const dh=drawerHTML(DATA.find(x=>x.id===1));
  t("drawer built without throwing", typeof dh==="string"&&dh.length>500);

  console.log("\n== bulk selection");
  t("off by default", selMode===false && selBox(5)==="");
  setSelMode(true);
  t("mode on renders a checkbox", selBox(5).includes("selbox"));
  t("row markup carries the box", /class="selbox/.test(rowHTML(view(DATA[4]))));
  t("card markup carries data-id", /class="card [^"]*" data-id="/.test(cardHTML(view(DATA[4]))));
  const fakeRow={ classList:{toggle(){}}, querySelector(){return {classList:{toggle(){}}}} };
  [11,12,13].forEach(id=>togglePick(id, fakeRow));
  t("three picked", picked.size===3 && picked.has(12));
  togglePick(13, fakeRow);
  t("tapping again unpicks", picked.size===2 && !picked.has(13));
  await bulkApply("own","Owned","Owned");
  t("bulk own applied to both", rec(11).own==="Owned" && rec(12).own==="Owned");
  t("untouched entry unchanged", rec(13).own!=="Owned", rec(13).own);
  t("selection survives an action", picked.size===2);
  await bulkApply("status","Read","Read");
  t("bulk status applied", rec(11).status==="Read" && rec(12).status==="Read");
  picked.clear();
  DATA.slice(100,180).forEach(d=>picked.add(d.id));
  const before=rec(DATA[100].id).own||"";
  await bulkApply("own","Wishlist","Wishlist");
  t("a >60 selection is gated on confirm", (rec(DATA[100].id).own||"")===before);
  setSelMode(false);
  t("leaving the mode clears the selection", picked.size===0 && selBox(5)==="");

  console.log("\n== the Any data filter was removed");
  const doc0=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  /* Klaus dropped it: the gaps it exposed are now tracked in
     verify_pass_report.txt, not in the app. The control, its pass() branch
     and its entry in every filter id list all had to go together. */
  t("the Any data select is gone from the markup", !/id="fIsbn"/.test(doc0));
  t("pass() no longer reads it", !/getElementById\("fIsbn"\)/.test(doc0));
  t("no orphan ib branch left in pass()", !/\bib===/.test(doc0));
  ["fEra","fPhase","fPrio","fEvent","fSeries","fScore","q","qc"]
    .forEach(i=>{const e=document.getElementById(i); if(e) e.value="";});
  fOwnSel.clear(); fStatusSel.clear();
  t("no filter passes everything", DATA.filter(pass).length===DATA.length,
    DATA.filter(pass).length+" of "+DATA.length);


  console.log("\n== era and overlap corrections");
  const bl=[512,515,574,659,664,674,675,677].map(id=>DATA.find(d=>d.id===id));
  t("Black Label books are out of continuity, not Rebirth",
    bl.every(d=>d && d.era==="Out of continuity"),
    bl.map(d=>d&&d.era).join("|"));
  const gone=[682,684,685,686,687,688];
  t("the invented omnibus and the uncollected one-shots are gone",
    gone.every(id=>!DATA.find(d=>d.id===id)), DATA.length+" entries");
  t("nothing still links to a dropped entry",
    DATA.every(d=>(d.overlap||[]).every(o=>!gone.includes(o.id))));
  // integrity: every overlap link must point at an entry that exists
  const ids=new Set(DATA.map(d=>d.id));
  const dangling=[];
  DATA.forEach(d=>(d.overlap||[]).forEach(o=>{ if(!ids.has(o.id)) dangling.push(d.id+"->"+o.id); }));
  t("no dangling overlap links at all", dangling.length===0, dangling.join(" "));
  /* #708 A Good Day to Die is gone - Klaus confirmed it is collected inside the
     DCeased trade, so the cross-link it needed went with it. #700 stays. */
  t("A Good Day to Die is gone and #700 survives it",
    !DATA.find(d=>d.id===708) && !!DATA.find(d=>d.id===700));
  const yotv1=DATA.find(d=>d.id===681);
  t("Year of the Villain #1 points at Hell Arisen, not an omnibus",
    !!yotv1 && (yotv1.overlap||[]).some(o=>o.id===651));
  /* The nine duplicate ISBNs, approved 2026-09-08. Seven entries went; two kept
     their entry but lost an ISBN that belonged to another book. */
  const DUPGONE=[309,376,531,321,593,498,578];
  t("the seven duplicate entries are gone", DUPGONE.every(id=>!DATA.find(d=>d.id===id)));
  t("the entries they duplicated survive",
    [251,548,388,322,609,605,623].every(id=>!!DATA.find(d=>d.id===id)));
  t("nothing links to a dropped duplicate",
    DATA.every(d=>(d.overlap||[]).every(o=>!DUPGONE.includes(o.id))));
  t("#681 and #689 no longer hold another book's ISBN",
    [681,689].every(id=>!DATA.find(d=>d.id===id).isbn_hint));
  t("Deathstroke Vol. 7 is R.I.P., the volume that ISBN actually is",
    DATA.find(d=>d.id===594).title==="Deathstroke Vol. 7: R.I.P.");
  /* Zero month: thirteen New 52 trades open with the Sept 2012 #0 issue. Each
     was verified against GCD before it was written. */
  const ZERO=[64,75,76,95,109,111,119,127,145,167,170,172,263];
  t("all thirteen zero-month ranges start at #0",
    ZERO.every(id=>/^#0[,-]/.test(DATA.find(d=>d.id===id).issues)),
    ZERO.filter(id=>!/^#0[,-]/.test(DATA.find(d=>d.id===id).issues)).join(","));

  console.log("\n== verified corrections");
  const ww=DATA.find(d=>d.id===438);
  t("Wonder Woman Vol. 4 issue range matches dc.com",
    ww.issues==="#16, 18, 20, 22, 24; Wonder Woman Annual #1 (Rucka story)", ww.issues);
  t("and it is no longer flagged for verification", ww.confidence==="High", ww.confidence);
  t("the source of the correction is in the note", /dc\.com 2026-09-07/.test(ww.notes||""));

  /* #531 was dropped as a duplicate of #388 on 2026-09-08; #388 inherited its
     corrected range, so the assertion moves with it. #498 was dropped too. */
  const fixed={91:"#0, 8-13; Resurrection Man #9",375:"#13-18",379:"#13-26",
    388:"Nightwing: Rebirth #1; #1-4, 7-8",665:"#74-81",667:"#76-81",
    670:"#53-57; Aquaman Annual #2"};
  t("all seven corrected ranges are in place",
    Object.keys(fixed).every(id=>DATA.find(d=>d.id===+id).issues===fixed[id]),
    Object.keys(fixed).filter(id=>DATA.find(d=>d.id===+id).issues!==fixed[id]).join(","));
  t("Nightwing Vol. 1 is retitled to the book its ISBN actually is",
    DATA.find(d=>d.id===388).title==="Nightwing Vol. 1: Better Than Batman");
  t("Deathstroke: Arkham is resolved with the right isbn",
    (()=>{const d=DATA.find(x=>x.id===609);
      return d.confidence==="High" && d.issues==="#36-40" && d.isbn_hint==="9781401294311";})());
  t("Green Lantern Corps Vol. 3 resolved from League of Comic Geeks",
    (()=>{const d=DATA.find(x=>x.id===136);
      /* the Green Lantern #20 crossover chapter was added 2026-09-08 from GCD */
      return d.issues==="#15-20; Green Lantern Corps Annual #1; Green Lantern #20"
        && d.confidence==="High"
        && d.isbn_hint==="9781401247669" && /leagueofcomicgeeks/.test(d.notes);})());
  t("no entry is left flagged Verify among the original 11 suspects",
    [91,136,375,379,438,388,609,665,667,670].every(id=>
      DATA.find(d=>d.id===id).confidence!=="Verify"),
    [91,136,375,379,438,388,609,665,667,670].filter(id=>
      DATA.find(d=>d.id===id).confidence==="Verify").join(","));
  t("every correction records its source and date",
    [91,375,379,665,667,670,609,136,438].every(id=>
      /2026-09-07/.test(DATA.find(d=>d.id===id).notes||"")));

  console.log("\n== new eras");
  const eras=[...new Set(DATA.map(d=>d.era))];
  t("three new eras exist", ["Infinite Frontier","Dawn of DC","DC All In"].every(e=>eras.includes(e)), eras.join("|"));
  /* 807: 810 minus #658 (duplicate of #694), plus #821 (Aquaman Vol. 4), minus
     #165 Blue Beetle and #218 Stormwatch (pre-Flashpoint) and #184 Villains
     Month (an event with no TPB) - all four dropped on Klaus's call 2026-09-08. */
  /* 796: twelve dropped when Klaus cleared missing_isbn.csv, two added (Aquaman
     Vol. 4, Red Lanterns Vol. 4), seven dropped as duplicate ISBNs, then the
     three missing New Guardians volumes added. */
  const GONE=[658,165,218,184,304,350,351,359,462,619,649,708,
              309,376,531,321,593,498,578];
  t("796 entries", DATA.length===796, DATA.length);
  t("everything Klaus dropped is gone", GONE.every(id=>!DATA.find(d=>d.id===id)));
  t("nothing links to any of them",
    DATA.every(d=>(d.overlap||[]).every(o=>!GONE.includes(o.id))));
  /* Red Lanterns is complete at six volumes and five of the six ranges were
     wrong - Vol. 3 was carrying Vol. 4's issues. All six now come from GCD. */
  t("Red Lanterns runs 1-6 with no Vol. 7",
    (()=>{const rl=DATA.filter(d=>/^Red Lanterns Vol\./.test(d.title));
      return rl.length===6 && !rl.some(d=>/Vol\. 7/.test(d.title));})(),
    DATA.filter(d=>/^Red Lanterns Vol\./.test(d.title)).length+" volumes");
  t("Red Lanterns ranges do not overlap",
    (()=>{const want={21:"#1-7",90:"#8-12; Stormwatch #9",
      209:"#0, 13-20; Green Lantern #20",822:"#21-26; Green Lantern Annual #2"};
      return Object.keys(want).every(id=>DATA.find(d=>d.id===+id).issues===want[id]);})());
  /* Eight ranges Klaus confirmed against DC's solicit text. GCD agreed with DC
     on all seven it had data for, which is the strongest signal yet that the
     reprint table is trustworthy where the list disagrees with it. */
  t("the eight badly-wrong ranges are fixed",
    (()=>{const want={173:"#19-30",108:"#0, 7-16",135:"#0, 13-20",59:"#13-23",
      631:"#41-44, 47-50; Annual #1",192:"#25-34; Annual #1",558:"#19-28"};
      return Object.keys(want).every(id=>DATA.find(d=>d.id===+id).issues===want[id]);})(),
    Object.keys({173:0,108:0,135:0,59:0,631:0,192:0,558:0})
      .map(id=>id+":"+DATA.find(d=>d.id===+id).issues).join(" | "));
  t("StormWatch stops at four volumes",
    DATA.filter(d=>/^Stormwatch Vol\./i.test(d.title)).length===4,
    DATA.filter(d=>/^Stormwatch Vol\./i.test(d.title)).map(d=>d.title).join(" | "));
  t("Legion of Super-Heroes Millennium collects the ongoing too",
    (()=>{const d=DATA.find(x=>x.id===691);
      return d.title==="Legion of Super-Heroes Vol. 1: Millennium" &&
             /Legion of Super-Heroes #1-6/.test(d.issues);})());
  t("Justice League Vol. 4: Endless was already right",
    DATA.find(d=>d.id===550).issues==="#20-25");
  t("Men of Tomorrow lost its invented volume number",
    (()=>{const d=DATA.find(x=>x.id===236);
      return d.title==="Superman: The Men of Tomorrow" &&
             String(rec(236).isbn||d.isbn_hint)==="9781401258689";})());
  t("the duplicate Batman books are gone",
    [726,728,729].every(id=>!DATA.find(d=>d.id===id)));
  t("the originals they duplicated are still there",
    [655,656,657].every(id=>!!DATA.find(d=>d.id===id)));
  t("no two entries claim the same isbn",
    (()=>{const h=DATA.map(d=>d.isbn_hint).filter(Boolean);return new Set(h).size===h.length;})(),
    "duplicates present");
  /* Both "unfixable" ISBNs are now sourced: #453 is Superman: ACTION COMICS -
     The Oz Effect, and #354 is Green Lantern CORPS: The Lost Army - GCD has the
     latter and its reprint links confirm the contents. */
  t("Lost Army is retitled and sourced",
    (()=>{const d=DATA.find(x=>x.id===354);
      return d.title==="Green Lantern Corps: The Lost Army" &&
             String(rec(354).isbn||d.isbn_hint)==="9781401261269" &&
             /Lost Army #1-6/.test(d.issues);})());
  /* The whole point of pulling gcd_reprint: issue ranges are now sourced, not
     guessed. Only the 11 collections GCD has no reprint links for stay blank. */
  t("at most 11 entries still have a blank issue range",
    DATA.filter(d=>!(d.issues||"").trim()).length<=11,
    DATA.filter(d=>!(d.issues||"").trim()).length+" blank");
  t("every filled range records where it came from",
    DATA.filter(d=>/Issue list from GCD reprint records/.test(d.notes||""))
        .every(d=>(d.issues||"").trim().length>0));
  /* #658 WAS the duplicate half of that pair. Klaus confirmed #694 is the real
     entry (it has the ISBN), so #658 is gone and nothing may still link to it. */
  t("the duplicate Arkham Knight entry is gone",
    !DATA.find(d=>d.id===658) && !!DATA.find(d=>d.id===694));
  t("nothing links to the dropped duplicate",
    DATA.every(d=>(d.overlap||[]).every(o=>o.id!==658)));
  /* Aquaman restarts at Vol. 1 after Rebirth Vol. 6 - there is no Vol. 7/8/9
     and no "Kingdom". */
  /* The "(2019 renumbering)" suffix in the title was a workaround for two
     volumes sharing a number. The series label carries that now, so the titles
     match DC's spines. */
  t("the DeConnick Aquaman run is numbered 1-4",
    ["Aquaman Vol. 1: Unspoken Water","Aquaman Vol. 2: Amnesty",
     "Aquaman Vol. 3: Manta vs. Machine",
     "Aquaman Vol. 4: Echoes of a Life Lived Well"]
      .every(t2=>DATA.some(d=>d.title===t2 && d.series==="Aquaman (2019)")));
  t("no invented Aquaman Kingdom is left", !DATA.some(d=>/Aquaman.*Kingdom/.test(d.title)));
  t("Preludes to the Wedding is plural and has its ISBN",
    (()=>{const d=DATA.find(x=>x.id===489);
      return d.title==="Batman: Preludes to the Wedding" &&
             String(rec(489).isbn||d.isbn_hint)==="9781401286545";})());
  t("the Oz Effect carries its Action Comics title and ISBN",
    (()=>{const d=DATA.find(x=>x.id===453);
      return /Action Comics - The Oz Effect/.test(d.title) &&
             String(rec(453).isbn||d.isbn_hint)==="9781401287863";})());
  /* "new entry" means an entry I ADDED (id >= 724), not an entry that happens
     to sit in one of the three new eras. Once era was re-derived from the
     original issues' cover dates, older books moved into Infinite Frontier and
     DC All In - and they have no isbn_hint (their ISBN lives in details.json),
     so filtering by era made three of these guards fail on correct data. */
  const nw=DATA.filter(d=>d.id>=724 && d.id<=819);   // the GCD sweep batch
  // #820+ came from Klaus's own cover photos, not the sweep - different source.
  t("every new entry carries a GCD isbn hint", nw.every(d=>/^97[89]\d{10}$/.test(d.isbn_hint||"")));
  // an entry whose contents GCD could confirm is High, not Verify
  t("new entries are Verify unless their contents were confirmed",
    nw.every(d=>d.confidence==="Verify" || (d.issues||"").length>0),
    nw.filter(d=>d.confidence!=="Verify" && !(d.issues||"").length).map(d=>d.id).join(","));
  t("every new entry records where it came from", nw.every(d=>/GCD collected editions/.test(d.notes||"")));
  // 10 in the batch, Endless Winter (#805) included - it sits in Rebirth
  t("hardcover fallbacks say so", nw.filter(d=>/hardcover/.test(d.notes)).length===10,
    nw.filter(d=>/hardcover/.test(d.notes)).length+" flagged");
  t("Absolute Edition reprints were NOT pulled in",
    !DATA.some(d=>/Red Son|Arkham Asylum|for All Seasons|Three Jokers/i.test(d.title) && d.era==="DC All In"));

  const fs=DATA.filter(d=>/^14\. Future State/.test(d.phase));
  t("Future State is its own phase, ahead of Infinite Frontier",
    fs.length===9 && fs.every(d=>d.era==="Infinite Frontier"), fs.length+" entries");
  t("the three later phases were renumbered to 15/16/17",
    ["15. Infinite Frontier (2021-2023)","16. Dawn of DC (2023-2024)",
     "17. DC All In / Absolute Universe (2024- )"].every(ph=>DATA.some(d=>d.phase===ph)));
  t("Death Metal tie-ins joined the existing Death Metal phase",
    DATA.filter(d=>/Death Metal/.test(d.title)).every(d=>d.era==="Rebirth"));
  t("both Detective Comics runs are attributed in the title",
    DATA.filter(d=>/Tamaki\)/.test(d.title)).length===4 &&
    DATA.filter(d=>/Ram V\)/.test(d.title)).length===5);
  /* This used to check isbn_hint only, so #178 and #184 shared an ISBN for a
     day - theirs lived in details.json. Check the effective ISBN instead:
     whatever rec() ends up with after the import. */
  /* WARNING: this runs against the details.json FIXTURE below, not the real
     file. It therefore CANNOT see a duplicate that lives only in the real
     details.json - and nine did, for weeks, while this suite said 146/146.
     The real-file version of this check is check_data.py, which must be run
     alongside boot_check.js before any deploy. Do not delete that script. */
  const eff=DATA.map(d=>String(rec(d.id).isbn||d.isbn_hint||"")).filter(Boolean);
  t("no two entries share an ISBN, from either source (FIXTURE ONLY)",
    new Set(eff).size===eff.length,
    (()=>{const c={};eff.forEach(k=>c[k]=(c[k]||0)+1);
      return Object.keys(c).filter(k=>c[k]>1).join(",")||"none";})());

  const dcx=DATA.find(d=>d.isbn_hint==="9781779525185");
  t("Dark Crisis records that it contains Death of the Justice League",
    /Death of the Justice League/.test(dcx.issues) && dcx.confidence==="High");
  t("no separate Death of the Justice League entry was invented",
    DATA.filter(d=>/^justice league: death of/i.test(d.title)).length===0);
  // the list already had 9 Rebirth-era Titans books, so count by the new ids
  const tt=DATA.filter(d=>d.id>=806 && /^Titans/.test(d.title));
  t("seven Titans books added on top of the nine already there",
    tt.length===7 && DATA.filter(d=>/^Titans/.test(d.title)).length===16,
    tt.length+" new, "+DATA.filter(d=>/^Titans/.test(d.title)).length+" total");
  const ew=DATA.find(d=>/Endless Winter/.test(d.title));
  t("Endless Winter is in, flagged as hardcover-only",
    !!ew && /hardcover/.test(ew.notes) && ew.era==="Rebirth");

  const ev=["Batman: Shadow War","Trial of the Amazons","Flashpoint Beyond","Lazarus Planet",
            "Lazarus Planet: Revenge of the Gods","Batman / Catwoman: The Gotham War"];
  t("the six missing events are in", ev.every(tt=>DATA.some(d=>d.title===tt)),
    ev.filter(tt=>!DATA.some(d=>d.title===tt)).join(" | "));
  t("the five hardcover-only events say so",
    ev.filter(tt=>/is the hardcover/.test((DATA.find(d=>d.title===tt)||{}).notes||"")).length===5);
  t("Flashpoint Beyond is not flagged hardcover (it has a TP)",
    !/is the hardcover/.test(DATA.find(d=>d.title==="Flashpoint Beyond").notes));
  // 11 since DC Rebirth Omnibus joined them - GCD indexes no paperback for it
  t("every hardcover fallback in the whole list is flagged",
    DATA.filter(d=>/is the hardcover/.test(d.notes||"")).length===11,
    DATA.filter(d=>/is the hardcover/.test(d.notes||"")).length+" flagged");

  console.log("\n== control bar layout");
  const doc=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  t("Clear all and sort sit together in a right-hugging tail",
    /<div class="tail">\s*<button class="chip" id="reset">/.test(doc));
  t("sort is the last control in the tail",
    /id="fSort"[\s\S]*?<\/select>\s*<\/div>\s*<div class="count"/.test(doc));
  t("one width token for every control", /\.controls\{--cw:/.test(doc));
  t("no one-off inline width left on the creator search",
    !/id="qc"[^>]*style=/.test(doc));
  t("every select is wired to the render listener",
    /"q","qc","fEra","fPhase","fPrio","fEvent","fSeries","fScore"\]\.forEach\(id=>\s*\n?\s*document\.getElementById\(id\)\.addEventListener\("input",render\)/.test(doc));
  /* Klaus's order: era + reading phase + storyline bundled, then priority,
     then series and rating, then the owned/read chips, then the text boxes. */
  t("filter bar is in the requested order",
    /id="fEra"[\s\S]*?id="fPhase"[\s\S]*?id="fEvent"[\s\S]*?id="fPrio"[\s\S]*?id="fSeries"[\s\S]*?id="fScore"[\s\S]*?id="gOwn"[\s\S]*?id="gStatus"[\s\S]*?id="q" type="search"[\s\S]*?id="qc" type="search"[\s\S]*?<div class="tail">/.test(doc));
  t("the chips sit after rating, not before storyline",
    doc.indexOf('id="gOwn"') > doc.indexOf('id="fScore"'));
  t("both text filters sit last, just before the tail",
    /id="q" type="search"[\s\S]{0,140}id="qc" type="search"[\s\S]{0,160}<div class="tail">/.test(doc));
  t("Fill covers from ISBNs button removed", !/id="fromisbn"/.test(doc));
  t("Storage check button removed", !/id="diag"/.test(doc));
  t("the era filter offers the new eras",
    /<option>Infinite Frontier<\/option>/.test(doc) && /<option>DC All In<\/option>/.test(doc));
  t("the header no longer claims the list stops at 2021", !/2011&ndash;2021/.test(doc));

  console.log("\n== back to top");
  const gt=document.getElementById("gotop");
  t("button exists in the markup", /id="gotop"/.test(doc));
  t("hidden at the top of the page", (window.scrollY=0, syncGoTop(), !gt.classList.contains("on")));
  t("shown once scrolled", (window.scrollY=900, syncGoTop(), gt.classList.contains("on")));
  t("hidden again when scrolled back", (window.scrollY=10, syncGoTop(), !gt.classList.contains("on")));
  t("it clears the selection bar rather than hiding under it",
    /\.gotop\{[^}]*bottom:70px/.test(doc) && /\.selbar\{[^}]*bottom:0/.test(doc));

  console.log("\n== one badge only, events only");
  const withOrder=DATA.filter(d=>orderBadge(d)!=="");
  const anyReadorder=DATA.filter(d=>(d.readorder||[]).length);
  t("the order badge is limited to events and crossovers",
    withOrder.every(d=>d.kind==="Event"||d.kind==="Crossover"),
    withOrder.filter(d=>!["Event","Crossover"].includes(d.kind)).length+" leaked");
  t("it is a real subset of everything that has a reading order",
    withOrder.length>0 && withOrder.length<anyReadorder.length,
    withOrder.length+" of "+anyReadorder.length);
  const rows=DATA.slice(0,400).map(d=>rowHTML(view(d))).join("");
  t("no overlap badge in any row", !/>overlap</.test(rows));
  t("no conflict badge in any row", !/>conflict</.test(rows));
  t("no edited badge in any row", !/>edited</.test(rows));
  t("the order badge does appear somewhere",
    /title="Has an issue-level reading order"/.test(DATA.filter(d=>orderBadge(d)).map(d=>rowHTML(view(d))).join("")));
  t("the new eras get their own colour class",
    eraCls("Infinite Frontier")==="inf" && eraCls("Dawn of DC")==="dawn" &&
    eraCls("DC All In")==="allin" && eraCls("Rebirth")==="reb");

  console.log("\n== own and status take several values at once");
  ["q","qc","fEra","fPhase","fPrio","fEvent","fSeries","fScore"]
    .forEach(i=>{const e=document.getElementById(i); if(e) e.value="";});
  fOwnSel.clear(); fStatusSel.clear();
  const baseAll=DATA.filter(pass).length;
  state[301]=Object.assign(rec(301),{own:"Owned",status:"Read"});
  state[302]=Object.assign(rec(302),{own:"Wishlist",status:"Unread"});
  state[303]=Object.assign(rec(303),{own:"",status:"Reading"});
  fOwnSel.add("Owned");
  const onlyOwned=DATA.filter(pass).map(d=>d.id);
  t("one value filters", onlyOwned.length>=1 && onlyOwned.includes(301) && !onlyOwned.includes(302));
  fOwnSel.add("Wishlist");
  const both=DATA.filter(pass).map(d=>d.id);
  t("two values are an OR, not an AND",
    both.includes(301) && both.includes(302) && both.length>onlyOwned.length,
    both.length+" vs "+onlyOwned.length);
  t("an entry with no ownership is reachable via Not owned",
    (fOwnSel.clear(), fOwnSel.add("__none"), DATA.filter(pass).map(d=>d.id).includes(303)));
  fOwnSel.clear();
  fStatusSel.add("Read"); fStatusSel.add("Reading");
  const st=DATA.filter(pass).map(d=>d.id);
  t("status is multi-select too", st.includes(301) && st.includes(303) && !st.includes(302));
  t("both count as active filters",
    (fOwnSel.add("Owned"), activeFilterCount()>=2), activeFilterCount());
  document.getElementById("reset")&&null;
  fOwnSel.clear(); fStatusSel.clear();
  t("clearing them restores every entry", DATA.filter(pass).length===baseAll, DATA.filter(pass).length+" vs "+baseAll);
  const doc2=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  t("the old single-value selects are gone",
    !/id="fOwn"/.test(doc2) && !/id="fStatus"/.test(doc2));
  t("chip groups are in the markup",
    /id="gOwn"/.test(doc2) && /id="gStatus"/.test(doc2) && /data-fown=/.test(doc2));

  console.log("\n== drawer no longer sits under the floating bar");
  openDrawer(1);
  t("opening the drawer marks the body", document.body.classList.contains("drawer-open"));
  closeDrawer();
  t("closing it clears the mark", !document.body.classList.contains("drawer-open"));
  t("the css hides the bar and the button while it is open",
    /body\.drawer-open \.selbar, body\.drawer-open \.gotop\{display:none !important\}/.test(doc2));

  console.log("\n== labels and the last ISBN sweep");
  const doc3=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  t("the phase filter says Reading phase", /All reading phases/.test(doc3) && !/All phases</.test(doc3));
  t("the event filter says Storyline", /All storylines/.test(doc3) && !/All events</.test(doc3));
  t("the table column says Storyline", /class="h-ev">Storyline/.test(doc3));
  const found={55:"9781401234829",423:"9781401267421",518:"9781401274795",
               519:"9781401276058",592:"9781779516398",595:"9781401291174"};
  t("the six provable ISBNs are in",
    Object.keys(found).every(id=>DATA.find(d=>d.id===+id).isbn_hint===found[id]),
    Object.keys(found).filter(id=>DATA.find(d=>d.id===+id).isbn_hint!==found[id]).join(","));
  /* The collection was there all along under the plural spelling - see the
     Preludes test above. What must never come back is the wrong ISBN. */
  t("Preludes to the Wedding did not take the Wedding's ISBN",
    DATA.find(d=>d.id===489).isbn_hint!=="9781401283384");
  t("it did not steal the Wedding's ISBN",
    DATA.find(d=>d.id===489).isbn_hint!=="9781401283384");
  t("every ISBN in the list is still unique",
    (()=>{const h=DATA.map(d=>d.isbn_hint).filter(Boolean);return new Set(h).size===h.length;})());
  t("the malformed GCD ISBN was cleaned to 13 digits",
    /^97[89]\d{10}$/.test(DATA.find(d=>d.id===595).isbn_hint));

  console.log("\n== the Batgirl correction");
  const mind=DATA.find(d=>d.id===339);
  t("Fugue is gone; #339 is Mindfields",
    mind.title==="Batgirl Vol. 8: Mindfields" && mind.isbn_hint==="9781401262693"
    && mind.issues==="#46-52; Batgirl: Endgame #1" && mind.confidence==="High");
  const fam=DATA.find(d=>d.title==="Batgirl Vol. 7: Family Business");
  t("Family Business was added", !!fam && fam.isbn_hint==="9781401259662"
    && fam.issues==="#41-45; Batgirl Annual #3");
  t("both sit in the same phase as the rest of that run",
    !!fam && fam.phase===mind.phase && fam.era===mind.era);
  t("no book called Fugue survives anywhere",
    !DATA.some(d=>/fugue/i.test(d.title)));
  t("ISBNs are still unique after both changes",
    (()=>{const h=DATA.map(d=>d.isbn_hint).filter(Boolean);return new Set(h).size===h.length;})());

  console.log("\n== what validate_gcd.py found");
  const swaps={10:"9781401237844",115:"9781401246280",253:"9781401258467",337:"9781401264796"};
  t("four more hardcovers swapped for their paperbacks",
    Object.keys(swaps).every(id=>DATA.find(d=>d.id===+id).isbn_hint===swaps[id]),
    Object.keys(swaps).filter(id=>DATA.find(d=>d.id===+id).isbn_hint!==swaps[id]).join(","));
  // #184 is gone entirely now, so the only thing left to guard is that no one
  // else ever takes Forever Evil's ISBN.
  t("Forever Evil keeps its ISBN", DATA.find(d=>d.id===178).isbn_hint==="9781401248918");
  t("nobody else claims it",
    DATA.filter(d=>String(rec(d.id).isbn||d.isbn_hint)==="9781401248918").length===1);

  console.log("\n== reading order follows the eras");
  /* Reading order used to be raw entry id - the order things were ADDED - so
     DC All In sat in the middle and anything appended sat at the end. It is now
     era -> phase -> earliest collected cover date -> id, with the position
     exposed as ord() and shown in the first column. */
  const doc5=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  t("every entry has a position", DATA.every(d=>ord(d)>=1 && ord(d)<=DATA.length));
  t("positions are a permutation of 1..N",
    new Set(DATA.map(d=>ord(d))).size===DATA.length);
  const eraSeq=DATA.slice().sort((a,b)=>ord(a)-ord(b)).map(d=>d.era);
  const firstAt={}; eraSeq.forEach((e,i)=>{ if(!(e in firstAt)) firstAt[e]=i; });
  t("the eras appear in DC's real order, All In last before Elseworlds",
    ["New 52","Rebirth","Infinite Frontier","Dawn of DC","DC All In","Out of continuity"]
      .filter(e=>e in firstAt).every((e,i,arr)=>i===0||firstAt[arr[i-1]]<firstAt[e]),
    JSON.stringify(firstAt));
  t("each era is one unbroken block",
    (()=>{const seen=new Set(); let prev=null;
      for(const e of eraSeq){ if(e!==prev){ if(seen.has(e)) return false; seen.add(e); prev=e; } }
      return true;})());
  /* the three most recently added entries must sit with their series, not at
     the end: Batgirl Vol. 7, Aquaman Vol. 4, Red Lanterns Vol. 4 */
  t("appended entries are no longer stranded at the end",
    [820,821,822].every(id=>ord(DATA.find(d=>d.id===id))<DATA.length-20),
    [820,821,822].map(id=>id+"@"+ord(DATA.find(d=>d.id===id))).join(" "));
  t("Red Lanterns Vol. 4 sits between Vol. 3 and Vol. 5",
    ord(DATA.find(d=>d.id===209))<ord(DATA.find(d=>d.id===822)) &&
    ord(DATA.find(d=>d.id===822))<ord(DATA.find(d=>d.id===310)));
  /* World's Finest was the worst case: ids were alphabetical by title, so
     issues #35-43 sorted before #12-17. mdate fixes it. */
  t("World's Finest reads in issue order",
    ord(DATA.find(d=>d.id===746))<ord(DATA.find(d=>d.id===745)) &&
    ord(DATA.find(d=>d.id===745))<ord(DATA.find(d=>d.id===741)) &&
    ord(DATA.find(d=>d.id===741))<ord(DATA.find(d=>d.id===740)));
  t("every entry carries an mdate", DATA.filter(d=>!d.mdate).length<=5,
    DATA.filter(d=>!d.mdate).map(d=>d.id).join(","));
  /* Klaus's rule, final: era follows the cover date of the material and a run
     may cross eras. Gotham Nocturne is Infinite Frontier for Overture and
     Act I, Dawn of DC for the rest - and it still reads in order, because
     ordering is era -> phase -> mdate and the eras are adjacent. */
  t("Gotham Nocturne is NOT forced into one era",
    DATA.find(d=>d.id===800).era==="Infinite Frontier" &&
    DATA.find(d=>d.id===801).era==="Infinite Frontier" &&
    [802,803,804].every(id=>DATA.find(d=>d.id===id).era==="Dawn of DC"));
  t("Gotham Nocturne reads Overture -> Act I -> Act II -> Intermezzo -> Act III",
    [800,801,802,803,804].every((id,i,arr)=>i===0||
      ord(DATA.find(d=>d.id===arr[i-1]))<ord(DATA.find(d=>d.id===id))));
  t("the first column shows the position, not the id",
    /class="c-ord" title="entry #\$\{d\.id\}">\$\{selBox\(d\.id\)\}\$\{ord\(d\)\}/.test(doc5));
  t("the drawer still shows the internal id", /id \$\{d\.id\}/.test(doc5));

  console.log("\n== volume numbers and series labels");
  /* Klaus spotted two entries both labelled "Vol. 1" with different titles. The
     series field was not telling two RUNS apart, so DC's restarts collided -
     sixteen times, worst of all Detective Comics, which had three runs sharing
     one label and therefore three Vol. 1 through Vol. 6. */
  t("no series has two different books at the same volume number",
    (()=>{const seen={},bad=[];
      DATA.forEach(d=>{const m=/\bVol\.?\s*(\d+)\b/i.exec(d.title); if(!m) return;
        const k=d.series+"|"+m[1], norm=d.title.replace(/\bvol\.?\s*\d+\b/ig," ")
          .toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).join(" ");
        if(seen[k]&&seen[k]!==norm) bad.push(k); else seen[k]=norm;});
      window.__volBad=bad; return bad.length===0;})(),
    (window.__volBad||[]).join(" ; "));
  t("the Detective Comics runs have their own labels",
    ["Detective Comics (New 52)","Detective Comics (Rebirth)",
     "Batman: Detective Comics (Tomasi)","Batman: Detective Comics (Tamaki)",
     "Batman: Detective Comics (Ram V)"].every(s2=>DATA.some(d=>d.series===s2)));
  t("no entry is left on the bare 'Detective Comics' label except the #1000 one-shot",
    DATA.filter(d=>d.series==="Detective Comics").every(d=>/#1000/.test(d.title)));
  t("the DeConnick Aquaman run is its own series",
    DATA.filter(d=>d.series==="Aquaman (2019)").length===4 &&
    DATA.filter(d=>d.series==="Aquaman (Rebirth)").length===6);
  t("the renumbering suffix is gone from the Aquaman titles",
    !DATA.some(d=>/renumbering/.test(d.title)));
  /* The complete six-volume New Guardians run, from Klaus's LoCG shelf. The
     list had 1, 2 and 5 - and 5 was labelled 4. */
  t("New Guardians runs 1-6 under one series label",
    (()=>{const ng=DATA.filter(d=>d.series==="Green Lantern: New Guardians");
      return ng.length===6 && [1,2,3,4,5,6].every(n=>
        ng.some(d=>new RegExp("Vol\\. "+n+":").test(d.title)));})(),
    DATA.filter(d=>d.series==="Green Lantern: New Guardians").length+" volumes");
  t("The Godkillers is Vol. 5 and collects #28-34",
    (()=>{const d=DATA.find(x=>x.id===207);
      return /Vol\. 5: The Godkillers/.test(d.title) && /#28-34/.test(d.issues);})());
  t("the zero issue is in Vol. 3, not Vol. 2",
    /^#0, 13-20/.test(DATA.find(d=>d.id===823).issues) &&
    !/#0/.test(DATA.find(d=>d.id===89).issues));
  t("no GL shorthand left in the New Guardians titles",
    !DATA.some(d=>/^GL: New Guardians/.test(d.title)));
  /* Four entries deliberately keep a number DC did not print, so the list can
     be read straight through a restart. Each one says so in its note. */
  t("the deliberate continuous numbers are all documented",
    [269,820,339,320,665].every(id=>/NUMBERING|printed/i.test(DATA.find(d=>d.id===id).notes||"")),
    [269,820,339,320,665].filter(id=>!/NUMBERING|printed/i.test(DATA.find(d=>d.id===id).notes||"")).join(","));

  console.log("\n== carrying progress between two devices");
  /* No server: the site is public, so a write credential in the page would be
     public too. The transfer is a file, and the import MERGES per book by
     timestamp - that is what makes importing an older file harmless. */
  const doc6=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  t("every write stamps the entry with a time", /function stamp\(r\)\{ r\.t = Date\.now\(\);/.test(doc6));
  t("patch stamps", /const r=rec\(id\); r\[field\]=val; stamp\(r\);/.test(doc6));
  t("bulk apply stamps", /r\[field\]=val; stamp\(r\); state\[id\]=r;/.test(doc6));
  t("drawer edits stamp", /r\.edits=edits; stamp\(r\);/.test(doc6));
  t("the export carries a timestamp, a device and the build",
    /_longbox:"progress"[\s\S]{0,200}savedAt:now\.toISOString\(\)/.test(doc6));
  t("the sync bookkeeping stays out of state",
    /const SYNCKEY = "longbox\.sync"/.test(doc6) && !/state\._meta/.test(doc6));

  // the merge itself, exercised for real
  const keep = JSON.stringify(state);
  state = {};
  state[9001] = {own:"Owned", status:"Read", t: 5000};      // this device, older
  state[9002] = {own:"Owned", status:"Read", t: 9000};      // this device, newer
  state[9003] = {own:"Wishlist", t: 7000};                  // only here
  const incoming = {
    9001: {own:"Owned", status:"Reading", t: 8000},         // file is newer -> wins
    9002: {own:"", status:"Unread", t: 1000},               // file is older -> loses
    9004: {own:"Owned", status:"Unread", t: 8500},          // only in the file -> added
    __test: {junk:true}, notanid: {junk:true}
  };
  const res = mergeProgress(incoming);
  t("a newer file entry wins", state[9001].status==="Reading", JSON.stringify(state[9001]));
  t("an older file entry loses", state[9002].status==="Read", JSON.stringify(state[9002]));
  t("a book only on this device survives", state[9003] && state[9003].own==="Wishlist");
  t("a book only in the file is added", state[9004] && state[9004].own==="Owned");
  t("the merge counts what it did",
    res.updated===1 && res.added===1 && res.kept===1, JSON.stringify(res));
  t("non-numeric keys are ignored", !state.__test && !state.notanid);
  t("nothing is ever deleted by a merge", Object.keys(state).length===4,
    Object.keys(state).join(","));
  // an older export with no timestamps must not clobber timestamped local data
  const wasStatus = state[9001].status;
  mergeProgress({9001:{own:"Owned", status:"Skipped"}});
  t("a file with no timestamps cannot overwrite stamped local data",
    state[9001].status===wasStatus, state[9001].status);
  /* after the merge: 9001 t=8000 (file won), 9002 t=9000 (local kept),
     9003 t=7000, 9004 t=8500 -> the newest stamp is 9002's 9000 */
  t("newestStamp finds the latest change", newestStamp(state)===9000, String(newestStamp(state)));
  t("entryCount ignores the probe key", entryCount({1:{},2:{},__test:{}})===2);
  state = JSON.parse(keep);

  console.log("\n== tap a series to filter by it");
  const doc4=require("fs").readFileSync(process.env.LB_HTML,"utf8");
  t("rows carry a clickable series", /class="serlink" data-series=/.test(rowHTML(view(DATA[8]))));
  t("the drawer does too", /class="serlink" data-series=/.test(drawerHTML(DATA[8])));
  t("it is wired up", /e\.target\.closest\("\[data-series\]"\)/.test(doc4));
  t("selection mode suppresses it", /if\(!a \|\| selMode\) return;/.test(doc4));
  const fs2=document.getElementById("fSeries");
  fs2.value=""; fOwnSel.clear(); fStatusSel.clear();
  ["q","qc","fEra","fPhase","fPrio","fEvent","fScore"].forEach(i2=>{
    const e2=document.getElementById(i2); if(e2) e2.value="";});
  // the filter itself must work once a series is chosen
  const someSeries=DATA.find(d=>d.series==="Batgirl").series;
  fs2.innerHTML='<option value=""></option><option>'+someSeries+'</option>';
  fs2.value=someSeries;
  const onlyBg=DATA.filter(pass);
  t("choosing a series filters to it",
    onlyBg.length>0 && onlyBg.every(d=>d.series===someSeries), onlyBg.length+" rows");
  fs2.value="";
  t("clearing it restores the list", DATA.filter(pass).length===DATA.length);
  const bg=[269,820,339].map(id=>DATA.find(d=>d.id===id));
  t("the printed volume numbers are recorded on all three Batgirl books",
    bg.every(d=>/Numbering note/.test(d.notes||"")));

  console.log("\n== import feedback");
  const im=document.getElementById("importMsg");
  t("the import report is written onto the page, not only into an alert()",
    im && im.hidden===false && /Imported from/.test(im.innerHTML||""),
    im? ("hidden="+im.hidden+" html="+(im.innerHTML||"").slice(0,40)) : "no element");
  t("it carries the counts", im && /ISBNs/.test(im.innerHTML) && /covers/.test(im.innerHTML));
  console.log("\n"+(nFail?"FAILED "+nFail+" of "+(nPass+nFail):"ALL "+nPass+" CHECKS PASSED"));
  if(H_alerts.length) console.log("\nalerts raised during boot/import:\n - "+H_alerts.join("\n - ").slice(0,900));
  process.exit(nFail?1:0);
})().catch(e=>{ console.log("\nHARNESS THREW: "+e.stack); process.exit(2); });
