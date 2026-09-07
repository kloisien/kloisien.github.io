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

  console.log("\n"+(nFail?"FAILED "+nFail+" of "+(nPass+nFail):"ALL "+nPass+" CHECKS PASSED"));
  if(H_alerts.length) console.log("\nalerts raised during boot/import:\n - "+H_alerts.join("\n - ").slice(0,900));
  process.exit(nFail?1:0);
})().catch(e=>{ console.log("\nHARNESS THREW: "+e.stack); process.exit(2); });
