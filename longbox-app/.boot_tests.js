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
  await applyDetails({ "1":{ isbn:"9781401233372", pages:176, cover:DEAD,
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

  console.log("\n== data-quality filter");
  const isbnSel=document.getElementById("fIsbn");
  const q=document.getElementById("q"); q.value="";
  ["fEra","fPhase","fPrio","fOwn","fStatus","fEvent","fSeries","fScore","qc"]
    .forEach(i=>{document.getElementById(i).value="";});
  isbnSel.value="";
  const all=DATA.filter(pass).length;
  t("no filter passes everything", all===DATA.length, all+" of "+DATA.length);
  // rec() reads state, so give two entries an isbn and one a short page count
  state[201]=Object.assign(rec(201),{isbn:"9781401233372"});
  state[202]=Object.assign(rec(202),{isbn:"9781401237882",pages:32});
  // entry 1 also carries an isbn from the import test above, so compare against
  // what state actually holds rather than a hardcoded count
  const expect=DATA.filter(d=>rec(d.id).isbn).map(d=>d.id).sort((a,b)=>a-b);
  isbnSel.value="yes";
  const withIsbn=DATA.filter(pass).map(d=>d.id).sort((a,b)=>a-b);
  t("Has an ISBN matches exactly the entries that have one",
    withIsbn.join()===expect.join() && withIsbn.includes(201) && withIsbn.includes(202),
    withIsbn.join(",")+" vs "+expect.join(","));
  isbnSel.value="no";
  t("No ISBN is the exact complement",
    DATA.filter(pass).length===DATA.length-expect.length);
  isbnSel.value="thin";
  const thin=DATA.filter(pass).map(d=>d.id);
  t("Suspect under 60pp finds the 32pp entry", thin.length===1 && thin[0]===202, thin.join(","));
  isbnSel.value="";
  t("clearing it restores the full list", DATA.filter(pass).length===DATA.length);
  t("it counts as an active filter", (isbnSel.value="no", activeFilterCount()>=1));
  isbnSel.value="";

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
  t("809 entries after removing the three duplicate Batman books",
    DATA.length===809, DATA.length);
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
  const nw=DATA.filter(d=>["Infinite Frontier","Dawn of DC","DC All In"].includes(d.era));
  t("every new entry carries a GCD isbn hint", nw.every(d=>/^97[89]\d{10}$/.test(d.isbn_hint||"")));
  // an entry whose contents GCD could confirm is High, not Verify
  t("new entries are Verify unless their contents were confirmed",
    nw.every(d=>d.confidence==="Verify" || (d.issues||"").length>0),
    nw.filter(d=>d.confidence!=="Verify" && !(d.issues||"").length).map(d=>d.id).join(","));
  t("every new entry records where it came from", nw.every(d=>/GCD collected editions/.test(d.notes||"")));
  // 9 in the three new eras; Endless Winter is the 10th but sits in Rebirth
  t("hardcover fallbacks say so", nw.filter(d=>/hardcover/.test(d.notes)).length===9,
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
  t("no duplicate isbn hints anywhere",
    (()=>{const h=DATA.map(d=>d.isbn_hint).filter(Boolean);return new Set(h).size===h.length;})());

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
  t("every hardcover fallback in the whole list is flagged",
    DATA.filter(d=>/is the hardcover/.test(d.notes||"")).length===10,
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
  t("fIsbn is wired to the render listener (the bug that made it do nothing)",
    /"fScore","fIsbn"\]\.forEach\(id=>\s*\n?\s*document\.getElementById\(id\)\.addEventListener\("input",render\)/.test(doc));
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
