async function getWiki() {
  const res = await fetch('https://hypixel-skyblock.fandom.com/wiki/Farm_Merchant');
  const html = await res.text();
  const m = html.match(/https:\/\/[^"']+\.(?:png|jpg)/gi);
  if (m) {
    const filtered = m.filter(u => u.toLowerCase().includes('farm') || u.toLowerCase().includes('merchant'));
    console.log(filtered.slice(0, 10));
  }
}
getWiki();
