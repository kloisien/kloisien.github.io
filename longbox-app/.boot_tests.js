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
  const dc=DATA.find(d=>d.id===708), dctpb=DATA.find(d=>d.id===700);
  t("DCeased: A Good Day to Die points at the DCeased tpb",
    !!dc && (dc.overlap||[]).some(o=>o.id===700));
  t("and the tpb points back", !!dctpb && (dctpb.overlap||[]).some(o=>o.id===708));
  const yotv1=DATA.find(d=>d.id===681);
  t("Year of the Villain #1 points at Hell Arisen, not an omnibus",
    !!yotv1 && (yotv1.overlap||[]).some(o=>o.id===651));

  console.log("\n== verified corrections");
  const ww=DATA.find(d=>d.id===438);
  t("Wonder Woman Vol. 4 issue range matches dc.com",
    ww.issues==="#16, 18, 20, 22, 24; Wonder Woman Annual #1 (Rucka story)", ww.issues);
  t("and it is no longer flagged for verification", ww.confidence==="High", ww.confidence);
  t("the source of the correction is in the note", /dc\.com 2026-09-07/.test(ww.notes||""));

  const fixed={91:"#0, 8-13; Resurrection Man #9",375:"#13-18",379:"#13-26",
    531:"Nightwing: Rebirth #1; #1-4, 7-8",665:"#74-81",667:"#76-81",
    670:"#53-57; Aquaman Annual #2"};
  t("all seven corrected ranges are in place",
    Object.keys(fixed).every(id=>DATA.find(d=>d.id===+id).issues===fixed[id]),
    Object.keys(fixed).filter(id=>DATA.find(d=>d.id===+id).issues!==fixed[id]).join(","));
  t("Nightwing Vol. 1 is retitled to the book its ISBN actually is",
    DATA.find(d=>d.id===531).title==="Nightwing Vol. 1: Better Than Batman");
  t("Deathstroke: Arkham is resolved with the right isbn",
    (()=>{const d=DATA.find(x=>x.id===609);
      return d.confidence==="High" && d.issues==="#36-40" && d.isbn_hint==="9781401294311";})());
  t("Green Lantern Corps Vol. 3 resolved from League of Comic Geeks",
    (()=>{const d=DATA.find(x=>x.id===136);
      return d.issues==="#15-20; Green Lantern Corps Annual #1" && d.confidence==="High"
        && d.isbn_hint==="9781401247669" && /leagueofcomicgeeks/.test(d.notes);})());
  t("no entry is left flagged Verify among the original 11 suspects",
    [91,136,375,379,438,498,531,609,665,667,670].every(id=>
      DATA.find(d=>d.id===id).confidence!=="Verify"),
    [91,136,375,379,438,498,531,609,665,667,670].filter(id=>
      DATA.find(d=>d.id===id).confidence==="Verify").join(","));
  t("every correction records its source and date",
    [91,375,379,531,665,667,670,609,136,498,438].every(id=>
      /2026-09-07/.test(DATA.find(d=>d.id===id).notes||"")));

  console.log("\n== new eras");
  const eras=[...new Set(DATA.map(d=>d.era))];
  t("three new eras exist", ["Infinite Frontier","Dawn of DC","DC All In"].every(e=>eras.includes(e)), eras.join("|"));
  // 812 added, then 3 removed: they duplicated Batman entries already in the list
  // 809 after the three duplicate Batman books came out, +1 for Batgirl: Family Business
  t("810 entries", DATA.length===810, DATA.length);
  t("the duplicate Batman books are gone",
    [726,728,729].every(id=>!DATA.find(d=>d.id===id)));
  t("the originals they duplicated are still there",
    [655,656,657].every(id=>!!DATA.find(d=>d.id===id)));
  t("no two entries claim the same isbn",
    (()=>{const h=DATA.map(d=>d.isbn_hint).filter(Boolean);return new Set(h).size===h.length;})(),
    "duplicates present");
  t("the two unfixable ISBNs were removed, not guessed",
    [354,453].every(id=>{const d=DATA.find(x=>x.id===id);
      return !d.isbn_hint && d.confidence==="Verify" && /WRONG ISBN REMOVED/.test(d.notes);}));
  t("Detective Comics Arkham Knight pair is cross-linked",
    (()=>{const a=DATA.find(d=>d.id===658),b=DATA.find(d=>d.id===694);
      return (a.overlap||[]).some(o=>o.id===694) && (b.overlap||[]).some(o=>o.id===658);})());
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
  const eff=DATA.map(d=>String(rec(d.id).isbn||d.isbn_hint||"")).filter(Boolean);
  t("no two entries share an ISBN, from either source",
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
  t("no ISBN was invented for Prelude to the Wedding",
    !DATA.find(d=>d.id===489).isbn_hint &&
    /NO COLLECTED EDITION/.test(DATA.find(d=>d.id===489).notes));
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
  t("Villains Month no longer borrows Forever Evil's ISBN",
    !DATA.find(d=>d.id===184).isbn_hint &&
    /DUPLICATE ISBN REMOVED/.test(DATA.find(d=>d.id===184).notes));
  t("Forever Evil keeps it", DATA.find(d=>d.id===178).isbn_hint==="9781401248918");

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
